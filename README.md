# The-Multiple-Deepseek(TMD)

Parallel multi-DeepSeek team orchestration plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh), inspired by oh-my-openagent's category-to-model routing.

English | [中文](README.zh.md)

The model names a specialist **role** per task — planner, engineer, reviewer, explorer, quick — and never a model. The plugin's roster maps each role to a DeepSeek provider route, model, output cap, and specialist persona, then fans the tasks out as parallel subagents through the harness's `ctx.subagents` seam and returns one aggregated outcome per task.

| Role | Default model | Kind of work |
|---|---|---|
| `planner` | `deepseek-v4-pro` | Strategic planning, scoping, risks |
| `engineer` | `deepseek-v4-pro` | Autonomous end-to-end implementation |
| `reviewer` | `deepseek-v4-pro` | Adversarial review and critique |
| `explorer` | `deepseek-v4-flash` | Codebase research and mapping |
| `quick` | `deepseek-v4-flash` | Small, fast, well-scoped edits |

Every role, model, and persona is configurable from the dsh patch layer.

## Installation

Requires a dsh profile (Harness home `~\.dsh`). Install into the profile and mount the row:

```sh
cd <your dsh checkout>
pnpm dsh plugin --profile web add github:jkesh/The-Multiple-Deepseek
```

Then add this row to `~\.dsh\profiles\web\cordis.patch.yml`:

```yaml
- id: multiple-deepseek
  name: the-multiple-deepseek
  config:
    provider: spawn   # the in-box subagent provider (spawn or fork)
```

Verify with `pnpm dsh --profile web --dump-config`.

The plugin imports `@deepseek-ai/dsh-*` and `@deepseek-ai/cordis` as peer dependencies; dsh resolves them from its own installation (the profile module fallback), so they are never installed from a registry.

## Config

| Key | Default | Meaning |
|---|---|---|
| `provider` | required | The `ctx.subagents` provider route children run on (`spawn` / `fork`). |
| `toolName` | `deepseek_team` | Model-facing tool name. |
| `llmProvider` | `deepseek-official` | Default LLM route for members that name none. |
| `members` | built-in roster | `{ role, label?, provider?, model, maxTokens?, persona? }` list. |
| `defaultRole` | `engineer` | Role used when a task names none. |
| `maxTasks` | 8 | Cap on tasks per call. |
| `maxParallel` | 6 | Cap on concurrently running tasks. |
| `enableRunInBackground` | true | Expose `run_in_background`. |
| `requireWorkTools` | true | Refuse a team call when the calling session exposes no file/shell tools; set `false` for tool-free parallel reasoning. |
| `toolFilter` | none | `{ allow?, deny? }` applied to every child. |
| `maxDepth` | 3 | Maximum child depth, or `'provider-managed'`. |

The model-facing contract is the `deepseek_team` tool: each task is `{ role?, description, prompt }`; the call waits for all members and returns `{ kind: 'foreground', tasks: [{ index, role, status, runId?, output, error? }] }`, or `{ kind: 'background', jobId }` with `run_in_background: true`. One failing member never aborts the team; partial child output survives in the failure detail.

## Human command and team mode

When the `ctx.commands` seam is mounted (every dsh-base profile), the plugin registers the `team` slash command — dispatch the team directly, without a model turn:

```text
/team planner: draft a migration plan | quick: fix the README typo
```

Segments split on `|` or newlines; each is `role: task` or a bare task routed to `defaultRole`. An invalid line or an absent provider reports a readable error.

For a switchable **team mode**, copy the `preset/team-mode` directory to `~\.dsh\.agent-presets\team-mode` (dsh discovers it live), then pick 团队模式 in the session's preset selector: it swaps the lead persona so the model orchestrates through `deepseek_team` by default, while the `/team` command stays available for direct runs. The shipped preset mounts the workbench team members inherit — platform shell (`pwsh`/`bash`), `read`/`write`/`edit`, `glob`/`grep`, background jobs, todo/ask-user, and web search — so specialists can actually read, edit, and run code instead of reporting a missing tool set.

The plugin also ships a **roster configuration panel**: after a restart, open 设置 → 团队模式 in the GUI. The panel provides a DSH-style role dropdown, a default LLM route dropdown populated from the host's active `llm.providers`, per-role model/route/persona editing, and save/reset through the `multiple-deepseek` settings document — changes hot-route the next team task.

## Development

`src/` is the source of truth; `lib/` is a committed build so git-based installs need no prepare script. This repository builds standalone:

```sh
npm install --no-save --ignore-scripts --legacy-peer-deps esbuild@^0.28.2
npm run build
npm install --no-save --ignore-scripts --legacy-peer-deps vitest@^3
npx vitest run tests/team-settings.spec.ts
```

`build.mjs` bundles the host and client halves; client CSS modules are inlined at build time. The package originates from the deepseek-harness monorepo package `@deepseek-ai/dsh-multiple-deepseek` (`packages/team/multiple-deepseek`), where the full test suite also runs.

## Tauri desktop client

The repository ships a Tauri 2 desktop shell in `desktop/`. It connects to the local
`http://127.0.0.1:3080` DSH web runtime and starts the installed `dsh web` command
when the port is not listening (the child console window is hidden).

```sh
npm run desktop:dev
npm run desktop:build
```

`desktop:build` produces the release executable at
`desktop/src-tauri/target/release/tmd-desktop.exe` and an NSIS installer at
`desktop/src-tauri/target/release/bundle/nsis/DeepSeek Harness Team_0.1.0_x64-setup.exe`.
Building requires Rust/MSVC, WebView2, Node.js, and a `dsh` command on PATH. The
current MVP reuses the installed DSH runtime; the signed side-by-side runtime,
atomic update, and rollback design lives in `docs/update-architecture.md`.

## CI and releases

`.github/workflows/build.yml` runs on pushes to `main`, pull requests, `v*` tags, and manual dispatch:

- builds and tests the plugin on Ubuntu;
- builds the Tauri exe and NSIS installer on Windows and uploads them as run artifacts;
- on a `v*` tag, publishes a GitHub Release with the exe, installer, and SHA256.

To cut a release:

```sh
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT
