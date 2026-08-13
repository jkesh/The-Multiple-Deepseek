/**
 * The-Multiple-Deepseek: parallel multi-DeepSeek team orchestration as one
 * model-facing tool plus the roster resolver that owns its routing.
 *
 * The model names a specialist role per task — planner, engineer, reviewer,
 * explorer, quick — and the `ctx.multipleDeepseek` roster maps each role to a
 * DeepSeek provider route, model, and specialist persona. Every task runs as a
 * child agent through a configured `ctx.subagents` provider, in parallel under
 * a concurrency bound; the call returns one aggregated outcome per task.
 *
 * The package is a Consumer over two seams: children run through
 * `ctx.subagents`, and role routing lands on `ctx.llm` routes
 * (`deepseek-official` from `@deepseek-ai/dsh-llm-deepseek` by default).
 * Specialist personas, the optional tool filter, and the delegation depth cap
 * require a subagent provider advertising the `persona`, `toolFilter`, and
 * `depthLimit` capabilities — the in-process providers do.
 * @module @deepseek-ai/dsh-multiple-deepseek
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { assertSubagentMaxDepth } from '@deepseek-ai/dsh-subagent'
import type { SubagentProvider, SubagentResult, SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import type { JobOutcome } from '@deepseek-ai/dsh-jobs'
import type {
  MemberConfig,
  MemberSpec,
  ResolvedRoster,
  RosterInput,
  TeamForegroundResult,
  TeamTaskOutcome,
} from './types.ts'

export type {
  MemberConfig,
  MemberSpec,
  ResolvedRoster,
  RosterInput,
  TeamBackgroundResult,
  TeamForegroundResult,
  TeamTaskOutcome,
  TeamTaskStatus,
  TeamToolResult,
} from './types.ts'

/** Plugin name for the cordis loader. */
export const name = 'multiple-deepseek'
/** Capabilities this plugin consumes. */
export const inject = ['tools', 'subagents', 'systemPrompt']

/** Default LLM provider route for team members. */
export const DEFAULT_LLM_PROVIDER = 'deepseek-official'
/** Default specialist role when a task names none. */
export const DEFAULT_ROLE = 'engineer'
/** Default model-facing tool name. */
export const DEFAULT_TOOL_NAME = 'deepseek_team'
/** Default cap on tasks per team call. */
export const DEFAULT_MAX_TASKS = 8
/** Default cap on concurrently running team tasks. */
export const DEFAULT_MAX_PARALLEL = 6
/** Prompt order after the subagent delegation guidance. */
const TEAM_SECTION_ORDER = 117

/** Built-in specialist roster: each role names the DeepSeek model that suits its kind of work. */
export const DEFAULT_MEMBERS: MemberConfig[] = [
  {
    role: 'planner',
    label: 'strategic planner',
    model: 'deepseek-v4-pro',
    persona: 'You are the planning specialist on a DeepSeek team. Break the goal into concrete steps, '
      + 'identify scope, risks, and open decisions, and produce a precise plan before work starts. '
      + 'Ask for missing constraints instead of assuming them.',
  },
  {
    role: 'engineer',
    label: 'autonomous implementer',
    model: 'deepseek-v4-pro',
    persona: 'You are the autonomous implementation specialist on a DeepSeek team. Given a goal, explore '
      + 'the code, research the patterns, and execute end to end. Do not stop at a half-finished result; '
      + 'drive the task to a working conclusion.',
  },
  {
    role: 'reviewer',
    label: 'adversarial reviewer',
    model: 'deepseek-v4-pro',
    persona: 'You are the adversarial review specialist on a DeepSeek team. Read the work critically: find '
      + 'defects, security issues, and design flaws. Be specific about what to change and why.',
  },
  {
    role: 'explorer',
    label: 'codebase researcher',
    model: 'deepseek-v4-flash',
    persona: 'You are the codebase research specialist on a DeepSeek team. Search, read, and map the '
      + 'relevant code and documentation, then report precise findings with file paths and references.',
  },
  {
    role: 'quick',
    label: 'fast editor',
    model: 'deepseek-v4-flash',
    persona: 'You are the fast-edit specialist on a DeepSeek team. Make one small, well-scoped change '
      + 'quickly and report exactly what changed.',
  },
]

