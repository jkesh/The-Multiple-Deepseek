/**
 * Team-mode settings section for The-Multiple-Deepseek.
 */

import type { ClientContext, SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConfigurableProviderView, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import {
  Button,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconPlusOutline16,
  IconRefreshOutline14,
  IconTrashOutline16,
  Menu,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import css from './team-settings.module.css'

import { normalizedRoster, validateRoster } from './team-settings-state.ts'
import type { RosterMember, TeamRoster } from './team-settings-state.ts'

type Notice = { kind: 'success' | 'error'; text: string }

const NAMESPACE = 'multiple-deepseek'

type SnapshotSelector<T> = <S>(
  selector: (snapshot: T) => S,
  equality?: (left: S, right: S) => boolean,
) => S

interface TeamSettingsInjected {
  scope: SettingsScope<TeamRoster>
  useSnapshot: SnapshotSelector<SettingsScopeSnapshot<TeamRoster>>
  listProviders: () => Promise<ConfigurableProviderView[]>
}

export const inject = ['slots', 'settingsScope', 'connection', 'remote']

const ROLE_TEMPLATES: RosterMember[] = [
  { role: 'analyst', label: 'data analyst', model: 'deepseek-v4-pro', persona: 'You are the data analysis specialist on a DeepSeek team. Examine data, find patterns, and present actionable insights with clear evidence.' },
  { role: 'auditor', label: 'security auditor', model: 'deepseek-v4-pro', persona: 'You are the security audit specialist on a DeepSeek team. Review code, configuration, and dependencies for vulnerabilities and provide concrete remediation.' },
  { role: 'frontend', label: 'UI/frontend developer', model: 'deepseek-v4-pro', persona: 'You are the frontend specialist on a DeepSeek team. Build accessible, responsive interfaces and deliver clean, working code.' },
  { role: 'qa', label: 'quality assurance', model: 'deepseek-v4-flash', persona: 'You are the QA specialist on a DeepSeek team. Design and execute regression tests, then report failures with concise reproduction steps.' },
  { role: 'writer', label: 'documentation writer', model: 'deepseek-v4-flash', persona: 'You are the documentation specialist on a DeepSeek team. Write clear READMEs, API references, and changelogs with consistent terminology.' },
]

export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<TeamRoster>({ namespace: NAMESPACE })
  const useSnapshot = bindSnapshotSelector(scope as never)
  const connection = ctx.get('connection') as { readonly api?: IApiClient } | undefined
  const listProviders = async (): Promise<ConfigurableProviderView[]> => {
    if (connection?.api === undefined) return []
    try {
      const response = await connection.api.llm.providers({})
      return response.result.ok ? response.result.value.providers : []
    } catch {
      return []
    }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'team',
    order: 20,
    label: () => '团队模式 Team Mode',
    inject: (): TeamSettingsInjected => ({ scope, useSnapshot, listProviders }),
  }, TeamSettings))
}

function cloneRoster(roster: TeamRoster): TeamRoster {
  return {
    llmProvider: roster.llmProvider,
    defaultRole: roster.defaultRole,
    members: roster.members.map(member => ({ ...member })),
  }
}

function sameRoster(left: TeamRoster, right: TeamRoster): boolean {
  return JSON.stringify(normalizedRoster(left)) === JSON.stringify(normalizedRoster(right))
}

