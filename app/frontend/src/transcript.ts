// Transcript state: a faithful port of the recognition rules the Rust core
// and the WebUI share — surface gate, context classification, reasoning,
// tool rows, turn footers.

import type { Message, SessionEvent, ToolView } from './types'

export interface TranscriptState {
  messages: Message[]
  running: boolean
  currentTurn: number
  finishedTurns: number[]
}

export function blankTranscript(): TranscriptState {
  return { messages: [], running: false, currentTurn: 0, finishedTurns: [] }
}

const SURFACE_TYPES = new Set(['user/message', 'assistant/message', 'tool/result'])

function isAppendSurface(event: SessionEvent): boolean {
  if (!SURFACE_TYPES.has(event.type)) return false
  if (event.surfaceOp === undefined) return true
  return event.surfaceOp === 'append'
}

function contentText(blocks: unknown[]): string {
  return blocks
    .filter((block) => (block as { type?: string }).type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('')
}

function contentReasoning(blocks: unknown[]): string {
  return blocks
    .filter((block) => (block as { type?: string }).type === 'reasoning')
    .map((block) => (block as { text: string }).text)
    .join('')
}
export function applyEvent(state: TranscriptState, event: SessionEvent): TranscriptState {
  const data = event.data as Record<string, unknown>
  switch (event.type) {
    case 'turn/start': {
      const turn = Number(data.turn ?? 0)
      return { ...state, currentTurn: turn }
    }
    case 'turn/end': {
      const turn = Number(data.turn ?? 0)
      const finished = state.finishedTurns.includes(turn) ? state.finishedTurns : [...state.finishedTurns, turn]
      return { ...state, finishedTurns: finished, running: turn === state.currentTurn ? false : state.running }
    }
    case 'user/message': {
      if (!isAppendSurface(event)) return state
      const message = data as unknown as { id?: string; content?: unknown[]; source?: { kind?: string; plugin?: string; form?: string } }
      const sourceKind = message.source?.kind ?? ''
      const row: Message = {
        id: message.id ?? 'msg-' + event.seq,
        kind: sourceKind === 'user' ? 'user' : 'context',
        producer: sourceKind === 'user' ? undefined : (message.source?.plugin ?? message.source?.form ?? '注入上下文'),
        text: contentText(message.content ?? []),
        reasoning: '',
        tools: [],
        finalized: true,
      }
      return { ...state, messages: [...state.messages, row] }
    }
    case 'assistant/chunk': {
      const chunk = data.chunk as { type?: string; index?: number; text?: string; id?: string; name?: string; argumentsDelta?: string }
      const messages = [...state.messages]
      let last = messages[messages.length - 1]
      if (!last || last.kind !== 'assistant' || last.finalized) {
        last = { id: 'assistant-' + event.seq, kind: 'assistant', text: '', reasoning: '', tools: [], finalized: false }
        messages.push(last)
      }
      if (chunk.type === 'text-delta' && chunk.text) {
        last = { ...last, text: last.text + chunk.text }
      } else if (chunk.type === 'reasoning-delta' && chunk.text) {
        last = { ...last, reasoning: last.reasoning + chunk.text }
      } else if (chunk.type === 'tool-call-delta') {
        const id = chunk.id ?? ''
        const tools = [...last.tools]
        let tool = tools.find((item) => item.id === id)
        if (!tool) {
          tool = { id, name: chunk.name ?? '', arguments: '' }
          tools.push(tool)
        }
        if (chunk.name) tool = { ...tool, name: chunk.name }
        tool = { ...tool, arguments: tool.arguments + (chunk.argumentsDelta ?? '') }
        const index = tools.findIndex((item) => item.id === id)
        tools[index] = tool
        last = { ...last, tools }
      } else if (chunk.type === 'block-end') {
        const block = (chunk as unknown as { block?: { type?: string; text?: string } }).block
        if (block?.type === 'text') {
          last = { ...last, text: last.text + (block.text ?? '') }
        } else if (block?.type === 'reasoning') {
          last = { ...last, reasoning: last.reasoning + (block.text ?? '') }
        }
      }
      messages[messages.length - 1] = last
      return { ...state, messages, running: true }
    }
    case 'assistant/message': {
      if (!isAppendSurface(event)) return state
      const message = data as unknown as { id?: string; content?: unknown[] }
      if (!message.content || message.content.length === 0) return state
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      const row: Message = {
        id: message.id ?? 'assistant-' + event.seq,
        kind: 'assistant',
        text: contentText(message.content ?? []),
        reasoning: contentReasoning(message.content ?? []),
        tools: last && last.kind === 'assistant' && !last.finalized ? last.tools : [],
        finalized: true,
      }
      if (last && last.kind === 'assistant' && !last.finalized) {
        messages[messages.length - 1] = row
      } else {
        messages.push(row)
      }
      return { ...state, messages }
    }
    case 'tool/call': {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (last && last.kind === 'assistant') {
        const tool: ToolView = {
          id: String(data.callId ?? ''),
          name: String(data.name ?? ''),
          arguments: String(data.arguments ?? ''),
        }
        messages[messages.length - 1] = { ...last, tools: [...last.tools, tool] }
      }
      return { ...state, messages }
    }
    case 'tool/result': {
      if (!isAppendSurface(event)) return state
      const message = data.message as { content?: { toolCallId?: string; content?: unknown[]; isError?: boolean }[] } | undefined
      const block = message?.content?.[0]
      const callId = block?.toolCallId ?? ''
      const messages = state.messages.map((row) => {
        if (row.kind !== 'assistant') return row
        const tool = row.tools.find((item) => item.id === callId)
        if (!tool) return row
        return {
          ...row,
          tools: row.tools.map((item) =>
            item.id === callId
              ? { ...item, result: contentText(block?.content ?? []), error: block?.isError }
              : item,
          ),
        }
      })
      return { ...state, messages }
    }
    default:
      return state
  }
}
