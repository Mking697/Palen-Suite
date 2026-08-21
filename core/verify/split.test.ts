/**
 * splitRun unit tests + engine sensitivity checks.
 * Run:  node core/verify/split.test.ts
 *
 * Expected values are read straight off the production drawings, so a failure
 * here means the shop rule has been broken, not that a number moved.
 */

import assert from 'node:assert/strict';
import { splitRun } from '../split.ts';
import { buildRoomBlock } from '../boq.ts';
import { layoutRoom } from '../layout.ts';
import { HI_15191 } from '../jobs/hi-15191.ts';
import { HI_15223 } from '../jobs/hi-15223.ts';
import { HI_15279 } from '../jobs/hi-15279.ts';
import { round2 } from '../format.ts';
import { DOOR_TOP_MIN_WALL_HEIGHT, floorCoreTh, lCutDefault } from '../rules.ts';
import { junctions, roomFlashing } from '../flashing.ts';
import { chain, compileWalls, notched, toChain } from '../plan.ts';
import type { Mm, RoomSpec } from '../types.ts';

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

console.log('\n  splitRun — against the drawings\n');

t('HI-15191 freezer 3050 wall: sliver 90 forces a 635+635 pair', () => {
  assert.deepEqual(splitRun(2450, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [1180, 635, 635]);
});

t('HI-15191 freezer 4575 wall: balance 435 is kept as-is', () => {
  assert.deepEqual(splitRun(3975, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [1180, 1180, 1180, 435]);
});

t('HI-15191 ante 1525 wall: sliver 45 forces 613+613', () => {
  assert.deepEqual(splitRun(1225, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [613, 613]);
});

t('HI-15191 ante ceiling 1495 -> 1180 + 315', () => {
  assert.deepEqual(splitRun(1495, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [1180, 315]);
});

t('HI-15191 freezer ceiling 4455 -> 1180x3 + 915', () => {
  assert.deepEqual(splitRun(4455, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [1180, 1180, 1180, 915]);
});

t('HI-15223 chiller 2590 wall -> 1180 + 810', () => {
  assert.deepEqual(splitRun(1990, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [1180, 810]);
});

t('HI-15252 F&V 6500 wall (module 1030) -> 1030x5 + 750', () => {
  assert.deepEqual(splitRun(5900, { module: 1030, minPanelWidth: 150, maxSplitPieces: 2 }), [1030, 1030, 1030, 1030, 1030, 750]);
});

t('HI-15252 freezer 3592 wall (module 1030) -> 1030x2 + 932', () => {
  assert.deepEqual(splitRun(2992, { module: 1030, minPanelWidth: 150, maxSplitPieces: 2 }), [1030, 1030, 932]);
});

console.log('\n  splitRun — edge cases\n');

t('zero and sub-millimetre runs produce nothing', () => {
  assert.deepEqual(splitRun(0, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), []);
  assert.deepEqual(splitRun(0.3, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), []);
});

t('run below a module is one panel, even below minPanelWidth', () => {
  assert.deepEqual(splitRun(90, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [90]);
});

t('run exactly one module is not split', () => {
  assert.deepEqual(splitRun(1180, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [1180]);
});

t('exact multiples leave no balance', () => {
  assert.deepEqual(splitRun(3540, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }), [1180, 1180, 1180]);
});

t('auto mode never splits a balance more than two ways', () => {
  // after giving a module back the balance is always under 2 x module,
  // so raising maxSplitPieces alone can never produce a third piece
  for (let run = 200; run <= 9000; run += 7) {
    for (const mod of [1030, 1180, 1220]) {
      const two = splitRun(run, { module: mod, minPanelWidth: 150, maxSplitPieces: 2 });
      const five = splitRun(run, { module: mod, minPanelWidth: 150, maxSplitPieces: 5 });
      assert.deepEqual(five, two, `run ${run} mod ${mod}`);
    }
  }
});

t('balancePieces 3 forces a three-way split (draftsman override)', () => {
  // HI-15191 freezer 3050 wall: balance 1270 normally becomes 635+635
  assert.deepEqual(
    splitRun(2450, { module: 1180, minPanelWidth: 150, balancePieces: 2 }),
    [1180, 635, 635],
  );
  assert.deepEqual(
    splitRun(2450, { module: 1180, minPanelWidth: 150, balancePieces: 3 }),
    [1180, 423, 423, 423],
  );
  assert.deepEqual(
    splitRun(2450, { module: 1180, minPanelWidth: 150, balancePieces: 4 }),
    [1180, 318, 318, 318, 318],
  );
});

t('no piece is ever wider than the module, in either mode', () => {
  for (let run = 200; run <= 9000; run += 7) {
    for (const mod of [1030, 1180, 1220]) {
      for (const pieces of [2, 3, 4]) {
        for (const opts of [
          { module: mod, minPanelWidth: 150, maxSplitPieces: pieces },
          { module: mod, minPanelWidth: 150, balancePieces: pieces },
        ]) {
          const out = splitRun(run, opts);
          assert.ok(
            Math.max(...out) <= mod + 1,
            `run ${run} ${JSON.stringify(opts)} -> ${out.join(',')}`,
          );
        }
      }
    }
  }
});

t('split total never loses more than rounding from the run', () => {
  for (let run = 200; run <= 9000; run += 13) {
    const out = splitRun(run, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 });
    const sum = out.reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(sum - run) <= out.length,
      `run ${run} -> ${out.join(',')} sums to ${sum}`,
    );
  }
});

console.log('\n  L-shaped rooms and butt joints (HI-15223)\n');

const chiller = HI_15223.rooms[0];
const chillerLayout = layoutRoom(chiller);
const byWall = (id: string) => chillerLayout.wallRuns.find((r) => r.wallId === id)!;

t('a butt end takes one wall thickness off the run', () => {
  // bottom wall 1600 butts into the notch upright: 1600 - 60 = 1540
  assert.equal(byWall('bottom').clearRun, 1540);
  assert.deepEqual(byWall('bottom').widths, [1180, 360]);
});

t('corner, butt end and door all come off the same run', () => {
  // left wall 3860 - 300 corner - 60 butt = 3500, less the 1180 door = 2320
  assert.equal(byWall('left').clearRun, 3500);
  assert.deepEqual(byWall('left').widths, [1180, 1140]);
});

t('a wall shorter than the module is a single panel', () => {
  assert.deepEqual(byWall('notch').widths, [365]);
});

t('an L-shaped plan with two butt joints has only two corner panels', () => {
  assert.equal(chillerLayout.cornerCount, 2);
});

t('butt joint widths are kept out of the ordinary wall tally', () => {
  assert.deepEqual(chillerLayout.buttJointWidths, [930]);
  assert.ok(!chillerLayout.wallWidths.includes(930));
  // 1180 x5, 1140, 895, 810, 365, 360 = 10 ordinary panels
  assert.equal(chillerLayout.wallWidths.length, 10);
});

t('butt joint panel gets the wider outer blank and narrower inner skin', () => {
  const b = buildRoomBlock(chiller, 40);
  const outer = b.rows.find((r) => r.desc.includes('(Outer) Butt Joint'))!;
  const inner = b.rows.find((r) => r.desc.includes('(Inner)') && r.desc.includes('Butt Joint'))!;
  assert.equal(outer.panelW, 930);
  assert.equal(outer.blankW, 1030, 'butt joint outer blank is +100, not +40');
  assert.equal(inner.panelW, 880);
  assert.equal(inner.blankW, 920, 'butt joint inner blank is the normal +40');
});

console.log('\n  draftsman overrides and panelised floors (HI-15279)\n');

const [freezer79, chiller79] = HI_15279.rooms;

t('minPanelWidth 150 is pinned by two jobs from opposite sides', () => {
  // HI-15279 ambient ceiling 11930: balance 130 is rejected, giving 655 + 655
  assert.deepEqual(
    splitRun(11930, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }).slice(-2),
    [655, 655],
  );
  // HI-15252 F&V keeps a 150 wall panel, so the floor cannot be above 150
  assert.deepEqual(
    splitRun(1180 + 150, { module: 1180, minPanelWidth: 150, maxSplitPieces: 2 }),
    [1180, 150],
  );
});

t('equalPieces splits a whole run evenly, ignoring the module', () => {
  const w = layoutRoom(freezer79).wallRuns.find((r) => r.wallId === 'W')!;
  // 3400 - 600 corners - 1180 door = 1620, wanted as 810 | door | 810
  assert.deepEqual(w.widths, [810, 810]);
});

t('explicit panels override an unevenly split balance', () => {
  const e = layoutRoom(chiller79).wallRuns.find((r) => r.wallId === 'E')!;
  assert.deepEqual(e.widths, [1180, 240, 200], 'auto would give 1180 + 440');
});

t('explicit panels that do not add up to the run throw', () => {
  const bad = structuredClone(chiller79);
  bad.walls.find((w) => w.id === 'E')!.panels = [1180, 240, 500];
  assert.throws(() => layoutRoom(bad), /explicit panels .* but the run is 1620/);
});

t('a room owning three walls gets two corner panels, not four', () => {
  assert.equal(layoutRoom(chiller79).cornerCount, 2);
  assert.equal(layoutRoom(freezer79).cornerCount, 4);
});

t('panelised floor splits on its own module and carries ply', () => {
  const b = buildRoomBlock(freezer79, 40);
  const floors = b.rows.filter((r) => r.desc.startsWith('Bottom PPGI'));
  assert.deepEqual(floors.map((r) => [r.panelW, r.panelQty]), [[1220, 3], [710, 1]]);
  assert.equal(b.totals.plyQty, 4, 'one ply sheet per floor panel');
  assert.equal(floors[0].panelL, 3200, 'floor uses the internal clear span');
});

t('the core gives way so the panel stays the floor thickness', () => {
  const layers = [
    { material: 'PPGI', th: 0.4 },
    { material: 'Puf', th: 0 },
    { material: 'Ply', th: 12 },
    { material: 'AL. CHQ', th: 2 },
  ];
  // 100 - 0.4 - 12 - 2: the panel does not become 114
  assert.equal(floorCoreTh(layers, 100), 85.6);
  // thicker sheets eat further into the core, never into the panel
  assert.equal(floorCoreTh([...layers.slice(0, 3), { material: 'AL. CHQ', th: 5 }], 100), 82.6);
  // and it is reported as it falls, so an impossible build-up is visible
  assert.ok(floorCoreTh(layers, 10) < 0);
});

t('a floor that states its build-up prints every layer of it', () => {
  const layered = structuredClone(freezer79);
  layered.floor.layers = [
    { material: 'PPGI', th: 0.4 },
    { material: 'Puf', th: 0 },
    { material: 'Ply', th: 12 },
    { material: 'SS', th: 2 },
  ];
  const row = buildRoomBlock(layered, 40).rows.find((r) => r.desc.startsWith('Bottom'))!;
  assert.equal(row.desc, 'Bottom PPGI 0.4 mm + Puf 85.6 mm + Ply 12 mm + SS 2 mm = 100 mm');

  // a job that states a description instead keeps it exactly as transcribed —
  // HI-15279's two rooms print the same build-up spaced differently
  const printed = buildRoomBlock(freezer79, 40).rows.find((r) => r.desc.startsWith('Bottom'))!;
  assert.equal(printed.desc, 'Bottom PPGI +Puf + 12 mm Ply + 2mm AL. CHQ ON Top = 100mm');
});

console.log('\n  the door top panel — the shop\'s rule, above 3050 only\n');

/** The same freezer, stood up to the given wall height. */
const atHeight = (h: number) => {
  const room = structuredClone(freezer79); // 100mm walls, 1180 door, 1980 clear
  room.ext.h = h;
  return room;
};

t('no door top up to 3050, and one above it', () => {
  assert.equal(layoutRoom(atHeight(2745)).doorTop, null, 'every verified sheet is here');
  assert.equal(layoutRoom(atHeight(DOOR_TOP_MIN_WALL_HEIGHT)).doorTop, null, 'not at 3050');
  assert.deepEqual(layoutRoom(atHeight(3600)).doorTop, { w: 1180, l: 1620 }, '3600 - 1980');
});

t('below the threshold the door assembly is still the full wall height', () => {
  const rows = buildRoomBlock(atHeight(2745), 40).rows;
  assert.equal(rows.some((r) => r.desc.startsWith('Door Top')), false);
  assert.equal(rows.find((r) => r.desc === 'Inner Sheet')!.panelL, 2745);
});

t('above it the top is its own panel, built like any other wall panel', () => {
  const room = atHeight(3600);
  const rows = buildRoomBlock(room, 40).rows;

  const outer = rows.find((r) => r.desc === 'Door Top Panel (Outer)')!;
  assert.deepEqual(
    [outer.panelW, outer.panelL, outer.blankW, outer.blankL, outer.panelQty, outer.ppgiQty],
    [1180, 1620, 1220, 1620, 1, 1],
    'blank is panel + 40, one PPGI',
  );
  assert.equal(round2(outer.areaSqmt), 1.91);
  assert.equal(round2(outer.chemWeight), 7.65);

  // the rebate is at the top of the wall, so the inner skin is a ceiling short
  const inner = rows.find((r) => r.desc === 'Door Top Panel (Inner)')!;
  assert.equal(inner.panelL, 1620 - room.ceilTh);
  assert.equal(inner.areaSqmt, 0, 'the outer row owns the foam');
});

t('the door top and the door assembly fill the module exactly once', () => {
  const room = atHeight(3600);
  const rows = buildRoomBlock(room, 40).rows;
  const door = room.walls.find((w) => w.door)!.door!;

  // the assembly stops at the head, and the top panel carries the rest
  assert.equal(rows.find((r) => r.desc === 'Inner Sheet')!.panelL, door.clearH);
  const inThatStretch =
    rows.find((r) => r.desc === 'Inner Sheet')!.areaSqmt +
    rows.find((r) => r.desc === 'Door Top Panel (Outer)')!.areaSqmt;
  // 1180 x 3600 of wall, counted once
  assert.equal(round2(inThatStretch), round2((door.moduleW / 1000) * (room.ext.h / 1000)));
});

t('the L cut off leaves the door top inner as long as its outer', () => {
  const room = atHeight(3600);
  room.lCut = false;
  const rows = buildRoomBlock(room, 40).rows;
  assert.equal(rows.find((r) => r.desc === 'Door Top Panel (Inner)')!.panelL, 1620);
});

console.log('\n  flashing — the shop\'s rule, not yet a sheet\'s\n');

t('three flashings on every room, each running the whole perimeter', () => {
  const f = roomFlashing(freezer79); // 4570 x 3400 x 2745, 100mm walls
  assert.deepEqual(f.rows.map((r) => r.kind), ['inner', 'outer', 'u']);

  // 2 x (4570 + 3400) = 15940 mm
  assert.equal(f.rows.find((r) => r.kind === 'u')!.rmtr, 15.94);
  assert.equal(f.rows.find((r) => r.kind === 'u')!.rmtrText, '15.94');
  // width is the wall thickness plus 2, on all three
  assert.deepEqual(f.rows.map((r) => r.width), [102, 102, 102]);
  // and the U profile carries that same figure in its middle leg
  assert.equal(f.rows.find((r) => r.kind === 'u')!.profile, '10x40x102x40x10');
});

t('a butt joint adds one wall height of inner and one of outer, and no U', () => {
  const plain = structuredClone(freezer79);
  plain.outline = { ...plain.outline!, vertices: {} };
  const before = roomFlashing(plain);

  const butted = structuredClone(freezer79);
  butted.outline = {
    ...butted.outline!,
    vertices: { 0: { corner: false, through: 'prev' } },
  };
  const after = roomFlashing(butted);

  // compared in millimetres: differencing two figures already rounded to the
  // printed hundredth loses the last one
  const rm = (f: typeof before, kind: string) => f.rows.find((r) => r.kind === kind)!.rmtr;
  const gained = (kind: string) => Math.round((rm(after, kind) - rm(before, kind)) * 1000);
  assert.equal(gained('inner'), butted.ext.h, 'inner gains a wall height');
  assert.equal(gained('outer'), butted.ext.h, 'outer gains a wall height');
  assert.equal(gained('u'), 0, 'the U flashing is unchanged');
});

/** How much a flashing runs beyond the room's own perimeter, in millimetres. */
const beyondPerimeter = (f: ReturnType<typeof roomFlashing>, kind: string, room: typeof freezer79) =>
  Math.round(
    (f.rows.find((r) => r.kind === kind)!.rmtr - (2 * (room.ext.w + room.ext.l)) / 1000) * 1000,
  );

t('a partition leaves two open ends, one at each of its corners', () => {
  // the chiller hands its fourth side to the freezer, so two of its wall ends
  // stop against a wall it does not own
  assert.deepEqual(junctions(chiller79), { butts: 0, opens: 2 });
  // the freezer owns all four of its walls, so every end is a corner
  assert.deepEqual(junctions(freezer79), { butts: 0, opens: 0 });
});

t('a plain rectangle closes an open end with inner flashing only', () => {
  const f = roomFlashing(chiller79); // 7380 x 3400 x 2745, one partition
  const H = chiller79.ext.h;
  assert.equal(beyondPerimeter(f, 'inner', chiller79), 2 * H, 'one room height per open end');
  assert.equal(beyondPerimeter(f, 'outer', chiller79), 0, 'a rectangle takes no outer here');
  assert.equal(beyondPerimeter(f, 'u', chiller79), 0, 'the U flashing is unchanged');
});

t('a shaped room closes its open ends on both faces', () => {
  const shaped = structuredClone(chiller79);
  // same bounding box, so the perimeter is untouched and only the junctions
  // differ: a notch out of one corner, and the top wall the neighbour's
  shaped.outline = notched(
    shaped.ext.w,
    shaped.ext.l,
    { corner: 'SE', w: 1600, d: 305, through: 'next' },
    { 0: { shared: true } },
  );
  assert.deepEqual(junctions(shaped), { butts: 1, opens: 2 });

  const f = roomFlashing(shaped);
  const H = shaped.ext.h;
  // the butt joint adds a height to both faces, and so does each open end
  assert.equal(beyondPerimeter(f, 'inner', shaped), 3 * H);
  assert.equal(beyondPerimeter(f, 'outer', shaped), 3 * H, 'a shaped room takes outer too');
  assert.equal(beyondPerimeter(f, 'u', shaped), 0);
});

t('the same room typed two ways gets the same flashing', () => {
  // the shape is read off the outline, never off the mode the form was in, so
  // a rectangle walked out wall by wall is still a rectangle
  const walked = structuredClone(chiller79);
  walked.outline = chain(
    toChain(chiller79.outline!.points),
    chiller79.outline!.edges,
    chiller79.outline!.vertices,
  );
  assert.equal(walked.outline.points.length, 4);
  assert.equal(roomFlashing(walked).totalRmtr, roomFlashing(chiller79).totalRmtr);
});

t('extra flashing is printed as typed, and marked apart from the rule rows', () => {
  const room = structuredClone(freezer79);
  room.extraFlashing = [
    { type: 'Gutter Flashing', material: 'GI', thickness: 0.6, width: 300, length: 7400 },
    { type: 'Hanging Flashing', material: 'PPGI', thickness: 0.5, width: 120, length: 2500 },
    // a row still being filled in never reaches the sheet
    { type: 'Flat Strip Flashing', material: 'PPGI', thickness: 0.4, width: 80, length: 0 },
  ];
  const f = roomFlashing(room);

  const typed = f.rows.filter((r) => r.source === 'typed');
  assert.equal(typed.length, 2, 'a zero length is not a flashing');
  assert.deepEqual(typed.map((r) => r.label), ['Gutter Flashing', 'Hanging Flashing']);
  // nothing is derived: the sheet, the width and the length go through as given
  assert.deepEqual(typed.map((r) => [r.material, r.thickness, r.width]), [
    ['GI', 0.6, 300],
    ['PPGI', 0.5, 120],
  ]);
  assert.equal(typed[0].rmtrText, '7.40');

  // the three the engine works out are untouched, and the total carries both
  const rule = f.rows.filter((r) => r.source === 'rule');
  assert.equal(rule.length, 3);
  assert.equal(
    Math.round(f.totalRmtr * 1000),
    Math.round(roomFlashing(freezer79).totalRmtr * 1000) + 7400 + 2500,
  );
});

t('the flashing total never reaches the panel totals', () => {
  const block = buildRoomBlock(freezer79, 40);
  const f = roomFlashing(freezer79);
  assert.ok(f.totalRmtr > 0);
  // flashing is a separate purchase — nothing about it is a panel or a skin
  assert.equal(
    block.rows.some((r) => r.desc.toLowerCase().includes('flashing')),
    false,
    'flashing must not appear as a BOQ row',
  );
});

t('the L cut default follows the wall thickness', () => {
  assert.equal(lCutDefault(120), true);
  assert.equal(lCutDefault(60), true);
  assert.equal(lCutDefault(50), false, '50 is not "more than 50"');
  assert.equal(lCutDefault(40), false);
});

t('turning the L cut off un-sets-back every inner skin and the ceiling', () => {
  const H = freezer79.ext.h;
  const inner = (rows: ReturnType<typeof buildRoomBlock>['rows'], kind: string) =>
    rows.find((r) => r.desc.includes(kind) && r.desc.includes('(Inner)'))!;

  // 100mm walls, so the cut is fitted unless the room says otherwise
  const on = buildRoomBlock(freezer79, 40).rows;
  assert.equal(inner(on, 'Wall Panel').blankL, H - freezer79.wallTh);

  const cutless = structuredClone(freezer79);
  cutless.lCut = false;
  const off = buildRoomBlock(cutless, 40).rows;

  assert.equal(inner(off, 'Wall Panel').blankL, H, 'inner skin runs the full height');
  assert.equal(
    inner(off, 'Corner Panel').panelW,
    off.find((r) => r.desc === 'Corner Panel (Outer)')!.panelW,
    'the corner inner matches its outer',
  );
  // no rebate for the ceiling to sit in, so it runs the full external size
  assert.equal(layoutRoom(cutless).ceiling.w, cutless.ext.w);
  assert.equal(layoutRoom(cutless).ceiling.l, cutless.ext.l);
});

t('a panelised floor can run the other way, and still covers the same area', () => {
  const turnedSpec = structuredClone(freezer79);
  turnedSpec.floor.splitAxis = 'l';

  const floorsOf = (room: typeof freezer79) =>
    buildRoomBlock(room, 40).rows.filter((r) => r.desc.startsWith('Bottom PPGI'));
  const across = floorsOf(freezer79);
  const turned = floorsOf(turnedSpec);

  // the floor is 4370 x 3200 internal. Across the width it splits 1220 x 3 +
  // 710 on a 3200 long panel; along the length, 1220 x 2 + 760 on a 4370 one.
  assert.deepEqual(across.map((r) => [r.panelW, r.panelQty]), [[1220, 3], [710, 1]]);
  assert.deepEqual(turned.map((r) => [r.panelW, r.panelQty]), [[1220, 2], [760, 1]]);
  assert.equal(turned[0].panelL, 4370, 'the panel length is now the width');

  // the same slab of floor either way round — only the cuts move
  const areaOf = (rows: typeof across) =>
    round2(rows.reduce((n, r) => n + (r.areaSqmt ?? 0), 0));
  assert.equal(areaOf(turned), areaOf(across));
});

t('two walls in different sheets become two BOQ rows, same totals', () => {
  const room = structuredClone(HI_15191.rooms[0]);
  const before = buildRoomBlock(room, 40);

  room.walls.find((w) => w.id === 'S')!.skin = {
    outer: { material: 'SS', thickness: 0.5 },
    inner: { material: 'PPGI', thickness: 0.4 },
  };
  const after = buildRoomBlock(room, 40);

  assert.ok(after.rows.length > before.rows.length, 'the SS wall splits off its own rows');
  assert.ok(
    after.rows.some((r) => r.skin === 'SS 0.5'),
    'the SS sheet must be printed on its row',
  );
  // splitting a row moves no quantity
  assert.equal(after.totals.panelQty, before.totals.panelQty);
  assert.equal(after.totals.ppgiQty, before.totals.ppgiQty);
  assert.equal(round2(after.totals.chemWeight), round2(before.totals.chemWeight));
});

t('everything defaults to PPGI 0.4, which is what the sheets print', () => {
  const b = buildRoomBlock(HI_15191.rooms[0], 40);
  const skins = new Set(b.rows.filter((r) => r.ppgiQty).map((r) => r.skin));
  assert.deepEqual([...skins], ['PPGI 0.4']);
});

t('a puf slab floor carries no ply and no blank size', () => {
  const b = buildRoomBlock(HI_15191.rooms[0], 40);
  const slab = b.rows[0];
  assert.equal(b.totals.plyQty, 0);
  assert.equal(slab.blankW, undefined);
});

t('every floor is the clear area inside the walls, slab or panelised', () => {
  // A wall never stands on the floor, so 120mm comes off each own end. The
  // sheet prints this slab 3050 x 4575 — its own envelope — and that
  // disagreement is recorded in hi-15191.expected.ts rather than followed.
  const freezer = HI_15191.rooms[0];
  const slab = buildRoomBlock(freezer, 40).rows[0];
  assert.equal(slab.panelW, freezer.ext.w - 2 * freezer.wallTh);
  assert.equal(slab.panelL, freezer.ext.l - 2 * freezer.wallTh);

  // the panelised floors were already internal and are unchanged
  assert.equal(layoutRoom(freezer79).floor.panelLength, 3200);
});

console.log('\n  engine sensitivity — inputs must actually move the output\n');

const base = buildRoomBlock(HI_15191.rooms[0], 40);

t('corner leg 300 -> 250 changes both corner skins', () => {
  const r = structuredClone(HI_15191.rooms[0]);
  r.cornerLeg = 250;
  const b = buildRoomBlock(r, 40);
  const outer = b.rows.find((x) => x.desc === 'Corner Panel (Outer)');
  const inner = b.rows.find((x) => x.desc === 'Corner Panel (Inner)');
  assert.equal(outer?.panelW, 500, 'outer should be 2 x leg');
  assert.equal(inner?.panelW, 500 - 240 + 5, 'inner should be outer - 2*th + 5');
});

/*
 * A corner of its own size. The shop said on 21 August 2026 that a room's
 * corners are not all the same, so the leg is stated per junction and the
 * room's `cornerLeg` covers the ones that say nothing.
 */
const cornerRoom = (vertices: Record<number, { leg: Mm }> = {}) => {
  const outline = {
    points: [
      [0, 0],
      [6000, 0],
      [6000, 4000],
      [0, 4000],
    ] as [number, number][],
    vertices,
  };
  return {
    ...structuredClone(HI_15191.rooms[0]),
    ext: { w: 6000, l: 4000, h: 2590 },
    cornerLeg: 300,
    outline,
    walls: compileWalls(outline),
    ceiling: { wEnds: ['own', 'own'], lEnds: ['own', 'own'], splitAxis: 'l' },
  } as RoomSpec;
};

t('a vertex states one leg and both walls meeting there are handed it', () => {
  // a corner panel is one piece; two walls being told different figures for it
  // would print a size the drawing does not show
  const walls = compileWalls({
    points: [
      [0, 0],
      [6000, 0],
      [6000, 4000],
      [0, 4000],
    ],
    vertices: { 1: { leg: 450 } },
  });
  assert.equal(walls[0].cornerEndLeg, 450, 'the wall arriving at vertex 1');
  assert.equal(walls[1].cornerStartLeg, 450, 'the wall leaving vertex 1');
  assert.equal(walls[2].cornerStartLeg, undefined, 'an unstated corner takes the room figure');
});

t('a corner of its own size comes off its two walls and nothing else', () => {
  const L = layoutRoom(cornerRoom({ 1: { leg: 450 }, 2: { leg: 450 } }));
  const run = (id: string) => L.wallRuns.find((r) => r.wallId === id)!.clearRun;
  assert.equal(run('E0'), 6000 - 300 - 450, 'one room leg and one stated leg');
  assert.equal(run('E1'), 4000 - 450 - 450, 'both ends stated');
  assert.equal(run('E3'), 4000 - 300 - 300, 'neither end stated');
  assert.deepEqual(L.cornerLegs, [450, 450, 300, 300], 'four corners, widest first');
  assert.equal(L.cornerCount, 4, 'a leg per corner must not change how many there are');
});

t('corners of two sizes print as two rows, not one with a quantity', () => {
  const rows = buildRoomBlock(cornerRoom({ 1: { leg: 450 }, 2: { leg: 450 } }), 40).rows.filter(
    (r) => r.desc === 'Corner Panel (Outer)',
  );
  assert.equal(rows.length, 2, 'two sizes cannot share one row');
  assert.deepEqual(
    rows.map((r) => [r.panelW, r.panelQty]),
    [
      [900, 2],
      [600, 2],
    ],
    'each row is 2 x its own leg, widest first',
  );
});

t('corners all one size still print as one row, exactly as before', () => {
  // the whole of the guarantee that no verified sheet moved: the per-corner
  // leg is a statement, and a room that makes none is the room it always was
  const rows = buildRoomBlock(cornerRoom(), 40).rows.filter(
    (r) => r.desc === 'Corner Panel (Outer)',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].panelW, 600);
  assert.equal(rows[0].panelQty, 4);
});

t('two walls claiming different legs for one corner is said, not halved', () => {
  // only reachable from a job file that writes `walls` itself — the form
  // writes both ends from the one vertex — and a fraction of a panel is not a
  // thing that can be printed
  const room = cornerRoom();
  room.walls[0].cornerEndLeg = 450;
  assert.throws(() => layoutRoom(room), /is claimed by 1 wall end/);
});

/*
 * A room taken without a ceiling, or without a floor, or without either — the
 * shop, 21 August 2026. Nothing about the walls moves either way: they do not
 * stand on the floor and they do not hang from the ceiling.
 */
const without = (what: { ceiling?: false; floor?: false }) => {
  const r = structuredClone(HI_15191.rooms[0]);
  if (what.ceiling === false) r.ceiling.fitted = false;
  if (what.floor === false) r.floor.fitted = false;
  return buildRoomBlock(r, 40);
};
const descs = (b: ReturnType<typeof buildRoomBlock>) => b.rows.map((x) => x.desc);

t('saying nothing about a ceiling or a floor still builds both', () => {
  // the whole of the guarantee that no job written before this moved
  const b = without({});
  assert.equal(b.totals.panelQty, base.totals.panelQty);
  assert.ok(descs(b).includes('Roof Panel'), 'the roof is still priced');
  assert.ok(descs(b).some((d) => d.startsWith('Puf Slab')), 'the floor is still priced');
});

t('no ceiling drops the roof panels and touches nothing else', () => {
  const b = without({ ceiling: false });
  assert.equal(descs(b).includes('Roof Panel'), false, 'a roof nobody bought is priced');
  assert.equal(b.totals.panelQty, base.totals.panelQty - 4, 'four roof panels');
  assert.equal(b.totals.ppgiQty, base.totals.ppgiQty - 8, 'two skins each');
  assert.deepEqual(
    b.rows.filter((x) => x.desc.startsWith('Wall Panels')),
    base.rows.filter((x) => x.desc.startsWith('Wall Panels')),
    'the walls must not move',
  );
});

t('no floor drops the slab and touches nothing else', () => {
  const b = without({ floor: false });
  assert.equal(descs(b).some((d) => d.startsWith('Puf Slab')), false);
  assert.equal(b.totals.panelQty, base.totals.panelQty - 1, 'one slab');
  assert.equal(b.totals.ppgiQty, base.totals.ppgiQty, 'a puf slab carries no PPGI');
  assert.deepEqual(
    b.rows.filter((x) => x.desc.startsWith('Corner Panel')),
    base.rows.filter((x) => x.desc.startsWith('Corner Panel')),
    'the corners must not move',
  );
});

t('neither one leaves a room that is only its walls', () => {
  const b = without({ ceiling: false, floor: false });
  assert.equal(b.totals.panelQty, base.totals.panelQty - 5);
  assert.equal(
    descs(b).some((d) => d === 'Roof Panel' || d.startsWith('Puf Slab')),
    false,
  );
});

t('no ceiling does not quietly take the L cut with it', () => {
  /*
   * The ceiling thickness is also the depth of the L cut, so the walls' inner
   * skins go on being shortened by it. Deciding otherwise is the estimator's,
   * through the L cut tick — a tool that unticks the box next to the one you
   * clicked is a tool nobody can check.
   */
  const b = without({ ceiling: false });
  const inner = (x: { desc: string }) => x.desc === 'Wall Panels (Inner)';
  assert.deepEqual(b.rows.filter(inner), base.rows.filter(inner));
});

t('density 40 -> 42 raises chemical weight by exactly 5%', () => {
  const b = buildRoomBlock(HI_15191.rooms[0], 42);
  assert.equal(round2(b.totals.chemWeight), round2(base.totals.chemWeight * 1.05));
  assert.equal(round2(b.totals.areaSqmt), round2(base.totals.areaSqmt), 'area must not move');
});

t('removing the door gives back the 8th 1180 wall panel', () => {
  const r = structuredClone(HI_15191.rooms[0]);
  delete r.walls[0].door;
  const b = buildRoomBlock(r, 40);
  const w1180 = b.rows.find((x) => x.desc === 'Wall Panels (Outer)' && x.panelW === 1180);
  assert.equal(w1180?.panelQty, 8);
  assert.equal(base.rows.find((x) => x.desc === 'Wall Panels (Outer)' && x.panelW === 1180)?.panelQty, 7);
});

t('an unknown wall thickness fails loudly instead of guessing', () => {
  const r = structuredClone(HI_15191.rooms[0]);
  r.wallTh = 80;
  assert.throws(() => buildRoomBlock(r, 40), /No door blank preset for 80mm/);
});

console.log(`\n  ${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}\n`);
