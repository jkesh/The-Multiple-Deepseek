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

// ../The-Multiple-Deepseek/src/client/index.tsx
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
var LABEL_STYLE = { fontSize: 12, opacity: 0.7 };
function TeamSettings({ scope, useSnapshot }) {
  const snapshot = useSnapshot();
  const [draft, setDraft] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)(null);
  const initialized = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    if (!initialized.current && snapshot.status === "ready" && snapshot.value !== void 0) {
      initialized.current = true;
      setDraft(cloneRoster(snapshot.value));
    }
  }, [snapshot]);
  if (snapshot.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u8BBE\u7F6E\u4E0D\u53EF\u7528\uFF08\u8FDC\u7A0B\u6D4F\u89C8\u5668\u6216\u672A\u6302\u8F7D\u8BBE\u7F6E\u670D\u52A1\uFF09\u3002" });
  if (draft === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u672A\u627E\u5230\u56E2\u961F\u82B1\u540D\u518C\u914D\u7F6E\u3002" });
  const updateMember = (index, patch) => {
    setDraft((prev) => prev === null ? prev : patchMember(prev, index, patch));
  };
  const addMember = () => {
    setDraft((prev) => prev === null ? prev : { ...prev, members: [...prev.members, { role: "", model: "" }] });
  };
  const removeMember = (index) => {
    setDraft((prev) => prev === null ? prev : { ...prev, members: prev.members.filter((_, i) => i !== index) });
  };
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await scope.set("members", draft.members);
      await scope.set("defaultRole", draft.defaultRole);
      await scope.set("llmProvider", draft.llmProvider);
      setMessage("\u5DF2\u4FDD\u5B58\uFF1B\u4E0B\u4E00\u6B21\u56E2\u961F\u4EFB\u52A1\u5373\u6309\u65B0\u82B1\u540D\u518C\u8DEF\u7531\u3002");
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { opacity: 0.75 }, children: "\u6BCF\u4E2A\u4EFB\u52A1\u6307\u5B9A\u4E00\u4E2A\u4E13\u5BB6\u89D2\u8272\uFF1B\u89D2\u8272\u51B3\u5B9A\u4F7F\u7528\u54EA\u4E2A DeepSeek \u6A21\u578B\u4E0E\u4EBA\u8BBE\u3002\u4FEE\u6539\u540E\u70B9\u51FB\u4FDD\u5B58\u5373\u53EF\u751F\u6548\uFF08\u65E0\u9700\u91CD\u542F\uFF09\u3002" }),
    draft.members.map((member, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ROW_STYLE, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u89D2\u8272 role" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: INPUT_STYLE,
          value: member.role,
          placeholder: "planner",
          onChange: (event) => updateMember(index, { role: event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u6A21\u578B model\uFF08\u5982 deepseek-v4-pro\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: INPUT_STYLE,
          value: member.model,
          placeholder: "deepseek-v4-pro",
          onChange: (event) => updateMember(index, { model: event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "LLM \u63D0\u4F9B\u65B9\u8DEF\u7531\uFF08\u9ED8\u8BA4 deepseek-official\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: INPUT_STYLE,
          value: member.provider ?? "",
          placeholder: "deepseek-official",
          onChange: (event) => updateMember(index, { provider: event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u4E13\u5BB6\u4EBA\u8BBE persona\uFF08\u53EF\u9009\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "textarea",
        {
          style: INPUT_STYLE,
          rows: 2,
          value: member.persona ?? "",
          placeholder: "You are the planning specialist on a DeepSeek team\u2026",
          onChange: (event) => updateMember(index, { persona: event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => removeMember(index), disabled: busy, children: "\u5220\u9664\u8BE5\u89D2\u8272" })
    ] }, index)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: addMember, disabled: busy, children: "+ \u6DFB\u52A0\u89D2\u8272" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u9ED8\u8BA4\u89D2\u8272 defaultRole\uFF08\u4EFB\u52A1\u672A\u6307\u5B9A\u89D2\u8272\u65F6\u4F7F\u7528\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: INPUT_STYLE,
          value: draft.defaultRole,
          onChange: (event) => setDraft({ ...draft, defaultRole: event.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: LABEL_STYLE, children: "\u9ED8\u8BA4 LLM \u8DEF\u7531 llmProvider" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: INPUT_STYLE,
          value: draft.llmProvider,
          onChange: (event) => setDraft({ ...draft, llmProvider: event.target.value })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 16, display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
        void save();
      }, disabled: busy || !snapshot.writable, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
        void reset();
      }, disabled: busy || !snapshot.writable, children: "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4" })
    ] }),
    message !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { marginTop: 8, color: message.startsWith("\u5DF2") ? void 0 : "#c0392b" }, children: message }) : null
  ] });
}
return module.exports; } });
