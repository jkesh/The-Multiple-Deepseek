# The-Multiple-Deepseek

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的并行多 DeepSeek 团队编排插件，借鉴 oh-my-openagent 的类别到模型路由。

[English](README.md) | 中文

模型为每个任务指定专家**角色**——planner、engineer、reviewer、explorer、quick——而从不直接指定模型。插件的花名册把每个角色映射到 DeepSeek 提供方路由、模型、输出上限与专家人设，然后通过 harness 的 `ctx.subagents` 接缝把任务并行扇出为子代理，并按任务返回一个聚合结果。

| 角色 | 默认模型 | 适用工作 |
|---|---|---|
| `planner` | `deepseek-v4-pro` | 战略规划、范围与风险 |
| `engineer` | `deepseek-v4-pro` | 自主端到端实现 |
| `reviewer` | `deepseek-v4-pro` | 对抗性审查 |
| `explorer` | `deepseek-v4-flash` | 代码库研究 |
| `quick` | `deepseek-v4-flash` | 小而快的精准修改 |

每个角色、模型与人设都可以在 dsh 的 patch 层中配置。

## 安装

需要一个 dsh profile（Harness home `~\.dsh`）。安装到 profile 并挂载配置行：

```sh
cd <你的 dsh checkout>
pnpm dsh plugin --profile web add github:jkesh/The-Multiple-Deepseek
```

然后把下面这行加到 `~\.dsh\profiles\web\cordis.patch.yml`：

```yaml
- id: multiple-deepseek
  name: the-multiple-deepseek
  config:
    provider: spawn   # 内置子代理提供方（spawn 或 fork）
```

用 `pnpm dsh --profile web --dump-config` 验证。

插件把 `@deepseek-ai/dsh-*` 与 `@deepseek-ai/cordis` 声明为 peer 依赖；dsh 从自身安装解析它们（profile 模块回退），因此不会从注册表安装。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `provider` | 必填 | 子代理运行的 `ctx.subagents` 提供方路由（`spawn` / `fork`）。 |
| `toolName` | `deepseek_team` | 面向模型的工具名。 |
| `llmProvider` | `deepseek-official` | 未单独声明路由的成员的默认 LLM 路由。 |
| `members` | 内置花名册 | `{ role, label?, provider?, model, maxTokens?, persona? }` 列表。 |
| `defaultRole` | `engineer` | 任务未指定角色时的兜底。 |
| `maxTasks` | 8 | 每次调用的任务数上限。 |
| `maxParallel` | 6 | 并发任务上限。 |
| `enableRunInBackground` | true | 是否暴露 `run_in_background`。 |
| `toolFilter` | 无 | 应用于每个子代理的 `{ allow?, deny? }`。 |
| `maxDepth` | 3 | 子代理最大深度，或 `'provider-managed'`。 |

面向模型的契约是 `deepseek_team` 工具：每个任务是 `{ role?, description, prompt }`；调用等待全部成员并返回 `{ kind: 'foreground', tasks: [{ index, role, status, runId?, output, error? }] }`，或配合 `run_in_background: true` 返回 `{ kind: 'background', jobId }`。单个成员失败不会中止整支团队；失败详情中保留子代理的部分输出。

## 人类命令与团队模式

挂载 `ctx.commands` 接缝时（所有 dsh-base profile 都会挂载），插件会注册 `team` 斜杠命令——不经模型回合直接分派团队：

```text
/team planner: 起草迁移计划 | quick: 修复 README 拼写
```

输入按 `|` 或换行拆段；每段是 `role: 任务`，或直接路由到 `defaultRole` 的裸任务。无效输入或提供方缺失会返回可读错误。

想一键切换**团队模式**：把 `preset/team-mode` 目录复制到 `~\.dsh\.agent-presets\team-mode`（dsh 实时发现，无需重启），然后在会话的预设选择器里选 团队模式——它会换用团队主管 persona，让模型默认通过 `deepseek_team` 编排；`/team` 命令仍然可用，用于直接触发。

插件还附带**花名册配置面板**：重启后在 GUI 打开 设置 → 团队模式，即可编辑每个角色的模型、LLM 路由与人设——通过设置文档保存，下一次团队任务即按新路由生效（由 `multiple-deepseek` 设置区段支撑）。

## 开发

本包源自 deepseek-harness 单仓中的 `@deepseek-ai/dsh-multiple-deepseek`（`packages/team/multiple-deepseek`）。`src/` 是事实来源；`lib/` 是已提交的构建产物，因此基于 git 的安装无需 prepare 脚本。重新构建请检出单仓并运行其 `pnpm run build`；测试（`tests/`）在单仓内用 `pnpm exec vitest run packages/team/multiple-deepseek/tests` 运行。

## License

MIT
