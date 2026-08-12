/**
 * Drawing tests.
 * Run:  node core/verify/draw.test.ts
 *
 * The design rule these enforce: a drawing never counts anything. Every panel
 * on a drawing must be a panel the BOQ priced, at the same width. If these two
 * ever drift apart the drawing becomes worse than useless, because the factory
 * would be cutting to one and buying to the other.
 */

import assert from 'node:assert/strict';
import { layoutRoom } from '../layout.ts';
import { compileWalls } from '../plan.ts';
import { offsetPolygon, wallSegments } from '../draw/geom.ts';
import {
  ceilingPlan,
  defaultFrame,
  doorElevation,
  doorElevations,
  floorPlan,
  jobPlan,
  roomDrawings,
  roomPlan,
  wallElevations,
} from '../draw/index.ts';
import { toDxf } from '../draw/dxf.ts';
import { toSvg } from '../draw/svg.ts';
import type { RoomSpec } from '../types.ts';
import { HI_15191 } from '../jobs/hi-15191.ts';
import { HI_15223 } from '../jobs/hi-15223.ts';
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

const DRAWABLE: Array<[string, RoomSpec]> = [
  ['HI-15191 freezer', HI_15191.rooms[0]],
  ['HI-15191 ante', HI_15191.rooms[1]],
  ['HI-15279 freezer', HI_15279.rooms[0]],
  ['HI-15279 chiller', HI_15279.rooms[1]],
];

const sorted = (ns: number[]) => [...ns].sort((a, b) => a - b);

console.log('\n  the drawing shows exactly the panels the BOQ prices\n');

for (const [name, room] of DRAWABLE) {
  t(`${name} — every wall panel on the drawing is a priced panel`, () => {
    const L = layoutRoom(room);
    const walls = compileWalls(room.outline!);

    const drawn: number[] = [];
    for (const wall of walls) {
      const run = L.wallRuns.find((r) => r.wallId === wall.id)!;
      for (const s of wallSegments(run, wall, room.module)) {
        if (!s.door) drawn.push(s.width);
      }
    }

    assert.deepEqual(
      sorted(drawn),
      sorted([...L.wallWidths, ...L.buttJointWidths]),
      'drawn widths must equal the widths layout produced',
    );
  });

  t(`${name} — each wall's segments fill its clear run exactly`, () => {
    const L = layoutRoom(room);
    for (const wall of compileWalls(room.outline!)) {
      const run = L.wallRuns.find((r) => r.wallId === wall.id)!;
      const segs = wallSegments(run, wall, room.module);
      const total = segs.reduce((n, s) => n + s.width, 0);
      // splitRun rounds each piece to whole mm, so a run can be out by up to
      // half a mm per piece. HI-15191's ante wall is the live case: a 1225 run
      // becomes 613 + 613 = 1226, and the production sheet prints 613 too.
      const slack = segs.length * 0.5 + 0.01;
      assert.ok(
        Math.abs(total - run.clearRun) <= slack,
        `wall ${wall.id}: segments total ${total}, clear run ${run.clearRun}`,
      );
      // and they must be contiguous, no overlap and no gap
      segs.forEach((s, i) => {
        if (i > 0) assert.equal(s.a, segs[i - 1].b, `wall ${wall.id} seg ${i} not contiguous`);
      });
    }
  });

  t(`${name} — ceiling and floor drawings match the layout`, () => {
    const L = layoutRoom(room);
    const ceil = ceilingPlan(room);
    assert.equal(ceil.cells.length, L.ceiling.widths.length, 'ceiling panel count');

    const floor = floorPlan(room);
    const want = room.floor.kind === 'panelised' ? (L.floor.widths?.length ?? 0) : 1;
    assert.equal(floor.cells.length, want, 'floor panel count');
  });
}

console.log('\n  door placement\n');

t('a door with no stated position is centred', () => {
  const room = HI_15191.rooms[0];
  const L = layoutRoom(room);
  const wall = compileWalls(room.outline!).find((w) => w.door)!;
  const run = L.wallRuns.find((r) => r.wallId === wall.id)!;
  const segs = wallSegments(run, wall, room.module);
  const door = segs.find((s) => s.door)!;
  // 2450 clear - 1180 door = 1270, split 635 + 635, so the door starts at 635
  assert.equal(door.a, 635);
  assert.equal(run.clearRun - door.b, 635, 'equal panel either side');
});

t('a door snaps to a panel boundary rather than cutting one in half', () => {
  const room = HI_15279.rooms[1];
  const L = layoutRoom(room);
  const wall = compileWalls(room.outline!).find((w) => w.door)!;
  const run = L.wallRuns.find((r) => r.wallId === wall.id)!;
  const segs = wallSegments(run, wall, room.module);
  const door = segs.find((s) => s.door)!;
  // widths are 1180 + 240 + 200; centring would want 810, which is mid-panel,
  // so it lands on the 1180 boundary instead
  assert.equal(door.a, 1180);
  assert.deepEqual(
    segs.filter((s) => !s.door).map((s) => s.width),
    [1180, 240, 200],
  );
});

t('fromLeft places the door where the drawing says', () => {
  const room = structuredClone(HI_15279.rooms[0]);
  const wall = compileWalls(room.outline!).find((w) => w.door)!;
  wall.door!.fromLeft = 0;
  const run = layoutRoom(room).wallRuns.find((r) => r.wallId === wall.id)!;
  const segs = wallSegments(run, wall, room.module);
  assert.equal(segs[0].door, true, 'door should be first when fromLeft is 0');
});

console.log('\n  door elevation\n');

t('the frame chain adds up to the door module', () => {
  const door = HI_15191.rooms[0].walls.find((w) => w.door)!.door!;
  const frame = defaultFrame(door);
  assert.equal(frame * 2 + door.clearW, door.moduleW, '160 + 860 + 160 = 1180');
});

t('a frame is worked out from the opening when the job does not state one', () => {
  assert.equal(defaultFrame({ label: 'D', clearW: 860, clearH: 1980, moduleW: 1180 }), 160);
});

t('the elevation dimensions the frame, the leaf and the module', () => {
  const room = HI_15191.rooms[0];
  const d = doorElevation(room, room.walls.find((w) => w.door)!.door!, 'N');
  const texts = d.dims.map((x) => x.text);
  for (const want of ['1180', '860', '160', '1980', '2590', '120', '100', '150']) {
    assert.ok(texts.includes(want), `elevation is missing the ${want} dimension`);
  }
});

t('the chequered sheet is drawn and dimensioned only when asked for', () => {
  const room = HI_15191.rooms[0];
  const door = room.walls.find((w) => w.door)!.door!;
  assert.ok(doorElevation(room, door, 'N').dims.some((x) => x.text === '600'));

  const plain = doorElevation(room, { ...door, chqHeight: undefined }, 'N');
  assert.ok(!plain.dims.some((x) => x.text === '600'));
  assert.ok(!plain.notes.some((n) => n.text.includes('CHQ')));
});

t('the lift stands the door off the slab, and the leaf stays clear of it', () => {
  const room = HI_15191.rooms[0];
  const door = room.walls.find((w) => w.door)!.door!;
  const d = doorElevation(room, door, 'N');
  const doorLines = d.lines.filter((l) => l.layer === 'DOOR');
  const bottom = Math.max(...doorLines.map((l) => Math.max(l.y1, l.y2)));
  // slab top is 2590 - 100 = 2490; a 150 lift puts the leaf at 2340
  assert.equal(bottom, room.ext.h - room.floor.th - door.liftAboveFloor!);
});

t('a room with a door gets a door elevation among its drawings', () => {
  const titles = roomDrawings(HI_15191.rooms[0]).map((d) => d.title);
  assert.equal(titles.filter((t2) => t2.includes('Typical elevation')).length, 1);
  assert.equal(doorElevations(HI_15279.rooms[1]).length, 1);
});

console.log('\n  geometry and renderers\n');

t('offsetting a rectangle inward gives the inner face', () => {
  const inner = offsetPolygon(
    [
      [0, 0],
      [3000, 0],
      [3000, 2000],
      [0, 2000],
    ],
    100,
  );
  assert.deepEqual(
    inner.map((p) => [Math.round(p[0]), Math.round(p[1])]),
    [
      [100, 100],
      [2900, 100],
      [2900, 1900],
      [100, 1900],
    ],
  );
});

t('an L-shape offsets without collapsing at the re-entrant corner', () => {
  const inner = offsetPolygon(
    [
      [0, 0],
      [3000, 0],
      [3000, 2000],
      [2000, 2000],
      [2000, 3000],
      [0, 3000],
    ],
    100,
  );
  assert.equal(inner.length, 6);
  // the re-entrant vertex moves outward from the room, not inward
  assert.deepEqual(inner[3].map(Math.round), [1900, 1900]);
});

t('the plan drawing draws both wall faces', () => {
  const d = roomPlan(HI_15191.rooms[0]);
  const wallLines = d.lines.filter((l) => l.layer === 'WALL');
  assert.equal(wallLines.length, 8, '4 outer + 4 inner');
  assert.ok(d.dims.length > 0);
});

t('a room does not redraw a wall its neighbour builds', () => {
  // the ante room owns three walls; the fourth is the freezer's
  const d = roomPlan(HI_15191.rooms[1]);
  const wallLines = d.lines.filter((l) => l.layer === 'WALL');
  assert.equal(wallLines.length, 6, '3 walls x 2 faces, not 4');

  // and nothing is drawn on the shared side, which is the freezer's wall
  const shared = HI_15191.rooms[1].ext.l; // the ante's own depth
  assert.ok(
    !wallLines.some((l) => Math.abs(l.y1) < 0.5 && Math.abs(l.y2) < 0.5),
    'the partition line belongs to the freezer, not the ante room',
  );
  assert.ok(shared > 0);
});

t('the inside runs up to the partition, not past it', () => {
  const ante = HI_15191.rooms[1];
  const d = roomPlan(ante);
  // the shared side is edge 0, at y = 0 in the room's own coordinates. The
  // side walls' inner faces must reach it rather than stopping a wall
  // thickness short, because the freezer's wall is what closes the room there.
  const innerReaches = d.lines.some(
    (l) => l.layer === 'WALL' && (Math.abs(l.y1) < 0.5 || Math.abs(l.y2) < 0.5),
  );
  assert.ok(innerReaches, 'side walls must run to the partition line');
});

t('a room is drawn where the job puts it', () => {
  const room = HI_15191.rooms[0];
  const here = roomPlan(room, [0, 0]);
  const moved = roomPlan(room, [5000, 2000]);
  const shift = (a: { x1: number }[], b: { x1: number }[]) => b[0].x1 - a[0].x1;
  assert.equal(shift(here.lines, moved.lines), 5000, 'the whole drawing moves with it');
  assert.equal(moved.lines.length, here.lines.length, 'and nothing else changes');
});

t('one job layout holds every room, connected ones touching', () => {
  const d = jobPlan(HI_15191);
  const freezer = roomPlan(HI_15191.rooms[0]);
  const ante = roomPlan(HI_15191.rooms[1], HI_15191.rooms[1].at);
  assert.equal(d.lines.length, freezer.lines.length + ante.lines.length);
  // the ante sits 1525 above the freezer, so the layout starts above zero
  assert.ok(
    d.lines.some((l) => l.y1 < 0 || l.y2 < 0),
    'the ante room must be drawn above the freezer, not on top of it',
  );
  assert.ok(d.notes.some((n) => n.text === 'FREEZER ROOM'));
  assert.ok(d.notes.some((n) => n.text === 'ANTE ROOM'));
});

t('the layout says why it cannot be drawn rather than drawing nothing', () => {
  assert.throws(() => jobPlan(HI_15223), /plan outline/);
});

t('an elevation exists for every wall the room owns', () => {
  assert.equal(wallElevations(HI_15191.rooms[0]).length, 4);
  assert.equal(wallElevations(HI_15191.rooms[1]).length, 3, 'ante owns three walls');
  assert.equal(wallElevations(HI_15279.rooms[1]).length, 3, 'chiller owns three walls');
});

t('DXF comes out balanced and on the legacy layers', () => {
  const dxf = toDxf(roomPlan(HI_15191.rooms[0]));
  assert.equal((dxf.match(/^0$/gm) ?? []).length > 0, true);
  assert.ok(dxf.startsWith('0\nSECTION\n2\nENTITIES'));
  assert.ok(dxf.trimEnd().endsWith('0\nENDSEC\n0\nEOF'));
  for (const layer of ['WALL', 'PANEL', 'DIM']) {
    assert.ok(dxf.includes(`\n${layer}\n`), `missing layer ${layer}`);
  }
});

t('DXF flips Y so the drawing is the right way up in AutoCAD', () => {
  const d = roomPlan(HI_15191.rooms[0]);
  const dxf = toDxf(d);
  // the outline's top edge (y = 0) must come out at y = room length
  assert.ok(dxf.includes(`\n20\n${d.l}\n`), 'top edge should map to y = length');
});

t('SVG renders and stays inside its own box', () => {
  const svg = toSvg(roomPlan(HI_15191.rooms[0]), { maxWidth: 800 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('viewBox='));
  assert.ok(svg.includes('max-width:100%'));
});

console.log('\n  a room that cannot be drawn says so\n');

t('a room with no outline refuses to draw instead of inventing one', () => {
  assert.throws(() => roomPlan(HI_15223.rooms[0]), /no outline/);
});

console.log(`\n  ${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}\n`);
