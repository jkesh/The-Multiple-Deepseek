import { useEffect, useState } from 'react'
import { ArrowLeft, Cpu, SlidersHorizontal } from 'lucide-react'
import { rpc } from '../core'
import { NamespaceList } from './schema-form'
import type { AgentPresetEntry, ModelProviderGroup, ModelSelection, SettingsNamespace } from '../types'

interface Props {
  sessionId: string | null
  onBack: () => void
  onStatus: (message: string) => void
}

export default function SettingsView({ sessionId, onBack, onStatus }: Props) {
  const [namespaces, setNamespaces] = useState<SettingsNamespace[]>([])
  const [groups, setGroups] = useState<ModelProviderGroup[]>([])
  const [current, setCurrent] = useState<ModelSelection | null>(null)
  const [presets, setPresets] = useState<AgentPresetEntry[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<string | null>(null)
  const [preset, setPreset] = useState('')

  const refreshSettings = async () => {
    try {
      const value = (await rpc('settings.describe', {})) as { namespaces?: SettingsNamespace[] }
      setNamespaces(value.namespaces ?? [])
    } catch (error) {
      onStatus('设置加载失败：' + String(error))
    }
  }

  const refreshModels = async () => {
    try {
      const list = (await rpc('agentPreset.list', {})) as { presets?: AgentPresetEntry[] }
      setPresets(list.presets ?? [])
    } catch {
      /* presets are optional */
    }
    if (!sessionId) return
    try {
      const value = (await rpc('session.models', { sessionId })) as {
        current?: ModelSelection
        groups?: ModelProviderGroup[]
      }
      setGroups(value.groups ?? [])
      setCurrent(value.current ?? null)
      setProvider(value.current?.provider ?? '')
      setModel(value.current?.model ?? '')
      setEffort(value.current?.reasoningEffort ?? null)
    } catch (error) {
      onStatus('模型目录加载失败：' + String(error))
    }
  }

  useEffect(() => {
    void refreshSettings()
    void refreshModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const activeGroup = groups.find((group) => group.id === provider)
  const activeModel = activeGroup?.models.find((item) => item.id === model)

  return (
    <aside className="sidebar settings">
      <div className="sidebar-head">
        <button className="icon-button" onClick={onBack} title="返回会话"><ArrowLeft size={15} /></button>
        <span>设置</span>
        <span />
      </div>
      <div className="settings-scroll">
        <div className="section-head"><Cpu size={13} /> 模型与预设</div>
        <div className="ns-card">
          <label className="schema-label">Provider</label>
          <select className="schema-input" value={provider} onChange={(event) => {
            setProvider(event.target.value)
            const group = groups.find((item) => item.id === event.target.value)
            setModel(group?.models[0]?.id ?? '')
          }}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <label className="schema-label">模型</label>
          <select className="schema-input" value={model} onChange={(event) => setModel(event.target.value)}>
            {(activeGroup?.models ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.name ?? item.id}</option>
            ))}
          </select>
          {activeModel?.reasoning && (
            <>
              <label className="schema-label">推理强度</label>
              <select className="schema-input" value={effort ?? ''} onChange={(event) => setEffort(event.target.value || null)}>
                <option value="">默认</option>
                {activeModel.reasoning.efforts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={!sessionId || !provider || !model}
              onClick={async () => {
                try {
                  const value = (await rpc('session.selectModel', {
                    sessionId, provider, model, reasoningEffort: effort ?? null,
                  })) as { selected?: ModelSelection }
                  if (value.selected) setCurrent(value.selected)
                  onStatus('模型已切换')
                } catch (error) {
                  onStatus('切换模型失败：' + String(error))
                }
              }}
            >应用模型</button>
          </div>
          {current && (
            <div className="ns-meta">当前：{current.provider} / {current.model}{current.reasoningEffort ? ' · ' + current.reasoningEffort : ''}</div>
          )}
        </div>
        <div className="ns-card">
          <label className="schema-label">Agent 预设</label>
          <select className="schema-input" value={preset} onChange={(event) => setPreset(event.target.value)}>
            <option value="">选择预设</option>
            {presets.map((item) => <option key={item.id} value={item.id}>{item.id}{item.isDefault ? '（默认）' : ''}</option>)}
          </select>
          <div className="actions">
            <button
              className="primary"
              disabled={!sessionId || !preset}
              onClick={async () => {
                try {
                  await rpc('agentPreset.select', { sessionId, agentPreset: preset })
                  onStatus('预设已切换')
                } catch (error) {
                  onStatus('切换预设失败：' + String(error))
                }
              }}
            >应用预设</button>
          </div>
        </div>
        <div className="section-head"><SlidersHorizontal size={13} /> 设置</div>
        <NamespaceList
          namespaces={namespaces}
          onSaved={() => { onStatus('已保存'); void refreshSettings() }}
          onError={onStatus}
          onRefresh={refreshSettings}
        />
      </div>
    </aside>
  )
}
