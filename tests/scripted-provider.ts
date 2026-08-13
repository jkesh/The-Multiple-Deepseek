/**
 * Package-local scripted child boundary for deterministic multiple-deepseek tests.
 * Mountable through the cordis Loader (it is an ordinary function plugin) and
 * through `ctx.plugin`; module-level queues let tests script per-start
 * outcomes, gates, and disposal without a second provider.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SubagentCapabilities,
  SubagentProvider,
  SubagentResult,
  SubagentRun,
  SubagentStartRequest,
  SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'

const DEFAULT_CAPABILITIES: SubagentCapabilities = {
  outputSchema: true,
  depthLimit: true,
  toolFilter: true,
  persona: true,
}

/** Options for one scripted provider fixture. */
export interface Config {
  /** Registry name to register under. */
  name: string
  /** Default final text returned by the scripted child. */
  reply?: string
  /** Default terminal result reason. */
  stopReason?: string
  /** Start-time features advertised by the provider. */
  capabilities?: Partial<SubagentCapabilities>
}

/** One scripted per-start override, shifted by each start. */
export interface ScriptedOutcome {
  /** Overrides the provider-default reply text. */
  reply?: string
  /** Overrides the provider-default stop reason. */
  stopReason?: string
  /** Rejects the start before publication with this message. */
  startError?: string
  /** Replaces the child output content blocks entirely. */
  output?: ContentBlock[]
  /** Rejects the published run's result promise with this message. */
  resultError?: string
  /** Makes the published run's disposal reject with this message. */
  disposeError?: string
}

/** Every published start request, in start order. */
export const starts: SubagentStartRequest[] = []
/** Per-start gates awaited after publication; each gate runs for the next start. */
export const startGates: Array<(request: SubagentStartRequest) => Promise<void> | void> = []
/** Per-start outcome overrides, shifted by each start. */
export const outcomeQueue: ScriptedOutcome[] = []

/** Clear every scripted queue and record between tests. */
export function resetScripted(): void {
  starts.length = 0
  startGates.length = 0
  outcomeQueue.length = 0
}

/** Scripted provider whose result aborts if its signal or disposer wins first. */
class ScriptedSubagentProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities
  readonly inheritsParentContext: boolean

  constructor(
    readonly name: string,
    private readonly config: Config,
  ) {
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...config.capabilities }
    this.inheritsParentContext = false
  }

  async start(request: SubagentStartRequest): Promise<SubagentRun> {
    const queued = outcomeQueue.shift()
    const reply = queued?.reply ?? this.config.reply ?? 'scripted specialist reply'
    const stopReason = (queued?.stopReason ?? this.config.stopReason ?? 'completed') as SubagentStopReason
    const state = { cancelled: false }
    const onAbort = (): void => { state.cancelled = true }
    request.signal.addEventListener('abort', onAbort, { once: true })
    await Promise.resolve()
    if (state.cancelled) {
      request.signal.removeEventListener('abort', onAbort)
      throw new Error('scripted subagent start aborted before publication')
    }
    if (queued?.startError !== undefined) throw new Error(queued.startError)
    starts.push(request)
    for (const gate of [...startGates]) await gate(request)
    if (state.cancelled) {
      request.signal.removeEventListener('abort', onAbort)
      throw new Error('scripted subagent start aborted before publication')
    }
    const output = queued?.output ?? [{ type: 'text', text: reply }]
    const resultFor = (): SubagentResult => ({
      output,
      stopReason: state.cancelled ? 'aborted' : stopReason,
    })
    const pending = new Promise<SubagentResult>((resolve) => {
      setTimeout(() => { resolve(resultFor()) }, 0)
    })
    const base = queued?.resultError !== undefined
      ? Promise.reject(new Error(queued.resultError))
      : pending
    const result = base.finally(() => {
      request.signal.removeEventListener('abort', onAbort)
    })

    return {
      id: SessionId(`scripted-specialist:${this.name}:${request.parent.id}`),
      localAgent: undefined,
      result,
      dispose(): Promise<void> {
        state.cancelled = true
        request.signal.removeEventListener('abort', onAbort)
        if (queued?.disposeError !== undefined) return Promise.reject(new Error(queued.disposeError))
        return Promise.resolve()
      },
    }
  }
}

/** Cordis companion plugin name. */
export const name = 'scripted-subagent-provider'
/** Service required before the provider can register. */
export const inject = ['subagents']

/** Schemastery schema for the scripted provider config. */
export const Config: z<Config> = z.object({
  name: z.string().required(),
  reply: z.string(),
  stopReason: z.string(),
  capabilities: z.object({
    outputSchema: z.boolean(),
    depthLimit: z.boolean(),
    toolFilter: z.boolean(),
    persona: z.boolean(),
  }),
})

/**
 * Register the scripted provider on the real subagent registry.
 * @param ctx - context carrying the subagent runtime.
 * @param config - provider identity and defaults.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.subagents.registerProvider(new ScriptedSubagentProvider(config.name, config))
}
