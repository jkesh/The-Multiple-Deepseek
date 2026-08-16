// Wire types mirrored from the Rust core (dsh-remote) and the pinned
// protocol contract in docs/native-client.md.

export interface SessionSummary {
  sessionId: string
  updatedAt: number
  running: boolean
  blank: boolean
  parentSessionId?: string
  origin?: string
  cwd?: string
  agentPreset?: string
  projections?: Record<string, unknown>
}

export interface SessionEvent {
  type: string
  seq: number
  time: number
  data: Record<string, unknown>
  surfaceOp?: unknown
}

export interface Frame {
  type: string
  rpcId: string
  method: string
  payload: Record<string, unknown>
}

export interface BackendStatus {
  running: boolean
  owned: boolean
  base: string
}

export interface ToolView {
  id: string
  name: string
  arguments: string
  result?: string
  error?: boolean
}

export interface Message {
  id: string
  kind: 'user' | 'context' | 'assistant'
  producer?: string
  text: string
  reasoning: string
  tools: ToolView[]
  finalized: boolean
}

export interface PendingApproval {
  rpcId: string
  sessionId: string
  approvalId: string
  toolName: string
  reason?: string
}

export interface QuestionDraft {
  id: string
  selected: string[]
  custom: string
}

export interface PendingQuestion {
  rpcId: string
  sessionId: string
  questions: Question[]
  drafts: QuestionDraft[]
}

export interface Question {
  id: string
  question: string
  header?: string
  multi_select?: boolean
  options?: { label: string; description?: string }[]
}
