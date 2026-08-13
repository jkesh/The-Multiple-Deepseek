/**
 * Drives the REAL plugin body: mounts `dsh-multiple-deepseek` on a real
 * ToolRuntime + SubagentRuntime + SystemPrompt, with a package-local scripted
 * child boundary, and invokes the registered `deepseek_team` tool through
 * `ctx.tools.execute`. Everything downstream of the child boundary is the
 * shipping code path.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import * as ToolTasks from '@deepseek-ai/dsh-tool-jobs'
import { JobId } from '@deepseek-ai/dsh-jobs'
import * as plugin from '../src/index.ts'
import * as scripted from './scripted-provider.ts'

const testToolSignal = new AbortController().signal

/** A minimal parent Agent passed through to the provider request. */
function fakeAgent(id = 'parent-1'): Agent {
  return { id: SessionId(id) } as unknown as Agent
}

let contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
  contexts = []
  scripted.resetScripted()
})

async function baseContext(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SubagentRuntime)
  return ctx
}

async function setup(
  pluginConfig: plugin.Config,
  providerConfig: Partial<scripted.Config> = {},
): Promise<Context> {
  const ctx = await baseContext()
  await ctx.plugin(scripted, { name: 'mock', ...providerConfig })
  await ctx.plugin(plugin, pluginConfig)
  return ctx
}

/** A live, registry-registered parent with a scope fiber, for owned background jobs. */
function ownerAgent(ctx: Context, sessionId: string): Agent {
  const scopeFiber = ctx.plugin(() => {})
  const id = SessionId(sessionId)
  const agent = {
    id,
    ctx: scopeFiber.ctx,
    options: {},
    session: { id, header: { version: 0, id, createdAt: 0 } },
  } as unknown as Agent
  ctx.agents.register(agent)
  return agent
}

async function backgroundSetup(
  pluginConfig: plugin.Config,
  providerConfig: Partial<scripted.Config> = {},
): Promise<Context> {
  const ctx = await setup(pluginConfig, providerConfig)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalJobRegistry)
  await ctx.plugin(ToolTasks, {})
  return ctx
}

let callCounter = 0

function callTeam(ctx: Context, args: unknown, over: { agent?: Agent | undefined } = {}) {
  // Distinguish "no override" (use a default agent) from an explicit
  // `{ agent: undefined }` (test the no-agent path).
  const agent = 'agent' in over ? over.agent : fakeAgent()
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name: 'deepseek_team',
    arguments: args,
    ...agent ? { agent } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

/** Narrow the tool result's foreground task array for per-task assertions. */
function tasksOf(result: { value: unknown }): unknown[] {
  return (result.value as { tasks: unknown[] }).tasks
}

function sectionNames(assembly: { sections: { name: string }[] }): string[] {
  return assembly.sections.map(section => section.name).sort()
}

const task = (role: string | undefined, description: string, prompt: string) => ({
  ...role === undefined ? {} : { role },
  description,
  prompt,
})

describe('resolveRoster', () => {
  it('rejects each self-contained misconfiguration before any registration', () => {
    expect(() => plugin.resolveRoster({ llmProvider: '', defaultRole: 'x', members: [{ role: 'x', model: 'm' }] }))
      .toThrow('llmProvider must name a registered LLM route')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [{ role: '', model: 'm' }] }))
      .toThrow('member roles must be non-empty')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [{ role: 'x', model: '' }] }))
      .toThrow('role "x" has an empty model')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [{ role: 'x', model: 'm', label: '' }] }))
      .toThrow('role "x" has an empty label')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [{ role: 'x', model: 'm', provider: '' }] }))
      .toThrow('role "x" has an empty provider route')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [{ role: 'x', model: 'm', persona: '' }] }))
      .toThrow('role "x" has an empty persona')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [{ role: 'x', model: 'm', maxTokens: 0 }] }))
      .toThrow('role "x" maxTokens must be a positive safe integer')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [] }))
      .toThrow('the roster must configure at least one role')
    expect(() => plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'ghost', members: [{ role: 'x', model: 'm' }] }))
      .toThrow('defaultRole "ghost" is not a configured role (roles: x)')
  })

  it('resolves member defaults and reports duplicate roles', () => {
    const roster = plugin.resolveRoster({ llmProvider: 'p', defaultRole: 'x', members: [{ role: 'x', model: 'm' }] })
    expect(roster.members).toEqual([{ role: 'x', label: 'x', provider: 'p', model: 'm' }])
    expect(() => plugin.resolveRoster({
      llmProvider: 'p',
      defaultRole: 'x',
      members: [{ role: 'x', model: 'm1' }, { role: 'x', model: 'm2' }],
    })).toThrow('duplicate role "x"')
  })
})

