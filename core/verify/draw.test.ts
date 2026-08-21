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
import { offsetPolygon, runBounds, wallSegments } from '../draw/geom.ts';
import {
  ceilingPlan,
  composeSheet,
  defaultFrame,
  doorElevation,
  doorElevations,
  floorPlan,
  jobPlan,
  model3d,
  roomDrawings,
  roomPlan,
  wallElevations,
} from '../draw/index.ts';
import { doorLabel } from '../rules.ts';
import { toDxf } from '../draw/dxf.ts';
import { toSvg } from '../draw/svg.ts';
import type { RoomOutline, RoomSpec } from '../types.ts';
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
  /*
   * Not a job — a room whose four corners are two different sizes, which no
   * printed sheet has yet. It is here because the three checks below are what
   * hold "a drawing never counts anything": the drawing takes each corner's own
   * leg through `runBounds`, and if it took the room's figure instead the
   * segments would no longer fill the clear run.
   */
  ['a room with corners of two sizes', mixedCornerRoom()],
];

function mixedCornerRoom(): RoomSpec {
  const outline: RoomOutline = {
    points: [
      [0, 0],
      [6000, 0],
      [6000, 4000],
      [0, 4000],
    ],
    vertices: { 1: { leg: 450 }, 2: { leg: 450 } },
  };
  return {
    ...structuredClone(HI_15191.rooms[0]),
    name: 'Mixed corners',
    ext: { w: 6000, l: 4000, h: 2590 },
    cornerLeg: 300,
    outline,
    walls: compileWalls(outline),
    ceiling: { wEnds: ['own', 'own'], lEnds: ['own', 'own'], splitAxis: 'l' },
  } as RoomSpec;
}

const sorted = (ns: number[]) => [...ns].sort((a, b) => a - b);

console.log('\n  the drawing shows exactly the panels the BOQ prices\n');

t("a wall run starts and ends at each corner's own leg, not the room's", () => {
  /*
   * `wallSegments` lays the panels out from 0 along the clear run, so a wrong
   * leg there does not change a single width — it slides the whole run along
   * the wall, and the first panel is drawn where the corner panel belongs.
   * That is a drawing disagreeing with the sheet about where a piece of steel
   * goes, so it is checked at the place it happens rather than through the
   * widths, which cannot see it.
   */
  const room = mixedCornerRoom();
  const walls = compileWalls(room.outline!);
  const at = (id: string) => {
    const w = walls.find((x) => x.id === id)!;
    return runBounds(w, w.length, room.cornerLeg, room.wallTh);
  };

  assert.deepEqual(at('E0'), { start: 300, end: 6000 - 450 }, 'room leg one end, stated the other');
  assert.deepEqual(at('E1'), { start: 450, end: 4000 - 450 }, 'both ends stated');
  assert.deepEqual(at('E3'), { start: 300, end: 4000 - 300 }, 'neither end stated');
});

t('the 3D model stands up a corner panel of each stated size', () => {
  /*
   * Two faces per corner panel, because a corner panel is an L: one leg runs
   * down each of the two walls meeting there, and the model stands both up.
   * Four corners, so eight legs — four of them 450 from the two vertices that
   * state it, four of them the room's 300.
   */
  const room = mixedCornerRoom();
  const legs = model3d({ jobNo: 'X', density: 40, rooms: [room] })
    .faces.filter((f) => f.kind === 'corner')
    .map((f) => f.detail?.[0])
    .sort();
  assert.deepEqual(
    legs,
    [
      'leg 300 mm',
      'leg 300 mm',
      'leg 300 mm',
      'leg 300 mm',
      'leg 450 mm',
      'leg 450 mm',
      'leg 450 mm',
      'leg 450 mm',
    ],
    'the model must show the legs the sheet prices, not the room figure eight times',
  );
});

t('a ceiling or floor nobody bought is not drawn, and not stood up', () => {
  /*
   * The shop, 21 August 2026: a customer sometimes takes the room without one.
   * A sheet showing a panel nobody is buying is a sheet somebody cuts from, so
   * the view goes with the row — and so does the face in the 3D model, which
   * is the same panels stood up.
   */
  const room = structuredClone(HI_15191.rooms[0]) as RoomSpec;
  const titles = () => roomDrawings(room).map((d) => d.title);
  const kinds = () =>
    new Set(model3d({ jobNo: 'X', density: 40, rooms: [room] }).faces.map((f) => f.kind));

  assert.ok(titles().some((x) => /Ceiling/.test(x)), 'a fitted ceiling is drawn');
  assert.ok(titles().some((x) => /Floor/.test(x)), 'a fitted floor is drawn');
  assert.ok(kinds().has('ceiling') && kinds().has('floor'));

  room.ceiling.fitted = false;
  assert.equal(titles().some((x) => /Ceiling/.test(x)), false, 'no ceiling, no ceiling view');
  assert.equal(kinds().has('ceiling'), false, 'no ceiling, no ceiling face');
  assert.ok(titles().some((x) => /Floor/.test(x)), 'the floor is still there');

  room.floor.fitted = false;
  assert.equal(titles().some((x) => /Floor/.test(x)), false, 'no floor, no floor view');
  assert.equal(kinds().has('floor'), false, 'no floor, no floor face');
  assert.ok(kinds().has('wall'), 'the walls are still drawn');
});

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

console.log('\n  the drawing sheet\n');

t('a view stays inside its own frame, dimensions and labels included', () => {
  const eps = 0.001;
  for (const room of [...HI_15191.rooms, ...HI_15279.rooms]) {
    for (const view of roomDrawings(room)) {
      const { drawing, cells } = composeSheet([view], { title: 'SHEET' });
      assert.equal(cells.length, 1, 'one view, one cell');
      const c = cells[0];
      const has = (x: number, y: number) =>
        x >= c.x0 - eps && x <= c.x1 + eps && y >= c.y0 - eps && y <= c.y1 + eps;
      const where = `${view.title}`;

      // the sheet border is four lines and the title block rule is a fifth;
      // everything else belongs to the view and must sit in its frame
      const stray = drawing.lines.filter((l) => !has(l.x1, l.y1) || !has(l.x2, l.y2));
      assert.equal(stray.length, 5, `${where}: ${stray.length} lines outside the frame`);

      for (const n of drawing.notes) {
        if (n.text === 'SHEET') continue; // the title block
        assert.ok(has(n.x, n.y), `${where}: label "${n.text}" outside the frame`);
      }
      for (const panel of drawing.cells) {
        assert.ok(
          has(panel.x0, panel.y0) && has(panel.x1, panel.y1),
          `${where}: panel label outside the frame`,
        );
      }
      for (const dm of drawing.dims) {
        const [x, y] = dm.dir === 'h' ? [dm.a, dm.base + dm.off] : [dm.base + dm.off, dm.a];
        assert.ok(has(x, y), `${where}: dimension "${dm.text}" outside the frame`);
      }
    }
  }
});

t('the sheet gives every view a cell of its own, and they do not overlap', () => {
  const views = HI_15191.rooms.flatMap((r) => roomDrawings(r));
  const { cells } = composeSheet(views, { title: 'SHEET' });
  assert.equal(cells.length, views.length);
  assert.deepEqual(
    cells.map((c) => c.title),
    views.map((v) => v.title),
    'cells come back in the order the views went in',
  );
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i];
      const b = cells[j];
      const apart = a.x1 <= b.x0 + 0.001 || b.x1 <= a.x0 + 0.001 || a.y1 <= b.y0 + 0.001 || b.y1 <= a.y0 + 0.001;
      assert.ok(apart, `cells ${i} and ${j} overlap`);
    }
  }
});

console.log('\n  the 3D model — the same panels, stood up\n');

/** Every face's width, taken off its own points rather than its label. */
const faceSpan = (f: { pts: [number, number, number][] }) => {
  const a = f.pts[0];
  const b = f.pts[1];
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
};

for (const job of [HI_15191, HI_15279]) {
  t(`${job.jobNo} — every 3D wall panel is a panel the BOQ priced`, () => {
    const m = model3d(job);
    assert.equal(m.skipped.length, 0, `rooms left out: ${JSON.stringify(m.skipped)}`);

    for (const room of job.rooms) {
      const L = layoutRoom(room);
      const walls = compileWalls(room.outline!);
      const edges = room.outline!.edges ?? {};

      for (const wall of walls) {
        const run = L.wallRuns.find((r) => r.wallId === wall.id);
        if (!run) continue;
        // a wall the neighbour builds is not this room's to stand up
        const idx = Object.keys(edges).find((k) => edges[+k]?.id === wall.id);
        if (idx !== undefined && edges[+idx]?.shared) continue;

        const want = wallSegments(run, wall, room.module)
          .filter((s) => !s.door)
          .map((s) => Math.round(s.width))
          .sort((a, b) => a - b);
        const got = m.faces
          .filter((f) => f.room === room.name && f.wallId === wall.id && f.kind === 'wall')
          .map((f) => Math.round(faceSpan(f)))
          .sort((a, b) => a - b);
        // the door module is a wall face too, so compare the set without it
        const doors = wallSegments(run, wall, room.module).filter((s) => s.door).length;
        assert.equal(
          got.length,
          want.length + doors,
          `${room.name} wall ${wall.id}: ${got.length} faces, ${want.length + doors} panels`,
        );
      }
    }
  });

  t(`${job.jobNo} — every 3D ceiling and floor panel is one the BOQ priced`, () => {
    const m = model3d(job);
    for (const room of job.rooms) {
      const L = layoutRoom(room);
      const ceil = m.faces.filter((f) => f.room === room.name && f.kind === 'ceiling');
      assert.equal(ceil.length, L.ceiling.widths.length, `${room.name} ceiling panels`);

      const floor = m.faces.filter((f) => f.room === room.name && f.kind === 'floor');
      const wantFloor = room.floor.kind === 'panelised' ? (L.floor.widths?.length ?? 0) : 1;
      assert.equal(floor.length, wantFloor, `${room.name} floor panels`);
    }
  });
}

