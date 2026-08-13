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
| `toolFilter` | none | `{ allow?, deny? }` applied to every child. |
| `maxDepth` | 3 | Maximum child depth, or `'provider-managed'`. |

The model-facing contract is the `deepseek_team` tool: each task is `{ role?, description, prompt }`; the call waits for all members and returns `{ kind: 'foreground', tasks: [{ index, role, status, runId?, output, error? }] }`, or `{ kind: 'background', jobId }` with `run_in_background: true`. One failing member never aborts the team; partial child output survives in the failure detail.

## Human command and team mode

When the `ctx.commands` seam is mounted (every dsh-base profile), the plugin registers the `team` slash command — dispatch the team directly, without a model turn:

```text
/team planner: draft a migration plan | quick: fix the README typo
```

Segments split on `|` or newlines; each is `role: task` or a bare task routed to `defaultRole`. An invalid line or an absent provider reports a readable error.

For a switchable **team mode**, copy the `preset/team-mode` directory to `~\.dsh\.agent-presets\team-mode` (dsh discovers it live), then pick 团队模式 in the session's preset selector: it swaps the lead persona so the model orchestrates through `deepseek_team` by default, while the `/team` command stays available for direct runs.

The plugin also ships a **roster configuration panel**: after a restart, open 设置 → 团队模式 in the GUI to edit each role's model, LLM route, and persona — saved through the settings document and hot-routed on the next team task (the `multiple-deepseek` settings section backs it).

## Development

This package originates from the deepseek-harness monorepo package `@deepseek-ai/dsh-multiple-deepseek` (`packages/team/multiple-deepseek`). `src/` is the source of truth; `lib/` is a committed build so git-based installs need no prepare script. To rebuild, check out the monorepo and run its `pnpm run build`; the tests (`tests/`) run inside the monorepo with `pnpm exec vitest run packages/team/multiple-deepseek/tests`.

## License

MIT
