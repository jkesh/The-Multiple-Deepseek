import { useState } from 'react'
import { Cpu, Send, Square, X } from 'lucide-react'
import type { PendingApproval, PendingQuestion } from '../types'

interface Props {
  running: boolean
  queueLen: number
  currentModel: string | null
  approvals: PendingApproval[]
  questions: PendingQuestion[]
  onSend: (text: string, steer: boolean) => void
  onStop: () => void
  onOpenModel: () => void
  onAnswerApproval: (approval: PendingApproval, outcome: "allowed-once" | "rejected") => void
  onAnswerQuestions: (pending: PendingQuestion) => void
}

export default function Composer(props: Props) {
  const { running, queueLen, currentModel, approvals, questions, onSend, onStop, onOpenModel, onAnswerApproval, onAnswerQuestions } = props
  const [draft, setDraft] = useState("")

  if (questions.length > 0) {
    const pending = questions[0]
    return (
      <footer className="composer takeover">
        <QuestionPanel pending={pending} onAnswer={onAnswerQuestions} />
      </footer>
    )
  }
  if (approvals.length > 0) {
    const approval = approvals[0]
    return (
      <footer className="composer takeover">
        <div className="approval">
          <div className="approval-head">● 等待审批</div>
          <div className="approval-reason">{approval.reason ?? "工具 " + approval.toolName + " 请求越权执行"}</div>
          <div className="approval-actions">
            <button onClick={() => onAnswerApproval(approval, "rejected")}><X size={13} /> 拒绝</button>
            <button className="primary" onClick={() => onAnswerApproval(approval, "allowed-once")}>允许一次</button>
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer className="composer">
      {running && queueLen > 0 && <div className="queue">⏸ {queueLen} 条排队消息</div>}
      <div className="composer-row">
        <button className="model-seat" onClick={onOpenModel} title="切换模型">
          <Cpu size={13} />
          <span>{currentModel ?? "选择模型"}</span>
        </button>
        <textarea
          value={draft}
          placeholder={running ? "正在生成中 — Enter 加入队列，Ctrl+Enter 插话" : "给智能体发消息"}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (draft.trim()) {
                onSend(draft, event.ctrlKey || event.metaKey)
                setDraft("")
              }
            }
          }}
        />
        {running ? (
          <button className="stop" onClick={onStop}><Square size={13} /> 停止</button>
        ) : (
          <button className="primary" disabled={!draft.trim()} onClick={() => {
            onSend(draft, false)
            setDraft("")
          }}><Send size={13} /> 发送</button>
        )}
      </div>
    </footer>
  )
}
function QuestionPanel(props: { pending: PendingQuestion; onAnswer: (pending: PendingQuestion) => void }) {
  const { pending, onAnswer } = props
  const [drafts, setDrafts] = useState(pending.drafts)
  const ready: PendingQuestion = { ...pending, drafts }
  return (
    <div className="questions">
      {pending.questions.map((question, index) => (
        <div key={question.id} className="question">
          <div className="question-head">{question.header ?? "问题"} {index + 1} / {pending.questions.length}</div>
          <div>{question.question}</div>
          {question.options?.map((option) => {
            const draft = drafts[index]
            const checked = draft?.selected.includes(option.label) ?? false
            return (
              <label key={option.label} className="option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setDrafts((previous) => {
                      const next = [...previous]
                      const current = next[index] ?? { id: question.id, selected: [], custom: "" }
                      next[index] = {
                        ...current,
                        selected: checked
                          ? current.selected.filter((item) => item !== option.label)
                          : question.multi_select
                            ? [...current.selected, option.label]
                            : [option.label],
                      }
                      return next
                    })
                  }}
                />
                {option.label}
              </label>
            )
          })}
        </div>
      ))}
      <button className="primary" onClick={() => onAnswer(ready)}>提交回答</button>
    </div>
  )
}
