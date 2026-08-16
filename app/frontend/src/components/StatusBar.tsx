import { Plus, Settings, Square, Triangle } from 'lucide-react'
import type { BackendStatus } from '../types'

interface Props {
  status: BackendStatus | null
  statusText: string
  settingsOpen: boolean
  onStart: () => void
  onStop: () => void
  onNew: () => void
  onToggleSettings: () => void
}

export default function StatusBar(props: Props) {
  const { status, statusText, settingsOpen, onStart, onStop, onNew, onToggleSettings } = props
  const running = status?.running ?? false
  const owned = status?.owned ?? false
  return (
    <header className="statusbar">
      <span className={"dot " + (running ? "on" : owned ? "starting" : "off")} />
      <span className="statuslabel">
        {running ? (owned ? "后台运行中（本程序管理）" : "后台运行中（外部进程）") : owned ? "后台启动中…" : "后台已停止"}
      </span>
      {!running && !owned && <button onClick={onStart}><Triangle size={12} /> 启动后台</button>}
      {running && owned && <button onClick={onStop}><Square size={12} /> 停止后台</button>}
      <span className="spacer" />
      <span className="statustext">{statusText}</span>
      <span className="spacer" />
      <button className={'icon-button' + (settingsOpen ? ' active' : '')} onClick={onToggleSettings} title="设置">
        <Settings size={14} />
      </button>
      <button className="primary" onClick={onNew}><Plus size={14} /> 新建会话</button>
    </header>
  )
}
