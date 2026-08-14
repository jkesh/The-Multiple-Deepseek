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

/** Validation errors keyed by field path (`members.0.role`, `defaultRole`, etc). */
type ValidationErrors = Record<string, string>

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

/** Default role templates for the quick-add button. These use role ids distinct
 * from the built-in DEFAULT_MEMBERS roster (planner, engineer, reviewer, explorer,
 * quick) so that adding a template never duplicates an existing role. */
const ROLE_TEMPLATES: RosterMember[] = [
  {
    role: 'analyst',
    label: 'data analyst',
    model: 'deepseek-v4-pro',
    persona: 'You are the data analysis specialist on a DeepSeek team. Examine datasets, find patterns, '
      + 'produce statistical summaries, and present actionable insights with clear evidence. '
      + 'Ask for missing data or assumptions instead of guessing.',
  },
  {
    role: 'auditor',
    label: 'security auditor',
    model: 'deepseek-v4-pro',
    persona: 'You are the security audit specialist on a DeepSeek team. Review code, configs, '
      + 'and dependencies for vulnerabilities, credential leaks, injection risks, and access control '
      + 'flaws. Be specific about severity and remediation.',
  },
  {
    role: 'frontend',
    label: 'UI/frontend developer',
    model: 'deepseek-v4-pro',
    persona: 'You are the frontend development specialist on a DeepSeek team. Build and maintain '
      + 'UI components, layouts, and interactions. Consider accessibility, responsiveness, and '
      + 'state management. Deliver clean, working code with minimal assumptions.',
  },
  {
    role: 'qa',
    label: 'quality assurance',
    model: 'deepseek-v4-flash',
    persona: 'You are the QA/testing specialist on a DeepSeek team. Design test cases, edge cases, '
      + 'and regression checks. Execute tests and report failures with reproduction steps and '
      + 'expected vs actual behaviour.',
  },
  {
    role: 'writer',
    label: 'documentation writer',
    model: 'deepseek-v4-flash',
    persona: 'You are the documentation specialist on a DeepSeek team. Write clear, well-structured '
      + 'documentation, READMEs, API references, and changelogs. Use consistent terminology and '
      + 'include examples where helpful.',
  },
]

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

/** Run field-level validation and return error key/value pairs. */
function validateRoster(draft: TeamRoster): ValidationErrors {
  const errors: ValidationErrors = {}
  if (draft.llmProvider.trim().length === 0) {
    errors.llmProvider = 'LLM 提供方路由不能为空'
  }
  if (draft.defaultRole.trim().length === 0) {
    errors.defaultRole = '默认角色不能为空'
  } else if (draft.members.length > 0 && !draft.members.some(m => m.role === draft.defaultRole)) {
    errors.defaultRole = `角色 "${draft.defaultRole}" 不在花名册中`
  }
  const seenRoles = new Set<string>()
  for (let i = 0; i < draft.members.length; i++) {
    const member = draft.members[i]
    const prefix = `members.${i}`
    if (member.role.trim().length === 0) {
      errors[`${prefix}.role`] = '角色名称不能为空'
    } else if (seenRoles.has(member.role)) {
      errors[`${prefix}.role`] = `角色 "${member.role}" 重复`
    }
    seenRoles.add(member.role)
    if (member.model.trim().length === 0) {
      errors[`${prefix}.model`] = '模型名称不能为空'
    }
    if (member.maxTokens !== undefined && member.maxTokens !== null) {
      if (!Number.isSafeInteger(member.maxTokens) || member.maxTokens <= 0) {
        errors[`${prefix}.maxTokens`] = 'maxTokens 必须是正整数'
      }
    }
  }
  if (draft.members.length === 0) {
    errors.members = '花名册至少需要一个角色'
  }
  return errors
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

const INVALID_INPUT_STYLE = {
  ...INPUT_STYLE,
  border: '1px solid #c0392b',
}

const LABEL_STYLE = { fontSize: 12, opacity: 0.7 } as const

const ERROR_TEXT_STYLE = { fontSize: 11, color: '#c0392b', marginTop: -2 } as const

const SMALL_BUTTON_STYLE = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid var(--dsw-border, rgba(127,127,127,0.25))',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
} as const

/**
 * The 团队模式 panel: one row per roster role with role/label/provider/model/
 * maxTokens/persona fields, validation, role templates, dropdown default-role
 * selection, and save/reset actions.
 * @param props - owner share plus the injected scope face.
 * @returns the section content tree.
 */