/** Plugin configuration: the subagent provider route, team bounds, and the role roster. */
export interface Config {
  /** The `ctx.subagents` provider route children run on (e.g. `spawn`). */
  provider: string
  /** Model-facing tool name (default `deepseek_team`). Each loaded instance must use a distinct name. */
  toolName?: string
  /** Default LLM route for members that name none (default `deepseek-official`). */
  llmProvider?: string
  /** Specialist roster; omission uses {@link DEFAULT_MEMBERS}. */
  members?: MemberConfig[]
  /** Role used when a task names none (default `engineer`). */
  defaultRole?: string
  /** Cap on tasks per call (default 8); larger calls reject before any start. */
  maxTasks?: number
  /** Cap on concurrently running tasks (default 6). */
  maxParallel?: number
  /** Expose `run_in_background` (default true). Disabled instances omit the parameter and reject forced background calls. */
  enableRunInBackground?: boolean
  /** Tool filter applied to every child. Requires the provider's `toolFilter` capability; unknown names fail startup. */
  toolFilter?: {
    /** Global tool names the child keeps; everything else is removed. */
    allow?: string[]
    /** Global tool names removed from the child. */
    deny?: string[]
  }
  /** Maximum child depth (default `3`; `0` forbids delegation), or `'provider-managed'` to send no cap. */
  maxDepth?: number | 'provider-managed'
}

const memberSchema: z<MemberConfig> = z.object({
  role: z.string().required(),
  label: z.string(),
  provider: z.string(),
  model: z.string().required(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  persona: z.string(),
})

/** Schemastery schema doubling as the plugin's validated configuration entry. */
export const Config: z<Config> = z.object({
  provider: z.string().required(),
  toolName: z.string().default(DEFAULT_TOOL_NAME),
  llmProvider: z.string().default(DEFAULT_LLM_PROVIDER),
  members: z.array(memberSchema).default(DEFAULT_MEMBERS),
  defaultRole: z.string().default(DEFAULT_ROLE),
  maxTasks: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_TASKS),
  maxParallel: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_PARALLEL),
  enableRunInBackground: z.boolean().default(true),
  // Prevent Schemastery from materializing omitted toolFilter as `{ allow: [] }`, which would deny every tool.
  toolFilter: z.object({
    allow: z.array(z.string()).default(undefined as unknown as string[]),
    deny: z.array(z.string()).default(undefined as unknown as string[]),
  }).default(undefined as unknown as { allow: string[]; deny: string[] }),
  maxDepth: z.union([z.natural().max(Number.MAX_SAFE_INTEGER), z.const('provider-managed' as const)]).default(3),
})

/** A task named a role absent from the roster; the call rejects before any child starts. */
export class UnknownRoleError extends Error {
  /** The role the model requested. */
  readonly role: string
  /** The role ids this roster accepts, in configuration order. */
  readonly roles: readonly string[]

  /**
   * @param role - the requested role id.
   * @param roles - the roster's accepted role ids, in configuration order.
   */
  constructor(role: string, roles: readonly string[]) {
    super(`multiple-deepseek: unknown team role "${role}" (configured roles: ${roles.join(', ')})`)
    this.name = 'UnknownRoleError'
    this.role = role
    this.roles = roles
  }
}

/**
 * Validate raw roster facts and resolve every member default. Misconfiguration
 * fails here, at load, before any effect registers. Programmatic construction
 * may bypass Schemastery normalization, so every bound is re-judged here.
 * @param input - raw roster facts from configuration.
 * @returns the validated roster with member defaults resolved.
 */
export function resolveRoster(input: RosterInput): ResolvedRoster {
  if (input.llmProvider.length === 0) {
    throw new Error('multiple-deepseek: llmProvider must name a registered LLM route')
  }
  const members = (input.members ?? DEFAULT_MEMBERS).map((member) => {
    if (member.role.length === 0) throw new Error('multiple-deepseek: member roles must be non-empty')
    if (member.model.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty model`)
    }
    if (member.label !== undefined && member.label.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty label`)
    }
    if (member.provider !== undefined && member.provider.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty provider route`)
    }
    if (member.persona !== undefined && member.persona.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty persona`)
    }
    if (member.maxTokens !== undefined && (!Number.isSafeInteger(member.maxTokens) || member.maxTokens <= 0)) {
      throw new Error(`multiple-deepseek: role "${member.role}" maxTokens must be a positive safe integer`)
    }
    return {
      role: member.role,
      label: member.label ?? member.role,
      provider: member.provider ?? input.llmProvider,
      model: member.model,
      ...member.maxTokens === undefined ? {} : { maxTokens: member.maxTokens },
      ...member.persona === undefined ? {} : { persona: member.persona },
    }
  })
  const roles = new Set<string>()
  for (const member of members) {
    if (roles.has(member.role)) throw new Error(`multiple-deepseek: duplicate role "${member.role}"`)
    roles.add(member.role)
  }
  if (members.length === 0) throw new Error('multiple-deepseek: the roster must configure at least one role')
  if (!roles.has(input.defaultRole)) {
    throw new Error(
      `multiple-deepseek: defaultRole "${input.defaultRole}" is not a configured role (roles: ${[...roles].join(', ')})`,
    )
  }
  return { llmProvider: input.llmProvider, defaultRole: input.defaultRole, members }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The mounted multi-DeepSeek roster resolver. */
    multipleDeepseek: MultipleDeepseekResolver
  }
}

/**
 * Owns the role-to-DeepSeek routing table. The model names a role, never a
 * model: {@link resolve} returns the routed member spec, and the team tool
 * turns it into the child's `AgentOptions` and persona.
 */
export class MultipleDeepseekResolver extends Service {
  /** Schemastery schema for the roster facts this service validates. */
  static Config: z<RosterInput> = z.object({
    llmProvider: z.string().required(),
    defaultRole: z.string().required(),
    members: z.array(memberSchema),
  })

  private readonly roster: ResolvedRoster

  /**
   * @param ctx - Cordis context registering the `multipleDeepseek` service.
   * @param config - roster facts; {@link resolveRoster} validates and completes them.
   */
  constructor(ctx: Context, config: RosterInput) {
    super(ctx, 'multipleDeepseek')
    this.roster = resolveRoster(config)
  }

  /**
   * Resolve one role to its routed member spec.
   * @param role - the role id a task named.
   * @returns the member spec carrying the DeepSeek route, model, and specialist facts.
   * @throws {@link UnknownRoleError} when the roster has no such role.
   */
  resolve(role: string): MemberSpec {
    const member = this.roster.members.find(candidate => candidate.role === role)
    if (member === undefined) throw new UnknownRoleError(role, this.roster.members.map(spec => spec.role))
    return member
  }

  /**
   * The mounted roster in configuration order.
   * @returns every role and its routed DeepSeek facts.
   */
  listRoles(): readonly MemberSpec[] {
    return this.roster.members
  }

  /**
   * The role a task gets when it names none.
   * @returns the roster's default role id.
   */
  get defaultRole(): string {
    return this.roster.defaultRole
  }
}

/** Child agent options for one resolved member. */
function agentOptionsOf(member: MemberSpec): AgentOptions {
  return {
    provider: member.provider,
    model: member.model,
    ...member.maxTokens === undefined ? {} : { maxTokens: member.maxTokens },
  }
}

/** Model-facing role menu: `planner — strategic planner; engineer — autonomous implementer`. */
function roleMenu(roster: MultipleDeepseekResolver): string {
  return roster.listRoles().map(member => `${member.role} — ${member.label}`).join('; ')
}

/** A non-`completed` stop reason means the child did not finish cleanly. */
function stopFailure(result: SubagentResult): string | undefined {
  switch (result.stopReason) {
    case 'completed':
      return undefined
    case 'aborted':
      return 'specialist run was cancelled'
    case 'error':
      return 'specialist run failed'
    case 'max-tokens':
      return 'specialist run hit its token limit before finishing'
    case 'refusal':
      return 'specialist declined the task'
    // Merge-extensible union: a backend may add stop reasons. Treat an unknown
    // terminal reason as a failure rather than reporting partial output as success.
    default:
      return `specialist run ended abnormally (${String(result.stopReason)})`
  }
}

/** A task failure that still carries the child's partial answer for the parent model. */
class TeamTaskFailure extends Error {
  /**
   * @param message - the stop-reason headline.
   * @param output - the child's output content blocks, possibly partial.
   */
  constructor(message: string, readonly output: ContentBlock[]) {
    super(message)
    this.name = 'TeamTaskFailure'
  }
}

/** Extend a stop-reason headline with the child's preserved partial text. */
function withPartialAnswer(error: string, output: ContentBlock[]): TeamTaskFailure {
  const text = output
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
  return new TeamTaskFailure(
    text.length === 0 ? error : `${error}\nPartial output before the run ended:\n${text}`,
    output,
  )
}

/** Join the text blocks of a canonical content-block array without trusting arbitrary values. */
function textOf(value: JsonValue[]): string {
  return value.reduce((text: string, block: JsonValue): string => {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) return text
    if (block.type !== 'text') return text
    const body = block.text
    if (typeof body !== 'string') return text
    return text + body
  }, '')
}

