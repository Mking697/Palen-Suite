/**
 * Cross-room checks on a whole job.
 *
 * `compileWalls` sees one outline at a time, so it cannot know whether the
 * room on the other side of a wall really exists or really is that long. That
 * gap is silent and expensive: a wall ticked as the neighbour's when nothing
 * stands behind it is built by nobody, and it disappears from the BOQ without
 * an error, a warning or a `!`.
 *
 * It happens as soon as two connected rooms are different sizes — an ambient
 * room 3690 deep against a chiller 3400 deep leaves 290mm of real wall with no
 * neighbour behind it. The BOQ is short by those panels and nothing says so.
 *
 * These are findings, not throws. Half of the editing in the calculator is
 * spent in a state that is briefly invalid — you tick the partition before you
 * have placed the room behind it — so the job still builds and the problem is
 * reported next to it. Same principle as the sheet deviations in the verifier:
 * print the disagreement, never quietly absorb it.
 *
 * Pure, like the rest of `core/`.
 */

import type { JobSpec, Mm, Pt, RoomSpec } from './types.ts';

/** Two edges are on the same line if they agree to this, in mm. */
const EPS: Mm = 0.5;

export interface Problem {
  room: string;
  /** the wall id printed on the drawing, e.g. 'N' */
  wallId: string;
  kind: 'unbacked-shared-wall';
  /** how much of that wall has no room behind it */
  mm: Mm;
  message: string;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (v: Pt) => Math.hypot(v[0], v[1]);

interface Edge {
  index: number;
  id: string;
  a: Pt;
  b: Pt;
  shared: boolean;
}

/** A room's outline in job coordinates, i.e. shifted by its `at`. */
function worldEdges(room: RoomSpec): Edge[] {
  if (!room.outline) return [];
  const [ox, oy] = room.at ?? [0, 0];
  const pts: Pt[] = room.outline.points.map((p) => [p[0] + ox, p[1] + oy]);
  const overrides = room.outline.edges ?? {};

  return pts.map((a, i) => ({
    index: i,
    id: overrides[i]?.id ?? `E${i}`,
    a,
    b: pts[(i + 1) % pts.length],
    shared: !!overrides[i]?.shared,
  }));
}

/**
 * How much of `edge` another edge lies along, as an interval measured from
 * `edge.a`. Null when the two are not on the same line — parallel but offset,
 * crossing, or simply elsewhere.
 */
function overlap(edge: Edge, other: Edge): [Mm, Mm] | null {
  const along = sub(edge.b, edge.a);
  const total = len(along);
  if (total < EPS) return null;
  const u: Pt = [along[0] / total, along[1] / total];

  const v = sub(other.b, other.a);
  const vLen = len(v);
  if (vLen < EPS) return null;
  // parallel, and on the same line rather than one wall thickness away
  if (Math.abs(cross(u, [v[0] / vLen, v[1] / vLen])) > EPS / total) return null;
  if (Math.abs(cross(u, sub(other.a, edge.a))) > EPS) return null;

  const t0 = dot(sub(other.a, edge.a), u);
  const t1 = dot(sub(other.b, edge.a), u);
  const from = Math.max(0, Math.min(t0, t1));
  const to = Math.min(total, Math.max(t0, t1));
  return to - from > EPS ? [from, to] : null;
}

/** Total length of a set of intervals, counting an overlap once. */
function covered(spans: [Mm, Mm][]): Mm {
  const sorted = [...spans].sort((p, q) => p[0] - q[0]);
  let sum = 0;
  let end = -Infinity;
  for (const [from, to] of sorted) {
    if (to <= end) continue;
    sum += to - Math.max(from, end);
    end = to;
  }
  return sum;
}

/**
 * Every wall a room has handed to a neighbour that is not there to take it.
 *
 * A wall counts as backed only where a *different* room's own wall lies along
 * it. If that room has also ticked the same side as its neighbour's, the wall
 * belongs to nobody and both ends of the mistake are reported.
 */
export function checkJob(job: JobSpec): Problem[] {
  const placed = job.rooms.filter((r) => r.outline);
  const edges = new Map<RoomSpec, Edge[]>(placed.map((r) => [r, worldEdges(r)]));
  const problems: Problem[] = [];

  for (const room of placed) {
    for (const edge of edges.get(room)!) {
      if (!edge.shared) continue;

      const spans: [Mm, Mm][] = [];
      for (const other of placed) {
        if (other === room) continue;
        for (const theirs of edges.get(other)!) {
          if (theirs.shared) continue; // nobody builds that one either
          const span = overlap(edge, theirs);
          if (span) spans.push(span);
        }
      }

      const total = len(sub(edge.b, edge.a));
      const gap = Math.round(total - covered(spans));
      if (gap < 1) continue;

      problems.push({
        room: room.name,
        wallId: edge.id,
        kind: 'unbacked-shared-wall',
        mm: gap,
        message:
          `${room.name} · wall ${edge.id} is ticked as the neighbour's, but ` +
          `${gap} mm of it has no room behind it. Nobody builds that stretch, ` +
          `so it is in no BOQ. Either the rooms are different sizes and the ` +
          `deeper one should own the whole wall, or a room has moved.`,
      });
    }
  }

  return problems;
}
