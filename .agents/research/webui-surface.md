# Web UI surface

## 1. Boot flow

The web app is a thin shell over `@deepseek-ai/dsh-client-web`; all real code lives in `packages/client`.

- `apps/web/index.html` — static `<div id="root">` + `<script type="module" src="/src/main.ts">`. The host injects `window.__DSH_BOOT__` at serve time: `packages/client/modules/src/index.ts` scans the Loader entries for `package.json` `dsh.client` declarations, composes a `WebBootGraph` (rows: id/url/rev/inject/immediately), and `injectBootManifest()` inserts `<script>window.__DSH_BOOT__ = {...}</script>` before `</head>`.
- `apps/web/src/main.ts` — `new AppWebEntry(document.getElementById("root")).run()`.
- `apps/web/src/node-module-stub.ts` — throwing `createRequire` browser stand-in for `node:module` (type-only import for the vendored loader).
- `packages/client/web/src/boot.tsx` — `AppWebEntry.run()`: `parseBootManifest(__DSH_BOOT__)` → build `ClientModuleSystem` (`web/src/seed.ts` seeds react, react-dom, cordis, ui-slots, web-react, ui-primitives, ui-attachment, schema-form) → render loading page with React 18 `createRoot` → mount vendored `cordis-plugin-loader`, `loader.internal = modules` → prefetch `immediately` tier → create cordis entries (modules, plugin rows, shell `app-shell`) → `loader.await()` + fiber sweep → flip `settled` signal → `AppRoot` renders `appShell.renderApp()`.
- Client plugins arrive as bundles at `/plugins/<id>/client.js?rev=<rev>`; the bundle only **registers** its factory via `window.__ModuleLoader__.load({id, factory})` (`modules/src/client/system.ts`). Materialization is lazy memoized CJS (`loadCache`, `makeRequire`); `window.__DSH_MODULES__` hands the instance to the modules plugin, which provides `ctx.modules`.

**Framework:** React 18 + react-dom/client, CSS Modules, Cordis (vendored) as the plugin container. **State:** `useSyncExternalStore`-style snapshot stores (`createSnapshotStore`, `bindSnapshotSelector` in `web-react/src/bind.ts`).

## 2. Directory structure

- `apps/web/src` — only `main.ts` + `node-module-stub.ts` (bootstrap lives entirely in the client packages).
- `packages/client/` (one line per dir):
  - `web/` — shell boot kernel, AppRoot, app-shell assembly, seed table.
  - `modules/` — host scan + wire graph; browser `ClientModuleSystem`/`__ModuleLoader__`.
  - `web-react/` — React bindings: slot renderer, session provider, `bindSnapshotSelector`.
  - `ui-slots/` — slot registry pure core (SlotMap, register, store/inject seats).
  - `runtime/` — shared services: SlotRegistry, sessions (SessionRuntime, ConversationNodeAssembler), workspaces, conversation event/view registries.
  - `connection/` — browser↔host HTTP RPC + SSE/MUX event bridge (`web-api-client.ts`, `rpc.ts`).
  - `hmr/` — client-plugin hot refresh; `locale/` — dictionaries + `t` translation; `schema-form/` — schema draft editing.
  - `ui-layout` — AppFrame, root/frame slots, panel geometry store.
  - `ui-sidebar` — navigation shell; `ui-workspace` — session list/search + hero picker.
  - `ui-conversation` — chat view, composer, skeleton, approvals, todo dock, queue.
  - `ui-tool` — tool call tree + per-tool views; `ui-trajectory` — alternate activity views.
  - `ui-goal` — goal bar; `ui-plan` — plan chip; `ui-jobs` — background-job list.
  - `ui-model-selection` — composer model picker; `ui-settings*` — settings base/shell/general/models/plugins/inventory.
  - `ui-agent-preset` — preset picker/authoring; `ui-subagent` — subagent catalog/lineage; `ui-workflow-run` — workflow replay.
  - `ui-commands`/`ui-input-trigger`/`ui-skill` — slash-command and suggestion machinery.
  - `ui-theme`/`ui-attachment`/`ui-primitives`/`ui-user-questions`/`ui-permission-presets`/`ui-deliverables`/`ui-message-feedback`/`ui-directory-picker-*` — smaller feature/atom plugins.

## 3. Feature inventory

