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
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var NAMESPACE = "multiple-deepseek";
var inject = ["slots", "settingsScope", "connection", "remote"];
var ROLE_TEMPLATES = [
  {
    role: "analyst",
    label: "data analyst",
    model: "deepseek-v4-pro",
    persona: "You are the data analysis specialist on a DeepSeek team. Examine datasets, find patterns, produce statistical summaries, and present actionable insights with clear evidence. Ask for missing data or assumptions instead of guessing."
  },
  {
    role: "auditor",
    label: "security auditor",
    model: "deepseek-v4-pro",
    persona: "You are the security audit specialist on a DeepSeek team. Review code, configs, and dependencies for vulnerabilities, credential leaks, injection risks, and access control flaws. Be specific about severity and remediation."
  },
  {
    role: "frontend",
    label: "UI/frontend developer",
    model: "deepseek-v4-pro",
    persona: "You are the frontend development specialist on a DeepSeek team. Build and maintain UI components, layouts, and interactions. Consider accessibility, responsiveness, and state management. Deliver clean, working code with minimal assumptions."
  },
  {
    role: "qa",
    label: "quality assurance",
    model: "deepseek-v4-flash",
    persona: "You are the QA/testing specialist on a DeepSeek team. Design test cases, edge cases, and regression checks. Execute tests and report failures with reproduction steps and expected vs actual behaviour."
  },
  {
    role: "writer",
    label: "documentation writer",
    model: "deepseek-v4-flash",
    persona: "You are the documentation specialist on a DeepSeek team. Write clear, well-structured documentation, READMEs, API references, and changelogs. Use consistent terminology and include examples where helpful."
  }
];
function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NAMESPACE });
  const useSnapshot = (0, import_dsh_client_web_react.bindSnapshotSelector)(scope);
  const injected = () => ({ scope, useSnapshot });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "team",
    order: 20,
    label: () => "\u56E2\u961F\u6A21\u5F0F Team Mode",
    inject: injected
  }, TeamSettings));
}
function cloneRoster(roster) {
  return {
    llmProvider: roster.llmProvider,
    defaultRole: roster.defaultRole,
    members: roster.members.map((member) => ({
      role: member.role,
      ...member.label === void 0 ? {} : { label: member.label },
      ...member.provider === void 0 ? {} : { provider: member.provider },
      model: member.model,
      ...member.maxTokens === void 0 ? {} : { maxTokens: member.maxTokens },
      ...member.persona === void 0 ? {} : { persona: member.persona }
    }))
  };
}
function patchMember(draft, index, patch) {
  const members = draft.members.map((member, i) => i === index ? { ...member, ...patch } : member);
  return { ...draft, members };
}
function validateRoster(draft) {
  const errors = {};
  if (draft.llmProvider.trim().length === 0) {
    errors.llmProvider = "LLM \u63D0\u4F9B\u65B9\u8DEF\u7531\u4E0D\u80FD\u4E3A\u7A7A";
  }
  if (draft.defaultRole.trim().length === 0) {
    errors.defaultRole = "\u9ED8\u8BA4\u89D2\u8272\u4E0D\u80FD\u4E3A\u7A7A";
  } else if (draft.members.length > 0 && !draft.members.some((m) => m.role === draft.defaultRole)) {
    errors.defaultRole = `\u89D2\u8272 "${draft.defaultRole}" \u4E0D\u5728\u82B1\u540D\u518C\u4E2D`;
  }
  const seenRoles = /* @__PURE__ */ new Set();
  for (let i = 0; i < draft.members.length; i++) {
    const member = draft.members[i];
    const prefix = `members.${i}`;
    if (member.role.trim().length === 0) {
      errors[`${prefix}.role`] = "\u89D2\u8272\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A";
    } else if (seenRoles.has(member.role)) {
      errors[`${prefix}.role`] = `\u89D2\u8272 "${member.role}" \u91CD\u590D`;
    }
    seenRoles.add(member.role);
    if (member.model.trim().length === 0) {
      errors[`${prefix}.model`] = "\u6A21\u578B\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A";
    }
    if (member.maxTokens !== void 0 && member.maxTokens !== null) {
      if (!Number.isSafeInteger(member.maxTokens) || member.maxTokens <= 0) {
        errors[`${prefix}.maxTokens`] = "maxTokens \u5FC5\u987B\u662F\u6B63\u6574\u6570";
      }
    }
  }
  if (draft.members.length === 0) {
    errors.members = "\u82B1\u540D\u518C\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u89D2\u8272";
  }
  return errors;
}
var ROW_STYLE = {
  border: "1px solid var(--dsw-border, rgba(127,127,127,0.25))",
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6
};
var INPUT_STYLE = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--dsw-border, rgba(127,127,127,0.25))",
  background: "transparent",
  color: "inherit"
};
var INVALID_INPUT_STYLE = {
  ...INPUT_STYLE,
  border: "1px solid #c0392b"
};
var LABEL_STYLE = { fontSize: 12, opacity: 0.7 };
var ERROR_TEXT_STYLE = { fontSize: 11, color: "#c0392b", marginTop: -2 };
var SMALL_BUTTON_STYLE = {
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid var(--dsw-border, rgba(127,127,127,0.25))",
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};
function TeamSettings({ scope, useSnapshot }) {
  const snapshot = useSnapshot();
  const [draft, setDraft] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)(null);
  const [errors, setErrors] = (0, import_react.useState)({});
  const [templateOpen, setTemplateOpen] = (0, import_react.useState)(false);
  const initialized = (0, import_react.useRef)(false);
  const templateRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    if (!initialized.current && snapshot.status === "ready" && snapshot.value !== void 0) {
      initialized.current = true;
      setDraft(cloneRoster(snapshot.value));
    }
  }, [snapshot]);
  (0, import_react.useEffect)(() => {
    if (!templateOpen) return;
    const handler = (event) => {
      if (templateRef.current !== null && !templateRef.current.contains(event.target)) {
        setTemplateOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [templateOpen]);
  if (snapshot.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u8BBE\u7F6E\u4E0D\u53EF\u7528\uFF08\u8FDC\u7A0B\u6D4F\u89C8\u5668\u6216\u672A\u6302\u8F7D\u8BBE\u7F6E\u670D\u52A1\uFF09\u3002" });
  if (draft === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u672A\u627E\u5230\u56E2\u961F\u82B1\u540D\u518C\u914D\u7F6E\u3002" });
  const fieldError = (field) => errors[field];
  const revalidate = () => {
    setErrors(validateRoster(draft));
  };
  const updateMember = (index, patch) => {
    setDraft((prev) => prev === null ? prev : patchMember(prev, index, patch));
  };
  const addMember = (template) => {
    setDraft((prev) => {
      if (prev === null) return prev;
      if (template !== void 0 && prev.members.some((m) => m.role === template.role)) {
        return prev;
      }
      return {
        ...prev,
        members: [...prev.members, template !== void 0 ? { ...template } : { role: "", model: "" }]
      };
    });
    setTemplateOpen(false);
  };
  const removeMember = (index) => {
    setDraft((prev) => prev === null ? prev : { ...prev, members: prev.members.filter((_, i) => i !== index) });
  };
  const save = async () => {
    const validation = validateRoster(draft);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setMessage("\u8BF7\u4FEE\u6B63\u8868\u5355\u4E2D\u7684\u9519\u8BEF\u540E\u518D\u4FDD\u5B58\u3002");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await scope.set("members", draft.members);
      await scope.set("defaultRole", draft.defaultRole);
      await scope.set("llmProvider", draft.llmProvider);
      setMessage("\u5DF2\u4FDD\u5B58\uFF1B\u4E0B\u4E00\u6B21\u56E2\u961F\u4EFB\u52A1\u5373\u6309\u65B0\u82B1\u540D\u518C\u8DEF\u7531\u3002");
      setErrors({});
    } catch (error) {
      setMessage(`\u4FDD\u5B58\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await scope.unset("members");
      await scope.unset("defaultRole");
      await scope.unset("llmProvider");
      setMessage("\u5DF2\u91CD\u7F6E\u4E3A\u7EC4\u5408\u9ED8\u8BA4\u82B1\u540D\u518C\u3002");
    } catch (error) {
      setMessage(`\u91CD\u7F6E\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const duplicateRoles = draft.members.filter(
    (member, index, arr) => arr.findIndex((m) => m.role === member.role && m.role !== "") !== index
  ).map((m) => m.role);
  const availableRoles = [...new Set(draft.members.map((m) => m.role).filter((r) => r.length > 0))];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { opacity: 0.75 }, children: "\u6BCF\u4E2A\u4EFB\u52A1\u6307\u5B9A\u4E00\u4E2A\u4E13\u5BB6\u89D2\u8272\uFF1B\u89D2\u8272\u51B3\u5B9A\u4F7F\u7528\u54EA\u4E2A DeepSeek \u6A21\u578B\u4E0E\u4EBA\u8BBE\u3002\u4FEE\u6539\u540E\u70B9\u51FB\u4FDD\u5B58\u5373\u53EF\u751F\u6548\uFF08\u65E0\u9700\u91CD\u542F\uFF09\u3002" }),
    draft.members.map((member, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ROW_STYLE, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u89D2\u8272 role" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: fieldError(`members.${index}.role`) !== void 0 ? INVALID_INPUT_STYLE : INPUT_STYLE,
          value: member.role,
          placeholder: "planner",
          onChange: (event) => updateMember(index, { role: event.target.value }),
          onBlur: () => revalidate()
        }
      ),
      fieldError(`members.${index}.role`) !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: ERROR_TEXT_STYLE, children: fieldError(`members.${index}.role`) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u663E\u793A\u6807\u7B7E label\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4\u540C\u89D2\u8272\u540D\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: INPUT_STYLE,
          value: member.label ?? "",
          placeholder: "strategic planner",
          onChange: (event) => updateMember(index, { label: event.target.value === "" ? void 0 : event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u6A21\u578B model\uFF08\u5982 deepseek-v4-pro\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: fieldError(`members.${index}.model`) !== void 0 ? INVALID_INPUT_STYLE : INPUT_STYLE,
          value: member.model,
          placeholder: "deepseek-v4-pro",
          onChange: (event) => updateMember(index, { model: event.target.value }),
          onBlur: () => revalidate()
        }
      ),
      fieldError(`members.${index}.model`) !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: ERROR_TEXT_STYLE, children: fieldError(`members.${index}.model`) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "LLM \u63D0\u4F9B\u65B9\u8DEF\u7531\uFF08\u9ED8\u8BA4 deepseek-official\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: INPUT_STYLE,
          value: member.provider ?? "",
          placeholder: "deepseek-official",
          onChange: (event) => updateMember(index, { provider: event.target.value === "" ? void 0 : event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u8F93\u51FA\u4E0A\u9650 maxTokens\uFF08\u53EF\u9009\uFF0C\u6B63\u6574\u6570\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: fieldError(`members.${index}.maxTokens`) !== void 0 ? INVALID_INPUT_STYLE : INPUT_STYLE,
          type: "number",
          min: 1,
          value: member.maxTokens !== void 0 && member.maxTokens !== null ? String(member.maxTokens) : "",
          placeholder: "4096",
          onChange: (event) => {
            const raw = event.target.value.trim();
            updateMember(index, { maxTokens: raw.length === 0 ? void 0 : Number(raw) });
          },
          onBlur: () => revalidate()
        }
      ),
      fieldError(`members.${index}.maxTokens`) !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: ERROR_TEXT_STYLE, children: fieldError(`members.${index}.maxTokens`) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u4E13\u5BB6\u4EBA\u8BBE persona\uFF08\u53EF\u9009\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "textarea",
        {
          style: INPUT_STYLE,
          rows: 2,
          value: member.persona ?? "",
          placeholder: "You are the planning specialist on a DeepSeek team\u2026",
          onChange: (event) => updateMember(index, { persona: event.target.value === "" ? void 0 : event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: () => removeMember(index),
          disabled: busy,
          style: { ...SMALL_BUTTON_STYLE, alignSelf: "flex-end" },
          children: "\u5220\u9664\u8BE5\u89D2\u8272"
        }
      )
    ] }, index)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: addMember, disabled: busy, style: SMALL_BUTTON_STYLE, children: "+ \u6DFB\u52A0\u7A7A\u89D2\u8272" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: templateRef, style: { position: "relative", display: "inline-block" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => setTemplateOpen(!templateOpen), disabled: busy, style: SMALL_BUTTON_STYLE, children: "+ \u4ECE\u6A21\u677F\u6DFB\u52A0" }),
        templateOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
          position: "absolute",
          top: "100%",
          left: 0,
          zIndex: 10,
          background: "var(--dsw-bg, #1e1e2e)",
          border: "1px solid var(--dsw-border, rgba(127,127,127,0.25))",
          borderRadius: 6,
          padding: 4,
          minWidth: 180,
          marginTop: 4,
          display: "flex",
          flexDirection: "column",
          gap: 2
        }, children: ROLE_TEMPLATES.map((template) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            onClick: () => addMember(template),
            style: {
              ...SMALL_BUTTON_STYLE,
              textAlign: "left",
              border: "none",
              background: "transparent",
              padding: "6px 8px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: template.role }),
              " \u2014 ",
              template.label
            ]
          },
          template.role
        )) }) : null
      ] })
    ] }),
    fieldError("members") !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: ERROR_TEXT_STYLE, children: fieldError("members") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u9ED8\u8BA4\u89D2\u8272 defaultRole\uFF08\u4EFB\u52A1\u672A\u6307\u5B9A\u89D2\u8272\u65F6\u4F7F\u7528\uFF09" }),
      availableRoles.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "select",
        {
          style: fieldError("defaultRole") !== void 0 ? INVALID_INPUT_STYLE : INPUT_STYLE,
          value: draft.defaultRole,
          onChange: (event) => setDraft({ ...draft, defaultRole: event.target.value }),
          onBlur: () => revalidate(),
          children: [
            !availableRoles.includes(draft.defaultRole) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: draft.defaultRole, children: [
              "\u26A0 ",
              draft.defaultRole,
              "\uFF08\u82B1\u540D\u518C\u4E2D\u5DF2\u79FB\u9664\u8BE5\u89D2\u8272\uFF09"
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: draft.defaultRole, children: draft.defaultRole }),
            availableRoles.map((role) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: role, children: role }, role))
          ]
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: fieldError("defaultRole") !== void 0 ? INVALID_INPUT_STYLE : INPUT_STYLE,
          value: draft.defaultRole,
          placeholder: "engineer",
          onChange: (event) => setDraft({ ...draft, defaultRole: event.target.value }),
          onBlur: () => revalidate()
        }
      ),
      fieldError("defaultRole") !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: ERROR_TEXT_STYLE, children: fieldError("defaultRole") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u9ED8\u8BA4 LLM \u8DEF\u7531 llmProvider" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: fieldError("llmProvider") !== void 0 ? INVALID_INPUT_STYLE : INPUT_STYLE,
          value: draft.llmProvider,
          placeholder: "deepseek-official",
          onChange: (event) => setDraft({ ...draft, llmProvider: event.target.value }),
          onBlur: () => revalidate()
        }
      ),
      fieldError("llmProvider") !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: ERROR_TEXT_STYLE, children: fieldError("llmProvider") }) : null,
      duplicateRoles.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: ERROR_TEXT_STYLE, children: [
        "\u91CD\u590D\u89D2\u8272\uFF1A",
        duplicateRoles.join(", ")
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 16, display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: () => {
            void save();
          },
          disabled: busy || !snapshot.writable,
          style: {
            ...SMALL_BUTTON_STYLE,
            padding: "8px 16px",
            background: Object.keys(errors).length > 0 ? void 0 : "var(--dsw-accent, #4f8cff)",
            color: Object.keys(errors).length > 0 ? void 0 : "#fff",
            borderColor: Object.keys(errors).length > 0 ? "#c0392b" : void 0
          },
          children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
        void reset();
      }, disabled: busy || !snapshot.writable, style: SMALL_BUTTON_STYLE, children: "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4" })
    ] }),
    message !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { marginTop: 8, color: message.startsWith("\u5DF2") || message.startsWith("\u8BF7\u4FEE\u6B63") ? void 0 : "#c0392b" }, children: message }) : null
  ] });
}

return module.exports; } });