describe('dsh-multiple-deepseek', () => {
  it('routes each role to its DeepSeek model and persona and aggregates results in order', async () => {
    const ctx = await setup({ provider: 'mock' }, { reply: 'member reply' })
    const result = await callTeam(ctx, {
      tasks: [
        task('planner', 'plan the work', 'plan X'),
        task('quick', 'fix the typo', 'fix Y'),
        task('reviewer', 'review the diff', 'review Z'),
      ],
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(result.value).toEqual({
      kind: 'foreground',
      tasks: [
        { index: 0, role: 'planner', status: 'completed', runId: 'scripted-specialist:mock:parent-1', output: [{ type: 'text', text: 'member reply' }] },
        { index: 1, role: 'quick', status: 'completed', runId: 'scripted-specialist:mock:parent-1', output: [{ type: 'text', text: 'member reply' }] },
        { index: 2, role: 'reviewer', status: 'completed', runId: 'scripted-specialist:mock:parent-1', output: [{ type: 'text', text: 'member reply' }] },
      ],
    })
    expect(scripted.starts).toHaveLength(3)
    expect(scripted.starts.map(start => start.agentOptions)).toEqual([
      { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    ])
    expect(scripted.starts.every(start => start.persona !== undefined)).toBe(true)
    expect(scripted.starts.map(start => start.label)).toEqual(['plan the work', 'fix the typo', 'review the diff'])
    expect(scripted.starts.map(start => start.prompt)).toEqual([
      [{ type: 'text', text: 'plan X' }],
      [{ type: 'text', text: 'fix Y' }],
      [{ type: 'text', text: 'review Z' }],
    ])
    expect(scripted.starts.every(start => start.maxDepth === 3)).toBe(true)
  })

  it('applies a roster llmProvider override, per-role maxTokens, and no persona when unconfigured', async () => {
    const ctx = await setup({
      provider: 'mock',
      llmProvider: 'deepseek-gateway',
      members: [{ role: 'architect', model: 'deepseek-reasoner', maxTokens: 4096 }],
      defaultRole: 'architect',
    })
    const result = await callTeam(ctx, { tasks: [task('architect', 'design it', 'design X')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(scripted.starts).toHaveLength(1)
    expect(scripted.starts[0]!.agentOptions).toEqual({
      provider: 'deepseek-gateway',
      model: 'deepseek-reasoner',
      maxTokens: 4096,
    })
    expect(scripted.starts[0]!.persona).toBeUndefined()
  })

  it('uses the default role when a task names none', async () => {
    const ctx = await setup({ provider: 'mock', defaultRole: 'quick' })
    const result = await callTeam(ctx, { tasks: [task(undefined, 'fast fix', 'fix X')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(scripted.starts).toHaveLength(1)
    expect(scripted.starts[0]!.agentOptions).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })

  it('sends no maxDepth when the provider manages the recursion budget', async () => {
    const ctx = await setup({ provider: 'mock', maxDepth: 'provider-managed' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'fast fix', 'fix X')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(scripted.starts[0]!.maxDepth).toBeUndefined()
  })

  it('rejects an unknown role before starting any member', async () => {
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('nonexistent', 'do a thing', 'go')] })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('unknown team role "nonexistent"')
    expect(scripted.starts).toHaveLength(0)
  })

  it('rejects an empty task list', async () => {
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [] })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('must name at least one task')
    expect(scripted.starts).toHaveLength(0)
  })

  it('rejects a team larger than maxTasks', async () => {
    const ctx = await setup({ provider: 'mock', maxTasks: 2 })
    const result = await callTeam(ctx, {
      tasks: [task('quick', 'a', 'a'), task('quick', 'b', 'b'), task('quick', 'c', 'c')],
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('3 tasks exceed the configured maxTasks (2)')
    expect(scripted.starts).toHaveLength(0)
  })


  it('routes the configured toolFilter onto every child request', async () => {
    const ctx = await setup({ provider: 'mock', toolFilter: { allow: ['read'] } })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(scripted.starts[0]!.toolFilter).toEqual({ allow: ['read'] })
    expect(scripted.starts[0]!.toolFilter).not.toHaveProperty('deny')
  })

  it('classifies team calls concurrency-safe for foreground and background', async () => {
    const ctx = await setup({ provider: 'mock' })
    expect(ctx.tools.executionMode({
      signal: testToolSignal,
      callId: CallId('team-foreground'),
      name: 'deepseek_team',
      arguments: { tasks: [task('quick', 'a', 'a')] },
    })).toEqual({ kind: 'parallel' })
    expect(ctx.tools.executionMode({
      signal: testToolSignal,
      callId: CallId('team-background'),
      name: 'deepseek_team',
      arguments: { tasks: [task('quick', 'a', 'a')], run_in_background: true },
    })).toEqual({ kind: 'parallel' })
  })

  it('applies full defaults through a direct apply() call', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock' })
    plugin.apply(ctx, { provider: 'mock' })
    expect(ctx.tools.get('deepseek_team')).toBeDefined()
    const result = await callTeam(ctx, { tasks: [task(undefined, 'default role', 'go')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(scripted.starts[0]!.agentOptions).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    expect(scripted.starts[0]!.maxDepth).toBeUndefined()
  })

  it('ignores unrelated provider lifecycle events', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock' })
    await ctx.plugin(plugin, { provider: 'mock' })
    expect(ctx.tools.get('deepseek_team')).toBeDefined()
    const other = await ctx.plugin(scripted, { name: 'other' })
    expect(ctx.tools.get('deepseek_team')).toBeDefined()
    await other.dispose()
    expect(ctx.tools.get('deepseek_team')).toBeDefined()
  })

  it('leaves the prompt section empty while the tool waits for its provider', async () => {
    const ctx = await baseContext()
    await ctx.plugin(plugin, { provider: 'late' })
    const assembly = await ctx.systemPrompt.assemble()
    const section = assembly.sections.find(section => section.name === 'tool:deepseek_team')
    expect(section?.text ?? '').toBe('')
  })

  it('kills a task whose start aborts while the background job is cancelled', async () => {
    let releaseStart!: () => void
    const gate = new Promise<void>((resolve) => { releaseStart = resolve })
    scripted.startGates.push(() => gate)
    const ctx = await backgroundSetup({ provider: 'mock' })
    const parent = ownerAgent(ctx, 'parent-1')
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')], run_in_background: true }, { agent: parent })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const background = result.value as { jobId: string }
    const jobId = JobId(background.jobId)
    ctx.jobs.kill(jobId, parent)
    releaseStart()
    const job = await ctx.jobs.wait(jobId, 5000, parent)
    expect(job.status).toBe('failed')
    expect(job.detail).toBe('1 of 1 DeepSeek team tasks did not complete')
  })

  it('renders primitive and non-text output blocks without failing', async () => {
    scripted.outcomeQueue.push({
      output: [null, 'plain', { type: 'reasoning', text: 'thought' }, { type: 'text', text: 42 }] as unknown as ContentBlock[],
    })
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(text(result)).toBe('[1] quick completed')
  })
  it('rejects a call without a calling agent', async () => {
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')] }, { agent: undefined })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('requires a calling agent')
    expect(scripted.starts).toHaveLength(0)
  })

  it('keeps failed members from aborting the team and preserves their partial output', async () => {
    scripted.outcomeQueue.push(
      { reply: 'good work' },
      { stopReason: 'error', reply: 'partial draft' },
      { stopReason: 'max-tokens', reply: 'ran long' },
      { stopReason: 'refusal' },
      { stopReason: 'aborted', reply: 'was cancelling' },
      { stopReason: 'mystery', reply: '' },
    )
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, {
      tasks: [
        task('quick', 'a', 'a'),
        task('quick', 'b', 'b'),
        task('quick', 'c', 'c'),
        task('quick', 'd', 'd'),
        task('quick', 'e', 'e'),
        task('quick', 'f', 'f'),
      ],
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const tasks = tasksOf(result) as Array<{ status: string; error?: string; output: unknown[] }>
    expect(tasks.map(t => t.status)).toEqual(['completed', 'failed', 'failed', 'failed', 'failed', 'failed'])
    expect(tasks[1]!.error).toContain('specialist run failed')
    expect(tasks[1]!.error).toContain('Partial output before the run ended')
    expect(tasks[1]!.error).toContain('partial draft')
    expect(tasks[1]!.output).toEqual([{ type: 'text', text: 'partial draft' }])
    expect(tasks[2]!.error).toContain('hit its token limit')
    expect(tasks[3]!.error).toContain('declined the task')
    expect(tasks[4]!.error).toContain('was cancelled')
    expect(tasks[5]!.error).toContain('ended abnormally (mystery)')
    expect(tasks[5]!.error).not.toContain('Partial output')
  })

  it('records a startup rejection as a failed task without aborting the team', async () => {
    scripted.outcomeQueue.push({ startError: 'provider refused' }, { reply: 'fine' })
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a'), task('quick', 'b', 'b')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const tasks = tasksOf(result) as Array<{ status: string; error?: string; runId?: string; output: unknown[] }>
    expect(tasks.map(t => t.status)).toEqual(['failed', 'completed'])
    expect(tasks[0]!.error).toBe('Error: provider refused')
    expect(tasks[0]!.runId).toBeUndefined()
    expect(tasks[0]!.output).toEqual([])
  })

  it('records a rejected child result without partial output', async () => {
    scripted.outcomeQueue.push({ resultError: 'result blew up' })
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const tasks = tasksOf(result) as Array<{ status: string; error?: string; output: unknown[] }>
    expect(tasks[0]).toMatchObject({ status: 'failed', output: [] })
    expect(tasks[0]!.error).toContain('result blew up')
  })

  it('combines a rejected child result with a rejected disposal', async () => {
    scripted.outcomeQueue.push({ resultError: 'result blew up', disposeError: 'dispose exploded' })
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const tasks = tasksOf(result) as Array<{ status: string; error?: string }>
    expect(tasks[0]!.status).toBe('failed')
    expect(tasks[0]!.error).toContain('result blew up')
    expect(tasks[0]!.error).toContain('dispose failed: Error: dispose exploded')
  })

  it('reports a rejected disposal on an otherwise completed task', async () => {
    scripted.outcomeQueue.push({ reply: 'fine', disposeError: 'dispose exploded' })
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const tasks = tasksOf(result) as Array<{ status: string; error?: string; output: unknown[] }>
    expect(tasks[0]!.status).toBe('failed')
    expect(tasks[0]!.error).toContain('deepseek team task disposed with an error: Error: dispose exploded')
    expect(tasks[0]!.output).toEqual([{ type: 'text', text: 'fine' }])
  })

  it('renders a text-free output as a bare status line', async () => {
    scripted.outcomeQueue.push({ output: [{ type: 'reasoning', text: 'hidden thought' }] })
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(text(result)).toBe('[1] quick completed')
  })

  it('respects maxParallel', async () => {
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve })
    scripted.startGates.push(() => gate)
    const ctx = await setup({ provider: 'mock', maxParallel: 1 })
    const pending = callTeam(ctx, { tasks: [task('quick', 'a', 'a'), task('quick', 'b', 'b')] })
    await vi.waitFor(() => { expect(scripted.starts).toHaveLength(1) })
    await Promise.resolve()
    expect(scripted.starts).toHaveLength(1)
    releaseFirst()
    const result = await pending
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(scripted.starts).toHaveLength(2)
  })

  it('runs the whole team as one background job', async () => {
    const ctx = await backgroundSetup({ provider: 'mock' }, { reply: 'bg member' })
    const parent = ownerAgent(ctx, 'parent-1')
    const result = await callTeam(ctx, {
      tasks: [task('planner', 'plan', 'plan X'), task('quick', 'fix', 'fix Y')],
      run_in_background: true,
    }, { agent: parent })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const background = result.value as { kind: 'background'; jobId: string }
    expect(background.kind).toBe('background')
    expect(typeof background.jobId).toBe('string')
    expect(text(result)).toContain('started background deepseek team')
    const job = await ctx.jobs.wait(JobId(background.jobId), 5000, parent)
    expect(job.status).toBe('completed')
    expect(job.detail).toBe('2 DeepSeek team tasks completed')
    expect(scripted.starts).toHaveLength(2)
  })

  it('fails the background job when a member fails', async () => {
    scripted.outcomeQueue.push({ stopReason: 'error', reply: 'oops' })
    const ctx = await backgroundSetup({ provider: 'mock' })
    const parent = ownerAgent(ctx, 'parent-1')
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')], run_in_background: true }, { agent: parent })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const background = result.value as { jobId: string }
    const job = await ctx.jobs.wait(JobId(background.jobId), 5000, parent)
    expect(job.status).toBe('failed')
    expect(job.detail).toBe('1 of 1 DeepSeek team tasks did not complete')
  })

  it('kills an in-flight task when the background job is cancelled', async () => {
    scripted.outcomeQueue.push({ reply: 'never delivered' })
    const ctx = await backgroundSetup({ provider: 'mock' })
    const parent = ownerAgent(ctx, 'parent-1')
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')], run_in_background: true }, { agent: parent })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    const background = result.value as { jobId: string }
    const jobId = JobId(background.jobId)
    ctx.jobs.kill(jobId, parent, 'test kill')
    const job = await ctx.jobs.wait(jobId, 5000, parent)
    expect(job.status).toBe('failed')
    expect(job.detail).toBe('1 of 1 DeepSeek team tasks did not complete')
  })

  it('rejects forced background when enableRunInBackground is false and omits the parameter', async () => {
    const ctx = await setup({ provider: 'mock', enableRunInBackground: false })
    const tool = ctx.tools.get('deepseek_team')
    expect(tool).toBeDefined()
    expect((tool!.parameters as { run_in_background?: unknown }).run_in_background).toBeUndefined()
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')], run_in_background: true })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('run_in_background is disabled')
    expect(scripted.starts).toHaveLength(0)
  })

  it('rejects background execution without the jobs seam', async () => {
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a')], run_in_background: true })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('background jobs unavailable')
    expect(scripted.starts).toHaveLength(0)
  })

  it('validates task arguments before dispatch', async () => {
    const ctx = await setup({ provider: 'mock' })
    const result = await callTeam(ctx, { tasks: [task('quick', 'a', 'a'), { role: 'quick' }] })
    expect(result.isError).toBe(true)
    expect(scripted.starts).toHaveLength(0)
  })

  it('fails loud at load for a duplicate role', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock' })
    await expect(ctx.plugin(plugin, {
      provider: 'mock',
      members: [{ role: 'architect', model: 'm1' }, { role: 'architect', model: 'm2' }],
      defaultRole: 'architect',
    })).rejects.toThrow('duplicate role "architect"')
  })

  it('fails loud at load when defaultRole is not a configured role', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock' })
    await expect(ctx.plugin(plugin, {
      provider: 'mock',
      members: [{ role: 'architect', model: 'm' }],
      defaultRole: 'ghost',
    })).rejects.toThrow('defaultRole "ghost" is not a configured role')
  })

  it('fails loud at load for invalid team bounds and an empty toolFilter', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock' })
    // The Loader's schema validation rejects out-of-bounds values before apply runs.
    await expect(ctx.plugin(plugin, { provider: 'mock', maxTasks: 0 }))
      .rejects.toThrow('maxTasks')
    await expect(ctx.plugin(plugin, { provider: 'mock', maxParallel: 1.5 }))
      .rejects.toThrow('maxParallel')
    await expect(ctx.plugin(plugin, { provider: 'mock', toolFilter: {} }))
      .rejects.toThrow('names neither `allow` nor `deny`')
  })

  it('re-judges team bounds for direct apply() calls that bypass the schema', () => {
    const ctx = new Context()
    contexts.push(ctx)
    expect(() => {
      plugin.apply(ctx, { provider: 'mock', toolName: '' })
    }).toThrow('toolName must be non-empty')
    expect(() => {
      plugin.apply(ctx, { provider: 'mock', maxTasks: 0 })
    }).toThrow('maxTasks must be a positive safe integer')
    expect(() => {
      plugin.apply(ctx, { provider: 'mock', maxParallel: 0 })
    }).toThrow('maxParallel must be a positive safe integer')
  })

  it('fails at mount when the provider lacks the persona capability', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock', capabilities: { persona: false } })
    await expect(ctx.plugin(plugin, { provider: 'mock' })).rejects.toThrow('cannot apply specialist personas')
  })

  it('fails at mount when a numeric maxDepth exceeds provider support', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock', capabilities: { depthLimit: false } })
    await expect(ctx.plugin(plugin, { provider: 'mock' })).rejects.toThrow('cannot enforce maxDepth')
  })

  it('fails at mount when a toolFilter is configured without the capability', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock', capabilities: { toolFilter: false } })
    await expect(ctx.plugin(plugin, { provider: 'mock', toolFilter: { allow: ['read'] } }))
      .rejects.toThrow('cannot scope child tools')
  })

  it('registers the tool only once its provider appears and removes it on provider removal', async () => {
    const ctx = await baseContext()
    await ctx.plugin(plugin, { provider: 'late' })
    expect(ctx.tools.get('deepseek_team')).toBeUndefined()
    const providerFiber = await ctx.plugin(scripted, { name: 'late' })
    expect(ctx.tools.get('deepseek_team')).toBeDefined()
    await providerFiber.dispose()
    expect(ctx.tools.get('deepseek_team')).toBeUndefined()
  })

  it('withdraws the tool and prompt section on plugin disposal (HMR safety)', async () => {
    const ctx = await baseContext()
    await ctx.plugin(scripted, { name: 'mock' })
    const fiber = await ctx.plugin(plugin, { provider: 'mock' })
    expect(ctx.tools.get('deepseek_team')).toBeDefined()
    const before = await ctx.systemPrompt.assemble()
    expect(sectionNames(before)).toContain('tool:deepseek_team')
    const teamSection = before.sections.find(section => section.name === 'tool:deepseek_team')
    expect(teamSection?.text).toContain('planner — strategic planner')
    await fiber.dispose()
    expect(ctx.tools.get('deepseek_team')).toBeUndefined()
    const after = await ctx.systemPrompt.assemble()
    expect(sectionNames(after)).not.toContain('tool:deepseek_team')
  })

  it('exposes the roster resolver service', async () => {
    const ctx = await setup({ provider: 'mock' })
    const roster = ctx.get('multipleDeepseek')
    expect(roster).toBeInstanceOf(plugin.MultipleDeepseekResolver)
    expect(roster!.defaultRole).toBe('engineer')
    expect(roster!.listRoles().map(member => member.role))
      .toEqual(['planner', 'engineer', 'reviewer', 'explorer', 'quick'])
    expect(roster!.resolve('planner')).toMatchObject({
      role: 'planner',
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
    })
    expect(() => roster!.resolve('ghost')).toThrow(plugin.UnknownRoleError)
  })
})
