import { motion } from 'framer-motion'
import { Folder, FolderOpen, GitBranch, Loader2, MessageSquare, RefreshCw } from 'lucide-react'
import type { SessionSummary, WorkspaceView } from '../types'

interface Props {
  sessions: SessionSummary[]
  workspaces: WorkspaceView[]
  selected: string | null
  onSelect: (sessionId: string) => void
  onRefresh: () => void
}

function rowLabel(session: SessionSummary): string {
  const title = (session.projections?.values as { title?: string } | undefined)?.title
  return title ?? session.sessionId
}

function SessionRow(props: {
  session: SessionSummary
  selected: string | null
  onSelect: (sessionId: string) => void
}) {
  const { session, selected, onSelect } = props
  const isSubagent = session.origin === "subagent"
  return (
    <motion.button
      layout
      className={"session-row " + (selected === session.sessionId ? "selected" : "")}
      onClick={() => onSelect(session.sessionId)}
    >
      {isSubagent ? <GitBranch size={13} className="dim" /> : <MessageSquare size={13} className="dim" />}
      <span className="session-title">{rowLabel(session)}</span>
      {isSubagent && <span className="badge">子代理</span>}
    </motion.button>
  )
}

export default function SessionList(props: Props) {
  const { sessions, workspaces, selected, onSelect, onRefresh } = props
  const running = sessions.filter((session) => session.running)
  const workspaceSessions = new Set(workspaces.flatMap((workspace) => workspace.sessionIds))
  const ungrouped = sessions.filter((session) => !session.running && !workspaceSessions.has(session.sessionId))

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span>会话</span>
        <button className="icon-button" onClick={onRefresh} title="刷新"><RefreshCw size={13} /></button>
      </div>
      <div className="session-scroll">
        {running.length > 0 && (
          <section className="session-section">
            <h3><Loader2 size={11} /> 后台任务 <span className="count">{running.length}</span></h3>
            {running.map((session) => (
              <SessionRow key={session.sessionId} session={session} selected={selected} onSelect={onSelect} />
            ))}
          </section>
        )}
        {workspaces.map((workspace) => {
          const items = sessions.filter((session) => workspace.sessionIds.includes(session.sessionId) && !session.running)
          if (items.length === 0) return null
          const open = items.some((session) => session.sessionId === selected)
          return (
            <section key={workspace.workspaceId} className="session-section">
              <h3>{open ? <FolderOpen size={11} /> : <Folder size={11} />} {workspace.title} <span className="count">{items.length}</span></h3>
              {items.map((session) => (
                <SessionRow key={session.sessionId} session={session} selected={selected} onSelect={onSelect} />
              ))}
            </section>
          )
        })}
        {ungrouped.length > 0 && (
          <section className="session-section">
            <h3><Folder size={11} /> 未分类 <span className="count">{ungrouped.length}</span></h3>
            {ungrouped.map((session) => (
              <SessionRow key={session.sessionId} session={session} selected={selected} onSelect={onSelect} />
            ))}
          </section>
        )}
      </div>
    </aside>
  )
}
