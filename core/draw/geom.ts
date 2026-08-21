/**
 * Plan geometry helpers used by the drawings.
 *
 * These do not decide anything about panels — they place what the layout has
 * already worked out. Quantities come from boq.ts, positions come from here.
 */

import type { Mm, Pt, WallSpec } from '../types.ts';
import type { WallPanelRun } from '../layout.ts';

export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const length = (v: Pt) => Math.hypot(v[0], v[1]);

/** Unit vector from a to b. */
export function dir(a: Pt, b: Pt): Pt {
  const v = sub(b, a);
  const l = length(v) || 1;
  return [v[0] / l, v[1] / l];
}

export function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - a[1] * b[0];
  }
  return s / 2;
}

/**
 * Inward normal of the edge a->b for a polygon of the given winding.
 * In screen coordinates (y down) a positive signed area turns left-hand.
 */
export function inwardNormal(a: Pt, b: Pt, area: number): Pt {
  const [ux, uy] = dir(a, b);
  return area > 0 ? [-uy, ux] : [uy, -ux];
}

/**
 * Offset a polygon inward — this is the inner face of the walls.
 *
 * Each edge is moved along its inward normal and consecutive edges are
 * re-intersected, which is correct for the convex and re-entrant right angles
 * rooms are made of. Parallel neighbours cannot be intersected, so the shifted
 * point is used instead of failing.
 *
 * `dist` may be one distance for every edge, or one per edge. Per edge matters
 * for a room that does not build one of its own walls: the neighbour's wall
 * already stands on that line, so this room's inside starts there and the
 * offset for that edge is zero. Offsetting it anyway would push the adjoining
 * walls' inner faces a wall thickness into thin air.
 */
export function offsetPolygon(pts: Pt[], dist: Mm | Mm[]): Pt[] {
  const n = pts.length;
  const area = signedArea(pts);
  const at = (i: number) => (Array.isArray(dist) ? (dist[i] ?? 0) : dist);

  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const nrm = inwardNormal(p, q, area);
    return { p: add(p, scale(nrm, at(i))), u: dir(p, q) };
  });

  return pts.map((_, i) => {
    const e0 = edges[(i - 1 + n) % n]; // arrives at vertex i
    const e1 = edges[i]; //                leaves vertex i
    const det = e0.u[0] * -e1.u[1] - e0.u[1] * -e1.u[0];
    if (Math.abs(det) < 1e-9) return e1.p;
    const rhs = sub(e1.p, e0.p);
    const t = (rhs[0] * -e1.u[1] - rhs[1] * -e1.u[0]) / det;
    return add(e0.p, scale(e0.u, t));
  });
}

/** One panel, or the door, positioned along a wall's clear run. */
export interface PanelSeg {
  /** distance along the clear run, from its start */
  a: Mm;
  b: Mm;
  width: Mm;
  door?: boolean;
  /** false when the panel is not a full module */
  std: boolean;
}

/**
 * Place the panels of one wall along its run, with the door in among them.
 *
 * The widths are whatever `layoutRoom` produced — this never changes one. All
 * it decides is where the door sits, and a door cannot cut a panel in half, so
 * it snaps to the nearest panel boundary. `fromLeft` / `fromRight` on the door
 * state the position outright; with neither, centred is assumed, which is what
 * the legacy calculator does and what HI-15191 and HI-15279 both turn out to be.
 */
export function wallSegments(
  run: WallPanelRun,
  wall: WallSpec | undefined,
  module: Mm,
): PanelSeg[] {
  const widths = run.widths;
  const isStd = (w: Mm) => Math.abs(w - module) < 1;
  const out: PanelSeg[] = [];
  let x = 0;

  const door = wall?.door;
  if (!door) {
    for (const w of widths) {
      out.push({ a: x, b: x + w, width: w, std: isStd(w) });
      x += w;
    }
    return out;
  }

  const doorW = door.moduleW;
  const total = run.clearRun;

  const cum: Mm[] = [0];
  for (const w of widths) cum.push(cum[cum.length - 1] + w);

  let ideal: Mm;
  if (door.fromLeft !== undefined) ideal = door.fromLeft;
  else if (door.fromRight !== undefined) ideal = total - door.fromRight - doorW;
  else ideal = (total - doorW) / 2;

  let k = 0;
  let best = Infinity;
  cum.forEach((c, i) => {
    const d = Math.abs(c - ideal);
    if (d < best) {
      best = d;
      k = i;
    }
  });

  for (let i = 0; i < k; i++) {
    out.push({ a: x, b: x + widths[i], width: widths[i], std: isStd(widths[i]) });
    x += widths[i];
  }
  out.push({ a: x, b: x + doorW, width: doorW, door: true, std: false });
  x += doorW;
  for (let i = k; i < widths.length; i++) {
    out.push({ a: x, b: x + widths[i], width: widths[i], std: isStd(widths[i]) });
    x += widths[i];
  }
  return out;
}

/** True when the door position had to be assumed rather than read off the job. */
export const doorPositionAssumed = (walls: WallSpec[]) =>
  walls.some(
    (w) => w.door && w.door.fromLeft === undefined && w.door.fromRight === undefined,
  );

/**
 * Where a wall's clear run starts and ends along its edge: a corner panel eats
 * its leg off that end, a butt end eats one wall thickness.
 *
 * `cornerLeg` is the room's figure and each end may state its own — the same
 * fallback `layoutRoom` applies, and deliberately the same expression, because
 * a drawing that took a different leg from the sheet would put the first panel
 * somewhere the factory does not cut it.
 */
export function runBounds(
  wall: WallSpec,
  edgeLen: Mm,
  cornerLeg: Mm,
  wallTh: Mm,
): { start: Mm; end: Mm } {
  const start = wall.cornerStart
    ? (wall.cornerStartLeg ?? cornerLeg)
    : wall.buttStart
      ? wallTh
      : 0;
  const end = wall.cornerEnd ? (wall.cornerEndLeg ?? cornerLeg) : wall.buttEnd ? wallTh : 0;
  return { start, end: edgeLen - end };
}
