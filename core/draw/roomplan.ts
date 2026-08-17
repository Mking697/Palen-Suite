/**
 * WALL PANEL LAYOUT — the plan view.
 *
 * Outer outline, the inner face of the walls, every panel division tick, the
 * door with its label, and a dimension chain per wall. Panel widths come from
 * `layoutRoom`, never from here, so the plan and the BOQ cannot disagree.
 */

import type { DoorSpec, Mm, Pt, RoomSpec } from '../types.ts';
import { layoutRoom } from '../layout.ts';
import { compileWalls } from '../plan.ts';
import { doorLabel } from '../rules.ts';
import { defaultFrame } from './door.ts';
import { emptyDrawing, type Drawing } from './types.ts';
import {
  add,
  dir,
  doorPositionAssumed,
  inwardNormal,
  length,
  offsetPolygon,
  runBounds,
  scale,
  signedArea,
  wallSegments,
} from './geom.ts';

/** Segments a quarter circle is drawn in — the IR carries lines, not arcs. */
const SWING_STEPS = 8;

/**
 * The door leaf standing open, and the quarter circle it sweeps.
 *
 * Which end it is hinged on comes off `DoorSpec.hand`, and nothing is drawn
 * without one: a swing the job has not stated would be the drawing inventing a
 * fact about the building.
 *
 * **The convention, which came from reading the drawings and not from the
 * shop:** facing a wall from outside the room, the left hand points along that
 * edge's own direction — the outlines run clockwise, so this holds on every
 * wall — which puts an LHS hinge at the start of the opening and an RHS hinge
 * at its end. The leaf is drawn swinging *into* the room. If the shop hangs
 * them the other way, this function is the only place that changes.
 */
function drawSwing(d: Drawing, door: DoorSpec, p0: Pt, p1: Pt, u: Pt, n: Pt): void {
  if (!door.hand) return;

  // the leaf sits inside the module, a frame leg either side of it
  const frame = defaultFrame(door);
  const left = add(p0, scale(u, frame));
  const right = add(p1, scale(u, -frame));
  const hinge = door.hand === 'RHS' ? right : left;
  const jamb = door.hand === 'RHS' ? left : right;

  const r = length([jamb[0] - hinge[0], jamb[1] - hinge[1]]);
  if (r < 1) return;

  const open: Pt = [hinge[0] + n[0] * r, hinge[1] + n[1] * r];
  d.lines.push({ x1: hinge[0], y1: hinge[1], x2: open[0], y2: open[1], layer: 'DOOR' });

  const a0 = Math.atan2(jamb[1] - hinge[1], jamb[0] - hinge[0]);
  const a1 = Math.atan2(open[1] - hinge[1], open[0] - hinge[0]);
  // the short way round, so the arc is the quarter the leaf actually sweeps
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;

  let prev: Pt = jamb;
  for (let k = 1; k <= SWING_STEPS; k++) {
    const ang = a0 + (sweep * k) / SWING_STEPS;
    const q: Pt = [hinge[0] + Math.cos(ang) * r, hinge[1] + Math.sin(ang) * r];
    d.lines.push({ x1: prev[0], y1: prev[1], x2: q[0], y2: q[1], layer: 'DOOR', dash: true });
    prev = q;
  }
}

/**
 * @param origin where the room sits on the job plan. A room drawn on its own
 * uses [0,0]; the job plan passes each room's `at` so connected rooms come out
 * touching along the wall they share.
 */
