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

## Native desktop client

The repository ships a native Rust desktop client in `native/` (egui, no
webview, no served WebUI — see [docs/native-client.md](docs/native-client.md)).
It talks to the local dsh backend over the pinned protocol and owns the
backend lifecycle: heartbeat (`/api/health` with boot-marker fallback),
spawns `dsh web` on demand, start/stop buttons, and stop-with-the-window on
close (graceful `/api/shutdown` or process-tree cleanup).

```sh
cargo run -p dsh-client            # dev run
cargo build --release -p dsh-client  # release exe
makensis installer/installer.nsi   # NSIS installer (from native/)
```

The release executable lands at `native/target/release/dsh-client.exe` and
the installer at `native/target/release/dsh-client-setup.exe`. Building
requires Rust/MSVC and a `dsh` command on PATH (the client starts the
backend itself when it is not running).

### Deprecated: Tauri shell

`desktop/` is the legacy Tauri 2 wrapper around the served WebUI; it is kept
for reference only and no longer built by CI. The native client replaces it.

## CI and releases

`.github/workflows/build.yml` runs on pushes to `main`, pull requests, `v*` tags, and manual dispatch:

- builds and tests the plugin on Ubuntu;
- builds the native Rust client and its NSIS installer on Windows and uploads them as run artifacts;
- on a `v*` tag, publishes a GitHub Release with the exe, installer, and SHA256.

To cut a release:

```sh
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT
