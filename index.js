// dsh-queue-first-enter — index.js (Host half)
//
// The feature lives entirely in the browser half (client.js): it reads the
// authoritative `session/queue` snapshot and calls the existing strict-steer
// operation on the first queued row. This host half exists so the package is a
// normal dual-face plugin row (a package declaring `dsh.client` must still
// export a mountable entry) and so the row config is visible host-side.

/**
 * Mount the host half. It contributes no host behavior on purpose: the
 * gesture, the state, and the settings row all belong to the browser half.
 * @param ctx - host Cordis context.
 * @param config - row config from the profile patch.
 */
export function apply(ctx, config = {}) {
  ctx.effect(() => () => {}, "dsh-queue-first-enter: host half (no host behavior)");
}

export const name = "dsh-queue-first-enter";
export const inject = [];