/** One resolved task bound for dispatch. */
interface TeamEntry {
  /** Position of the task in the call's `tasks` argument. */
  readonly index: number
  /** Task display label. */
  readonly description: string
  /** Self-contained specialist prompt. */
  readonly prompt: string
  /** Routed roster member. */
  readonly member: MemberSpec
}

/** Start one child, collect its result, then release it; a failure never aborts the team. */
async function settleTeamTask(
  ctx: Context,
  providerName: string,
  entry: TeamEntry,
  buildRequest: (entry: TeamEntry, signal: AbortSignal) => SubagentStartRequest,
  signal: AbortSignal,
): Promise<TeamTaskOutcome> {
  const base = { index: entry.index, role: entry.member.role }
  let run: SubagentRun
  try {
    run = await ctx.subagents.start(providerName, buildRequest(entry, signal))
  } catch (error: unknown) {
    // Nothing was published; a failed startup records the rejection instead of aborting the team.
    return {
      ...base,
      status: signal.aborted ? 'killed' as const : 'failed' as const,
      output: [],
      error: String(error),
    }
  }
  const [execution] = await Promise.allSettled([
    run.result.then((result): SubagentResult => {
      const failure = stopFailure(result)
      if (failure !== undefined) throw withPartialAnswer(failure, result.output)
      return result
    }),
  ])
  const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
  if (execution.status === 'rejected') {
    const failure: unknown = execution.reason
    const partial = failure instanceof TeamTaskFailure ? failure.output as unknown as JsonValue[] : []
    let message = failure instanceof TeamTaskFailure ? failure.message : String(failure)
    if (disposal.status === 'rejected') message += `; dispose failed: ${String(disposal.reason)}`
    return {
      ...base,
      runId: String(run.id),
      status: signal.aborted ? 'killed' : 'failed',
      output: partial,
      error: message,
    }
  }
  if (disposal.status === 'rejected') {
    return {
      ...base,
      runId: String(run.id),
      status: 'failed',
      output: execution.value.output as unknown as JsonValue[],
      error: `deepseek team task disposed with an error: ${String(disposal.reason)}`,
    }
  }
  return {
    ...base,
    runId: String(run.id),
    status: 'completed',
    output: execution.value.output as unknown as JsonValue[],
  }
}

/** Run `fn` over `items` with at most `limit` concurrent invocations, preserving order. */
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const queue = [...items]
  const results = new Array<R>(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift()
      if (item === undefined) return
      // Capture the slot before the await: the assignment target is evaluated
      // synchronously, so sharing the mutable cursor across workers would let
      // every in-flight completion write the same index.
      const slot = cursor
      cursor += 1
      results[slot] = await fn(item)
    }
  }
  const width = Math.min(limit, items.length)
  const workers: Promise<void>[] = []
  for (let i = 0; i < width; i += 1) workers.push(worker())
  await Promise.all(workers)
  return results
}

/** Start every team task in parallel under the concurrency bound and aggregate one outcome per task. */
async function runTeam(
  ctx: Context,
  providerName: string,
  entries: readonly TeamEntry[],
  maxParallel: number,
  signal: AbortSignal,
  buildRequest: (entry: TeamEntry, signal: AbortSignal) => SubagentStartRequest,
): Promise<TeamTaskOutcome[]> {
  return mapWithLimit(entries, maxParallel, entry => settleTeamTask(ctx, providerName, entry, buildRequest, signal))
}

/** Project aggregated team outcomes onto the one terminal job outcome the jobs seam accepts. */
function summarizeTeam(tasks: readonly TeamTaskOutcome[]): JobOutcome {
  const incomplete = tasks.filter(task => task.status !== 'completed').length
  if (incomplete === 0) {
    return { status: 'completed', detail: `${tasks.length} DeepSeek team tasks completed` }
  }
  return { status: 'failed', detail: `${incomplete} of ${tasks.length} DeepSeek team tasks did not complete` }
}

