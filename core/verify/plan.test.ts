/**
 * Outline compiler tests.
 * Run:  node core/verify/plan.test.ts
 *
 * The migration to plan geometry is only correct if the compiled wall list is
 * the same wall list the BOQ was verified against. The arrays below are the
 * hand-written walls as they stood before the outlines were introduced,
 * transcribed from the drawings — they are frozen ground truth here, exactly
 * like the expected sheets are for the BOQ.
 *
 * Matching totals would not be enough: two different wall lists can total the
 * same. These compare wall by wall.
 */

import assert from 'node:assert/strict';
import {
  chain,
  chainGap,
  compileWalls,
  notched,
  rect,
  reentrantVertex,
  toChain,
  vertexInfo,
} from '../plan.ts';
import type { ChainWall, NotchCorner } from '../plan.ts';
import { layoutRoom } from '../layout.ts';
import type { RoomOutline, RoomSpec, WallSpec } from '../types.ts';
import { HI_15191 } from '../jobs/hi-15191.ts';
import { HI_15279 } from '../jobs/hi-15279.ts';

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${(e as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

/**
 * What the BOQ actually reads off a wall. Which physical end is "start"
 * follows the direction the outline is walked, and layout.ts only ever counts
 * corner and butt ends, so the counts are compared rather than the sides.
 */
const canon = (w: WallSpec) => ({
  id: w.id,
  length: w.length,
  cornerEnds: (w.cornerStart ? 1 : 0) + (w.cornerEnd ? 1 : 0),
  buttEnds: (w.buttStart ? 1 : 0) + (w.buttEnd ? 1 : 0),
  buttJoint: !!w.buttJoint,
  door: w.door?.label ?? null,
  equalPieces: w.equalPieces ?? null,
  panels: w.panels ?? null,
});

const byId = (ws: WallSpec[]) =>
  [...ws].sort((a, b) => a.id.localeCompare(b.id)).map(canon);

/** Compare a room's compiled walls against the frozen hand-written list. */
function sameWalls(room: RoomSpec, frozen: WallSpec[], label: string) {
  assert.deepEqual(byId(room.walls), byId(frozen), label);
}

console.log('\n  outline compiles to the verified wall lists\n');

const DOOR_91 = { label: 'Flush Door (LHS) PP', clearW: 860, clearH: 1980, moduleW: 1180 };
const DOOR_79 = { label: 'Flush Door PP (LHS)', clearW: 860, clearH: 1980, moduleW: 1180 };

t('HI-15191 freezer — plain rectangle, four corner panels', () => {
  sameWalls(
    HI_15191.rooms[0],
    [
      { id: 'N', length: 3050, cornerStart: true, cornerEnd: true, door: DOOR_91 },
      { id: 'E', length: 4575, cornerStart: true, cornerEnd: true },
      { id: 'S', length: 3050, cornerStart: true, cornerEnd: true },
      { id: 'W', length: 4575, cornerStart: true, cornerEnd: true },
    ],
    'freezer walls',
  );
  assert.equal(layoutRoom(HI_15191.rooms[0]).cornerCount, 4);
});

t('HI-15191 ante — shared edge drops a wall and two corner panels', () => {
  sameWalls(
    HI_15191.rooms[1],
    [
      { id: 'S', length: 3050, cornerStart: true, cornerEnd: true, door: DOOR_91 },
      { id: 'E', length: 1525, cornerStart: true, cornerEnd: false },
      { id: 'W', length: 1525, cornerStart: true, cornerEnd: false },
    ],
    'ante walls',
  );
  assert.equal(layoutRoom(HI_15191.rooms[1]).cornerCount, 2);
});

t('HI-15279 freezer — equalPieces survives the compile', () => {
  sameWalls(
    HI_15279.rooms[0],
    [
      { id: 'N', length: 4570, cornerStart: true, cornerEnd: true },
      { id: 'S', length: 4570, cornerStart: true, cornerEnd: true },
      { id: 'E', length: 3400, cornerStart: true, cornerEnd: true },
      { id: 'W', length: 3400, cornerStart: true, cornerEnd: true, door: DOOR_79, equalPieces: 2 },
    ],
    'freezer walls',
  );
  assert.deepEqual(
    layoutRoom(HI_15279.rooms[0]).wallRuns.find((r) => r.wallId === 'W')!.widths,
    [810, 810],
  );
});

t('HI-15279 chiller — explicit panels survive the compile', () => {
  sameWalls(
    HI_15279.rooms[1],
    [
      { id: 'N', length: 7380, cornerStart: true, cornerEnd: false },
      { id: 'S', length: 7380, cornerStart: true, cornerEnd: false },
      {
        id: 'E',
        length: 3400,
        cornerStart: true,
        cornerEnd: true,
        door: DOOR_79,
        panels: [1180, 240, 200],
      },
    ],
    'chiller walls',
  );
  assert.equal(layoutRoom(HI_15279.rooms[1]).cornerCount, 2);
});

console.log('\n  geometry the compiler must read correctly\n');

t('a rectangle has four convex right angles', () => {
  const info = vertexInfo(rect(3050, 4575).points);
  assert.equal(info.length, 4);
  assert.ok(info.every((v) => v.square && v.convex));
});

t('an L-shape has one re-entrant corner among its right angles', () => {
  //  a 3000 x 3000 square with a 1000 x 1000 bite out of the bottom right
  const L: RoomOutline = {
    points: [
      [0, 0],
      [3000, 0],
      [3000, 2000],
      [2000, 2000],
      [2000, 3000],
      [0, 3000],
    ],
  };
  const info = vertexInfo(L.points);
  assert.equal(info.filter((v) => v.square && v.convex).length, 5);
  assert.equal(info.filter((v) => v.square && !v.convex).length, 1);
  assert.equal(Math.round(info[3].angle), 270, 're-entrant vertex is 270 degrees');
});

t('winding direction does not change which corners are convex', () => {
  const cw = rect(2000, 3000).points;
  const ccw = [...cw].reverse();
  assert.ok(vertexInfo(ccw).every((v) => v.square && v.convex));
});

console.log('\n  the compiler refuses to guess\n');

t('a re-entrant corner with no stated through-wall throws', () => {
  const L: RoomOutline = {
    points: [
      [0, 0],
      [3000, 0],
      [3000, 2000],
      [2000, 2000],
      [2000, 3000],
      [0, 3000],
    ],
  };
  assert.throws(() => compileWalls(L), /re-entrant corner/);
});

t('a stated through-wall puts the butt on the other wall', () => {
  const L: RoomOutline = {
    points: [
      [0, 0],
      [3000, 0],
      [3000, 2000],
      [2000, 2000],
      [2000, 3000],
      [0, 3000],
    ],
    vertices: { 3: { through: 'prev' } },
  };
  const walls = compileWalls(L);
  // vertex 3 joins edge 2 (through) to edge 3, so edge 3 butts at its start
  assert.equal(walls[3].buttStart, true);
  assert.equal(walls[2].buttEnd, undefined);
  assert.equal(walls.filter((w) => w.buttStart || w.buttEnd).length, 1);
});

console.log('\n  notched rooms — a rectangle with a bite out of one corner\n');

t('every corner produces a closed six-sided outline with one re-entrant vertex', () => {
  for (const corner of ['NE', 'SE', 'SW', 'NW'] as NotchCorner[]) {
    const o = notched(2590, 3860, { corner, w: 1600, d: 305, through: 'next' });
    assert.equal(o.points.length, 6, corner);
    const info = vertexInfo(o.points);
    assert.ok(info.every((v) => v.square), `${corner}: every corner is a right angle`);
    const reentrant = info.map((v, i) => [v, i] as const).filter(([v]) => !v.convex);
    assert.equal(reentrant.length, 1, `${corner}: exactly one re-entrant corner`);
    assert.equal(reentrant[0][1], reentrantVertex(corner), `${corner}: at the stated vertex`);
  }
});

t('the bounding box is the whole rectangle, notch or no notch', () => {
  const o = notched(2590, 3860, { corner: 'SE', w: 1600, d: 305, through: 'next' });
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  // the ceiling and floor are built to this, straight over the notch
  assert.equal(Math.max(...xs) - Math.min(...xs), 2590);
  assert.equal(Math.max(...ys) - Math.min(...ys), 3860);
});

t('HI-15223 shape: six walls, the notch wall runs through, the bottom butts', () => {
  // 2590 x 3860 with 1600 x 305 out of the bottom right. Corner panels only
  // at the two top corners, as the sheet prints.
  const o = notched(2590, 3860, { corner: 'SE', w: 1600, d: 305, through: 'next' }, {
    0: { id: 'top' },
    1: { id: 'right' },
    2: { id: 'bottom' },
    3: { id: 'notch' },
    4: { id: 'buttWall' },
    5: { id: 'left' },
  });
  o.vertices = { ...o.vertices, 2: { corner: false, through: 'next' } };

  const walls = compileWalls(o);
  assert.equal(walls.length, 6);
  assert.deepEqual(
    walls.map((w) => w.length),
    [2590, 3555, 1600, 305, 990, 3860],
    'edge lengths come straight off the outline',
  );
  const notch = walls.find((w) => w.id === 'notch')!;
  const bottom = walls.find((w) => w.id === 'bottom')!;
  assert.ok(!notch.buttStart && !notch.buttEnd, 'the notch wall runs through the corner');
  assert.equal(bottom.buttEnd, true, 'the bottom wall butts into its face');
});

t('a notch outline still refuses to compile without the through-wall stated', () => {
  const o = notched(2590, 3860, { corner: 'SE', w: 1600, d: 305, through: 'next' });
  delete o.vertices![3];
  assert.throws(() => compileWalls(o), /re-entrant corner/);
});

console.log('\n  the wall chain — any right-angled shape, any number of walls\n');

t('a rectangle is four walls and four right turns', () => {
  const walls: ChainWall[] = [
    { length: 3050, turn: 'R' },
    { length: 4575, turn: 'R' },
    { length: 3050, turn: 'R' },
    { length: 4575, turn: 'R' },
  ];
  assert.deepEqual(chainGap(walls), [0, 0]);
  assert.deepEqual(chain(walls).points, rect(3050, 4575).points);
});

t('every shape survives a round trip through the chain', () => {
  const shapes = [
    rect(3050, 4575),
    notched(2590, 3860, { corner: 'SE', w: 1600, d: 305, through: 'next' }),
    notched(9000, 6000, { corner: 'NW', w: 2000, d: 1500, through: 'prev' }),
  ];
  for (const shape of shapes) {
    const walls = toChain(shape.points);
    assert.deepEqual(chainGap(walls), [0, 0], 'a real shape closes');
    assert.deepEqual(chain(walls).points, shape.points);
  }
});

t('a U-shaped room is eight walls with two re-entrant corners', () => {
  //  a 6000 x 4000 block with a 2000 x 2000 slot up the middle of one side
  const walls: ChainWall[] = [
    { length: 6000, turn: 'R' },
    { length: 4000, turn: 'R' },
    { length: 2000, turn: 'R' },
    { length: 2000, turn: 'L' },
    { length: 2000, turn: 'L' },
    { length: 2000, turn: 'R' },
    { length: 2000, turn: 'R' },
    { length: 4000, turn: 'R' },
  ];
  assert.deepEqual(chainGap(walls), [0, 0]);
  const info = vertexInfo(chain(walls).points);
  assert.equal(info.length, 8);
  assert.ok(info.every((v) => v.square), 'every corner is a right angle');
  assert.equal(info.filter((v) => !v.convex).length, 2, 'two re-entrant corners');
});

t('a chain that does not close reports the gap instead of pretending', () => {
  // HI-15223 as its drawing prints it: the vertical chain is one wall
  // thickness long, and this is how the calculator says so
  const walls: ChainWall[] = [
    { length: 2590, turn: 'R' },
    { length: 3555, turn: 'R' },
    { length: 1600, turn: 'L' },
    { length: 365, turn: 'R' },
    { length: 990, turn: 'R' },
    { length: 3860, turn: 'R' },
  ];
  assert.deepEqual(chainGap(walls), [0, 60], 'out by exactly one wall thickness');
});

t('the same chain with the notch at 305 closes exactly', () => {
  const walls: ChainWall[] = [
    { length: 2590, turn: 'R' },
    { length: 3555, turn: 'R' },
    { length: 1600, turn: 'L' },
    { length: 305, turn: 'R' },
    { length: 990, turn: 'R' },
    { length: 3860, turn: 'R' },
  ];
  assert.deepEqual(chainGap(walls), [0, 0]);
});

console.log('\n  the compiler still refuses to guess\n');

t('a non-right angle throws instead of inventing a trapezoid blank', () => {
  const triangle: RoomOutline = {
    points: [
      [0, 0],
      [4000, 0],
      [0, 3000],
    ],
  };
  assert.throws(() => compileWalls(triangle), /not 90/);
});

t('a duplicated point throws instead of making a zero-length wall', () => {
  const bad: RoomOutline = {
    points: [
      [0, 0],
      [3000, 0],
      [3000, 0],
      [3000, 2000],
      [0, 2000],
    ],
  };
  assert.throws(() => compileWalls(bad), /zero length/);
});

t('collinear points throw rather than compiling a room with no area', () => {
  assert.throws(
    () => compileWalls({ points: [[0, 0], [1000, 0], [2000, 0]] }),
    /no area/,
  );
});

t('per-wall sheets reach the wall and split the BOQ row', () => {
  const SS = { material: 'SS', thickness: 0.5 };
  const outline = rect(3050, 4575, {
    0: { id: 'N' },
    1: { id: 'E' },
    2: { id: 'S', skin: { outer: SS, inner: { material: 'PPGI', thickness: 0.4 } } },
    3: { id: 'W' },
  });
  const walls = compileWalls(outline);
  assert.deepEqual(walls.find((w) => w.id === 'S')!.skin?.outer, SS, 'skin must survive the compile');
  assert.equal(walls.find((w) => w.id === 'N')!.skin, undefined, 'others stay on the default');
});

t('a corner can be turned off, and then the walls butt instead', () => {
  const on = compileWalls(rect(3050, 4575));
  assert.equal(on.reduce((n, w) => n + (w.cornerStart ? 1 : 0) + (w.cornerEnd ? 1 : 0), 0), 8);

  const off = compileWalls({
    ...rect(3050, 4575),
    vertices: { 0: { corner: false, through: 'prev' } },
  });
  // that junction loses its corner panel, and one wall butts into the other
  assert.equal(off.reduce((n, w) => n + (w.cornerStart ? 1 : 0) + (w.cornerEnd ? 1 : 0), 0), 6);
  assert.equal(off.filter((w) => w.buttStart || w.buttEnd).length, 1);
});

t('turning a corner off without saying which wall runs through throws', () => {
  assert.throws(
    () => compileWalls({ ...rect(3050, 4575), vertices: { 0: { corner: false } } }),
    /corner panel turned off/,
  );
});

t('a wall end is either a corner or a butt joint, never both', () => {
  // The shop's rule, stated 14 August 2026: where a butt joint lands there is
  // no corner panel. `compileWalls` cannot produce both — a vertex either takes
  // the corner branch or falls through to the butt one — and this holds it to
  // that across every verified room and every notch corner.
  const outlines: RoomOutline[] = [
    ...HI_15191.rooms.map((r) => r.outline!),
    ...HI_15279.rooms.map((r) => r.outline!),
    { ...rect(3050, 4575), vertices: { 0: { corner: false, through: 'prev' } } },
    { ...rect(3050, 4575), vertices: { 2: { corner: false, through: 'next' } } },
    notched(2590, 3860, { corner: 'SE', w: 1600, d: 305, through: 'next' }),
  ];

  for (const outline of outlines) {
    for (const w of compileWalls(outline)) {
      assert.ok(!(w.cornerStart && w.buttStart), `${w.id}: corner and butt at the same start`);
      assert.ok(!(w.cornerEnd && w.buttEnd), `${w.id}: corner and butt at the same end`);
    }
  }
});

t('a butt end eats a wall thickness where a corner would have eaten a leg', () => {
  const room = structuredClone(HI_15191.rooms[0]);
  const before = layoutRoom(room).wallRuns;

  // no corner panel at vertex 0: one wall runs through, the other butts into it
  room.outline = { ...room.outline!, vertices: { 0: { corner: false, through: 'next' } } };
  room.walls = compileWalls(room.outline);
  const after = layoutRoom(room).wallRuns;

  const delta = (id: string) =>
    after.find((r) => r.wallId === id)!.clearRun - before.find((r) => r.wallId === id)!.clearRun;

  // exactly the two walls meeting there move, and nothing else does
  const moved = room.walls.filter((w) => delta(w.id) !== 0).map((w) => w.id);
  assert.equal(moved.length, 2, `walls that changed: ${moved.join(', ')}`);

  const butted = room.walls.find((w) => w.buttStart || w.buttEnd)!;
  // the butting wall trades a 300 leg for one 120mm thickness
  assert.equal(delta(butted.id), room.cornerLeg - room.wallTh);
  // and the wall running straight through gets the whole leg back
  const through = moved.find((id) => id !== butted.id)!;
  assert.equal(delta(through), room.cornerLeg);
});

t('a shared edge is not compiled into a wall at all', () => {
  const walls = compileWalls(rect(3000, 2000, { 0: { shared: true } }));
  assert.equal(walls.length, 3);
  assert.equal(walls.reduce((n, w) => n + (w.cornerStart ? 1 : 0) + (w.cornerEnd ? 1 : 0), 0), 4);
});

console.log(`\n  ${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}\n`);