function TeamSettings({ scope, useSnapshot }: TeamSettingsInjected) {
  const snapshot = useSnapshot()
  const [draft, setDraft] = useState<TeamRoster | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [templateOpen, setTemplateOpen] = useState(false)
  const initialized = useRef(false)
  const templateRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!initialized.current && snapshot.status === 'ready' && snapshot.value !== undefined) {
      initialized.current = true
      setDraft(cloneRoster(snapshot.value))
    }
  }, [snapshot])

  // Close template menu when clicking outside.
  useEffect(() => {
    if (!templateOpen) return
    const handler = (event: MouseEvent): void => {
      if (templateRef.current !== null && !templateRef.current.contains(event.target as Node)) {
        setTemplateOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [templateOpen])

  if (snapshot.status === 'loading') return <p>加载中…</p>
  if (snapshot.status === 'unavailable') return <p>设置不可用（远程浏览器或未挂载设置服务）。</p>
  if (draft === null) return <p>未找到团队花名册配置。</p>

  const fieldError = (field: string): string | undefined => errors[field]

  const revalidate = (): void => { setErrors(validateRoster(draft)) }

  const updateMember = (index: number, patch: Partial<RosterMember>): void => {
    setDraft(prev => prev === null ? prev : patchMember(prev, index, patch))
  }

  const addMember = (template?: RosterMember): void => {
    setDraft(prev => {
      if (prev === null) return prev
      if (template !== undefined && prev.members.some(m => m.role === template.role)) {
        return prev
      }
      return {
        ...prev,
        members: [...prev.members, template !== undefined ? { ...template } : { role: '', model: '' }],
      }
    })
    setTemplateOpen(false)
  }

  const removeMember = (index: number): void => {
    setDraft(prev => prev === null ? prev : { ...prev, members: prev.members.filter((_, i) => i !== index) })
  }

  const save = async (): Promise<void> => {
    const validation = validateRoster(draft)
    setErrors(validation)
    if (Object.keys(validation).length > 0) {
      setMessage('请修正表单中的错误后再保存。')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      // One field per write; the Host validates the merged roster and rejects
      // a section the router cannot serve (empty members, unknown defaultRole).
      await scope.set('members', draft.members)
      await scope.set('defaultRole', draft.defaultRole)
      await scope.set('llmProvider', draft.llmProvider)
      setMessage('已保存；下一次团队任务即按新花名册路由。')
      setErrors({})
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

  const duplicateRoles = draft.members.filter(
    (member, index, arr) => arr.findIndex(m => m.role === member.role && m.role !== '') !== index,
  ).map(m => m.role)
  const availableRoles = [...new Set(draft.members.map(m => m.role).filter(r => r.length > 0))]

  return (
    <div>
      <p style={{ opacity: 0.75 }}>
        每个任务指定一个专家角色；角色决定使用哪个 DeepSeek 模型与人设。修改后点击保存即可生效（无需重启）。
      </p>
      {draft.members.map((member, index) => (
        <div key={index} style={ROW_STYLE}>
          <label style={LABEL_STYLE}>角色 role</label>
          <input
            style={fieldError(`members.${index}.role`) !== undefined ? INVALID_INPUT_STYLE : INPUT_STYLE}
            value={member.role}
            placeholder="planner"
            onChange={event => updateMember(index, { role: event.target.value })}
            onBlur={() => revalidate()}
          />
          {fieldError(`members.${index}.role`) !== undefined ? (
            <p style={ERROR_TEXT_STYLE}>{fieldError(`members.${index}.role`)}</p>
          ) : null}

          <label style={LABEL_STYLE}>显示标签 label（可选，默认同角色名）</label>
          <input
            style={INPUT_STYLE}
            value={member.label ?? ''}
            placeholder="strategic planner"
            onChange={event => updateMember(index, { label: event.target.value === '' ? undefined : event.target.value })}
          />

          <label style={LABEL_STYLE}>模型 model（如 deepseek-v4-pro）</label>
          <input
            style={fieldError(`members.${index}.model`) !== undefined ? INVALID_INPUT_STYLE : INPUT_STYLE}
            value={member.model}
            placeholder="deepseek-v4-pro"
            onChange={event => updateMember(index, { model: event.target.value })}
            onBlur={() => revalidate()}
          />
          {fieldError(`members.${index}.model`) !== undefined ? (
            <p style={ERROR_TEXT_STYLE}>{fieldError(`members.${index}.model`)}</p>
          ) : null}

          <label style={LABEL_STYLE}>LLM 提供方路由（默认 deepseek-official）</label>
          <input
            style={INPUT_STYLE}
            value={member.provider ?? ''}
            placeholder="deepseek-official"
            onChange={event => updateMember(index, { provider: event.target.value === '' ? undefined : event.target.value })}
          />

          <label style={LABEL_STYLE}>输出上限 maxTokens（可选，正整数）</label>
          <input
            style={fieldError(`members.${index}.maxTokens`) !== undefined ? INVALID_INPUT_STYLE : INPUT_STYLE}
            type="number"
            min={1}
            value={member.maxTokens !== undefined && member.maxTokens !== null ? String(member.maxTokens) : ''}
            placeholder="4096"
            onChange={event => {
              const raw = event.target.value.trim()
              updateMember(index, { maxTokens: raw.length === 0 ? undefined : Number(raw) })
            }}
            onBlur={() => revalidate()}
          />
          {fieldError(`members.${index}.maxTokens`) !== undefined ? (
            <p style={ERROR_TEXT_STYLE}>{fieldError(`members.${index}.maxTokens`)}</p>
          ) : null}

          <label style={LABEL_STYLE}>专家人设 persona（可选）</label>
          <textarea
            style={INPUT_STYLE}
            rows={2}
            value={member.persona ?? ''}
            placeholder="You are the planning specialist on a DeepSeek team…"
            onChange={event => updateMember(index, { persona: event.target.value === '' ? undefined : event.target.value })}
          />
          <button type="button" onClick={() => removeMember(index)} disabled={busy}
            style={{ ...SMALL_BUTTON_STYLE, alignSelf: 'flex-end' }}>
            删除该角色
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={addMember} disabled={busy} style={SMALL_BUTTON_STYLE}>
          + 添加空角色
        </button>
        <div ref={templateRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button type="button" onClick={() => setTemplateOpen(!templateOpen)} disabled={busy} style={SMALL_BUTTON_STYLE}>
            + 从模板添加
          </button>
          {templateOpen ? (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 10,
              background: 'var(--dsw-bg, #1e1e2e)',
              border: '1px solid var(--dsw-border, rgba(127,127,127,0.25))',
              borderRadius: 6,
              padding: 4,
              minWidth: 180,
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}>
              {ROLE_TEMPLATES.map(template => (
                <button key={template.role} type="button" onClick={() => addMember(template)}
                  style={{
                    ...SMALL_BUTTON_STYLE,
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: '6px 8px',
                  }}>
                  <strong>{template.role}</strong> — {template.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {fieldError('members') !== undefined ? (
        <p style={ERROR_TEXT_STYLE}>{fieldError('members')}</p>
      ) : null}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={LABEL_STYLE}>默认角色 defaultRole（任务未指定角色时使用）</label>
        {availableRoles.length > 0 ? (
          <select
            style={fieldError('defaultRole') !== undefined ? INVALID_INPUT_STYLE : INPUT_STYLE}
            value={draft.defaultRole}
            onChange={event => setDraft({ ...draft, defaultRole: event.target.value })}
            onBlur={() => revalidate()}>
            {!availableRoles.includes(draft.defaultRole) ? (
              <option value={draft.defaultRole}>⚠ {draft.defaultRole}（花名册中已移除该角色）</option>
            ) : (
              <option value={draft.defaultRole}>{draft.defaultRole}</option>
            )}
            {availableRoles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        ) : (
          <input
            style={fieldError('defaultRole') !== undefined ? INVALID_INPUT_STYLE : INPUT_STYLE}
            value={draft.defaultRole}
            placeholder="engineer"
            onChange={event => setDraft({ ...draft, defaultRole: event.target.value })}
            onBlur={() => revalidate()}
          />
        )}
        {fieldError('defaultRole') !== undefined ? (
          <p style={ERROR_TEXT_STYLE}>{fieldError('defaultRole')}</p>
        ) : null}
        <label style={LABEL_STYLE}>默认 LLM 路由 llmProvider</label>
        <input
          style={fieldError('llmProvider') !== undefined ? INVALID_INPUT_STYLE : INPUT_STYLE}
          value={draft.llmProvider}
          placeholder="deepseek-official"
          onChange={event => setDraft({ ...draft, llmProvider: event.target.value })}
          onBlur={() => revalidate()}
        />
        {fieldError('llmProvider') !== undefined ? (
          <p style={ERROR_TEXT_STYLE}>{fieldError('llmProvider')}</p>
        ) : null}
        {duplicateRoles.length > 0 ? (
          <p style={ERROR_TEXT_STYLE}>重复角色：{duplicateRoles.join(', ')}</p>
        ) : null}
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => { void save() }} disabled={busy || !snapshot.writable}
          style={{
            ...SMALL_BUTTON_STYLE,
            padding: '8px 16px',
            background: Object.keys(errors).length > 0 ? undefined : 'var(--dsw-accent, #4f8cff)',
            color: Object.keys(errors).length > 0 ? undefined : '#fff',
            borderColor: Object.keys(errors).length > 0 ? '#c0392b' : undefined,
          }}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button type="button" onClick={() => { void reset() }} disabled={busy || !snapshot.writable} style={SMALL_BUTTON_STYLE}>
          重置为默认
        </button>
      </div>
      {message !== null ? (
        <p style={{ marginTop: 8, color: message.startsWith('已') || message.startsWith('请修正') ? undefined : '#c0392b' }}>
          {message}
        </p>
      ) : null}
    </div>
  )
}