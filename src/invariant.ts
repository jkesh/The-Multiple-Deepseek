/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-multiple-deepseek`.
 * @module @deepseek-ai/dsh-multiple-deepseek/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-multiple-deepseek'

/** Cordis companion plugin name. */
export const name = 'multiple-deepseek-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every team run executes through the subagent seam, whose run relations
 * and child sessions are owned by `ctx.subagents` and covered by its invariant.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
