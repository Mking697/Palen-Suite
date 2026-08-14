/**
 * The job as a set of flat faces in space — the 2D drawings stood up.
 *
 * Every face comes from something `layoutRoom` already worked out: a wall face
 * is one panel of `wallRuns`, a ceiling stripe is one width of
 * `L.ceiling.widths`, the floor is `L.floor`. Nothing here divides a run,
 * chooses a width or measures an area of its own — the same rule the flat
 * drawings follow, for the same reason. A 3D view that disagrees with the
 * elevation is worse than no 3D view.
 *
 * Faces only. No camera, no projection, no colour: a viewer decides how to look
 * at it, exactly as `svg.ts` and `dxf.ts` decide how to draw a `Drawing`.
 */

import type { JobSpec, Mm, Pt, RoomSpec } from '../types.ts';
import { layoutRoom } from '../layout.ts';
import { compileWalls } from '../plan.ts';
import { lCutDefault } from '../rules.ts';
import {
  add,
  dir,
  inwardNormal,
  length,
  runBounds,
  scale,
  signedArea,
  wallSegments,
} from './geom.ts';

/** x and y are the plan, exactly as the drawings use them; z is up. */
export type Pt3 = [Mm, Mm, Mm];

export type FaceKind = 'wall' | 'corner' | 'door' | 'ceiling' | 'floor';

export interface Face3 {
  /** in order round the face; 4 points for a panel, more for a room outline */
  pts: Pt3[];
  kind: FaceKind;
  room: string;
  /** the wall this face belongs to, where it belongs to one */
  wallId?: string;
  /** shown when the face is picked */
  label: string;
  /** the lines under that label, already worded — the viewer prints them as-is */
  detail: string[];
  /** false when the panel is not a full module, so a viewer can flag it */
  std: boolean;
}

export interface Model3 {
  faces: Face3[];
  min: Pt3;
  max: Pt3;
  /** rooms that could not be built, and why — the viewer says so */
  skipped: { room: string; reason: string }[];
}

const mm = (n: number) => String(Math.round(n));

/** A vertical quad standing on the plan segment a -> b, from z0 up to z1. */
const upright = (a: Pt, b: Pt, z0: Mm, z1: Mm): Pt3[] => [
  [a[0], a[1], z0],
  [b[0], b[1], z0],
  [b[0], b[1], z1],
  [a[0], a[1], z1],
];

/** A flat polygon lying at height z. */
const flat = (pts: Pt[], z: Mm): Pt3[] => pts.map((p): Pt3 => [p[0], p[1], z]);

const rect = (x0: Mm, y0: Mm, x1: Mm, y1: Mm): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

