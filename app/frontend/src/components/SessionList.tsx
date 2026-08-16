import { motion } from 'framer-motion'
import type { SessionSummary } from '../types'

interface Props {
  sessions: SessionSummary[]
  selected: string | null
  onSelect: (sessionId: string) => void
  onRefresh: () => void
}

function rowLabel(session: SessionSummary): string {
  const title = (session.projections?.values as { title?: string } | undefined)?.title
  return title ?? session.sessionId
}

export default function SessionList({ sessions, selected, onSelect, onRefresh }: Props) {
  const running = sessions.filter((session) => session.running)
  const subagents = sessions.filter((session) => !session.running && session.origin === 'subagent')
  const mains = sessions.filter((session) => !session.running && session.origin !== 'subagent')

  const section = (title: string, items: SessionSummary[], kind: string) => (
    <section className="session-section">
      <h3>{title} <span className="count">{items.length}</span></h3>
      {items.map((session) => (
        <motion.button
          key={session.sessionId}
          layout
          className={'session-row ' + (selected === session.sessionId ? 'selected' : '')}
          onClick={() => onSelect(session.sessionId)}
        >
          <span className={'dot ' + (session.running ? 'on' : 'off')} />
          <span className="session-title">{rowLabel(session)}</span>
          {kind === 'subagent' && session.parentSessionId && (
            <span className="badge">子代理</span>
          )}
        </motion.button>
      ))}
    </section>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span>会话</span>
        <button onClick={onRefresh}>刷新</button>
      </div>
      {section('后台任务', running, 'task')}
      {section('主会话', mains, 'main')}
      {section('子代理', subagents, 'subagent')}
    </aside>
  )
}
