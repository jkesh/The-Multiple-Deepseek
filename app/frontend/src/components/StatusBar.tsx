import type { BackendStatus } from '../types'

interface Props {
  status: BackendStatus | null
  statusText: string
  onStart: () => void
  onStop: () => void
  onNew: () => void
}

export default function StatusBar({ status, statusText, onStart, onStop, onNew }: Props) {
  const running = status?.running ?? false
  const owned = status?.owned ?? false
  return (
    <header className="statusbar">
      <span className={'dot ' + (running ? 'on' : owned ? 'starting' : 'off')} />
      <span className="statuslabel">
        {running ? (owned ? '后台运行中（本程序管理）' : '后台运行中（外部进程）') : owned ? '后台启动中…' : '后台已停止'}
      </span>
      {!running && !owned && <button onClick={onStart}>启动后台</button>}
      {running && owned && <button onClick={onStop}>停止后台</button>}
      <span className="spacer" />
      <span className="statustext">{statusText}</span>
      <span className="spacer" />
      <button className="primary" onClick={onNew}>新建会话</button>
    </header>
  )
}