function TeamSettings({ scope, useSnapshot, listProviders }: TeamSettingsInjected) {
  const snapshot = useSnapshot(value => value)
  const [draft, setDraft] = useState<TeamRoster | null>(null)
  const [baseline, setBaseline] = useState<TeamRoster | null>(null)
  const [providers, setProviders] = useState<ConfigurableProviderView[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))
  const [templateOpen, setTemplateOpen] = useState(false)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    let cancelled = false
    void listProviders().then(next => {
      if (!cancelled) setProviders(next)
    }).catch(() => {
      if (!cancelled) setProviders([])
    })
    return () => { cancelled = true }
  }, [listProviders])

  useEffect(() => {
    if (snapshot.status !== 'ready' || snapshot.value === undefined) return
    if (!initialized.current) {
      initialized.current = true
      const next = cloneRoster(snapshot.value)
      setDraft(next)
      setBaseline(cloneRoster(next))
      if (resetPending) {
        setResetPending(false)
        setNotice({ kind: 'success', text: '已恢复组合默认值。' })
      }
    }
  }, [snapshot, resetPending])

  const errors = useMemo(() => draft === null ? {} : validateRoster(draft), [draft])
  const dirty = draft !== null && baseline !== null && !sameRoster(draft, baseline)
  const availableRoles = draft?.members.map(member => member.role.trim()).filter(Boolean) ?? []
  const templateItems = ROLE_TEMPLATES.map(template => ({
    id: template.role,
    label: <span><strong>{template.role}</strong><span className={css.templateLabel}>{template.label}</span></span>,
    disabled: draft?.members.some(member => member.role.trim() === template.role) ?? false,
  }))
  const roleItems = [...new Set(availableRoles)].map(role => ({
    id: role,
    label: <span>{role}</span>,
  }))
  const selectedProvider = providers.find(provider => provider.provider === draft?.llmProvider && provider.active)
  const providerItems = providers.filter(provider => provider.active).map(provider => ({
    id: provider.provider,
    label: (
      <span>
        <strong>{provider.displayName}</strong>
        <span className={css.templateLabel}>{provider.provider}</span>
      </span>
    ),
  }))
  if (selectedProvider === undefined && draft !== null) {
    providerItems.unshift({
      id: draft.llmProvider,
      label: <span><strong>{draft.llmProvider || '未找到提供商'}</strong><span className={css.templateLabel}>当前路由</span></span>,
    })
  }

  if (snapshot.status === 'loading') return <p className={css.state}>正在加载团队配置...</p>
  if (snapshot.status === 'unavailable') return <p className={css.state} role="alert">设置服务不可用。请确认当前窗口连接到本机 DSH。</p>
  if (draft === null || baseline === null) return <p className={css.state}>未找到团队花名册配置。</p>

  const updateMember = (index: number, patch: Partial<RosterMember>): void => {
    setNotice(null)
    setDraft(current => current === null ? current : {
      ...current,
      members: current.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member),
    })
  }

  const addMember = (member: RosterMember): void => {
    setDraft(current => current === null ? current : { ...current, members: [...current.members, { ...member }] })
    setExpanded(current => new Set([...current, draft.members.length]))
    setTemplateOpen(false)
    setNotice(null)
  }

  const removeMember = (index: number): void => {
    setDraft(current => {
      if (current === null) return current
      const members = current.members.filter((_, memberIndex) => memberIndex !== index)
      const defaultRole = current.defaultRole === current.members[index]?.role ? members[0]?.role ?? '' : current.defaultRole
      return { ...current, members, defaultRole }
    })
    setExpanded(current => new Set([...current].filter(value => value !== index).map(value => value > index ? value - 1 : value)))
    setNotice(null)
  }

  const restoreDraft = (): void => {
    setDraft(cloneRoster(baseline))
    setNotice(null)
  }

  const save = async (): Promise<void> => {
    if (Object.keys(errors).length > 0) {
      setNotice({ kind: 'error', text: '请修正标记的字段后再保存。' })
      return
    }
    const next = normalizedRoster(draft)
    setBusy(true)
    setNotice(null)
    try {
      await scope.set('members', next.members)
      await scope.set('defaultRole', next.defaultRole)
      await scope.set('llmProvider', next.llmProvider)
      setDraft(cloneRoster(next))
      setBaseline(cloneRoster(next))
      setNotice({ kind: 'success', text: '已保存。下一次团队任务将使用新花名册。' })
    } catch (error) {
      setNotice({ kind: 'error', text: `保存失败：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBusy(false)
    }
  }

  const reset = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      await scope.unset('members')
      await scope.unset('defaultRole')
      await scope.unset('llmProvider')
      initialized.current = false
      setResetPending(true)
      setDraft(null)
      setBaseline(null)
      setExpanded(new Set([0]))
    } catch (error) {
      setNotice({ kind: 'error', text: `重置失败：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.root}>
      <header className={css.header}>
        <div>
          <h2 className={css.title}>团队路由</h2>
          <p className={css.intro}>配置角色、模型和专家人设。任务只选择角色，实际模型由这里统一路由。</p>
        </div>
        <span className={dirty ? css.dirty : css.saved}>{dirty ? '有未保存修改' : '配置已同步'}</span>
      </header>

      <section className={css.defaults} aria-labelledby="team-defaults-title">
        <h3 id="team-defaults-title" className={css.sectionTitle}>默认路由</h3>
        <div className={css.fieldGrid}>
          <div className={css.field}>
            <span className={css.label}>默认角色</span>
            <Menu open={roleMenuOpen} items={roleItems} selectedId={draft.defaultRole} compact portal
              anchor={(
                <button type="button" className={`${errors.defaultRole ? css.invalid : css.control} ${css.select}`}
                  aria-haspopup="menu" aria-expanded={roleMenuOpen} disabled={busy}
                  onClick={() => setRoleMenuOpen(open => !open)}>
                  <span className={css.selectText}>{draft.defaultRole || '请选择角色'}</span>
                  <IconChevronDownOutline14 className={css.selectChevron} />
                </button>
              )}
              onSelect={id => { setDraft({ ...draft, defaultRole: id }); setNotice(null); setRoleMenuOpen(false) }}
              onClose={() => setRoleMenuOpen(false)} />
            {errors.defaultRole && <span className={css.error}>{errors.defaultRole}</span>}
          </div>
          <div className={css.field}>
            <span className={css.label}>默认 LLM 路由</span>
            <Menu open={providerMenuOpen} items={providerItems} selectedId={draft.llmProvider} compact portal
              anchor={(
                <button type="button" className={`${errors.llmProvider ? css.invalid : css.control} ${css.select}`}
                  aria-haspopup="menu" aria-expanded={providerMenuOpen} disabled={busy}
                  onClick={() => setProviderMenuOpen(open => !open)}>
                  <span className={css.selectText}>
                    {selectedProvider ? selectedProvider.displayName : draft.llmProvider || '请选择路由'}
                  </span>
                  <IconChevronDownOutline14 className={css.selectChevron} />
                </button>
              )}
              onSelect={id => { setDraft({ ...draft, llmProvider: id }); setNotice(null); setProviderMenuOpen(false) }}
              onClose={() => setProviderMenuOpen(false)} />
            {errors.llmProvider && <span className={css.error}>{errors.llmProvider}</span>}
          </div>
        </div>
      </section>

      <section aria-labelledby="team-members-title">
        <div className={css.sectionHeader}>
          <div>
            <h3 id="team-members-title" className={css.sectionTitle}>专家角色</h3>
            <span className={css.count}>{draft.members.length} 个角色</span>
          </div>
          <div className={css.actions}>
            <Button size="sm" variant="outline" icon={<IconPlusOutline16 size={14} />}
              onClick={() => addMember({ role: '', model: '' })} disabled={busy}>空白角色</Button>
            <Menu open={templateOpen} items={templateItems} portal compact
              anchor={<Button size="sm" variant="outline" icon={<IconPlusOutline16 size={14} />}
                onClick={() => setTemplateOpen(open => !open)} disabled={busy}>模板</Button>}
              onSelect={id => { const template = ROLE_TEMPLATES.find(item => item.role === id); if (template) addMember(template) }}
              onClose={() => setTemplateOpen(false)} />
          </div>
        </div>
        <div className={css.roster}>
          {draft.members.map((member, index) => {
            const open = expanded.has(index)
            const memberHasError = Object.keys(errors).some(key => key.startsWith(`members.${index}.`))
            return (
              <article key={index} className={memberHasError ? css.memberInvalid : css.member}>
                <div className={css.memberSummary}>
                  <button type="button" className={css.expandButton} aria-expanded={open}
                    onClick={() => setExpanded(current => {
                      const next = new Set(current)
                      if (next.has(index)) next.delete(index); else next.add(index)
                      return next
                    })}>
                    {open ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
                    <span className={css.memberIdentity}>
                      <strong>{member.role.trim() || '未命名角色'}</strong>
                      <span>{member.label?.trim() || member.model.trim() || '尚未配置模型'}</span>
                    </span>
                  </button>
                  <span className={css.modelBadge}>{member.model.trim() || 'model unset'}</span>
                  <Tooltip label="删除角色" side="top">
                    <button type="button" className={css.iconButton} aria-label={`删除角色 ${member.role || index + 1}`}
                      onClick={() => removeMember(index)} disabled={busy}><IconTrashOutline16 /></button>
                  </Tooltip>
                </div>
                {open && (
                  <div className={css.memberBody}>
                    <div className={css.fieldGrid}>
                      <label className={css.field}><span className={css.label}>角色 ID</span>
                        <input className={errors[`members.${index}.role`] ? css.invalid : css.control} value={member.role}
                          placeholder="planner" spellCheck={false} onChange={event => updateMember(index, { role: event.target.value })} />
                        {errors[`members.${index}.role`] && <span className={css.error}>{errors[`members.${index}.role`]}</span>}</label>
                      <label className={css.field}><span className={css.label}>显示名称</span>
                        <input className={css.control} value={member.label ?? ''} placeholder="strategic planner"
                          onChange={event => updateMember(index, { label: event.target.value || undefined })} /></label>
                      <label className={css.field}><span className={css.label}>模型</span>
                        <input className={errors[`members.${index}.model`] ? css.invalid : css.control} value={member.model}
                          placeholder="deepseek-v4-pro" spellCheck={false} onChange={event => updateMember(index, { model: event.target.value })} />
                        {errors[`members.${index}.model`] && <span className={css.error}>{errors[`members.${index}.model`]}</span>}</label>
                      <label className={css.field}><span className={css.label}>覆盖 LLM 路由</span>
                        <input className={css.control} value={member.provider ?? ''} placeholder={draft.llmProvider}
                          spellCheck={false} onChange={event => updateMember(index, { provider: event.target.value || undefined })} /></label>
                      <label className={css.field}><span className={css.label}>输出上限</span>
                        <input className={errors[`members.${index}.maxTokens`] ? css.invalid : css.control} type="number" min={1}
                          value={member.maxTokens ?? ''} placeholder="由模型决定"
                          onChange={event => updateMember(index, { maxTokens: event.target.value === '' ? undefined : Number(event.target.value) })} />
                        {errors[`members.${index}.maxTokens`] && <span className={css.error}>{errors[`members.${index}.maxTokens`]}</span>}</label>
                    </div>
                    <label className={css.field}><span className={css.label}>专家人设</span>
                      <textarea className={css.persona} rows={4} value={member.persona ?? ''}
                        placeholder="描述这个专家的职责、输出标准和边界..."
                        onChange={event => updateMember(index, { persona: event.target.value || undefined })} /></label>
                  </div>
                )}
              </article>
            )
          })}
        </div>
        {errors.members && <p className={css.error} role="alert">{errors.members}</p>}
      </section>

      <footer className={css.footer}>
        <div aria-live="polite">{notice && <p className={notice.kind === 'error' ? css.noticeError : css.notice}>{notice.text}</p>}</div>
        <div className={css.footerActions}>
          <Button size="sm" variant="ghost" onClick={restoreDraft} disabled={busy || !dirty}>撤销修改</Button>
          <Button size="sm" variant="outline" icon={<IconRefreshOutline14 />} onClick={() => { void reset() }} disabled={busy || !snapshot.writable}>恢复默认</Button>
          <Button size="sm" variant="primary" onClick={() => { void save() }} disabled={busy || !snapshot.writable || !dirty || Object.keys(errors).length > 0}>{busy ? '保存中...' : '保存配置'}</Button>
        </div>
      </footer>
    </div>
  )
}