t('the 3D model stands on the floor and stops at the room height', () => {
  const m = model3d(HI_15191);
  const h = Math.max(...HI_15191.rooms.map((r) => r.ext.h));
  assert.equal(m.min[2], 0, 'nothing below the floor');
  assert.equal(m.max[2], h, 'nothing above the tallest room');
});

t('a room with no outline is reported, not silently dropped', () => {
  const job = structuredClone(HI_15223);
  delete job.rooms[0].outline;
  const m = model3d(job);
  assert.equal(m.skipped.length, 1);
  assert.match(m.skipped[0].reason, /outline/);
});

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

console.log('\n  the door top panel on a tall wall\n');

/** HI-15279's freezer stood up past the door top threshold. */
const tall = (): RoomSpec => {
  const room = structuredClone(HI_15279.rooms[0]);
  room.ext.h = 3600;
  return room;
};

t('the elevation names the top as a panel only when one is made', () => {
  const doorCell = (room: RoomSpec) => {
    const wall = compileWalls(room.outline!).find((w) => w.door)!;
    const d = wallElevations(room).find((x) => x.title.includes(`Wall ${wall.id} `))!;
    return d.cells.map((c) => c.text);
  };
  assert.ok(doorCell(tall()).some((x) => x.startsWith('DOOR TOP 1180 x 1620')));
  // short wall: the stretch is inside the door assembly, and says so
  assert.ok(doorCell(HI_15279.rooms[0]).some((x) => x.includes('in the door assembly')));
});

t('the 3D door module stops at the head and the top panel carries the rest', () => {
  const room = tall();
  const L = layoutRoom(room);
  const faces = model3d({ ...HI_15279, rooms: [room] }).faces.filter(
    (f) => f.label.includes('door module') || f.label.includes('door top'),
  );
  assert.equal(faces.length, 2);

  const zs = (label: string) => {
    const f = faces.find((x) => x.label.includes(label))!;
    return [Math.min(...f.pts.map((p) => p[2])), Math.max(...f.pts.map((p) => p[2]))];
  };
  const head = room.ext.h - L.doorTop!.l;
  assert.deepEqual(zs('door module'), [0, head], 'the module stops at the head');
  assert.deepEqual(zs('door top'), [head, room.ext.h], 'and the top panel goes on to the ceiling');
});

console.log('\n  door hand — LHS / RHS\n');

/** The leaf of the swing: on a horizontal wall it is the line square to it. */
const leafOf = (d: ReturnType<typeof roomPlan>) =>
  d.lines.filter((l) => l.layer === 'DOOR' && l.x1 === l.x2 && !l.dash);

/** The freezer with its door hung the stated way. */
const handed = (hand?: string) => {
  const room = structuredClone(HI_15191.rooms[0]);
  const edge = room.outline!.edges![0];
  edge.door = { ...edge.door!, hand };
  return roomPlan(room);
};

t('no hand, no swing — the plan does not invent one', () => {
  assert.equal(leafOf(handed(undefined)).length, 0);
  // the opening itself is still drawn across the wall
  assert.ok(handed(undefined).lines.some((l) => l.layer === 'DOOR'));
});

t('a stated hand draws the leaf open into the room, and the arc it sweeps', () => {
  const d = handed('LHS');
  const leaf = leafOf(d);
  assert.equal(leaf.length, 1, 'one leaf');
  // the door is on the top wall, so into the room is down the drawing
  assert.ok(leaf[0].y2 > leaf[0].y1, 'the leaf swings inwards');
  const door = HI_15191.rooms[0].walls.find((w) => w.door)!.door!;
  assert.equal(Math.round(Math.abs(leaf[0].y2 - leaf[0].y1)), door.clearW, 'a leaf wide');
  assert.equal(d.lines.filter((l) => l.layer === 'DOOR' && l.dash).length, 8, 'the arc');
});

t('LHS and RHS hinge at opposite jambs, one leaf width apart', () => {
  const door = HI_15191.rooms[0].walls.find((w) => w.door)!.door!;
  const lhs = leafOf(handed('LHS'))[0];
  const rhs = leafOf(handed('RHS'))[0];
  // reading the wall from outside the room, left is the way the edge runs
  assert.equal(Math.round(rhs.x1 - lhs.x1), door.clearW);
});

t('the hand rewrites the label\'s own token, and only when it is stated', () => {
  // the three verified jobs each write it differently, and none states a hand
  assert.equal(doorLabel({ label: 'Flush Door (LHS) PP' }), 'Flush Door (LHS) PP');
  assert.equal(doorLabel({ label: 'Flush Door  (LHS)SS/PP' }), 'Flush Door  (LHS)SS/PP');
  // stated, the token follows it wherever it sits in the label
  assert.equal(doorLabel({ label: 'Flush Door (LHS) PP', hand: 'RHS' }), 'Flush Door (RHS) PP');
  assert.equal(doorLabel({ label: 'Flush Door PP (LHS)', hand: 'RHS' }), 'Flush Door PP (RHS)');
  // and a label with no token to rewrite gets one
  assert.equal(doorLabel({ label: 'Sliding Door', hand: 'LHS' }), 'Sliding Door (LHS)');
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
