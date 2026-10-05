/**
 * Drawing upload — what the form is set to from the printed figures.
 * Run:  node core/verify/vision.test.ts
 *
 * The model's reading is a network call and is not tested here; what is tested
 * is everything decided *after* it, which is deterministic: the door's wall and
 * position, which corners are butt joints, which wall runs through, and the
 * warnings when the printed figures do not add up. The fixture is HI-12378's
 * WALL PANEL LAYOUT, transcribed from the drawing (CHILLER ROOM, 2082 x 1143).
 */

import assert from 'node:assert/strict';
import { parseExtraction } from '../../server/vision.ts';

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const HI_12378 = JSON.stringify({
  jobNo: 'HI-12378',
  room: {
    name: 'CHILLER ROOM',
    w: 2082,
    l: 1143,
    h: 2440,
    wallTh: 60,
    ceilTh: 60,
    floor: { kind: 'pufSlab', th: 60 },
    ceiling: { w: 2022, l: 1083 },
    door: { wall: 'bottom', clearW: 520, clearH: 1980, moduleW: 810, hand: 'RHS', skinOuter: 'SS', skinInner: 'SS' },
    walls: {
      top: [{ kind: 'corner', mm: 300 }, { kind: 'panel', mm: 1180 }, { kind: 'panel', mm: 302 }, { kind: 'corner', mm: 300 }],
      right: [{ kind: 'corner', mm: 300 }, { kind: 'panel', mm: 543 }, { kind: 'corner', mm: 300 }],
      bottom: [{ kind: 'door', mm: 810 }, { kind: 'panel', mm: 912 }, { kind: 'corner', mm: 300 }],
      left: [{ kind: 'corner', mm: 300 }, { kind: 'panel', mm: 843 }],
    },
    buttJoints: ['SW'],
  },
  notes: '',
});

console.log('\n  drawing upload — HI-12378\n');

const f = parseExtraction(HI_12378).form!;

t('the printed figures add up; the only thing to confirm is the SS thickness, which no drawing prints', () => {
  assert.equal(f.warnings.length, 1);
  assert.match(f.warnings[0], /SS.*thickness is not printed/);
});

t('the door is on the bottom wall (edge 2), as drawn — not defaulted to the top', () => {
  assert.equal(f.door!.edge, 2);
  assert.equal(f.door!.hand, 'RHS');
  assert.equal(f.door!.moduleW, 810);
});

t('the door sits at the end of the bottom wall: 912 of panel before it, in the wall\'s own direction', () => {
  // the bottom edge runs right to left, so the 912 panel comes first
  assert.equal(f.door!.fromLeft, 912);
});

t('the door opens outward and is stainless both sides', () => {
  assert.equal(f.door!.swing, 'out');
  assert.equal(f.door!.skinOuter!.material, 'SS');
  assert.equal(f.door!.skinInner!.material, 'SS');
  assert.equal(f.door!.label, 'Flush Door SS');
});

t('the butt joint is bottom-left: no corner panel there, the left wall runs through', () => {
  assert.deepEqual(f.corners, [true, true, true, false]);
  // vertex 3 sits between the bottom wall (prev, which butts: 2022 = 2082 - 60) and the left (next, full 1143)
  assert.equal(f.through[3], 'next');
});

t('every corner is the room\'s 300, so no corner states a leg of its own', () => {
  assert.deepEqual(f.cornerLegs, ['', '', '', '']);
});

t('the floor is the puf slab at 60, not the 100 the form starts with', () => {
  assert.equal(f.floorKind, 'pufSlab');
  assert.equal(f.floorTh, 60);
});

t('what the drawing prints is kept to check the BOQ against, panel by panel', () => {
  assert.deepEqual([...f.expected!.wallPanels].sort((a, b) => a - b), [302, 543, 843, 912, 1180]);
  assert.deepEqual(f.expected!.cornerPanels, [600, 600, 600]);
  assert.deepEqual(f.expected!.roof, [2022, 1083]);
});

t('a misread figure is named, never absorbed', () => {
  const bad = JSON.parse(HI_12378);
  bad.room.walls.right[1].mm = 534; // 300 + 534 + 300 = 1134, not 1143
  const w = parseExtraction(JSON.stringify(bad)).form!.warnings.filter((x) => !/thickness/.test(x));
  assert.equal(w.length, 1);
  assert.match(w[0], /right.*1134.*1143/);
});

t('no chains read, no guessing: defaults stay and it says so', () => {
  const none = JSON.parse(HI_12378);
  none.room.walls = null;
  const g = parseExtraction(JSON.stringify(none)).form!;
  assert.equal(g.door, null);
  assert.deepEqual(g.corners, [true, true, true, true]);
  assert.match(g.warnings[0], /not read/);
});

t('out-of-range and malformed figures are dropped, not trusted', () => {
  const r = parseExtraction('```json\n{"room":{"w":999999,"l":1143,"walls":{"top":[{"kind":"panel","mm":-5},{"kind":"x","mm":300}]}}}\n```');
  assert.equal(r.room.w, null);
  assert.equal(r.room.l, 1143);
  assert.deepEqual(r.room.walls!.top, []);
});

console.log(`\n  ${n} passed\n`);
