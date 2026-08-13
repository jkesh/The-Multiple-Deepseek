/**
 * The-Multiple-Deepseek: parallel multi-DeepSeek team orchestration as one
 * model-facing tool plus the roster resolver that owns its routing.
 *
 * The model names a specialist role per task — planner, engineer, reviewer,
 * explorer, quick — and the `ctx.multipleDeepseek` roster maps each role to a
 * DeepSeek provider route, model, and specialist persona. Every task runs as a
 * child agent through a configured `ctx.subagents` provider, in parallel under
 * a concurrency bound; the call returns one aggregated outcome per task.
 *
 * The package is a Consumer over two seams: children run through
 * `ctx.subagents`, and role routing lands on `ctx.llm` routes
 * (`deepseek-official` from `@deepseek-ai/dsh-llm-deepseek` by default).
 * Specialist personas, the optional tool filter, and the delegation depth cap
 * require a subagent provider advertising the `persona`, `toolFilter`, and
 * `depthLimit` capabilities — the in-process providers do. When the
 * `ctx.commands` seam is mounted, the plugin additionally registers the
 * `team` human command, which dispatches the same tool without a model turn.
 * @module @deepseek-ai/dsh-multiple-deepseek
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { MemberConfig, MemberSpec, ResolvedRoster, RosterInput } from './types.ts';
export type { MemberConfig, MemberSpec, ResolvedRoster, RosterInput, TeamBackgroundResult, TeamForegroundResult, TeamTaskOutcome, TeamTaskStatus, TeamToolResult, } from './types.ts';
/** Plugin name for the cordis loader. */
export declare const name = "multiple-deepseek";
/** Capabilities this plugin consumes. */
export declare const inject: string[];
/** Default LLM provider route for team members. */
export declare const DEFAULT_LLM_PROVIDER = "deepseek-official";
/** Default specialist role when a task names none. */
export declare const DEFAULT_ROLE = "engineer";
/** Default model-facing tool name. */
export declare const DEFAULT_TOOL_NAME = "deepseek_team";
/** Default cap on tasks per team call. */
export declare const DEFAULT_MAX_TASKS = 8;
/** Default cap on concurrently running team tasks. */
export declare const DEFAULT_MAX_PARALLEL = 6;
/** Built-in specialist roster: each role names the DeepSeek model that suits its kind of work. */
export declare const DEFAULT_MEMBERS: MemberConfig[];
/** Plugin configuration: the subagent provider route, team bounds, and the role roster. */
export interface Config {
    /** The `ctx.subagents` provider route children run on (e.g. `spawn`). */
    provider: string;
    /** Model-facing tool name (default `deepseek_team`). Each loaded instance must use a distinct name. */
    toolName?: string;
    /** Default LLM route for members that name none (default `deepseek-official`). */
    llmProvider?: string;
    /** Specialist roster; omission uses {@link DEFAULT_MEMBERS}. */
    members?: MemberConfig[];
    /** Role used when a task names none (default `engineer`). */
    defaultRole?: string;
    /** Cap on tasks per call (default 8); larger calls reject before any start. */
    maxTasks?: number;
    /** Cap on concurrently running tasks (default 6). */
    maxParallel?: number;
    /** Expose `run_in_background` (default true). Disabled instances omit the parameter and reject forced background calls. */
    enableRunInBackground?: boolean;
    /** Tool filter applied to every child. Requires the provider's `toolFilter` capability; unknown names fail startup. */
    toolFilter?: {
        /** Global tool names the child keeps; everything else is removed. */
        allow?: string[];
        /** Global tool names removed from the child. */
        deny?: string[];
    };
    /** Maximum child depth (default `3`; `0` forbids delegation), or `'provider-managed'` to send no cap. */
    maxDepth?: number | 'provider-managed';
}
/** Settings namespace owning the user-editable roster. */
export declare const SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Schemastery schema doubling as the plugin's validated configuration entry. */
export declare const Config: z<Config>;
/** A task named a role absent from the roster; the call rejects before any child starts. */
export declare class UnknownRoleError extends Error {
    /** The role the model requested. */
    readonly role: string;
    /** The role ids this roster accepts, in configuration order. */
    readonly roles: readonly string[];
    /**
     * @param role - the requested role id.
     * @param roles - the roster's accepted role ids, in configuration order.
     */
    constructor(role: string, roles: readonly string[]);
}
/**
 * Validate raw roster facts and resolve every member default. Misconfiguration
 * fails here, at load, before any effect registers. Programmatic construction
 * may bypass Schemastery normalization, so every bound is re-judged here.
 * @param input - raw roster facts from configuration.
 * @returns the validated roster with member defaults resolved.
 */
export declare function resolveRoster(input: RosterInput): ResolvedRoster;
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The mounted multi-DeepSeek roster resolver. */
        multipleDeepseek: MultipleDeepseekResolver;
    }
}
/**
 * Owns the role-to-DeepSeek routing table. The model names a role, never a
 * model: {@link resolve} returns the routed member spec, and the team tool
 * turns it into the child's `AgentOptions` and persona. The roster source is
 * re-read on every call, so a settings-layer change routes the very next
 * task without a restart.
 */
export declare class MultipleDeepseekResolver extends Service {
    /** Schemastery schema for the roster facts this service validates. */
    static Config: z<RosterInput>;
    private source;
    /**
     * @param ctx - Cordis context registering the `multipleDeepseek` service.
     * @param source - current roster facts; every lookup resolves and validates
     *   them, so the composition entry is the initial source and the settings
     *   wiring re-points it once a settings provider mounts.
     */
    constructor(ctx: Context, source: () => RosterInput);
    /**
     * Resolve one role to its routed member spec.
     * @param role - the role id a task named.
     * @returns the member spec carrying the DeepSeek route, model, and specialist facts.
     * @throws {@link UnknownRoleError} when the roster has no such role.
     */
    resolve(role: string): MemberSpec;
    /**
     * The mounted roster in configuration order.
     * @returns every role and its routed DeepSeek facts.
     */
    listRoles(): readonly MemberSpec[];
    /**
     * The role a task gets when it names none.
     * @returns the roster's default role id.
     */
    get defaultRole(): string;
}
/** Mount the team tool on the configured subagent provider. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map