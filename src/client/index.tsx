/**
 * The-Multiple-Deepseek settings panel, browser half: the 团队模式 section
 * that edits the `multiple-deepseek` settings namespace — the role-to-model
 * roster the deepseek_team tool routes through. The Host plugin registers the
 * namespace; this panel reads and writes it through `ctx.settingsScope`.
 */

import type {
  ClientContext,
  SettingsScope,
  SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { useEffect, useRef, useState } from 'react'
// Type-only: the settings-section slot contract and the settingsScope service
// declaration (erased at build time; resolved at runtime through the loader).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

/** One roster member as edited by the panel. */
interface RosterMember {
  role: string
  label?: string
  provider?: string
  model: string
  maxTokens?: number
  persona?: string
}

/** The user-editable roster slice of the plugin's settings section. */
interface TeamRoster {
  llmProvider: string
  defaultRole: string
  members: RosterMember[]
}

/** Settings namespace registered by the plugin's Host half. */
const NAMESPACE = 'multiple-deepseek'

/** Injected face shared by the plugin body and the panel component. */
interface TeamSettingsInjected {
  /** Bound settings scope over the roster namespace. */
  scope: SettingsScope<TeamRoster>
  /** React binding over the scope snapshot (bare observable behind a hook). */
  useSnapshot: () => SettingsScopeSnapshot<TeamRoster>
}

/** Required services: the slot target resolves through slots.inject. */
export const inject = ['slots', 'settingsScope', 'connection', 'remote']

/**
 * Register the 团队模式 settings section once the `settings.section`
 * declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<TeamRoster>({ namespace: NAMESPACE })
  // The scope is the one bare observable the panel reads; the framework
  // binding stays in this plugin body, never inside the component.
  const useSnapshot = bindSnapshotSelector(scope as never)
  const injected = (): TeamSettingsInjected => ({ scope, useSnapshot })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'team',
    order: 20,
    label: () => '团队模式 Team Mode',
    inject: injected,
  }, TeamSettings))
}

/** Clone a roster for the editable draft. */
function cloneRoster(roster: TeamRoster): TeamRoster {
  return {
    llmProvider: roster.llmProvider,
    defaultRole: roster.defaultRole,
    members: roster.members.map(member => ({
      role: member.role,
      ...member.label === undefined ? {} : { label: member.label },
      ...member.provider === undefined ? {} : { provider: member.provider },
      model: member.model,
      ...member.maxTokens === undefined ? {} : { maxTokens: member.maxTokens },
      ...member.persona === undefined ? {} : { persona: member.persona },
    })),
  }
}

/** Replace one draft member field and return the next draft. */
function patchMember(draft: TeamRoster, index: number, patch: Partial<RosterMember>): TeamRoster {
  const members = draft.members.map((member, i) => i === index ? { ...member, ...patch } : member)
  return { ...draft, members }
}

const ROW_STYLE = {
  border: '1px solid var(--dsw-border, rgba(127,127,127,0.25))',
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
} as const

const INPUT_STYLE = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--dsw-border, rgba(127,127,127,0.25))',
  background: 'transparent',
  color: 'inherit',
} as const

const LABEL_STYLE = { fontSize: 12, opacity: 0.7 } as const

/**
 * The 团队模式 panel: one row per roster role with role/provider/model and
 * persona fields, the default role and LLM route, and save/reset actions.
 * @param props - owner share plus the injected scope face.
 * @returns the section content tree.
 */
function TeamSettings({ scope, useSnapshot }: TeamSettingsInjected) {
  const snapshot = useSnapshot()
  const [draft, setDraft] = useState<TeamRoster | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current && snapshot.status === 'ready' && snapshot.value !== undefined) {
      initialized.current = true
      setDraft(cloneRoster(snapshot.value))
    }
  }, [snapshot])

  if (snapshot.status === 'loading') return <p>加载中…</p>
  if (snapshot.status === 'unavailable') return <p>设置不可用（远程浏览器或未挂载设置服务）。</p>
  if (draft === null) return <p>未找到团队花名册配置。</p>

  const updateMember = (index: number, patch: Partial<RosterMember>): void => {
    setDraft(prev => prev === null ? prev : patchMember(prev, index, patch))
  }
  const addMember = (): void => {
    setDraft(prev => prev === null ? prev : { ...prev, members: [...prev.members, { role: '', model: '' }] })
  }
  const removeMember = (index: number): void => {
    setDraft(prev => prev === null ? prev : { ...prev, members: prev.members.filter((_, i) => i !== index) })
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      // One field per write; the Host validates the merged roster and rejects
      // a section the router cannot serve (empty members, unknown defaultRole).
      await scope.set('members', draft.members)
      await scope.set('defaultRole', draft.defaultRole)
      await scope.set('llmProvider', draft.llmProvider)
      setMessage('已保存；下一次团队任务即按新花名册路由。')
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const reset = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      await scope.unset('members')
      await scope.unset('defaultRole')
      await scope.unset('llmProvider')
      setMessage('已重置为组合默认花名册。')
    } catch (error) {
      setMessage(`重置失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p style={{ opacity: 0.75 }}>
        每个任务指定一个专家角色；角色决定使用哪个 DeepSeek 模型与人设。修改后点击保存即可生效（无需重启）。
      </p>
      {draft.members.map((member, index) => (
        <div key={index} style={ROW_STYLE}>
          <label style={LABEL_STYLE}>角色 role</label>
          <input
            style={INPUT_STYLE}
            value={member.role}
            placeholder="planner"
            onChange={event => updateMember(index, { role: event.target.value })}
          />
          <label style={LABEL_STYLE}>模型 model（如 deepseek-v4-pro）</label>
          <input
            style={INPUT_STYLE}
            value={member.model}
            placeholder="deepseek-v4-pro"
            onChange={event => updateMember(index, { model: event.target.value })}
          />
          <label style={LABEL_STYLE}>LLM 提供方路由（默认 deepseek-official）</label>
          <input
            style={INPUT_STYLE}
            value={member.provider ?? ''}
            placeholder="deepseek-official"
            onChange={event => updateMember(index, { provider: event.target.value })}
          />
          <label style={LABEL_STYLE}>专家人设 persona（可选）</label>
          <textarea
            style={INPUT_STYLE}
            rows={2}
            value={member.persona ?? ''}
            placeholder="You are the planning specialist on a DeepSeek team…"
            onChange={event => updateMember(index, { persona: event.target.value })}
          />
          <button type="button" onClick={() => removeMember(index)} disabled={busy}>
            删除该角色
          </button>
        </div>
      ))}
      <button type="button" onClick={addMember} disabled={busy}>+ 添加角色</button>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={LABEL_STYLE}>默认角色 defaultRole（任务未指定角色时使用）</label>
        <input
          style={INPUT_STYLE}
          value={draft.defaultRole}
          onChange={event => setDraft({ ...draft, defaultRole: event.target.value })}
        />
        <label style={LABEL_STYLE}>默认 LLM 路由 llmProvider</label>
        <input
          style={INPUT_STYLE}
          value={draft.llmProvider}
          onChange={event => setDraft({ ...draft, llmProvider: event.target.value })}
        />
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => { void save() }} disabled={busy || !snapshot.writable}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button type="button" onClick={() => { void reset() }} disabled={busy || !snapshot.writable}>
          重置为默认
        </button>
      </div>
      {message !== null ? <p style={{ marginTop: 8, color: message.startsWith('已') ? undefined : '#c0392b' }}>{message}</p> : null}
    </div>
  )
}
