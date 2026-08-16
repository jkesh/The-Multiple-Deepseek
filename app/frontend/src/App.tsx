// App: page layout + state. The React page only renders; every protocol
// decision and the sidecar lifecycle live in the Rust core.

import { useCallback, useEffect, useRef, useState } from 'react'
import SessionList from './components/SessionList'
import Transcript from './components/Transcript'
import Composer from './components/Composer'
import StatusBar from './components/StatusBar'
import { backendStatus, onBackendStatus, onFrame, rpc, respond, startBackend, stopBackend } from './core'
import type { BackendStatus, Frame, Message, PendingApproval, PendingQuestion, SessionEvent, SessionSummary } from './types'
import { applyEvent, blankTranscript } from './transcript'

export default function App() {
  const [status, setStatus] = useState<BackendStatus | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [queueLen, setQueueLen] = useState(0)
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const [questions, setQuestions] = useState<PendingQuestion[]>([])
  const [statusText, setStatusText] = useState('connecting')
  const lastSeq = useRef(0)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const transcriptRef = useRef(blankTranscript())

  const refreshSessions = useCallback(async () => {
    try {
      const value = (await rpc('session.list', {})) as { items?: SessionSummary[] }
      setSessions(value.items ?? [])
      setStatusText('已连接')
    } catch (error) {
      setStatusText('会话列表失败：' + String(error))
    }
  }, [])

  const openSession = useCallback(async (sessionId: string) => {
    setSelected(sessionId)
    setMessages([])
    transcriptRef.current = blankTranscript()
    setRunning(false)
    setQueueLen(0)
    setApprovals([])
    setQuestions([])
    lastSeq.current = 0
    setHistoryLoading(true)
    try {
      const value = (await rpc('session.history', { sessionId })) as { events?: { event: SessionEvent }[] }
      const events = (value.events ?? []).map((entry) => entry.event).sort((a, b) => a.seq - b.seq)
      let transcript = blankTranscript()
      for (const event of events) {
        if (event.seq <= lastSeq.current) continue
        lastSeq.current = event.seq
        transcript = applyEvent(transcript, event)
      }
      setMessages(transcript.messages)
      setRunning(transcript.running)
    } catch (error) {
      setStatusText('历史加载失败：' + String(error))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  function handleFrame(frame: Frame) {
    switch (frame.method) {
      case 'session/event': {
        const sessionId = String(frame.payload.sessionId ?? '')
        if (sessionId !== selectedRef.current) return
        const event = frame.payload.event as unknown as SessionEvent
        if (event.seq <= lastSeq.current) return
        lastSeq.current = event.seq
        setMessages((previous) => {
          const next = applyEvent({ ...transcriptRef.current, messages: previous }, event)
          transcriptRef.current = next
          setRunning(next.running)
          return next.messages
        })
        break
      }
      case 'approval/requested': {
        const approval: PendingApproval = {
          rpcId: frame.rpcId,
          sessionId: String(frame.payload.sessionId ?? ''),
          approvalId: String(frame.payload.approvalId ?? ''),
          toolName: String(frame.payload.toolName ?? ''),
          reason: frame.payload.reason as string | undefined,
        }
        setApprovals((previous) =>
          previous.some((item) => item.approvalId === approval.approvalId) ? previous : [...previous, approval],
        )
        break
      }
      case 'approval/resolved': {
        const approvalId = String(frame.payload.approvalId ?? '')
        setApprovals((previous) => previous.filter((item) => item.approvalId !== approvalId))
        break
      }
      case 'question/requested': {
        const rawQuestions = (frame.payload.questions ?? []) as Record<string, unknown>[]
        const pending: PendingQuestion = {
          rpcId: frame.rpcId,
          sessionId: String(frame.payload.sessionId ?? ''),
          questions: rawQuestions.map((q) => ({
            id: String(q.id ?? ''),
            question: String(q.question ?? ''),
            header: q.header as string | undefined,
            multi_select: q.multi_select === true,
            options: q.options as PendingQuestion['questions'][number]['options'],
          })),
          drafts: rawQuestions.map((q) => ({ id: String(q.id ?? ''), selected: [], custom: '' })),
        }
        setQuestions((previous) => (previous.some((item) => item.rpcId === pending.rpcId) ? previous : [...previous, pending]))
        break
      }
      case 'question/resolved':
        setQuestions((previous) => previous.filter((item) => item.rpcId !== frame.rpcId))
        break
      case 'session/queue': {
        const sessionId = String(frame.payload.sessionId ?? '')
        if (sessionId === selectedRef.current) {
          setQueueLen(((frame.payload.items ?? []) as unknown[]).length)
        }
        break
      }
      case 'session/subscribed':
        void refreshSessions()
        break
      default:
        break
    }
  }

  useEffect(() => {
    backendStatus().then(setStatus).catch(() => setStatus(null))
    void refreshSessions()
    let un1: (() => void) | null = null
    let un2: (() => void) | null = null
    void onBackendStatus((next) => {
      setStatus(next)
      if (!next.running) setRunning(false)
    }).then((fn) => { un1 = fn })
    void onFrame(handleFrame).then((fn) => { un2 = fn })
    return () => { un1?.(); un2?.() }
  }, [])

  const send = useCallback(async (text: string, steer: boolean) => {
    if (!selected) return
    try {
      const value = (await rpc('session.prompt', {
        sessionId: selected,
        mode: steer ? 'steer' : 'queue',
        content: [{ type: 'text', text }],
      })) as { accepted?: boolean }
      if (value.accepted !== true) setStatusText('发送被拒绝')
    } catch (error) {
      setStatusText('发送失败：' + String(error))
    }
  }, [selected])

  const stop = useCallback(async () => {
    if (!selected) return
    try {
      await rpc('session.cancel', { sessionId: selected })
      setStatusText('已请求停止')
    } catch (error) {
      setStatusText('停止失败：' + String(error))
    }
  }, [selected])

  const answerApproval = useCallback(async (approval: PendingApproval, outcome: 'allowed-once' | 'rejected') => {
    try {
      const receipt = await respond(approval.rpcId, {
        sessionId: approval.sessionId,
        approvalId: approval.approvalId,
        outcome,
      })
      if (!receipt.accepted) setStatusText('审批应答未受理：' + (receipt.reason ?? '-'))
      setApprovals((previous) => previous.filter((item) => item.approvalId !== approval.approvalId))
    } catch (error) {
      setStatusText('审批应答失败：' + String(error))
    }
  }, [])

  const answerQuestions = useCallback(async (pending: PendingQuestion) => {
    try {
      const receipt = await respond(pending.rpcId, {
        sessionId: pending.sessionId,
        answer: {
          answers: pending.drafts.map((draft) => ({
            id: draft.id,
            selected: draft.selected,
            ...(draft.custom ? { custom: draft.custom } : {}),
          })),
        },
      })
      if (!receipt.accepted) setStatusText('提问应答未受理：' + (receipt.reason ?? '-'))
      setQuestions((previous) => previous.filter((item) => item.rpcId !== pending.rpcId))
    } catch (error) {
      setStatusText('提问应答失败：' + String(error))
    }
  }, [])

  const newSession = useCallback(async () => {
    try {
      const value = (await rpc('session.create', {})) as { sessionId?: string }
      if (value.sessionId) {
        await refreshSessions()
        await openSession(value.sessionId)
      }
    } catch (error) {
      setStatusText('新建会话失败：' + String(error))
    }
  }, [openSession, refreshSessions])

  return (
    <div className="app">
      <StatusBar
        status={status}
        statusText={statusText}
        onStart={() => startBackend().then(setStatus)}
        onStop={() => stopBackend().then(setStatus)}
        onNew={newSession}
      />
      <div className="body">
        <SessionList
          sessions={sessions}
          selected={selected}
          onSelect={openSession}
          onRefresh={refreshSessions}
        />
        <main className="conversation">
          <Transcript messages={messages} loading={historyLoading} running={running} blank={!selected} />
        </main>
        <Composer
          running={running}
          queueLen={queueLen}
          approvals={approvals}
          questions={questions}
          onSend={send}
          onStop={stop}
          onAnswerApproval={answerApproval}
          onAnswerQuestions={answerQuestions}
        />
      </div>
    </div>
  )
}