export function model3d(job: JobSpec): Model3 {
  const faces: Face3[] = [];
  const skipped: Model3['skipped'] = [];

  for (const room of job.rooms) {
    if (!room.outline) {
      skipped.push({ room: room.name, reason: 'no plan outline yet' });
      continue;
    }
    try {
      faces.push(...roomFaces(room));
    } catch (err) {
      skipped.push({ room: room.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const all = faces.flatMap((f) => f.pts);
  const axis = (i: 0 | 1 | 2) => all.map((p) => p[i]);
  const min: Pt3 = all.length ? [Math.min(...axis(0)), Math.min(...axis(1)), Math.min(...axis(2))] : [0, 0, 0];
  const max: Pt3 = all.length ? [Math.max(...axis(0)), Math.max(...axis(1)), Math.max(...axis(2))] : [0, 0, 0];

  return { faces, min, max, skipped };
}

function roomFaces(room: RoomSpec): Face3[] {
  const origin = room.at ?? [0, 0];
  const pts: Pt[] = room.outline!.points.map((p) => [p[0] + origin[0], p[1] + origin[1]]);
  const walls = compileWalls(room.outline!);
  const L = layoutRoom(room);
  const edges = room.outline!.edges ?? {};
  const theirs = (i: number) => !!edges[i]?.shared;
  const area = signedArea(pts);
  const h = room.ext.h;
  const out: Face3[] = [];

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
    const at = (d: Mm) => add(a, scale(u, d));

    // the corner panel legs, which eat the ends of the run
    if (wall.cornerStart && start > 0.5) {
      out.push({
        pts: upright(a, at(start), 0, h),
        kind: 'corner',
        room: room.name,
        wallId: wall.id,
        label: `${room.name} · corner`,
        detail: [`leg ${mm(start)} mm`, `height ${mm(h)} mm`, `wall ${mm(room.wallTh)} mm`],
        std: true,
      });
    }
    if (wall.cornerEnd && edgeLen - end > 0.5) {
      out.push({
        pts: upright(at(end), b, 0, h),
        kind: 'corner',
        room: room.name,
        wallId: wall.id,
        label: `${room.name} · corner`,
        detail: [`leg ${mm(edgeLen - end)} mm`, `height ${mm(h)} mm`, `wall ${mm(room.wallTh)} mm`],
        std: true,
      });
    }

    for (const s of wallSegments(run, wall, room.module)) {
      const p0 = at(start + s.a);
      const p1 = at(start + s.b);

      if (s.door && wall.door) {
        const d = wall.door;
        // the module the door takes out of the run, then the leaf standing in it
        out.push({
          pts: upright(p0, p1, 0, h),
          kind: 'wall',
          room: room.name,
          wallId: wall.id,
          label: `${room.name} · wall ${wall.id} · door module`,
          detail: [`${mm(s.width)} x ${mm(h)} mm`, `frame ${mm(d.frame)} mm each side`],
          std: false,
        });

        const lift = d.liftAboveFloor ?? 0;
        const midFrom = (s.width - d.clearW) / 2;
        const q0 = at(start + s.a + midFrom);
        const q1 = at(start + s.a + midFrom + d.clearW);
        // stood a hair proud of the wall so it paints over its own module
        const off = scale(n, -2);
        out.push({
          pts: upright(add(q0, off), add(q1, off), lift, lift + d.clearH),
          kind: 'door',
          room: room.name,
          wallId: wall.id,
          label: `${room.name} · ${d.label}`,
          detail: [
            `clear ${mm(d.clearW)} x ${mm(d.clearH)} mm`,
            `module ${mm(d.moduleW)} mm`,
            lift ? `lift ${mm(lift)} mm above floor` : 'sits on the floor',
          ],
          std: false,
        });
        continue;
      }

      out.push({
        pts: upright(p0, p1, 0, h),
        kind: 'wall',
        room: room.name,
        wallId: wall.id,
        label: `${room.name} · wall ${wall.id}`,
        detail: [
          `panel ${mm(s.width)} x ${mm(h)} mm`,
          `blank ${mm(s.width + 40)} x ${mm(h)} mm`,
          s.std ? 'full module' : 'balance panel',
        ],
        std: s.std,
      });
    }
  }

  out.push(...ceilingFaces(room, pts, L, edges));
  out.push(...floorFaces(room, pts, L, edges));
  return out;
}

/**
 * The ceiling and the floor are both built to the room's bounding box, so they
 * are laid out as one rectangle each and striped by the widths `layoutRoom`
 * produced. The insets are the same ones `layoutRoom` took off the spans: half
 * a wall thickness per own end for the ceiling — the L cut — and a whole one
 * for the floor, which sits between the walls.
 */
function boxOf(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

type Ends = [boolean, boolean];

/** Which sides of the bounding box this room builds itself. */
function ownEnds(room: RoomSpec, pts: Pt[], edges: Record<number, { shared?: boolean }>) {
  const b = boxOf(pts);
  const near = (v: number, t: number) => Math.abs(v - t) < 1;
  const sideOwned = (pick: (a: Pt, c: Pt) => boolean) => {
    let touched = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (!pick(a, c)) continue;
      touched = true;
      if (edges[i]?.shared) return false;
    }
    return touched;
  };
  return {
    w: [
      sideOwned((a, c) => near(a[0], b.x0) && near(c[0], b.x0)),
      sideOwned((a, c) => near(a[0], b.x1) && near(c[0], b.x1)),
    ] as Ends,
    l: [
      sideOwned((a, c) => near(a[1], b.y0) && near(c[1], b.y0)),
      sideOwned((a, c) => near(a[1], b.y1) && near(c[1], b.y1)),
    ] as Ends,
    box: b,
  };
}

function ceilingFaces(
  room: RoomSpec,
  pts: Pt[],
  L: ReturnType<typeof layoutRoom>,
  edges: Record<number, { shared?: boolean }>,
): Face3[] {
  const { w, l, box } = ownEnds(room, pts, edges);
  const lCut = room.lCut ?? lCutDefault(room.wallTh);
  const cut = lCut ? room.wallTh / 2 : 0;

  const x0 = box.x0 + (w[0] ? cut : 0);
  const y0 = box.y0 + (l[0] ? cut : 0);
  const z = room.ext.h;

  return stripe(
    L.ceiling.widths,
    room.ceiling.splitAxis,
    x0,
    y0,
    L.ceiling.panelLength,
    z,
    (width, std) => ({
      kind: 'ceiling' as const,
      room: room.name,
      label: `${room.name} · roof panel`,
      detail: [
        `${mm(width)} x ${mm(L.ceiling.panelLength)} mm`,
        `ceiling ${mm(room.ceilTh)} mm`,
        std ? 'full module' : 'balance panel',
      ],
      std,
    }),
    room.module,
  );
}

function floorFaces(
  room: RoomSpec,
  pts: Pt[],
  L: ReturnType<typeof layoutRoom>,
  edges: Record<number, { shared?: boolean }>,
): Face3[] {
  const { w, l, box } = ownEnds(room, pts, edges);
  const x0 = box.x0 + (w[0] ? room.wallTh : 0);
  const y0 = box.y0 + (l[0] ? room.wallTh : 0);

  if (!L.floor.widths) {
    return [
      {
        pts: flat(rect(x0, y0, x0 + L.floor.w, y0 + L.floor.l), 0),
        kind: 'floor',
        room: room.name,
        label: `${room.name} · ${room.floor.desc}`,
        detail: [`${mm(L.floor.w)} x ${mm(L.floor.l)} mm`, `${mm(room.floor.th)} mm`, 'one piece'],
        std: true,
      },
    ];
  }

  return stripe(
    L.floor.widths,
    room.floor.splitAxis ?? 'w',
    x0,
    y0,
    L.floor.panelLength,
    0,
    (width, std) => ({
      kind: 'floor' as const,
      room: room.name,
      label: `${room.name} · floor panel`,
      detail: [
        `${mm(width)} x ${mm(L.floor.panelLength)} mm`,
        `${mm(room.floor.th)} mm`,
        std ? 'full module' : 'balance panel',
      ],
      std,
    }),
    room.floor.module ?? 1220,
  );
}

/** Lay a list of widths out along one axis as flat panels at height z. */
function stripe(
  widths: Mm[],
  axis: 'w' | 'l',
  x0: Mm,
  y0: Mm,
  panelLength: Mm,
  z: Mm,
  meta: (width: Mm, std: boolean) => Omit<Face3, 'pts'>,
  module: Mm,
): Face3[] {
  const out: Face3[] = [];
  let run = 0;
  for (const width of widths) {
    const std = Math.abs(width - module) < 1;
    const pts =
      axis === 'w'
        ? rect(x0 + run, y0, x0 + run + width, y0 + panelLength)
        : rect(x0, y0 + run, x0 + panelLength, y0 + run + width);
    out.push({ pts: flat(pts, z), ...meta(width, std) });
    run += width;
  }
  return out;
}
