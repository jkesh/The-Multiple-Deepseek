/**
 * Pure type vocabulary for The-Multiple-Deepseek team orchestration: the role
 * roster and the model-facing team tool outcomes. Runtime code lives in
 * `index.ts`; this module is types only.
 * @module @deepseek-ai/dsh-multiple-deepseek/types
 */

import type { JsonValue } from '@deepseek-ai/dsh-session'

/** One configured team role: the routing category the model names instead of a model. */
export interface MemberConfig {
  /** Stable role id the model names in a task (e.g. `planner`). */
  role: string
  /** Display label for prompts and results; defaults to {@link role}. */
  label?: string
  /** LLM provider route for this role; defaults to the roster's `llmProvider`. */
  provider?: string
  /** Model id interpreted by the selected provider route. */
  model: string
  /** Per-request output cap for this role's child agent. */
  maxTokens?: number
  /** Specialist system-prompt prose applied to the child agent; omission keeps the deployment persona. */
  persona?: string
}

/** One validated roster member with every default resolved. */
export interface MemberSpec {
  /** Stable role id the model names in a task. */
  readonly role: string
  /** Display label for prompts and results. */
  readonly label: string
  /** LLM provider route this role's child agent uses. */
  readonly provider: string
  /** Model id interpreted by the selected provider route. */
  readonly model: string
  /** Per-request output cap for this role's child agent, when configured. */
  readonly maxTokens?: number
  /** Specialist system-prompt prose applied to the child agent, when configured. */
  readonly persona?: string
}

/** Raw roster facts the resolver validates and completes. */
export interface RosterInput {
  /** Default LLM route for members that name none. */
  llmProvider: string
  /** Role used when a task names none. */
  defaultRole: string
  /** Role roster; omission uses the built-in DeepSeek specialists. */
  members?: MemberConfig[]
}

/** Validated roster with every member default resolved. */
export interface ResolvedRoster {
  /** Default LLM route for members that named none. */
  readonly llmProvider: string
  /** Role used when a task names none. */
  readonly defaultRole: string
  /** Every role and its routed facts, in configuration order. */
  readonly members: readonly MemberSpec[]
}

/** Terminal classification of one team task. */
export type TeamTaskStatus = 'completed' | 'failed' | 'killed'

/** Aggregated outcome of one team task. */
export interface TeamTaskOutcome {
  /** Position of the task in the call's `tasks` argument. */
  readonly index: number
  /** Role the task was routed to. */
  readonly role: string
  /** Terminal classification. */
  readonly status: TeamTaskStatus
  /** Published child run id; absent when startup failed before publication. */
  readonly runId?: string
  /** Final child output content blocks, possibly partial on failure. */
  readonly output: JsonValue[]
  /** Stop-reason or startup failure detail; absent on success. */
  readonly error?: string
}

/** Foreground team result: one entry per task, in argument order. */
export interface TeamForegroundResult {
  readonly kind: 'foreground'
  /** One aggregated outcome per requested task, in argument order. */
  readonly tasks: TeamTaskOutcome[]
}

/** Background team result: the job id of the whole team, not per-task detail. */
export interface TeamBackgroundResult {
  readonly kind: 'background'
  /** Job id of the running team; collect with `job_output`, stop with `job_kill`. */
  readonly jobId: string
}

/** Model-facing result of one team tool call. */
export type TeamToolResult = TeamForegroundResult | TeamBackgroundResult
