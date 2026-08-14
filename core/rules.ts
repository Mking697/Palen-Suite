/**
 * Shop rules and defaults, all verified against the four source BOQ sheets.
 * Every value here is a default — the UI will expose each one as an input.
 */

import type { Mm } from './types.ts';
import { round2 } from './format.ts';

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

/**
 * Wall thickness above which the L cut is fitted unless the job says otherwise.
 *
 * From the shop, 14 August 2026 — **not** read off a sheet. The four source
 * sheets are all 60, 100 or 120mm and every one of them carries the cut, so
 * none of them contradicts this, but none of them pins the 50 either. A room
 * can always override it: some customers do not want the cut at any thickness.
 */
export const L_CUT_MIN_WALL_TH: Mm = 50;

/** The L cut a room gets when it does not state one. */
export const lCutDefault = (wallTh: Mm): boolean => wallTh > L_CUT_MIN_WALL_TH;

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

/**
 * What a panelised floor panel can be built from. The stocked skin materials,
 * plus the two that only ever appear in a floor: `Ply` and `AL. CHQ`, both read
 * straight off HI-15279's printed description
 * (`Bottom PPGI + Puf + 12 mm Ply + 2mm AL. CHQ`).
 */
export const FLOOR_LAYER_MATERIALS = [...Object.keys(SHEET_MATERIALS), 'Ply', 'AL. CHQ'];

/** The core of a floor panel. Everything else in the build-up is a sheet. */
export const FLOOR_CORE_MATERIAL = 'Puf';

/**
 * The floor build-up every verified sheet prints, bottom up. The core carries
 * no thickness of its own — see `floorCoreTh`.
 */
export const DEFAULT_FLOOR_LAYERS: { material: string; th: Mm }[] = [
  { material: 'PPGI', th: 0.4 },
  { material: FLOOR_CORE_MATERIAL, th: 0 },
  { material: 'Ply', th: 12 },
  { material: 'AL. CHQ', th: 2 },
];

/**
 * The puf core's thickness: what is left of the panel once its sheets are
 * taken off. A 100mm floor with 12mm ply and 2mm chequered plate on top is
 * still a 100mm floor — **the core gives way, the panel does not grow**. From
 * the shop, 14 August 2026.
 *
 * Every sheet counts, the 0.4mm bottom skin included, because the panel
 * thickness is the whole build-up and not the core alone.
 *
 * The result can go to zero or below if the sheets are thicker than the panel.
 * It is returned as it falls rather than clamped: that is a real mistake in the
 * input and the calculator says so, instead of quietly building something else.
 */
export function floorCoreTh(layers: { material: string; th: Mm }[], panelTh: Mm): Mm {
  const sheets = layers
    .filter((l) => l.material !== FLOOR_CORE_MATERIAL)
    .reduce((n, l) => n + (Number(l.th) || 0), 0);
  return round2(panelTh - sheets);
}

/**
 * A panelised floor's printed description, built from its layers.
 *
 * Only used when a job states `layers`. The four verified jobs state `desc`
 * instead and it is printed exactly as transcribed — HI-15279's two rooms print
 * the same build-up with different spacing, and reproducing that from a
 * formatter would be inventing a rule the sheets do not have.
 */
export function floorDesc(layers: { material: string; th: Mm }[], panelTh: Mm): string {
  const core = floorCoreTh(layers, panelTh);
  const parts = layers.map((l, i) => {
    const th = l.material === FLOOR_CORE_MATERIAL ? core : l.th;
    return `${i === 0 ? 'Bottom ' : ''}${l.material} ${th} mm`;
  });
  // every layer carries its thickness and they add up to the panel, so the
  // line can be checked on the shop floor without doing the sum again
  return `${parts.join(' + ')} = ${panelTh} mm`;
}

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

/**
 * The flashing types the shop works in, taken from the legacy calculator's own
 * `FLASHING_DATA` list rather than invented here. The engine computes inner,
 * outer and U from the room; anything else is typed in by the estimator, which
 * is exactly what legacy did for all seven.
 */
export const FLASHING_TYPES = [
  'U Flashing',
  'L Inner Flashing',
  'L Outer Flashing',
  'T Angel Flashing',
  'Hanging Flashing',
  'Flat Strip Flashing',
  'Gutter Flashing',
] as const;

export const FLASHING_PROFILES = {
  inner: '10x40x40x10',
  outer: '10x100x40x10',
  flatStrip: '10x80x10',
  chairAngle: '50x50',
} as const;
