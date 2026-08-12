/**
 * Shop rules and defaults, all verified against the four source BOQ sheets.
 * Every value here is a default — the UI will expose each one as an input.
 */

import type { Mm } from './types.ts';

/** PUF chemical density in kg/m3. All four source sheets compute at exactly 40. */
export const DEFAULT_DENSITY = 40;

/** Blank = panel + this, on the width only. Held on every row of all four sheets. */
export const DEFAULT_BLANK_ALLOWANCE: Mm = 40;

/** HI-15223 butt joint outer skin used +100 instead. Inner skin stayed at +40. */
export const BUTT_JOINT_BLANK_ALLOWANCE: Mm = 100;

/**
 * Butt joint inner skin is narrower than the outer by this much.
 * Single data point so far: HI-15223, 60mm, outer 930 / inner 880.
 * Confirm against a second job before trusting it at other thicknesses.
 */
export const BUTT_JOINT_INNER_DELTA: Mm = 50;

/** Corner panel inner skin = outer - 2*wallTh + this bend allowance. */
export const CORNER_INNER_BEND: Mm = 5;

/** Wallframe vertical blank length = wall height + this. */
export const WALLFRAME_VERTICAL_EXTRA: Mm = 15;

export const WALLFRAME_BLANK_WIDTH: Mm = 1220;
export const WALLFRAME_TOP_BOTTOM_LENGTH: Mm = 1500;

/**
 * Door leaf blank offsets over the clear opening, keyed by panel thickness.
 * These are NOT derivable from a formula (60 -> 100 adds 44, 100 -> 120 adds 49),
 * so they are a per-thickness preset the estimator can edit.
 *
 * Note: HI-15279 used 92/102 instead of 102/112 at 60mm for the same 860x1980
 * opening, which looks like an error in that sheet. Values below follow the
 * majority (HI-15191, HI-15223, HI-15252).
 */
export const DOOR_BLANK_OFFSETS: Record<
  number,
  { innerW: Mm; innerH: Mm; outerW: Mm; outerH: Mm }
> = {
  60: { innerW: 102, innerH: 125, outerW: 112, outerH: 102 },
  100: { innerW: 146, innerH: 185, outerW: 122, outerH: 124 },
  120: { innerW: 195, innerH: 228, outerW: 132, outerH: 124 },
};

/** U-flashing middle leg = panel thickness + 2. */
export function uFlashingProfile(th: Mm): string {
  return `10x40x${th + 2}x40x10`;
}

/** Sheet row labels. HI-15191 uses the plural "Wall Panels", the rest singular. */
export const DEFAULT_LABELS = {
  wallOuter: 'Wall Panel (Outer)',
  wallInner: 'Wall Panel (Inner)',
  buttOuter: 'Wall Panel (Outer) Butt Joint',
  buttInner: 'Wall Panel (Inner)  Butt Joint',
  cornerOuter: 'Corner Panel (Outer)',
  cornerInner: 'Corner Panel (Inner)',
  roof: 'Roof Panel',
} as const;

/**
 * Sheet materials and the thicknesses each is stocked in, from the legacy
 * calculator's own list. Every one of the four source sheets is PPGI 0.4
 * throughout, which is why the BOQ has a single "PPGI 0.4MM" column — the rest
 * of this list has never appeared on a verified sheet.
 */
export const SHEET_MATERIALS: Record<string, number[]> = {
  PPGI: [0.35, 0.4, 0.5, 0.6, 0.8],
  GI: [0.5, 0.6, 0.8, 1.2, 1.5],
  EGP: [0.5, 0.6, 0.8],
  SS: [0.5, 0.6, 0.8],
  PCGI: [0.5, 0.6, 0.8],
  HPCL: [4],
};

/** What every sheet prints unless a job says otherwise. */
export const DEFAULT_SKIN = { material: 'PPGI', thickness: 0.4 } as const;

export const skinLabel = (s: { material: string; thickness: number }) =>
  `${s.material} ${s.thickness}`;

/**
 * Door leaf thickness by type, as the legacy calculator has it.
 *
 * NOTE: this contradicts the sheets. All four print the door rows at the
 * *wall* thickness, and `DOOR_BLANK_OFFSETS` is keyed on that. Until the shop
 * settles which is right, the type is recorded and printed but the blank still
 * comes off the wall thickness. See README "Open items".
 */
export const DOOR_TYPES: Record<string, { label: string; thickness: Mm }> = {
  sliding: { label: 'Sliding Door', thickness: 60 },
  hinges: { label: 'Hinges Door', thickness: 45 },
  flush: { label: 'Flush Door', thickness: 0 },
};

/** Door leaf core. Legacy offers these three. */
export const DOOR_CORES = ['Puf', 'Rockwool', 'Honeycomb'] as const;

export const FLASHING_PROFILES = {
  inner: '10x40x40x10',
  outer: '10x100x40x10',
  flatStrip: '10x80x10',
  chairAngle: '50x50',
} as const;
