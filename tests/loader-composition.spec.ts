/**
 * Real-composition guard: ToolRuntime, SystemPrompt, SubagentRuntime, the
 * jobs registry, the scripted child boundary, and dsh-multiple-deepseek boot
 * from a test-only cordis.yml through the actual Loader + Include path, and a
 * parallel team runs end to end through the real tool registry.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import * as plugin from '../src/index.ts'
import * as scripted from './scripted-provider.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  scripted.resetScripted()
})

function fakeAgent(id = 'composition-parent'): Agent {
  const sessionId = SessionId(id)
  return {
    id: sessionId,
    options: {},
    session: { id: sessionId, header: { version: 0, id: sessionId, createdAt: 0 } },
  } as unknown as Agent
}

async function loadComposition(): Promise<{ ctx: Context }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-multiple-deepseek-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: tools',
    "  name: 'test-tools'",
    '- id: prompt',
    "  name: 'test-prompt'",
    '- id: subagents',
    "  name: 'test-subagents'",
    '- id: jobs',
    "  name: 'test-jobs-local'",
    '- id: scripted',
    "  name: 'test-scripted-provider'",
    '  config:',
    '    name: mock',
    '- id: team',
    "  name: 'test-multiple-deepseek'",
    '  config:',
    '    provider: mock',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-tools', ToolRuntime],
    ['test-prompt', SystemPrompt],
    ['test-subagents', SubagentRuntime],
    ['test-jobs-local', LocalJobRegistry],
    ['test-scripted-provider', scripted],
    ['test-multiple-deepseek', plugin],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx }
}

describe('multiple-deepseek real composition', () => {
  it('boots from cordis.yml and runs a parallel team through the real tool registry', async () => {
    const { ctx } = await loadComposition()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('composition-call'),
      name: 'deepseek_team',
      arguments: {
        tasks: [
          { role: 'planner', description: 'plan', prompt: 'plan X' },
          { role: 'quick', description: 'fix', prompt: 'fix Y' },
        ],
      },
      agent: fakeAgent(),
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected team success')
    expect(result.value).toMatchObject({
      kind: 'foreground',
      tasks: [
        { index: 0, role: 'planner', status: 'completed' },
        { index: 1, role: 'quick', status: 'completed' },
      ],
    })
    expect(scripted.starts.map(start => start.agentOptions?.model))
      .toEqual(['deepseek-v4-pro', 'deepseek-v4-flash'])
  })
})
