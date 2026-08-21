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

    /*
     * A corner panel is one piece shared by the two walls meeting at the
     * vertex, so its leg is read off the vertex and handed to both ends. Read
     * per wall instead, the two walls could be told different figures for the
     * same panel — and the sheet would print a size the drawing does not show.
     */
    const legAt = (v: number) => vertices[v]?.leg;

    walls.push({
      id: o.id ?? `E${i}`,
      length: Math.round(lengths[i]),
      cornerStart: corners[startVertex(i)],
      cornerEnd: corners[endVertex(i)],
      ...(corners[startVertex(i)] && legAt(startVertex(i)) != null
        ? { cornerStartLeg: legAt(startVertex(i)) }
        : {}),
      ...(corners[endVertex(i)] && legAt(endVertex(i)) != null
        ? { cornerEndLeg: legAt(endVertex(i)) }
        : {}),
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

/**
 * Headings, in the order a right turn advances them. Screen coordinates, y
 * down, so this cycle is clockwise as the drawing is read.
 */
const HEADINGS: Pt[] = [
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
  [0, -1], // N
];

/** One wall of a chain: how long it runs, and which way it turns at its end. */
export interface ChainWall {
  length: Mm;
  /** the turn taken at the *end* of this wall, to reach the next one */
  turn: 'L' | 'R';
}

/**
 * How far a chain of walls misses its own starting point. `[0, 0]` means the
 * room closes.
 *
 * This is the check a draftsman does by eye and the reason HI-15223 is still
 * open: walking its six printed wall lengths round lands 60mm — exactly one
 * wall thickness — away from where it started. A room that does not close
 * cannot be drawn, and the gap is the useful thing to say about it, so it is
 * returned rather than thrown.
 */
export function chainGap(walls: ChainWall[]): Pt {
  let x = 0;
  let y = 0;
  let h = 0;
  for (const wall of walls) {
    x += HEADINGS[h][0] * wall.length;
    y += HEADINGS[h][1] * wall.length;
    h = (h + (wall.turn === 'L' ? 3 : 1)) % 4;
  }
  return [Math.round(x), Math.round(y)];
}

/**
 * A room outline from the wall chain the drawing dimensions: a length per
 * wall and the turn at its end. Any number of walls, any right-angled shape —
 * an L, a U, a room with three steps in it.
 *
 * The first wall runs east, which is how the layouts are drawn: start at the
 * top left corner and read clockwise. Points are the *start* of each wall, so
 * edge i is wall i, and the last edge closes back to the first point — which
 * is only the length the drawing says if the chain closes. Check `chainGap`
 * before trusting it.
 *
 * The result is shifted so the bounding box starts at the origin. A room's
 * position on the job plan is `RoomSpec.at` and nothing else, so an outline
 * that carried its own offset would move the room twice.
 */
export function chain(
  walls: ChainWall[],
  edges?: RoomOutline['edges'],
  vertices?: RoomOutline['vertices'],
): RoomOutline {
  const walked: Pt[] = [];
  let x = 0;
  let y = 0;
  let h = 0;
  for (const wall of walls) {
    walked.push([x, y]);
    x += HEADINGS[h][0] * wall.length;
    y += HEADINGS[h][1] * wall.length;
    h = (h + (wall.turn === 'L' ? 3 : 1)) % 4;
  }

  const ox = Math.min(...walked.map((p) => p[0]));
  const oy = Math.min(...walked.map((p) => p[1]));
  const points: Pt[] = walked.map((p) => [p[0] - ox, p[1] - oy]);

  return { points, edges, vertices };
}

/**
 * The chain that walks an outline: a length and a turn per edge. The inverse
 * of `chain`, so a shape built any other way — `rect`, `notched`, a job file's
 * own point list — can be handed to an editor that works in wall lengths.
 */
export function toChain(points: Pt[]): ChainWall[] {
  const n = points.length;
  return points.map((a, i) => {
    const b = points[(i + 1) % n];
    const c = points[(i + 2) % n];
    const u = sub(b, a);
    const v = sub(c, b);
    return {
      length: Math.round(len(u)),
      // the polygon is walked clockwise, so a positive turn is a right one
      turn: cross(u, v) > 0 ? 'R' : 'L',
    };
  });
}

/** Which corner of the bounding box a notch is cut out of. */
export type NotchCorner = 'NE' | 'SE' | 'SW' | 'NW';

export interface Notch {
  corner: NotchCorner;
  /** how far the bite reaches along the wall */
  w: Mm;
  /** how deep it cuts in */
  d: Mm;
  /**
   * The two notch walls meet at a re-entrant corner, so one of them runs
   * through it and the other butts into that one's face and loses a wall
   * thickness. Which is which is off the drawing, not derivable — the same
   * decision `VertexOverride.through` states everywhere else.
   */
  through: 'prev' | 'next';
}

/**
 * The vertex where the two notch walls meet — always the re-entrant one, so
 * never a corner panel.
 */
export const reentrantVertex = (corner: NotchCorner): number =>
  ({ NE: 2, SE: 3, SW: 4, NW: 5 })[corner];

/**
 * A rectangle with a rectangular bite out of one corner: an L-shaped room, the
 * way the drawings show one. HI-15223 is 2590 x 3860 with 1600 taken out of
 * the bottom right, which is why it has six walls and two of them meet at a
 * re-entrant corner.
 *
 * `w` x `l` stays the *bounding box*, not the L. That is deliberate and it is
 * what the sheets do: HI-15223 prints one full 2530 x 3800 ceiling straight
 * over its notch, so `RoomSpec.ext` — which the ceiling and floor are built
 * from — has to stay the box.
 */
export function notched(
  w: Mm,
  l: Mm,
  notch: Notch,
  edges?: RoomOutline['edges'],
): RoomOutline {
  const { corner, w: nw, d: nd } = notch;
  const points: Pt[] =
    corner === 'NE'
      ? [[0, 0], [w - nw, 0], [w - nw, nd], [w, nd], [w, l], [0, l]]
      : corner === 'SE'
        ? [[0, 0], [w, 0], [w, l - nd], [w - nw, l - nd], [w - nw, l], [0, l]]
        : corner === 'SW'
          ? [[0, 0], [w, 0], [w, l], [nw, l], [nw, l - nd], [0, l - nd]]
          : [[nw, 0], [w, 0], [w, l], [0, l], [0, nd], [nw, nd]];

  return {
    points,
    edges,
    vertices: { [reentrantVertex(corner)]: { through: notch.through } },
  };
}