/** Mount the team tool on the configured subagent provider. */
export function apply(ctx: Context, config: Config): void {
  const toolName = config.toolName ?? DEFAULT_TOOL_NAME
  if (toolName.length === 0) throw new Error('multiple-deepseek: toolName must be non-empty')
  const maxTasks = config.maxTasks ?? DEFAULT_MAX_TASKS
  if (!Number.isSafeInteger(maxTasks) || maxTasks <= 0) {
    throw new Error('multiple-deepseek: maxTasks must be a positive safe integer')
  }
  const maxParallel = config.maxParallel ?? DEFAULT_MAX_PARALLEL
  if (!Number.isSafeInteger(maxParallel) || maxParallel <= 0) {
    throw new Error('multiple-deepseek: maxParallel must be a positive safe integer')
  }
  const backgroundEnabled = config.enableRunInBackground !== false
  if (config.maxDepth !== 'provider-managed') assertSubagentMaxDepth(config.maxDepth)
  if (config.toolFilter !== undefined && config.toolFilter.allow === undefined && config.toolFilter.deny === undefined) {
    throw new Error(
      'multiple-deepseek: `toolFilter` is configured but names neither `allow` nor `deny` — remove the key or fill the filter',
    )
  }

  // Construct the resolver directly: it registers under this plugin's own fiber
  // (so disposal unwinds it), the roster is validated before any other effect
  // registers, and the instance stays local instead of re-read from the store.
  const roster = new MultipleDeepseekResolver(ctx, {
    llmProvider: config.llmProvider ?? DEFAULT_LLM_PROVIDER,
    defaultRole: config.defaultRole ?? DEFAULT_ROLE,
    ...config.members === undefined ? {} : { members: config.members },
  })
  const roleMenuText = roleMenu(roster)

  let disposeTool: (() => void) | undefined
  const mount = (provider: SubagentProvider): void => {
    // A numeric cap the provider cannot enforce is a misconfiguration — fail at
    // mount (the earliest point the provider's capabilities are known), not on
    // the first delegation.
    if (typeof config.maxDepth === 'number' && !provider.capabilities.depthLimit) {
      throw new Error(
        `multiple-deepseek: provider "${provider.name}" cannot enforce maxDepth (no depthLimit capability) — `
        + 'set maxDepth: \'provider-managed\' to leave the recursion budget to the provider',
      )
    }
    if (roster.listRoles().some(member => member.persona !== undefined) && !provider.capabilities.persona) {
      throw new Error(
        `multiple-deepseek: provider "${provider.name}" cannot apply specialist personas (no persona capability) — `
        + 'remove the roster personas or use an in-process provider',
      )
    }
    if (config.toolFilter !== undefined && !provider.capabilities.toolFilter) {
      throw new Error(
        `multiple-deepseek: provider "${provider.name}" cannot scope child tools (no toolFilter capability)`,
      )
    }
    disposeTool = ctx.tools.register(defineTool({
      name: toolName,
      description: 'Coordinate a team of multiple DeepSeek specialists. Each task names a specialist role, '
        + 'and the role selects its DeepSeek model and specialist instructions automatically — name the kind '
        + 'of work, never a model. Tasks run in parallel; this call waits for every member and returns one '
        + 'result per task.'
        + (backgroundEnabled
          ? ' Set `run_in_background: true` to run the whole team as a background job and collect it with `job_output`.'
          : ''),
      parameters: {
        tasks: {
          type: 'array',
          required: true,
          description: 'The team tasks, started in parallel. Batch independent work into one call instead of delegating serially.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              role: {
                type: 'string',
                description: `The specialist role for this task: ${roleMenuText}. Omit to use the default role ${roster.defaultRole}.`,
              },
              description: {
                type: 'string',
                required: true,
                description: 'A short (3-5 word) description of the task, for display.',
              },
              prompt: {
                type: 'string',
                required: true,
                description: 'The complete, self-contained task for this specialist. It does not share this conversation\'s context, so include everything it needs.',
              },
            },
          },
        },
        ...backgroundEnabled ? {
          run_in_background: {
            type: 'boolean' as const,
            description: 'Whether to run the whole team as a background job and return its job id. Defaults to false; collect with `job_output` or stop with `job_kill`.',
          },
        } : {},
      },
      output: {
        schema: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true, const: 'background' },
                jobId: { type: 'string', required: true },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true, const: 'foreground' },
                tasks: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      index: { type: 'number', required: true },
                      role: { type: 'string', required: true },
                      status: { type: 'string', required: true, enum: ['completed', 'failed', 'killed'] },
                      runId: { type: 'string' },
                      output: { type: 'array', required: true, items: { type: 'json' } },
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
          ],
        },
        render: (_args, value) => {
          if (value.kind === 'background') {
            return [{ type: 'text', text: `started background deepseek team ${value.jobId}` }]
          }
          const lines = value.tasks.map((task) => {
            const head = `[${task.index + 1}] ${task.role} ${task.status}`
            const text = textOf(task.output)
            if (task.error !== undefined) return `${head}: ${task.error}${text.length === 0 ? '' : `\n${text}`}`
            return text.length === 0 ? head : `${head}:\n${text}`
          })
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      // Children never mutate the parent session; the one parent-owned write
      // (jobs.start) is a synchronous commutative insertion.
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const parent = exec.agent
        if (!parent) {
          // Non-agent callers provide no parent for delegation ownership.
          throw new Error('deepseek_team tool requires a calling agent (exec.agent was undefined)')
        }
        const tasks: Array<{ role?: string; description: string; prompt: string }> = args.tasks
        if (tasks.length === 0) throw new Error('multiple-deepseek: `tasks` must name at least one task')
        if (tasks.length > maxTasks) {
          throw new Error(`multiple-deepseek: ${tasks.length} tasks exceed the configured maxTasks (${maxTasks})`)
        }
        // The validator permits undeclared keys, so schema omission also needs
        // execution-time enforcement.
        if (args.run_in_background === true && !backgroundEnabled) {
          throw new Error('run_in_background is disabled for this tool instance (enableRunInBackground: false)')
        }
        // Resolve every role before the first start so an unknown role rejects the
        // whole call instead of launching a partial team.
        const entries: TeamEntry[] = tasks.map((task, index) => ({
          index,
          description: task.description,
          prompt: task.prompt,
          member: roster.resolve(task.role ?? roster.defaultRole),
        }))
        const buildRequest = (entry: TeamEntry, signal: AbortSignal): SubagentStartRequest => ({
          label: entry.description,
          prompt: [{ type: 'text', text: entry.prompt }],
          parent,
          signal,
          agentOptions: agentOptionsOf(entry.member),
          ...entry.member.persona === undefined ? {} : { persona: entry.member.persona },
          ...config.toolFilter === undefined ? {} : { toolFilter: config.toolFilter },
          ...typeof config.maxDepth === 'number' ? { maxDepth: config.maxDepth } : {},
        })
        if (args.run_in_background === true) {
          const jobs = ctx.get('jobs')
          if (jobs === undefined) {
            throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
          }
          const id = jobs.start({
            kind: 'subagent',
            label: `deepseek team (${tasks.length} tasks)`,
            owner: parent,
            run: () => {
              const controller = new AbortController()
              // runTeam captures every per-task failure, so `done` settles with the
              // aggregate outcome instead of rejecting; the jobs runtime maps an
              // unexpected rejection to `failed` at its own boundary.
              const done = runTeam(ctx, config.provider, entries, maxParallel, controller.signal, buildRequest)
                .then(summarizeTeam)
              return {
                cancel: (reason?: string) => {
                  controller.abort(reason ?? 'background deepseek team killed')
                },
                done,
              }
            },
          })
          return { kind: 'background' as const, jobId: id }
        }
        return {
          kind: 'foreground' as const,
          tasks: await runTeam(ctx, config.provider, entries, maxParallel, exec.signal, buildRequest),
        } satisfies TeamForegroundResult
      },
    }))
  }

  // Register listeners before checking presence so no synchronous change is missed.
  ctx.on('subagent/provider-added', (provider) => {
    if (provider.name === config.provider && disposeTool === undefined) mount(provider)
  })
  ctx.on('subagent/provider-removed', (name) => {
    if (name !== config.provider || disposeTool === undefined) return
    disposeTool()
    disposeTool = undefined
  })
  const present = ctx.subagents.getProvider(config.provider)
  if (present !== undefined) {
    mount(present)
  } else {
    // A backend fiber may activate later; a misspelled provider remains visible in this log.
    ctx.logger.info(`subagent provider "${config.provider}" not registered yet; the "${toolName}" tool will register when it appears`)
  }
  ctx.systemPrompt.section({
    name: `tool:${toolName}`,
    order: TEAM_SECTION_ORDER,
    text: context => disposeTool === undefined || ctx.tools.get(toolName, context.scope) === undefined
      ? ''
      : `Use ${toolName} to run several DeepSeek specialists in parallel. Pick a role per task: ${roleMenuText}. `
        + 'The role routes the task to its DeepSeek model and specialist instructions — name the kind of work, '
        + 'never a model. Batch independent tasks into one call and wait for all results; reserve a follow-up '
        + 'call for work that depends on a finished member\'s output.',
  })
}
