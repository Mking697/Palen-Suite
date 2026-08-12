/**
 * Panel run splitting.
 *
 * The shop rule, derived from the drawings:
 *
 *   run = wall length - corner legs - door module
 *   n   = floor(run / module)
 *   bal = run - n * module
 *   if bal is a sliver (< minPanelWidth), drop one full module and split the
 *   resulting balance into equal pieces
 *
 * This is what produces the recurring 635+635 / 613+613 / 563+563 pairs in the
 * source sheets instead of a full module plus a useless 90mm offcut.
 *
 * Auto mode never needs more than two pieces: after giving a module back the
 * balance is always under 2 x module. Splitting a balance three or more ways is
 * a deliberate draftsman decision, so it is a separate explicit input
 * (`balancePieces`) rather than a cap the engine happens to reach.
 */

import type { Mm } from './types.ts';

const EPS = 1e-6;

export interface SplitOptions {
  module: Mm;
  minPanelWidth: Mm;
  /** upper bound when the engine works out how many pieces the balance needs */
  maxSplitPieces?: number;
  /** force the balance into exactly this many equal pieces — overrides auto */
  balancePieces?: number;
}

export function splitRun(run: Mm, opts: SplitOptions): Mm[] {
  const { module, minPanelWidth, maxSplitPieces = 2, balancePieces } = opts;

  if (!(run > 0.5)) return [];
  if (run <= module + EPS) return [Math.round(run)];

  let n = Math.floor(run / module + EPS);
  let bal = run - n * module;

  // sliver balance: give back a module and split what is left
  if (bal > 0.5 && bal < minPanelWidth) {
    n -= 1;
    bal = run - n * module;
  }

  const out: Mm[] = [];
  for (let i = 0; i < n; i++) out.push(module);

  if (bal > 0.5) {
    // minimum pieces so that no piece is wider than the module
    const needed = Math.max(1, Math.ceil(bal / module - EPS));
    const pieces =
      balancePieces && balancePieces > 0
        ? Math.max(balancePieces, needed)
        : Math.min(maxSplitPieces, needed);
    const each = Math.round(bal / pieces);
    for (let i = 0; i < pieces; i++) out.push(each);
  }

  return out;
}
