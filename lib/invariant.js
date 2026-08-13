//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-multiple-deepseek`.
* @module @deepseek-ai/dsh-multiple-deepseek/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-multiple-deepseek";
/** Cordis companion plugin name. */
const name = "multiple-deepseek-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: every team run executes through the subagent seam, whose run relations
* and child sessions are owned by `ctx.subagents` and covered by its invariant.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