- **Chat composer / message stream** — `ui-conversation/src/client`: `input/machine.ts` + `input/hub.ts` (InputBar state machine), `skeleton/InputBar.tsx`, `chat/ChatView.tsx` rendering typed nodes from the runtime conversation snapshot; `conversation-nodes/register.ts` registers business nodes, `chat/register-node-renderers.ts` the renderers. Extension seats: `conversation.composer` (chain), `.bar`, `conversation.input.left/right/dock`, `conversation.composer.dock`.
- **Session sidebar / history / resume** — `ui-sidebar` `SidebarRoot` occupies `sidebar`; `ui-workspace` `WorkspaceBrowser` occupies `sidebar.workspaces` (search via `ctx.sessions.search`, `startSession`); resume state in `runtime/src/client/sessions/service.ts` (`SessionRuntime`, `SessionProvideChannel`).
- **Settings panels** — `ui-settings` (domain base: `ctx.settingsScope` + slot contracts in `client/contract/slots.ts`); `ui-settings-general` `SettingsRoot` occupies `sidebar.settings` and declares `settings.trigger/header/action/close/section/onboarding`; sections from `ui-settings-models`, `ui-settings-plugins`, `ui-settings-plugin-inventory`; per-feature rows via `settings.general.item` (ui-conversation → `composer-enter` EnterBehaviorRow).
- **Model picker + reasoning effort** — `ui-model-selection` `ModelSelect` occupies `conversation.input.model`; `client/directory.ts` snapshot store, selection RPC via `ctx.remote` (`ModelSelection`), provider/model catalogs in `ui-settings-models`.
- **Approvals / permissions** — `ui-conversation` `skeleton/ApprovalPanel.tsx` (chain-routed composer takeover via `selectApproval` on `ComposerChainProps.interactions`) + `skeleton/PermissionSelect.tsx`; `ui-permission-presets` (default permissions, session access switch); `ui-user-questions` renders `ask_user_question`.
- **Tool calls display** — `ui-tool` `ToolCallTree.tsx` + `ToolDetails.tsx` (occupies `conversation.details.tool`), keyed per-tool views (`tool.call.toolview`) with models in `client/tool/models/`; `ui-trajectory` adds alternate waterfall/activity views.
- **Goal bar** — `ui-goal` `GoalBar` occupies `conversation.input.dock`; live goal via `useProjection("goal")`, mutations (`onEdit`/`onPause`/`onResume`/`onClear`) via `ctx.remote`.
- **Plan mode** — `ui-plan` `PlanChip` occupies `conversation.input.plan`; reads the projection, exits via `remote.commands.execute("/plan off")`.
- **Todo** — `ui-conversation` `skeleton/TodoPanel.tsx` (`todoDockEntry` into `conversation.input.dock`).
- **Background jobs** — `ui-jobs` `JobListAction` in `conversation.session.header.actions`, reads the `jobsBySession` mirror.
- **Agent presets** — `ui-agent-preset` `PresetMenu`/`AgentPresetSeat` (hero seat `conversation.hero.agentPreset`), settings + seat stores.
- **Team panel** — none: `deepseek_team` is a host-side tool; delegation surfaces are `ui-subagent` (catalog action, child-transcript composer) and `ui-workflow-run` (workflow replay), with lineage in `runtime/src/client/sessions/subagent-lineage.ts`.

## 4. Core shell vs plugin contributions

**Shell-owned (web/web-react/ui-slots/runtime/locale/connection):** boot kernel, module loading, SlotRegistry service, sessions/workspaces services, RPC/SSE transport, and the single ctx-level render of the `root` slot (`web/src/app.tsx`). The `app-shell` pseudo-plugin (`web/src/app-shell.ts`) installs `createSlotRenderer()` and exposes `appShell.renderApp`.

**Everything visible is a plugin** — even the frame: `ui-layout` `AppFrame` occupies `root` and declares `sidebar`/`conversation`/`details`/`shell.overlay`. A `dsh.client` plugin registers UI from its `./client` bundle: `package.json` `dsh.client` + `exports["./client"]`; the host composes it into `__DSH_BOOT__`; the bundle registers via `__ModuleLoader__.load`; then `apply(ctx)` calls `ctx.slots.inject("slot.name", () => ctx.slots.register({name, children, store, inject, locale}, Component))` — `inject` waits for the slot declaration (child seats), `store` mints per-entry snapshot stores, `inject` supplies the business face, `locale` provides typed `t`. Slots are typed by `declare module` merges into `ui-slots` `SlotMap` (e.g. `settings.section`, `settings.general.item`, `conversation.input.model`); session-scope components get `useSession`/`useInput` standard props through `sessions.provide`; disposal rides `ctx.effect`.