export function roomPlan(room: RoomSpec, origin: Pt = [0, 0]): Drawing {
  if (!room.outline) {
    throw new Error(
      `${room.name} has no outline, so it cannot be drawn. ` +
        `Give the room an outline — see GUIDE.md.`,
    );
  }

  const pts: Pt[] = room.outline.points.map((p) => [p[0] + origin[0], p[1] + origin[1]]);
  const walls = compileWalls(room.outline);
  const L = layoutRoom(room);

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs);
  const l = Math.max(...ys);

  const d = emptyDrawing(`${room.name} — Wall Panel Layout`, w, l);
  d.subtitle = `${room.ext.w} x ${room.ext.l} x ${room.ext.h} mm (ext.) · wall ${room.wallTh}mm · module ${room.module}`;
  d.fill = pts;

  const edges = room.outline.edges ?? {};
  /** the neighbour builds this wall, so this room neither draws nor prices it */
  const theirs = (i: number) => !!edges[i]?.shared;

  const area = signedArea(pts);
  // a wall this room does not build already stands on the outline, so the
  // inside starts there and that edge is not offset at all
  const inner = offsetPolygon(
    pts,
    pts.map((_, i) => (theirs(i) ? 0 : room.wallTh)),
  );
  const span = Math.max(room.ext.w, room.ext.l);
  const tick = Math.max(120, span * 0.022);

  // outer and inner faces, but only of the walls this room builds — the
  // neighbour has already drawn the partition, and drawing it again would put
  // four lines between two rooms where the job has one wall
  for (let i = 0; i < pts.length; i++) {
    if (theirs(i)) continue;
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d.lines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], layer: 'WALL' });
    const ia = inner[i];
    const ib = inner[(i + 1) % inner.length];
    d.lines.push({ x1: ia[0], y1: ia[1], x2: ib[0], y2: ib[1], layer: 'WALL' });
  }

  // panel divisions, door and dimensions, wall by wall
  for (let i = 0; i < pts.length; i++) {
    if (theirs(i)) continue;

    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const u = dir(a, b);
    const n = inwardNormal(a, b, area);
    const edgeLen = length([b[0] - a[0], b[1] - a[1]]);

    const wall = walls.find((wl) => wl.id === (edges[i]?.id ?? `E${i}`));
    if (!wall) continue;
    const run = L.wallRuns.find((r) => r.wallId === wall.id);
    if (!run) continue;

    const { start, end } = runBounds(wall, edgeLen, room.cornerLeg, room.wallTh);
    const segs = wallSegments(run, wall, room.module);

    // horizontal walls dimension along x, vertical along y
    const horizontal = Math.abs(u[1]) < Math.abs(u[0]);
    const dimDir = horizontal ? 'h' : 'v';
    const dimBase = horizontal ? a[1] : a[0];
    // dimensions sit outside the room, so away from the inward normal
    const off = (horizontal ? -n[1] : -n[0]) * Math.max(300, span * 0.06);

    /** dimension a stretch of this edge, measured from the edge's start */
    const dimAlong = (from: Mm, to: Mm, text: string, offset = off) => {
      const p0 = add(a, scale(u, from));
      const p1 = add(a, scale(u, to));
      const m0 = horizontal ? p0[0] : p0[1];
      const m1 = horizontal ? p1[0] : p1[1];
      d.dims.push({
        dir: dimDir,
        a: Math.min(m0, m1),
        b: Math.max(m0, m1),
        base: dimBase,
        off: offset,
        text,
      });
    };

    // the corner leg, or the thickness a butt end runs into, at each end of
    // the wall — without these the dimension chain does not add up to the wall
    if (start > 0.5) dimAlong(0, start, String(Math.round(start)));
    if (edgeLen - end > 0.5) dimAlong(end, edgeLen, String(Math.round(edgeLen - end)));

    for (const s of segs) {
      const p0 = add(a, scale(u, start + s.a));
      const p1 = add(a, scale(u, start + s.b));

      // division tick pointing into the room
      if (s.a > 1) {
        d.lines.push({
          x1: p0[0],
          y1: p0[1],
          x2: p0[0] + n[0] * tick,
          y2: p0[1] + n[1] * tick,
          layer: 'PANEL',
        });
      }

      dimAlong(
        start + s.a,
        start + s.b,
        s.door ? `DOOR ${Math.round(s.width)}` : String(Math.round(s.width)),
      );

      if (s.door && wall.door) {
        d.lines.push({ x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], layer: 'DOOR' });
        drawSwing(d, wall.door, p0, p1, u, n);
        const mid: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        const rot = horizontal ? 0 : 90;
        d.notes.push({
          x: mid[0] + n[0] * tick * 1.7,
          y: mid[1] + n[1] * tick * 1.7,
          text: doorLabel(wall.door),
          rot,
          layer: 'DOOR',
          scale: 0.8,
        });
        d.notes.push({
          x: mid[0] + n[0] * tick * 3,
          y: mid[1] + n[1] * tick * 3,
          text: `${wall.door.clearW} x ${wall.door.clearH} clear`,
          rot,
          layer: 'TEXT',
          scale: 0.75,
        });
      }
    }

    // overall wall length, outside the panel chain
    const ea = horizontal ? a[0] : a[1];
    const eb = horizontal ? b[0] : b[1];
    d.dims.push({
      dir: dimDir,
      a: Math.min(ea, eb),
      b: Math.max(ea, eb),
      base: dimBase,
      off: off * 2.4,
      text: String(Math.round(edgeLen)),
    });
  }

  // room name in the middle, so a job plan with several rooms reads
  const cx = (Math.min(...xs) + w) / 2;
  const cy = (Math.min(...ys) + l) / 2;
  d.notes.push({ x: cx, y: cy, text: room.name.toUpperCase(), layer: 'TEXT', scale: 1.1 });
  d.notes.push({
    x: cx,
    y: cy + span * 0.045,
    text: `${room.wallTh}mm`,
    layer: 'TEXT',
    scale: 0.8,
  });

  if (doorPositionAssumed(walls)) {
    d.notes.push({
      x: cx,
      y: cy + span * 0.09,
      text: 'DOOR CENTRED (ASSUMED)',
      layer: 'CUT',
      scale: 0.7,
    });
  }

  return d;
}
