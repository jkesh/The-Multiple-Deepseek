window.__ModuleLoader__.load({ id: "the-multiple-deepseek", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react = require("react");

// src/client/team-settings.module.css
var id = "the-multiple-deepseek-settings";
if (typeof document !== "undefined" && document.getElementById(id) === null) {
  const style = document.createElement("style");
  style.id = id;
  style.textContent = ".root { display: flex; flex-direction: column; gap: 20px; width: min(100%, 880px); padding-bottom: 8px; color: var(--dsw-text-primary, inherit); }\n.header, .sectionHeader, .memberSummary, .footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.title, .sectionTitle { margin: 0; letter-spacing: 0; }\n.title { font-size: 20px; line-height: 28px; }\n.sectionTitle { display: inline; font-size: 14px; line-height: 20px; }\n.intro { max-width: 640px; margin: 4px 0 0; color: var(--dsw-text-secondary, rgba(127,127,127,.9)); font-size: 13px; line-height: 20px; }\n.saved, .dirty, .modelBadge, .count { flex: none; font-size: 11px; line-height: 18px; }\n.saved, .dirty, .modelBadge { border: 1px solid var(--dsw-border, rgba(127,127,127,.25)); border-radius: 999px; padding: 1px 8px; }\n.dirty { border-color: var(--dsw-warning, #ad6800); color: var(--dsw-warning, #ad6800); }\n.defaults { padding: 14px; border-top: 1px solid var(--dsw-border, rgba(127,127,127,.25)); border-bottom: 1px solid var(--dsw-border, rgba(127,127,127,.25)); }\n.fieldGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }\n.field { display: flex; min-width: 0; flex-direction: column; gap: 5px; }\n.label { color: var(--dsw-text-secondary, rgba(127,127,127,.9)); font-size: 12px; line-height: 16px; }\n.control, .invalid, .persona { box-sizing: border-box; width: 100%; min-height: 34px; border: 1px solid var(--dsw-border, rgba(127,127,127,.3)); border-radius: 6px; padding: 7px 9px; background: var(--dsw-surface, transparent); color: inherit; font: inherit; font-size: 13px; letter-spacing: 0; }\n.control:focus, .persona:focus { border-color: var(--dsw-accent, #1677ff); outline: 2px solid color-mix(in srgb, var(--dsw-accent, #1677ff) 18%, transparent); }\n.invalid { border-color: var(--dsw-error, #c0392b); outline: 1px solid color-mix(in srgb, var(--dsw-error, #c0392b) 18%, transparent); }\n.select { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; cursor: pointer; }\n.select:hover:not(:disabled) { background: var(--dsw-hover, rgba(127,127,127,.1)); }\n.select:disabled { cursor: default; }\n.selectText { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.selectChevron { flex: none; color: var(--dsw-text-secondary, rgba(127,127,127,.9)); }\n.persona { min-height: 92px; resize: vertical; line-height: 19px; }\n.error { margin: 0; color: var(--dsw-error, #c0392b); font-size: 11px; line-height: 16px; }\n.count { margin-left: 6px; color: var(--dsw-text-secondary, rgba(127,127,127,.9)); }\n.actions, .footerActions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.roster { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }\n.member, .memberInvalid { overflow: hidden; border: 1px solid var(--dsw-border, rgba(127,127,127,.25)); border-radius: 7px; background: var(--dsw-surface, transparent); }\n.memberInvalid { border-color: var(--dsw-error, #c0392b); }\n.memberSummary { min-height: 48px; padding: 0 8px 0 0; }\n.expandButton { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px; min-height: 48px; border: 0; padding: 0 10px; background: transparent; color: inherit; text-align: left; cursor: pointer; }\n.expandButton:hover, .iconButton:hover { background: var(--dsw-hover, rgba(127,127,127,.1)); }\n.memberIdentity { display: flex; min-width: 0; flex-direction: column; }\n.memberIdentity strong, .memberIdentity span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.memberIdentity strong { font-size: 13px; line-height: 18px; }\n.memberIdentity span { color: var(--dsw-text-secondary, rgba(127,127,127,.9)); font-size: 11px; line-height: 16px; }\n.modelBadge { max-width: 220px; overflow: hidden; color: var(--dsw-text-secondary, rgba(127,127,127,.9)); text-overflow: ellipsis; white-space: nowrap; }\n.iconButton { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-error, #c0392b); cursor: pointer; }\n.memberBody { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--dsw-border, rgba(127,127,127,.2)); padding: 14px; }\n.templateLabel { margin-left: 8px; color: var(--dsw-text-secondary, rgba(127,127,127,.9)); }\n.footer { position: sticky; bottom: 0; min-height: 48px; border-top: 1px solid var(--dsw-border, rgba(127,127,127,.25)); padding-top: 10px; background: var(--dsw-background, Canvas); }\n.footer > div:first-child { min-width: 0; flex: 1; }\n.notice, .noticeError, .state { margin: 0; font-size: 12px; line-height: 18px; }\n.notice { color: var(--dsw-success, #237804); }\n.noticeError { color: var(--dsw-error, #c0392b); }\n@media (max-width: 680px) { .header, .sectionHeader, .footer { align-items: flex-start; flex-direction: column; } .fieldGrid { grid-template-columns: minmax(0, 1fr); } .footerActions { width: 100%; } .modelBadge { max-width: 120px; } }\n";
  document.head.appendChild(style);
}
var team_settings_default = { "root": "root", "header": "header", "sectionHeader": "sectionHeader", "memberSummary": "memberSummary", "footer": "footer", "title": "title", "sectionTitle": "sectionTitle", "intro": "intro", "saved": "saved", "dirty": "dirty", "modelBadge": "modelBadge", "count": "count", "defaults": "defaults", "fieldGrid": "fieldGrid", "field": "field", "label": "label", "control": "control", "invalid": "invalid", "persona": "persona", "select": "select", "selectText": "selectText", "selectChevron": "selectChevron", "error": "error", "actions": "actions", "footerActions": "footerActions", "roster": "roster", "member": "member", "memberInvalid": "memberInvalid", "expandButton": "expandButton", "iconButton": "iconButton", "memberIdentity": "memberIdentity", "memberBody": "memberBody", "templateLabel": "templateLabel", "notice": "notice", "noticeError": "noticeError", "state": "state" };

// src/client/team-settings-state.ts
function normalizedRoster(roster) {
  return {
    llmProvider: roster.llmProvider.trim(),
    defaultRole: roster.defaultRole.trim(),
    members: roster.members.map((member) => ({
      role: member.role.trim(),
      model: member.model.trim(),
      ...member.label?.trim() ? { label: member.label.trim() } : {},
      ...member.provider?.trim() ? { provider: member.provider.trim() } : {},
      ...member.maxTokens === void 0 ? {} : { maxTokens: member.maxTokens },
      ...member.persona?.trim() ? { persona: member.persona.trim() } : {}
    }))
  };
}
function validateRoster(draft) {
  const errors = {};
  const roles = draft.members.map((member) => member.role.trim());
  if (draft.llmProvider.trim() === "") errors.llmProvider = "LLM \u63D0\u4F9B\u65B9\u8DEF\u7531\u4E0D\u80FD\u4E3A\u7A7A";
  if (draft.members.length === 0) errors.members = "\u82B1\u540D\u518C\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u89D2\u8272";
  if (draft.defaultRole.trim() === "") errors.defaultRole = "\u9ED8\u8BA4\u89D2\u8272\u4E0D\u80FD\u4E3A\u7A7A";
  else if (!roles.includes(draft.defaultRole.trim())) errors.defaultRole = "\u9ED8\u8BA4\u89D2\u8272\u5FC5\u987B\u6765\u81EA\u5F53\u524D\u82B1\u540D\u518C";
  const seen = /* @__PURE__ */ new Set();
  draft.members.forEach((member, index) => {
    const prefix = `members.${index}`;
    const role = member.role.trim();
    if (role === "") errors[`${prefix}.role`] = "\u89D2\u8272\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A";
    else if (seen.has(role)) errors[`${prefix}.role`] = `\u89D2\u8272 "${role}" \u91CD\u590D`;
    seen.add(role);
    if (member.model.trim() === "") errors[`${prefix}.model`] = "\u6A21\u578B\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A";
    if (member.maxTokens !== void 0 && (!Number.isSafeInteger(member.maxTokens) || member.maxTokens <= 0)) {
      errors[`${prefix}.maxTokens`] = "\u8F93\u51FA\u4E0A\u9650\u5FC5\u987B\u662F\u6B63\u6574\u6570";
    }
  });
  return errors;
}

// src/client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var NAMESPACE = "multiple-deepseek";
var inject = ["slots", "settingsScope", "connection", "remote"];
var ROLE_TEMPLATES = [
  { role: "analyst", label: "data analyst", model: "deepseek-v4-pro", persona: "You are the data analysis specialist on a DeepSeek team. Examine data, find patterns, and present actionable insights with clear evidence." },
  { role: "auditor", label: "security auditor", model: "deepseek-v4-pro", persona: "You are the security audit specialist on a DeepSeek team. Review code, configuration, and dependencies for vulnerabilities and provide concrete remediation." },
  { role: "frontend", label: "UI/frontend developer", model: "deepseek-v4-pro", persona: "You are the frontend specialist on a DeepSeek team. Build accessible, responsive interfaces and deliver clean, working code." },
  { role: "qa", label: "quality assurance", model: "deepseek-v4-flash", persona: "You are the QA specialist on a DeepSeek team. Design and execute regression tests, then report failures with concise reproduction steps." },
  { role: "writer", label: "documentation writer", model: "deepseek-v4-flash", persona: "You are the documentation specialist on a DeepSeek team. Write clear READMEs, API references, and changelogs with consistent terminology." }
];
function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NAMESPACE });
  const useSnapshot = (0, import_dsh_client_web_react.bindSnapshotSelector)(scope);
  const connection = ctx.get("connection");
  const listProviders = async () => {
    if (connection?.api === void 0) return [];
    try {
      const response = await connection.api.llm.providers({});
      return response.result.ok ? response.result.value.providers : [];
    } catch {
      return [];
    }
  };
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "team",
    order: 20,
    label: () => "\u56E2\u961F\u6A21\u5F0F Team Mode",
    inject: () => ({ scope, useSnapshot, listProviders })
  }, TeamSettings));
}
function cloneRoster(roster) {
  return {
    llmProvider: roster.llmProvider,
    defaultRole: roster.defaultRole,
    members: roster.members.map((member) => ({ ...member }))
  };
}
function sameRoster(left, right) {
  return JSON.stringify(normalizedRoster(left)) === JSON.stringify(normalizedRoster(right));
}
function TeamSettings({ scope, useSnapshot, listProviders }) {
  const snapshot = useSnapshot((value) => value);
  const [draft, setDraft] = (0, import_react.useState)(null);
  const [baseline, setBaseline] = (0, import_react.useState)(null);
  const [providers, setProviders] = (0, import_react.useState)([]);
  const [expanded, setExpanded] = (0, import_react.useState)(() => /* @__PURE__ */ new Set([0]));
  const [templateOpen, setTemplateOpen] = (0, import_react.useState)(false);
  const [roleMenuOpen, setRoleMenuOpen] = (0, import_react.useState)(false);
  const [providerMenuOpen, setProviderMenuOpen] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [resetPending, setResetPending] = (0, import_react.useState)(false);
  const initialized = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    void listProviders().then((next) => {
      if (!cancelled) setProviders(next);
    }).catch(() => {
      if (!cancelled) setProviders([]);
    });
    return () => {
      cancelled = true;
    };
  }, [listProviders]);
  (0, import_react.useEffect)(() => {
    if (snapshot.status !== "ready" || snapshot.value === void 0) return;
    if (!initialized.current) {
      initialized.current = true;
      const next = cloneRoster(snapshot.value);
      setDraft(next);
      setBaseline(cloneRoster(next));
      if (resetPending) {
        setResetPending(false);
        setNotice({ kind: "success", text: "\u5DF2\u6062\u590D\u7EC4\u5408\u9ED8\u8BA4\u503C\u3002" });
      }
    }
  }, [snapshot, resetPending]);
  const errors = (0, import_react.useMemo)(() => draft === null ? {} : validateRoster(draft), [draft]);
  const dirty = draft !== null && baseline !== null && !sameRoster(draft, baseline);
  const availableRoles = draft?.members.map((member) => member.role.trim()).filter(Boolean) ?? [];
  const templateItems = ROLE_TEMPLATES.map((template) => ({
    id: template.role,
    label: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: template.role }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.templateLabel, children: template.label })
    ] }),
    disabled: draft?.members.some((member) => member.role.trim() === template.role) ?? false
  }));
  const roleItems = [...new Set(availableRoles)].map((role) => ({
    id: role,
    label: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: role })
  }));
  const selectedProvider = providers.find((provider) => provider.provider === draft?.llmProvider && provider.active);
  const providerItems = providers.filter((provider) => provider.active).map((provider) => ({
    id: provider.provider,
    label: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: provider.displayName }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.templateLabel, children: provider.provider })
    ] })
  }));
  if (selectedProvider === void 0 && draft !== null) {
    providerItems.unshift({
      id: draft.llmProvider,
      label: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: draft.llmProvider || "\u672A\u627E\u5230\u63D0\u4F9B\u5546" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.templateLabel, children: "\u5F53\u524D\u8DEF\u7531" })
      ] })
    });
  }
  if (snapshot.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: team_settings_default.state, children: "\u6B63\u5728\u52A0\u8F7D\u56E2\u961F\u914D\u7F6E..." });
  if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: team_settings_default.state, role: "alert", children: "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\u3002\u8BF7\u786E\u8BA4\u5F53\u524D\u7A97\u53E3\u8FDE\u63A5\u5230\u672C\u673A DSH\u3002" });
  if (draft === null || baseline === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: team_settings_default.state, children: "\u672A\u627E\u5230\u56E2\u961F\u82B1\u540D\u518C\u914D\u7F6E\u3002" });
  const updateMember = (index, patch) => {
    setNotice(null);
    setDraft((current) => current === null ? current : {
      ...current,
      members: current.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member)
    });
  };
  const addMember = (member) => {
    setDraft((current) => current === null ? current : { ...current, members: [...current.members, { ...member }] });
    setExpanded((current) => /* @__PURE__ */ new Set([...current, draft.members.length]));
    setTemplateOpen(false);
    setNotice(null);
  };
  const removeMember = (index) => {
    setDraft((current) => {
      if (current === null) return current;
      const members = current.members.filter((_, memberIndex) => memberIndex !== index);
      const defaultRole = current.defaultRole === current.members[index]?.role ? members[0]?.role ?? "" : current.defaultRole;
      return { ...current, members, defaultRole };
    });
    setExpanded((current) => new Set([...current].filter((value) => value !== index).map((value) => value > index ? value - 1 : value)));
    setNotice(null);
  };
  const restoreDraft = () => {
    setDraft(cloneRoster(baseline));
    setNotice(null);
  };
  const save = async () => {
    if (Object.keys(errors).length > 0) {
      setNotice({ kind: "error", text: "\u8BF7\u4FEE\u6B63\u6807\u8BB0\u7684\u5B57\u6BB5\u540E\u518D\u4FDD\u5B58\u3002" });
      return;
    }
    const next = normalizedRoster(draft);
    setBusy(true);
    setNotice(null);
    try {
      await scope.set("members", next.members);
      await scope.set("defaultRole", next.defaultRole);
      await scope.set("llmProvider", next.llmProvider);
      setDraft(cloneRoster(next));
      setBaseline(cloneRoster(next));
      setNotice({ kind: "success", text: "\u5DF2\u4FDD\u5B58\u3002\u4E0B\u4E00\u6B21\u56E2\u961F\u4EFB\u52A1\u5C06\u4F7F\u7528\u65B0\u82B1\u540D\u518C\u3002" });
    } catch (error) {
      setNotice({ kind: "error", text: `\u4FDD\u5B58\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await scope.unset("members");
      await scope.unset("defaultRole");
      await scope.unset("llmProvider");
      initialized.current = false;
      setResetPending(true);
      setDraft(null);
      setBaseline(null);
      setExpanded(/* @__PURE__ */ new Set([0]));
    } catch (error) {
      setNotice({ kind: "error", text: `\u91CD\u7F6E\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: team_settings_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: team_settings_default.title, children: "\u56E2\u961F\u8DEF\u7531" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: team_settings_default.intro, children: "\u914D\u7F6E\u89D2\u8272\u3001\u6A21\u578B\u548C\u4E13\u5BB6\u4EBA\u8BBE\u3002\u4EFB\u52A1\u53EA\u9009\u62E9\u89D2\u8272\uFF0C\u5B9E\u9645\u6A21\u578B\u7531\u8FD9\u91CC\u7EDF\u4E00\u8DEF\u7531\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: dirty ? team_settings_default.dirty : team_settings_default.saved, children: dirty ? "\u6709\u672A\u4FDD\u5B58\u4FEE\u6539" : "\u914D\u7F6E\u5DF2\u540C\u6B65" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: team_settings_default.defaults, "aria-labelledby": "team-defaults-title", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "team-defaults-title", className: team_settings_default.sectionTitle, children: "\u9ED8\u8BA4\u8DEF\u7531" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.fieldGrid, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.field, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u9ED8\u8BA4\u89D2\u8272" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Menu,
            {
              open: roleMenuOpen,
              items: roleItems,
              selectedId: draft.defaultRole,
              compact: true,
              portal: true,
              anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  className: `${errors.defaultRole ? team_settings_default.invalid : team_settings_default.control} ${team_settings_default.select}`,
                  "aria-haspopup": "menu",
                  "aria-expanded": roleMenuOpen,
                  disabled: busy,
                  onClick: () => setRoleMenuOpen((open) => !open),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.selectText, children: draft.defaultRole || "\u8BF7\u9009\u62E9\u89D2\u8272" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, { className: team_settings_default.selectChevron })
                  ]
                }
              ),
              onSelect: (id2) => {
                setDraft({ ...draft, defaultRole: id2 });
                setNotice(null);
                setRoleMenuOpen(false);
              },
              onClose: () => setRoleMenuOpen(false)
            }
          ),
          errors.defaultRole && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.error, children: errors.defaultRole })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.field, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u9ED8\u8BA4 LLM \u8DEF\u7531" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Menu,
            {
              open: providerMenuOpen,
              items: providerItems,
              selectedId: draft.llmProvider,
              compact: true,
              portal: true,
              anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  className: `${errors.llmProvider ? team_settings_default.invalid : team_settings_default.control} ${team_settings_default.select}`,
                  "aria-haspopup": "menu",
                  "aria-expanded": providerMenuOpen,
                  disabled: busy,
                  onClick: () => setProviderMenuOpen((open) => !open),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.selectText, children: selectedProvider ? selectedProvider.displayName : draft.llmProvider || "\u8BF7\u9009\u62E9\u8DEF\u7531" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, { className: team_settings_default.selectChevron })
                  ]
                }
              ),
              onSelect: (id2) => {
                setDraft({ ...draft, llmProvider: id2 });
                setNotice(null);
                setProviderMenuOpen(false);
              },
              onClose: () => setProviderMenuOpen(false)
            }
          ),
          errors.llmProvider && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.error, children: errors.llmProvider })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "aria-labelledby": "team-members-title", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.sectionHeader, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "team-members-title", className: team_settings_default.sectionTitle, children: "\u4E13\u5BB6\u89D2\u8272" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: team_settings_default.count, children: [
            draft.members.length,
            " \u4E2A\u89D2\u8272"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.actions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Button,
            {
              size: "sm",
              variant: "outline",
              icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
              onClick: () => addMember({ role: "", model: "" }),
              disabled: busy,
              children: "\u7A7A\u767D\u89D2\u8272"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Menu,
            {
              open: templateOpen,
              items: templateItems,
              portal: true,
              compact: true,
              anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  size: "sm",
                  variant: "outline",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
                  onClick: () => setTemplateOpen((open) => !open),
                  disabled: busy,
                  children: "\u6A21\u677F"
                }
              ),
              onSelect: (id2) => {
                const template = ROLE_TEMPLATES.find((item) => item.role === id2);
                if (template) addMember(template);
              },
              onClose: () => setTemplateOpen(false)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: team_settings_default.roster, children: draft.members.map((member, index) => {
        const open = expanded.has(index);
        const memberHasError = Object.keys(errors).some((key) => key.startsWith(`members.${index}.`));
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: memberHasError ? team_settings_default.memberInvalid : team_settings_default.member, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.memberSummary, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                type: "button",
                className: team_settings_default.expandButton,
                "aria-expanded": open,
                onClick: () => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                }),
                children: [
                  open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronRightOutline14, {}),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: team_settings_default.memberIdentity, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: member.role.trim() || "\u672A\u547D\u540D\u89D2\u8272" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: member.label?.trim() || member.model.trim() || "\u5C1A\u672A\u914D\u7F6E\u6A21\u578B" })
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.modelBadge, children: member.model.trim() || "model unset" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: "\u5220\u9664\u89D2\u8272", side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: team_settings_default.iconButton,
                "aria-label": `\u5220\u9664\u89D2\u8272 ${member.role || index + 1}`,
                onClick: () => removeMember(index),
                disabled: busy,
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutline16, {})
              }
            ) })
          ] }),
          open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.memberBody, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.fieldGrid, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: team_settings_default.field, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u89D2\u8272 ID" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: errors[`members.${index}.role`] ? team_settings_default.invalid : team_settings_default.control,
                    value: member.role,
                    placeholder: "planner",
                    spellCheck: false,
                    onChange: (event) => updateMember(index, { role: event.target.value })
                  }
                ),
                errors[`members.${index}.role`] && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.error, children: errors[`members.${index}.role`] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: team_settings_default.field, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u663E\u793A\u540D\u79F0" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: team_settings_default.control,
                    value: member.label ?? "",
                    placeholder: "strategic planner",
                    onChange: (event) => updateMember(index, { label: event.target.value || void 0 })
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: team_settings_default.field, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u6A21\u578B" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: errors[`members.${index}.model`] ? team_settings_default.invalid : team_settings_default.control,
                    value: member.model,
                    placeholder: "deepseek-v4-pro",
                    spellCheck: false,
                    onChange: (event) => updateMember(index, { model: event.target.value })
                  }
                ),
                errors[`members.${index}.model`] && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.error, children: errors[`members.${index}.model`] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: team_settings_default.field, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u8986\u76D6 LLM \u8DEF\u7531" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: team_settings_default.control,
                    value: member.provider ?? "",
                    placeholder: draft.llmProvider,
                    spellCheck: false,
                    onChange: (event) => updateMember(index, { provider: event.target.value || void 0 })
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: team_settings_default.field, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u8F93\u51FA\u4E0A\u9650" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: errors[`members.${index}.maxTokens`] ? team_settings_default.invalid : team_settings_default.control,
                    type: "number",
                    min: 1,
                    value: member.maxTokens ?? "",
                    placeholder: "\u7531\u6A21\u578B\u51B3\u5B9A",
                    onChange: (event) => updateMember(index, { maxTokens: event.target.value === "" ? void 0 : Number(event.target.value) })
                  }
                ),
                errors[`members.${index}.maxTokens`] && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.error, children: errors[`members.${index}.maxTokens`] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: team_settings_default.field, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: team_settings_default.label, children: "\u4E13\u5BB6\u4EBA\u8BBE" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: team_settings_default.persona,
                  rows: 4,
                  value: member.persona ?? "",
                  placeholder: "\u63CF\u8FF0\u8FD9\u4E2A\u4E13\u5BB6\u7684\u804C\u8D23\u3001\u8F93\u51FA\u6807\u51C6\u548C\u8FB9\u754C...",
                  onChange: (event) => updateMember(index, { persona: event.target.value || void 0 })
                }
              )
            ] })
          ] })
        ] }, index);
      }) }),
      errors.members && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: team_settings_default.error, role: "alert", children: errors.members })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: team_settings_default.footer, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "aria-live": "polite", children: notice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: notice.kind === "error" ? team_settings_default.noticeError : team_settings_default.notice, children: notice.text }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: team_settings_default.footerActions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "ghost", onClick: restoreDraft, disabled: busy || !dirty, children: "\u64A4\u9500\u4FEE\u6539" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRefreshOutline14, {}), onClick: () => {
          void reset();
        }, disabled: busy || !snapshot.writable, children: "\u6062\u590D\u9ED8\u8BA4" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "primary", onClick: () => {
          void save();
        }, disabled: busy || !snapshot.writable || !dirty || Object.keys(errors).length > 0, children: busy ? "\u4FDD\u5B58\u4E2D..." : "\u4FDD\u5B58\u914D\u7F6E" })
      ] })
    ] })
  ] });
}

return module.exports; } });
