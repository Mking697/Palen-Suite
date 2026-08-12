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
  assert.equal(slab.panelW, 3050, 'puf slab uses the external footprint');
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
