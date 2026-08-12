/**
 * Plan geometry -> wall list.
 *
 * A room is a closed polygon of its external envelope. Everything the BOQ
 * needs about a wall is a property of that polygon:
 *
 *   wall run     edge length
 *   corner panel convex 90 degree vertex between two walls this room owns
 *   butt joint   concave (re-entrant) vertex — one wall runs into the other
 *   cut at site  a vertex that is not 90 degrees
 *   no wall      an edge marked shared, i.e. the neighbour's wall
 *
 * This compiler sits ABOVE the verified engine: it produces exactly the
 * WallSpec[] that layout.ts and boq.ts already consume, so migrating a job to
 * an outline cannot change a single BOQ figure. core/verify/plan.test.ts holds
 * that claim to the wall lists the sheets were verified against.
 *
 * Nothing here guesses. A polygon that does not close, an angle the shop has
 * no rule for, or a concave corner with no stated through-wall is an error,
 * not a value quietly picked — same principle as the `panels` guard in
 * layout.ts.
 */

import type { Mm, Pt, RoomOutline, WallSpec } from './types.ts';

/** Two lengths are the same wall if they agree to this, in mm. */
const LENGTH_EPS = 0.5;
/** How far off 90 degrees a corner may be and still be a corner. */
const RIGHT_ANGLE_TOL_DEG = 0.5;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt) => Math.hypot(v[0], v[1]);
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];

/** Shoelace. Sign gives the winding direction; magnitude is twice the area. */
function signedArea(points: Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += cross(a, b);
  }
  return s / 2;
}

export interface VertexInfo {
  /** interior angle at this vertex, degrees — 90 at a corner, 270 re-entrant */
  angle: number;
  /** true if the polygon turns outward here (a normal room corner) */
  convex: boolean;
  /** a right angle either way round: a corner panel or a butt joint */
  square: boolean;
}

/** Angle and turn direction at every vertex. Vertex i joins edge i-1 to edge i. */
export function vertexInfo(points: Pt[]): VertexInfo[] {
  const n = points.length;
  const orientation = Math.sign(signedArea(points));

  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const incoming = sub(p, prev);
    const outgoing = sub(next, p);

    const turn = cross(incoming, outgoing);
    // a convex vertex turns the same way the polygon winds
    const convex = Math.sign(turn) === orientation;

    // interior angle from the two edge directions meeting at p
    const back = sub(prev, p);
    const fwd = sub(next, p);
    const cos = dot(back, fwd) / (len(back) * len(fwd));
    let angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (!convex) angle = 360 - angle;

    // a re-entrant right angle reads as 270, and is just as square as a 90
    const square =
      Math.abs(angle - 90) <= RIGHT_ANGLE_TOL_DEG ||
      Math.abs(angle - 270) <= RIGHT_ANGLE_TOL_DEG;

    return { angle, convex, square };
  });
}

/** Edge i runs points[i] -> points[i+1]. */
export function edgeLengths(points: Pt[]): Mm[] {
  return points.map((p, i) => len(sub(points[(i + 1) % points.length], p)));
}

function validate(outline: RoomOutline): void {
  const { points } = outline;
  if (points.length < 3) {
    throw new Error(`Outline needs at least 3 points, got ${points.length}.`);
  }
  edgeLengths(points).forEach((l, i) => {
    if (l < LENGTH_EPS) {
      throw new Error(`Outline edge ${i} has zero length — duplicate point?`);
    }
  });
  if (Math.abs(signedArea(points)) < 1) {
    throw new Error('Outline encloses no area — the points may be collinear.');
  }
}

/**
 * Build the wall list for a room outline.
 *
 * cornerStart/cornerEnd are set from the vertices an edge runs between. Which
 * physical end is "start" follows the polygon direction; the BOQ only counts
 * corner ends, so direction is free here, but the drawing will read it.
 */
export function compileWalls(outline: RoomOutline): WallSpec[] {
  validate(outline);

  const { points } = outline;
  const n = points.length;
  const edges = outline.edges ?? {};
  const vertices = outline.vertices ?? {};
  const lengths = edgeLengths(points);
  const info = vertexInfo(points);

  const owned = (i: number) => !edges[(i + n) % n]?.shared;

  /** edge i starts at vertex i and ends at vertex i+1 */
  const startVertex = (i: number) => i;
  const endVertex = (i: number) => (i + 1) % n;

  const corners = new Array<boolean>(n).fill(false);
  const buttStart = new Array<boolean>(n).fill(false);
  const buttEnd = new Array<boolean>(n).fill(false);

  // Walk the vertices and decide what happens to the two walls meeting there.
  // Only vertices between two walls this room owns produce anything.
  for (let v = 0; v < n; v++) {
    const prevEdge = (v - 1 + n) % n; // ends at v
    const nextEdge = v; //                starts at v
    if (!owned(prevEdge) || !owned(nextEdge)) continue;

    const { convex, square, angle } = info[v];

    if (square && convex) {
      if (vertices[v]?.corner !== false) {
        corners[v] = true;
        continue;
      }
      // no corner panel: the two walls meet directly, so one has to run
      // through and the other into its face — the same junction as a
      // re-entrant corner, and it falls through to the same handling
    }

    if (square) {
      // one wall is continuous, the other butts into it and loses a thickness
      const through = vertices[v]?.through;
      if (!through) {
        if (convex) {
          throw new Error(
            `Vertex ${v} has its corner panel turned off. State which wall ` +
              `runs through it with vertices: { ${v}: { through: 'prev' | ` +
              `'next' } } — the other one butts into its face.`,
          );
        }
        throw new Error(
          `Vertex ${v} is a re-entrant corner. State which wall runs through ` +
            `it with vertices: { ${v}: { through: 'prev' | 'next' } } — the ` +
            `other one butts into its face and loses a wall thickness.`,
        );
      }
      if (through === 'prev') buttStart[nextEdge] = true;
      else buttEnd[prevEdge] = true;
      continue;
    }

    throw new Error(
      `Vertex ${v} is ${angle.toFixed(1)} degrees, not 90. Angled and triangle ` +
        `rooms are not supported yet: the end panel is a trapezoid and the ` +
        `shop has not confirmed how one is blanked. See DESIGN.md.`,
    );
  }

  const walls: WallSpec[] = [];
  for (let i = 0; i < n; i++) {
    if (!owned(i)) continue;
    const o = edges[i] ?? {};

    walls.push({
      id: o.id ?? `E${i}`,
      length: Math.round(lengths[i]),
      cornerStart: corners[startVertex(i)],
      cornerEnd: corners[endVertex(i)],
      ...(buttStart[i] ? { buttStart: true } : {}),
      ...(buttEnd[i] ? { buttEnd: true } : {}),
      ...(o.door ? { door: o.door } : {}),
      ...(o.skin ? { skin: o.skin } : {}),
      ...(o.buttJoint ? { buttJoint: true } : {}),
      ...(o.equalPieces ? { equalPieces: o.equalPieces } : {}),
      ...(o.panels ? { panels: o.panels } : {}),
    });
  }

  return walls;
}

/**
 * A plain rectangular room, clockwise from the origin.
 * `w` runs along x, `l` along y — the same axes RoomSpec.ext uses.
 */
export function rect(w: Mm, l: Mm, edges?: RoomOutline['edges']): RoomOutline {
  return {
    points: [
      [0, 0],
      [w, 0],
      [w, l],
      [0, l],
    ],
    edges,
  };
}
