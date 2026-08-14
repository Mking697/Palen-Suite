/**
 * Flashing — the folded strips that close a room's joints. A separate purchase
 * from the panels, bought by the running metre, so it is totalled on its own
 * and never joins the panel counts.
 *
 * Every rule here came from the shop on 14 August 2026, not off a sheet:
 *
 *   running metre = both widths + both lengths = 2 x (extW + extL)
 *   width         = wall thickness + 2
 *   three types are fitted on every job: inner, outer and U
 *   a butt joint adds one wall height of inner and one of outer, at that joint
 *
 * **Not yet verified against a printed sheet.** `README.md` records an earlier
 * finding that perimeter-based estimates land both above and below HI-15191's
 * printed figures. Those rows are coming; until they are transcribed this is
 * the shop's rule, held as stated, and the disagreement stays on the record.
 */

import type { JobSpec, Mm, RoomSpec, SkinSpec } from './types.ts';
export type { ExtraFlashing } from './types.ts';
import { compileWalls } from './plan.ts';
import { fmt2 } from './format.ts';
import { DEFAULT_SKIN, FLASHING_PROFILES, uFlashingProfile } from './rules.ts';

export type FlashingKind = 'inner' | 'outer' | 'u' | 'extra';

export interface FlashingRow {
  kind: FlashingKind;
  /**
   * Where the row came from. A rule row is worked out from the room; a typed
   * one the estimator entered. They print in one table but are never confused
   * for each other, the same way a draftsman's panel override is marked.
   */
  source: 'rule' | 'typed';
  label: string;
  /** the folded section, as the drawing office writes it */
  profile: string;
  /** flat width of the strip, mm */
  width: Mm;
  material: string;
  thickness: number;
  /**
   * Running metres, unrounded. Rounding lives at the print, the same way
   * `areaSqmt` does — round every row first and a total loses a hundredth.
   */
  rmtr: number;
  /**
   * The same figure rounded half-up and ready to print. The browser must never
   * format a figure of its own — `toFixed` rounds the binary value and would
   * disagree with the sheet, which is why `core/format.ts` exists.
   */
  rmtrText: string;
  /** how that length was arrived at, printed under the row */
  note: string;
}

export interface RoomFlashing {
  room: string;
  rows: FlashingRow[];
  totalRmtr: number;
  totalRmtrText: string;
}

/** Only the three the engine works out; a typed row carries its own name. */
const LABELS: Record<'inner' | 'outer' | 'u', string> = {
  inner: 'Inner Flashing',
  outer: 'Outer Flashing',
  u: 'U Flashing',
};

/**
 * Butt joints in a room: junctions where two walls meet with no corner panel,
 * so one runs through and the other butts into its face.
 *
 * `compileWalls` can never put a corner and a butt at the same end, which is
 * the shop's rule — see `core/verify/plan.test.ts`. So counting butt ends
 * counts junctions, with no risk of double counting a corner.
 */
export function buttJoints(room: RoomSpec): number {
  if (!room.outline) return 0;
  return compileWalls(room.outline).reduce(
    (n, w) => n + (w.buttStart ? 1 : 0) + (w.buttEnd ? 1 : 0),
    0,
  );
}

export function roomFlashing(room: RoomSpec): RoomFlashing {
  const skin: SkinSpec = room.flashingSkin ?? DEFAULT_SKIN;
  const perimeter = 2 * (room.ext.w + room.ext.l);
  const butts = buttJoints(room);
  // a butt joint is closed top to bottom, inside and out
  const extra = butts * room.ext.h;
  const width = room.wallTh + 2;

  const m = (mm: Mm) => mm / 1000;
  const perimeterNote = `2 x (${room.ext.w} + ${room.ext.l}) mm`;
  const buttNote = butts
    ? ` + ${butts} butt joint${butts > 1 ? 's' : ''} x ${room.ext.h} mm`
    : '';

  const row = (
    kind: 'inner' | 'outer' | 'u',
    profile: string,
    lengthMm: Mm,
    note: string,
  ): FlashingRow => ({
    kind,
    source: 'rule',
    label: LABELS[kind],
    profile,
    width,
    material: skin.material,
    thickness: skin.thickness,
    rmtr: m(lengthMm),
    rmtrText: fmt2(m(lengthMm)),
    note,
  });

  const rows: FlashingRow[] = [
    row('inner', FLASHING_PROFILES.inner, perimeter + extra, perimeterNote + buttNote),
    row('outer', FLASHING_PROFILES.outer, perimeter + extra, perimeterNote + buttNote),
    // the only profile that carries the panel thickness in its own section
    row('u', uFlashingProfile(room.wallTh), perimeter, perimeterNote),
  ];

  // then whatever the estimator added by hand, printed exactly as typed
  for (const x of room.extraFlashing ?? []) {
    const len = Number(x.length) || 0;
    if (len <= 0) continue;
    rows.push({
      kind: 'extra',
      source: 'typed',
      label: x.type,
      profile: '—',
      width: Number(x.width) || 0,
      material: x.material,
      thickness: x.thickness,
      rmtr: m(len),
      rmtrText: fmt2(m(len)),
      note: 'added by hand',
    });
  }

  const totalRmtr = rows.reduce((n, r) => n + r.rmtr, 0);
  return { room: room.name, rows, totalRmtr, totalRmtrText: fmt2(totalRmtr) };
}

export function jobFlashing(job: JobSpec) {
  const rooms = job.rooms.map(roomFlashing);
  const totalRmtr = rooms.reduce((n, r) => n + r.totalRmtr, 0);
  return { rooms, totalRmtr, totalRmtrText: fmt2(totalRmtr) };
}
