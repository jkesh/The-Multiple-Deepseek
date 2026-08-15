export interface RosterMember {
  role: string
  label?: string
  provider?: string
  model: string
  maxTokens?: number
  persona?: string
}

export interface TeamRoster {
  llmProvider: string
  defaultRole: string
  members: RosterMember[]
}

export type ValidationErrors = Record<string, string>

export function normalizedRoster(roster: TeamRoster): TeamRoster {
  return {
    llmProvider: roster.llmProvider.trim(),
    defaultRole: roster.defaultRole.trim(),
    members: roster.members.map(member => ({
      role: member.role.trim(),
      model: member.model.trim(),
      ...(member.label?.trim() ? { label: member.label.trim() } : {}),
      ...(member.provider?.trim() ? { provider: member.provider.trim() } : {}),
      ...(member.maxTokens === undefined ? {} : { maxTokens: member.maxTokens }),
      ...(member.persona?.trim() ? { persona: member.persona.trim() } : {}),
    })),
  }
}

export function validateRoster(draft: TeamRoster): ValidationErrors {
  const errors: ValidationErrors = {}
  const roles = draft.members.map(member => member.role.trim())
  if (draft.llmProvider.trim() === '') errors.llmProvider = 'LLM 提供方路由不能为空'
  if (draft.members.length === 0) errors.members = '花名册至少需要一个角色'
  if (draft.defaultRole.trim() === '') errors.defaultRole = '默认角色不能为空'
  else if (!roles.includes(draft.defaultRole.trim())) errors.defaultRole = '默认角色必须来自当前花名册'
  const seen = new Set<string>()
  draft.members.forEach((member, index) => {
    const prefix = `members.${index}`
    const role = member.role.trim()
    if (role === '') errors[`${prefix}.role`] = '角色名称不能为空'
    else if (seen.has(role)) errors[`${prefix}.role`] = `角色 "${role}" 重复`
    seen.add(role)
    if (member.model.trim() === '') errors[`${prefix}.model`] = '模型名称不能为空'
    if (member.maxTokens !== undefined && (!Number.isSafeInteger(member.maxTokens) || member.maxTokens <= 0)) {
      errors[`${prefix}.maxTokens`] = '输出上限必须是正整数'
    }
  })
  return errors
}
