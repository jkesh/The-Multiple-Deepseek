// ../The-Multiple-Deepseek/src/index.ts
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { CallId } from "@deepseek-ai/dsh-llm";
import { assertSubagentMaxDepth } from "@deepseek-ai/dsh-subagent";
var name = "multiple-deepseek";
var inject = ["tools", "subagents", "systemPrompt"];
var DEFAULT_LLM_PROVIDER = "deepseek-official";
var DEFAULT_ROLE = "engineer";
var DEFAULT_TOOL_NAME = "deepseek_team";
var DEFAULT_MAX_TASKS = 8;
var DEFAULT_MAX_PARALLEL = 6;
var TEAM_SECTION_ORDER = 117;
var DEFAULT_MEMBERS = [
  {
    role: "planner",
    label: "strategic planner",
    model: "deepseek-v4-pro",
    persona: "You are the planning specialist on a DeepSeek team. Break the goal into concrete steps, identify scope, risks, and open decisions, and produce a precise plan before work starts. Ask for missing constraints instead of assuming them."
  },
  {
    role: "engineer",
    label: "autonomous implementer",
    model: "deepseek-v4-pro",
    persona: "You are the autonomous implementation specialist on a DeepSeek team. Given a goal, explore the code, research the patterns, and execute end to end. Do not stop at a half-finished result; drive the task to a working conclusion."
  },
  {
    role: "reviewer",
    label: "adversarial reviewer",
    model: "deepseek-v4-pro",
    persona: "You are the adversarial review specialist on a DeepSeek team. Read the work critically: find defects, security issues, and design flaws. Be specific about what to change and why."
  },
  {
    role: "explorer",
    label: "codebase researcher",
    model: "deepseek-v4-flash",
    persona: "You are the codebase research specialist on a DeepSeek team. Search, read, and map the relevant code and documentation, then report precise findings with file paths and references."
  },
  {
    role: "quick",
    label: "fast editor",
    model: "deepseek-v4-flash",
    persona: "You are the fast-edit specialist on a DeepSeek team. Make one small, well-scoped change quickly and report exactly what changed."
  }
];
var memberSchema = z.object({
  role: z.string().required(),
  label: z.string(),
  provider: z.string(),
  model: z.string().required(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  persona: z.string()
});
var Config = z.object({
  provider: z.string().required(),
  toolName: z.string().default(DEFAULT_TOOL_NAME),
  llmProvider: z.string().default(DEFAULT_LLM_PROVIDER),
  members: z.array(memberSchema).default(DEFAULT_MEMBERS),
  defaultRole: z.string().default(DEFAULT_ROLE),
  maxTasks: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_TASKS),
  maxParallel: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_PARALLEL),
  enableRunInBackground: z.boolean().default(true),
  // Prevent Schemastery from materializing omitted toolFilter as `{ allow: [] }`, which would deny every tool.
  toolFilter: z.object({
    allow: z.array(z.string()).default(void 0),
    deny: z.array(z.string()).default(void 0)
  }).default(void 0),
  maxDepth: z.union([z.natural().max(Number.MAX_SAFE_INTEGER), z.const("provider-managed")]).default(3)
});
var UnknownRoleError = class extends Error {
  /** The role the model requested. */
  role;
  /** The role ids this roster accepts, in configuration order. */
  roles;
  /**
   * @param role - the requested role id.
   * @param roles - the roster's accepted role ids, in configuration order.
   */
  constructor(role, roles) {
    super(`multiple-deepseek: unknown team role "${role}" (configured roles: ${roles.join(", ")})`);
    this.name = "UnknownRoleError";
    this.role = role;
    this.roles = roles;
  }
};
function resolveRoster(input) {
  if (input.llmProvider.length === 0) {
    throw new Error("multiple-deepseek: llmProvider must name a registered LLM route");
  }
  const members = (input.members ?? DEFAULT_MEMBERS).map((member) => {
    if (member.role.length === 0) throw new Error("multiple-deepseek: member roles must be non-empty");
    if (member.model.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty model`);
    }
    if (member.label !== void 0 && member.label.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty label`);
    }
    if (member.provider !== void 0 && member.provider.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty provider route`);
    }
    if (member.persona !== void 0 && member.persona.length === 0) {
      throw new Error(`multiple-deepseek: role "${member.role}" has an empty persona`);
    }
    if (member.maxTokens !== void 0 && (!Number.isSafeInteger(member.maxTokens) || member.maxTokens <= 0)) {
      throw new Error(`multiple-deepseek: role "${member.role}" maxTokens must be a positive safe integer`);
    }
    return {
      role: member.role,
      label: member.label ?? member.role,
      provider: member.provider ?? input.llmProvider,
      model: member.model,
      ...member.maxTokens === void 0 ? {} : { maxTokens: member.maxTokens },
      ...member.persona === void 0 ? {} : { persona: member.persona }
    };
  });
  const roles = /* @__PURE__ */ new Set();
  for (const member of members) {
    if (roles.has(member.role)) throw new Error(`multiple-deepseek: duplicate role "${member.role}"`);
    roles.add(member.role);
  }
  if (members.length === 0) throw new Error("multiple-deepseek: the roster must configure at least one role");
  if (!roles.has(input.defaultRole)) {
    throw new Error(
      `multiple-deepseek: defaultRole "${input.defaultRole}" is not a configured role (roles: ${[...roles].join(", ")})`
    );
  }
  return { llmProvider: input.llmProvider, defaultRole: input.defaultRole, members };
}
var MultipleDeepseekResolver = class extends Service {
  /** Schemastery schema for the roster facts this service validates. */
  static Config = z.object({
    llmProvider: z.string().required(),
    defaultRole: z.string().required(),
    members: z.array(memberSchema)
  });
  roster;
  /**
   * @param ctx - Cordis context registering the `multipleDeepseek` service.
   * @param config - roster facts; {@link resolveRoster} validates and completes them.
   */
  constructor(ctx, config) {
    super(ctx, "multipleDeepseek");
    this.roster = resolveRoster(config);
  }
  /**
   * Resolve one role to its routed member spec.
   * @param role - the role id a task named.
   * @returns the member spec carrying the DeepSeek route, model, and specialist facts.
   * @throws {@link UnknownRoleError} when the roster has no such role.
   */
  resolve(role) {
    const member = this.roster.members.find((candidate) => candidate.role === role);
    if (member === void 0) throw new UnknownRoleError(role, this.roster.members.map((spec) => spec.role));
    return member;
  }
  /**
   * The mounted roster in configuration order.
   * @returns every role and its routed DeepSeek facts.
   */
  listRoles() {
    return this.roster.members;
  }
  /**
   * The role a task gets when it names none.
   * @returns the roster's default role id.
   */
  get defaultRole() {
    return this.roster.defaultRole;
  }
};
function agentOptionsOf(member) {
  return {
    provider: member.provider,
    model: member.model,
    ...member.maxTokens === void 0 ? {} : { maxTokens: member.maxTokens }
  };
}
function roleMenu(roster) {
  return roster.listRoles().map((member) => `${member.role} \u2014 ${member.label}`).join("; ");
}
var TEAM_COMMAND_NAME = "team";
function parseTeamCommand(rawInput) {
  const segments = rawInput.split(/[|\n]/u).map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return "team: expected at least one task, e.g. `/team planner: draft a plan | quick: fix the typo`";
  }
  const tasks = [];
  for (const segment of segments) {
    const colon = segment.indexOf(":");
    if (colon === -1) {
      tasks.push({ description: segment, prompt: segment });
      continue;
    }
    const role = segment.slice(0, colon).trim();
    const prompt = segment.slice(colon + 1).trim();
    if (role.length === 0) {
      return "team: empty role before the colon \u2014 name a role or drop the colon";
    }
    if (prompt.length === 0) {
      return "team: empty task after the colon \u2014 write the task text after `role:`";
    }
    tasks.push({ role, description: prompt, prompt });
  }
  return tasks;
}
function blocksText(content) {
  return content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
var teamCommandCallCounter = 0;
function stopFailure(result) {
  switch (result.stopReason) {
    case "completed":
      return void 0;
    case "aborted":
      return "specialist run was cancelled";
    case "error":
      return "specialist run failed";
    case "max-tokens":
      return "specialist run hit its token limit before finishing";
    case "refusal":
      return "specialist declined the task";
    // Merge-extensible union: a backend may add stop reasons. Treat an unknown
    // terminal reason as a failure rather than reporting partial output as success.
    default:
      return `specialist run ended abnormally (${String(result.stopReason)})`;
  }
}
var TeamTaskFailure = class extends Error {
  /**
   * @param message - the stop-reason headline.
   * @param output - the child's output content blocks, possibly partial.
   */
  constructor(message, output) {
    super(message);
    this.output = output;
    this.name = "TeamTaskFailure";
  }
  output;
};
function withPartialAnswer(error, output) {
  const text = output.filter((block) => block.type === "text").map((block) => block.text).join("");
  return new TeamTaskFailure(
    text.length === 0 ? error : `${error}
Partial output before the run ended:
${text}`,
    output
  );
}
function textOf(value) {
  return value.reduce((text, block) => {
    if (typeof block !== "object" || block === null || Array.isArray(block)) return text;
    if (block.type !== "text") return text;
    const body = block.text;
    if (typeof body !== "string") return text;
    return text + body;
  }, "");
}
async function settleTeamTask(ctx, providerName, entry, buildRequest, signal) {
  const base = { index: entry.index, role: entry.member.role };
  let run;
  try {
    run = await ctx.subagents.start(providerName, buildRequest(entry, signal));
  } catch (error) {
    return {
      ...base,
      status: signal.aborted ? "killed" : "failed",
      output: [],
      error: String(error)
    };
  }
  const [execution] = await Promise.allSettled([
    run.result.then((result) => {
      const failure = stopFailure(result);
      if (failure !== void 0) throw withPartialAnswer(failure, result.output);
      return result;
    })
  ]);
  const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
  if (execution.status === "rejected") {
    const failure = execution.reason;
    const partial = failure instanceof TeamTaskFailure ? failure.output : [];
    let message = failure instanceof TeamTaskFailure ? failure.message : String(failure);
    if (disposal.status === "rejected") message += `; dispose failed: ${String(disposal.reason)}`;
    return {
      ...base,
      runId: String(run.id),
      status: signal.aborted ? "killed" : "failed",
      output: partial,
      error: message
    };
  }
  if (disposal.status === "rejected") {
    return {
      ...base,
      runId: String(run.id),
      status: "failed",
      output: execution.value.output,
      error: `deepseek team task disposed with an error: ${String(disposal.reason)}`
    };
  }
  return {
    ...base,
    runId: String(run.id),
    status: "completed",
    output: execution.value.output
  };
}
async function mapWithLimit(items, limit, fn) {
  const queue = [...items];
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (; ; ) {
      const item = queue.shift();
      if (item === void 0) return;
      const slot = cursor;
      cursor += 1;
      results[slot] = await fn(item);
    }
  };
  const width = Math.min(limit, items.length);
  const workers = [];
  for (let i = 0; i < width; i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}
async function runTeam(ctx, providerName, entries, maxParallel, signal, buildRequest) {
  return mapWithLimit(entries, maxParallel, (entry) => settleTeamTask(ctx, providerName, entry, buildRequest, signal));
}
function summarizeTeam(tasks) {
  const incomplete = tasks.filter((task) => task.status !== "completed").length;
  if (incomplete === 0) {
    return { status: "completed", detail: `${tasks.length} DeepSeek team tasks completed` };
  }
  return { status: "failed", detail: `${incomplete} of ${tasks.length} DeepSeek team tasks did not complete` };
}
function apply(ctx, config) {
  const toolName = config.toolName ?? DEFAULT_TOOL_NAME;
  if (toolName.length === 0) throw new Error("multiple-deepseek: toolName must be non-empty");
  const maxTasks = config.maxTasks ?? DEFAULT_MAX_TASKS;
  if (!Number.isSafeInteger(maxTasks) || maxTasks <= 0) {
    throw new Error("multiple-deepseek: maxTasks must be a positive safe integer");
  }
  const maxParallel = config.maxParallel ?? DEFAULT_MAX_PARALLEL;
  if (!Number.isSafeInteger(maxParallel) || maxParallel <= 0) {
    throw new Error("multiple-deepseek: maxParallel must be a positive safe integer");
  }
  const backgroundEnabled = config.enableRunInBackground !== false;
  if (config.maxDepth !== "provider-managed") assertSubagentMaxDepth(config.maxDepth);
  if (config.toolFilter !== void 0 && config.toolFilter.allow === void 0 && config.toolFilter.deny === void 0) {
    throw new Error(
      "multiple-deepseek: `toolFilter` is configured but names neither `allow` nor `deny` \u2014 remove the key or fill the filter"
    );
  }
  const roster = new MultipleDeepseekResolver(ctx, {
    llmProvider: config.llmProvider ?? DEFAULT_LLM_PROVIDER,
    defaultRole: config.defaultRole ?? DEFAULT_ROLE,
    ...config.members === void 0 ? {} : { members: config.members }
  });
  const roleMenuText = roleMenu(roster);
  const commands = ctx.get("commands");
  if (commands !== void 0) {
    commands.register({
      name: TEAM_COMMAND_NAME,
      description: "Run parallel DeepSeek team tasks directly, without a model turn.",
      input: { hint: `role: task | role: task \u2014 roles: ${roleMenuText}` },
      handler: async (invocation) => {
        const parsed = parseTeamCommand(invocation.rawInput);
        if (typeof parsed === "string") return { kind: "error", text: parsed };
        if (disposeTool === void 0) {
          return {
            kind: "error",
            text: `team: deepseek_team is unavailable \u2014 subagent provider "${config.provider}" is not registered`
          };
        }
        for (const item of parsed) {
          roster.resolve(item.role ?? roster.defaultRole);
        }
        const result = await ctx.tools.execute({
          signal: invocation.signal,
          callId: CallId(`command-team-${++teamCommandCallCounter}`),
          name: toolName,
          arguments: { tasks: parsed },
          agent: invocation.agent
        });
        const text = blocksText(result.content);
        return result.isError ? { kind: "error", text } : { kind: "success", text };
      }
    });
  }
  let disposeTool;
  const mount = (provider) => {
    if (typeof config.maxDepth === "number" && !provider.capabilities.depthLimit) {
      throw new Error(
        `multiple-deepseek: provider "${provider.name}" cannot enforce maxDepth (no depthLimit capability) \u2014 set maxDepth: 'provider-managed' to leave the recursion budget to the provider`
      );
    }
    if (roster.listRoles().some((member) => member.persona !== void 0) && !provider.capabilities.persona) {
      throw new Error(
        `multiple-deepseek: provider "${provider.name}" cannot apply specialist personas (no persona capability) \u2014 remove the roster personas or use an in-process provider`
      );
    }
    if (config.toolFilter !== void 0 && !provider.capabilities.toolFilter) {
      throw new Error(
        `multiple-deepseek: provider "${provider.name}" cannot scope child tools (no toolFilter capability)`
      );
    }
    disposeTool = ctx.tools.register(defineTool({
      name: toolName,
      description: "Coordinate a team of multiple DeepSeek specialists. Each task names a specialist role, and the role selects its DeepSeek model and specialist instructions automatically \u2014 name the kind of work, never a model. Tasks run in parallel; this call waits for every member and returns one result per task." + (backgroundEnabled ? " Set `run_in_background: true` to run the whole team as a background job and collect it with `job_output`." : ""),
      parameters: {
        tasks: {
          type: "array",
          required: true,
          description: "The team tasks, started in parallel. Batch independent work into one call instead of delegating serially.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              role: {
                type: "string",
                description: `The specialist role for this task: ${roleMenuText}. Omit to use the default role ${roster.defaultRole}.`
              },
              description: {
                type: "string",
                required: true,
                description: "A short (3-5 word) description of the task, for display."
              },
              prompt: {
                type: "string",
                required: true,
                description: "The complete, self-contained task for this specialist. It does not share this conversation's context, so include everything it needs."
              }
            }
          }
        },
        ...backgroundEnabled ? {
          run_in_background: {
            type: "boolean",
            description: "Whether to run the whole team as a background job and return its job id. Defaults to false; collect with `job_output` or stop with `job_kill`."
          }
        } : {}
      },
      output: {
        schema: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true, const: "background" },
                jobId: { type: "string", required: true }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true, const: "foreground" },
                tasks: {
                  type: "array",
                  required: true,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      index: { type: "number", required: true },
                      role: { type: "string", required: true },
                      status: { type: "string", required: true, enum: ["completed", "failed", "killed"] },
                      runId: { type: "string" },
                      output: { type: "array", required: true, items: { type: "json" } },
                      error: { type: "string" }
                    }
                  }
                }
              }
            }
          ]
        },
        render: (_args, value) => {
          if (value.kind === "background") {
            return [{ type: "text", text: `started background deepseek team ${value.jobId}` }];
          }
          const lines = value.tasks.map((task) => {
            const head = `[${task.index + 1}] ${task.role} ${task.status}`;
            const text = textOf(task.output);
            if (task.error !== void 0) return `${head}: ${task.error}${text.length === 0 ? "" : `
${text}`}`;
            return text.length === 0 ? head : `${head}:
${text}`;
          });
          return [{ type: "text", text: lines.join("\n") }];
        }
      },
      // Children never mutate the parent session; the one parent-owned write
      // (jobs.start) is a synchronous commutative insertion.
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const parent = exec.agent;
        if (!parent) {
          throw new Error("deepseek_team tool requires a calling agent (exec.agent was undefined)");
        }
        const tasks = args.tasks;
        if (tasks.length === 0) throw new Error("multiple-deepseek: `tasks` must name at least one task");
        if (tasks.length > maxTasks) {
          throw new Error(`multiple-deepseek: ${tasks.length} tasks exceed the configured maxTasks (${maxTasks})`);
        }
        if (args.run_in_background === true && !backgroundEnabled) {
          throw new Error("run_in_background is disabled for this tool instance (enableRunInBackground: false)");
        }
        const entries = tasks.map((task, index) => ({
          index,
          description: task.description,
          prompt: task.prompt,
          member: roster.resolve(task.role ?? roster.defaultRole)
        }));
        const buildRequest = (entry, signal) => ({
          label: entry.description,
          prompt: [{ type: "text", text: entry.prompt }],
          parent,
          signal,
          agentOptions: agentOptionsOf(entry.member),
          ...entry.member.persona === void 0 ? {} : { persona: entry.member.persona },
          ...config.toolFilter === void 0 ? {} : { toolFilter: config.toolFilter },
          ...typeof config.maxDepth === "number" ? { maxDepth: config.maxDepth } : {}
        });
        if (args.run_in_background === true) {
          const jobs = ctx.get("jobs");
          if (jobs === void 0) {
            throw new Error("background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs");
          }
          const id = jobs.start({
            kind: "subagent",
            label: `deepseek team (${tasks.length} tasks)`,
            owner: parent,
            run: () => {
              const controller = new AbortController();
              const done = runTeam(ctx, config.provider, entries, maxParallel, controller.signal, buildRequest).then(summarizeTeam);
              return {
                cancel: (reason) => {
                  controller.abort(reason ?? "background deepseek team killed");
                },
                done
              };
            }
          });
          return { kind: "background", jobId: id };
        }
        return {
          kind: "foreground",
          tasks: await runTeam(ctx, config.provider, entries, maxParallel, exec.signal, buildRequest)
        };
      }
    }));
  };
  ctx.on("subagent/provider-added", (provider) => {
    if (provider.name === config.provider && disposeTool === void 0) mount(provider);
  });
  ctx.on("subagent/provider-removed", (name2) => {
    if (name2 !== config.provider || disposeTool === void 0) return;
    disposeTool();
    disposeTool = void 0;
  });
  const present = ctx.subagents.getProvider(config.provider);
  if (present !== void 0) {
    mount(present);
  } else {
    ctx.logger.info(`subagent provider "${config.provider}" not registered yet; the "${toolName}" tool will register when it appears`);
  }
  ctx.systemPrompt.section({
    name: `tool:${toolName}`,
    order: TEAM_SECTION_ORDER,
    text: (context) => disposeTool === void 0 || ctx.tools.get(toolName, context.scope) === void 0 ? "" : `Use ${toolName} to run several DeepSeek specialists in parallel. Pick a role per task: ${roleMenuText}. The role routes the task to its DeepSeek model and specialist instructions \u2014 name the kind of work, never a model. Batch independent tasks into one call and wait for all results; reserve a follow-up call for work that depends on a finished member's output.`
  });
}
export {
  Config,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_MAX_PARALLEL,
  DEFAULT_MAX_TASKS,
  DEFAULT_MEMBERS,
  DEFAULT_ROLE,
  DEFAULT_TOOL_NAME,
  MultipleDeepseekResolver,
  UnknownRoleError,
  apply,
  inject,
  name,
  resolveRoster
};
