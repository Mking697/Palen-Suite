/**
 * Drawing upload — what the form is set to from the printed figures.
 * Run:  node core/verify/vision.test.ts
 *
 * The model's reading is a network call and is not tested here; what is tested
 * is everything decided *after* it, which is deterministic: each room's door
 * wall and position, which corners are butt joints, which walls are open,
 * which wall runs through, where the printed panel widths differ from the shop
 * rule, and the warnings when the printed figures do not add up.
 *
 * Two fixtures, both transcribed from the drawings and never from a BOQ:
 *   HI-12378  one room, CHILLER ROOM 2082 x 1143 (the original single-room shape)
 *   HI-15420  two chiller rooms on one sheet, one with an open wall
 */

import assert from 'node:assert/strict';
import { HI_15420 } from './hi-15420.reading.ts';
import { parseExtraction, type DerivedForm, type ExtractedRoom } from '../../server/vision.ts';
import { buildRoomBlock } from '../boq.ts';
import { layoutRoom } from '../layout.ts';
import { compileWalls, rect } from '../plan.ts';
import { wallSegments } from '../draw/geom.ts';
import type { EdgeOverride, RoomSpec, VertexOverride } from '../types.ts';

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

/** The room the calculator builds from a derived form — the way the form's own `roomSpec` does. */
function specFromForm(room: ExtractedRoom, f: DerivedForm, withPanels = true): RoomSpec {
  const w = room.w!;
  const l = room.l!;
  const edges: Record<number, EdgeOverride> = {};
  for (let i = 0; i < 4; i++) {
    if (f.open[i]) {
      edges[i] = { shared: true };
      continue;
    }
    const o: EdgeOverride = { id: `E${i}`, skin: { outer: f.wallSkin.outer!, inner: f.wallSkin.inner! } };
    if (withPanels && f.panels[i]) o.panels = f.panels[i]!;
    const d = f.door;
    if (d && d.edge === i) {
      o.door = {
        label: d.label,
        hand: d.hand ?? undefined,
        swing: d.swing,
        clearW: d.clearW!,
        clearH: d.clearH!,
        moduleW: d.moduleW!,
        frame: Math.round((d.moduleW! - d.clearW!) / 2),
        ...(d.fromLeft != null ? { fromLeft: d.fromLeft } : {}),
        skin: { outer: d.skinOuter!, inner: d.skinInner! },
      };
    }
    edges[i] = o;
  }
  const vertices: Record<number, VertexOverride> = {};
  for (let v = 0; v < 4; v++) {
    if (!f.corners[v]) vertices[v] = { corner: false, through: f.through[v] };
    const leg = f.cornerLegs[v];
    if (f.corners[v] && leg !== '') vertices[v] = { leg };
  }
  const outline = { ...rect(w, l, edges), vertices };
  const own = (i: number) => (f.open[i] ? ('shared' as const) : ('own' as const));
  return {
    name: room.name!,
    ext: { w, l, h: room.h! },
    wallTh: room.wallTh!,
    ceilTh: room.ceilTh!,
    floor: { kind: 'pufSlab', th: f.floorTh!, desc: 'Puf Slab With Single Layer Tarfelt.' },
    ceiling: { splitAxis: 'l', wEnds: [own(3), own(1)], lEnds: [own(0), own(2)] },
    module: 1180,
    cornerLeg: 300,
    minPanelWidth: 150,
    maxSplitPieces: 2,
    outline,
    walls: compileWalls(outline),
  };
}

/** Every panel of a row family, expanded by quantity and sorted. */
const expand = (rows: Array<{ desc: string; panelW?: number; panelQty?: number }>, prefix: string) =>
  rows
    .filter((r) => r.desc.startsWith(prefix))
    .flatMap((r) => Array<number>(r.panelQty ?? 0).fill(r.panelW!))
    .sort((a, b) => a - b);
const asc = (a: number[]) => [...a].sort((x, y) => x - y);

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
    door: { wall: 'bottom', clearW: 520, clearH: 1980, moduleW: 810, hand: 'RHS', skinOuter: 'SS', skinInner: 'SS', chqHeight: 600, lift: 110 },
    walls: {
      top: [{ kind: 'corner', mm: 300 }, { kind: 'panel', mm: 1180 }, { kind: 'panel', mm: 302 }, { kind: 'corner', mm: 300 }],
      right: [{ kind: 'corner', mm: 300 }, { kind: 'panel', mm: 543 }, { kind: 'corner', mm: 300 }],
      bottom: [{ kind: 'door', mm: 810 }, { kind: 'panel', mm: 912 }, { kind: 'corner', mm: 300 }],
      left: [{ kind: 'corner', mm: 300 }, { kind: 'panel', mm: 843 }],
    },
    buttJoints: ['SW'],
    wallSheets: { outer: 'PPGI', inner: 'SS' },
  },
  notes: '',
});

console.log('\n  drawing upload — HI-12378 (one room, the original single "room" answer)\n');

const one = parseExtraction(HI_12378);
const f = one.rooms[0].form!;

t('a single "room" answer is wrapped as a one-room sheet', () => {
  assert.equal(one.rooms.length, 1);
  assert.equal(one.jobNo, 'HI-12378');
  assert.deepEqual(one.rooms[0].room.openWalls, []);
});

t('the same room under the new "rooms" shape reads identically', () => {
  const raw = JSON.parse(HI_12378);
  const wrapped = parseExtraction(JSON.stringify({ jobNo: raw.jobNo, rooms: [raw.room], notes: '' }));
  assert.deepEqual(wrapped, one);
});

t('the printed figures add up; what is left to confirm is the SS thickness and the corner/roof sheets', () => {
  assert.equal(f.warnings.length, 2);
  assert.ok(f.warnings.some((x) => /SS sheet: thickness is not printed/.test(x)));
  assert.ok(f.warnings.some((x) => /corner and roof panels take the same sheets/.test(x)));
});

t('walls are PPGI outside and SS inside, as the plan marks them; the door is SS with its CHQ sheet and lift', () => {
  assert.equal(f.wallSkin.outer!.material, 'PPGI');
  assert.equal(f.wallSkin.inner!.material, 'SS');
  assert.equal(f.door!.chqHeight, 600);
  assert.equal(f.door!.lift, 110);
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

t('the shop rule already gives every printed wall, so nothing is applied as exact widths and no wall is open', () => {
  assert.deepEqual(f.panels, [null, null, null, null]);
  assert.deepEqual(f.open, [false, false, false, false]);
});

t('what the drawing prints is kept to check the BOQ against, panel by panel', () => {
  assert.deepEqual([...f.expected!.wallPanels].sort((a, b) => a - b), [302, 543, 843, 912, 1180]);
  assert.deepEqual(f.expected!.cornerPanels, [600, 600, 600]);
  assert.deepEqual(f.expected!.roof, [2022, 1083]);
});

t('a misread figure is named, never absorbed', () => {
  const bad = JSON.parse(HI_12378);
  bad.room.walls.right[1].mm = 534; // 300 + 534 + 300 = 1134, not 1143
  const w = parseExtraction(JSON.stringify(bad)).rooms[0].form!.warnings.filter((x) => /add to/.test(x));
  assert.equal(w.length, 1);
  assert.match(w[0], /right.*1134.*1143/);
});

t('no chains read, no guessing: defaults stay and it says so', () => {
  const none = JSON.parse(HI_12378);
  none.room.walls = null;
  const g = parseExtraction(JSON.stringify(none)).rooms[0].form!;
  assert.equal(g.door, null);
  assert.deepEqual(g.corners, [true, true, true, true]);
  assert.deepEqual(g.panels, [null, null, null, null]);
  assert.match(g.warnings[0], /not read/);
});

t('out-of-range and malformed figures are dropped, not trusted', () => {
  const r = parseExtraction('```json\n{"room":{"w":999999,"l":1143,"walls":{"top":[{"kind":"panel","mm":-5},{"kind":"x","mm":300}]}}}\n```').rooms[0];
  assert.equal(r.room.w, null);
  assert.equal(r.room.l, 1143);
  assert.deepEqual(r.room.walls!.top, []);
});

t('an answer with no room in it is refused rather than turned into an empty form', () => {
  assert.throws(() => parseExtraction('{"jobNo":"HI-1","rooms":[],"notes":""}'), /No room could be read/);
  assert.throws(() => parseExtraction('not json'), /Could not read a dimension/);
});

t('corners that are all one figure other than 300 state it, instead of silently building 300s', () => {
  const r = JSON.parse(HI_12378);
  const c = (mm: number) => ({ kind: 'corner', mm });
  r.room.buttJoints = [];
  r.room.door = null;
  r.room.walls = {
    top: [c(250), { kind: 'panel', mm: 1582 }, c(250)],
    right: [c(250), { kind: 'panel', mm: 643 }, c(250)],
    bottom: [c(250), { kind: 'panel', mm: 1582 }, c(250)],
    left: [c(250), { kind: 'panel', mm: 643 }, c(250)],
  };
  const g = parseExtraction(JSON.stringify(r)).rooms[0].form!;
  assert.deepEqual(g.cornerLegs, [250, 250, 250, 250]);
  assert.deepEqual(g.expected!.cornerPanels, [500, 500, 500, 500]);
});

/* HI-15420 — two chiller rooms on one sheet: the fixture is shared with web.test.ts. */

console.log('\n  drawing upload — HI-15420 (two rooms on one sheet)\n');

const two = parseExtraction(HI_15420);
const [r1, r2] = two.rooms;
const f1 = r1.form!;
const f2 = r2.form!;

t('both rooms are read, in order, with the sheet\'s notes carried through', () => {
  assert.equal(two.jobNo, 'HI-15420');
  assert.equal(two.rooms.length, 2);
  assert.deepEqual(two.rooms.map((x) => x.room.name), ['CHILLER ROOM.1', 'CHILLER ROOM.2']);
  assert.match(two.notes, /hatched/);
  assert.deepEqual(r1.room.openWalls, []);
  assert.deepEqual(r2.room.openWalls, ['top']);
});

t('each room has its door on the bottom wall: 900 clear in a 1180 module, RHS, opening outward, lift 110', () => {
  for (const f of [f1, f2]) {
    assert.equal(f.door!.edge, 2);
    assert.equal(f.door!.moduleW, 1180);
    assert.equal(f.door!.clearW, 900);
    assert.equal(f.door!.hand, 'RHS');
    assert.equal(f.door!.swing, 'out');
    assert.equal(f.door!.lift, 110);
    assert.equal(f.door!.chqHeight, null);
  }
  assert.equal(f1.door!.clearH, 1900);
  assert.equal(f2.door!.clearH, 1750);
});

t('the door is PP outside and SS inside in both rooms, the same as the walls, and is labelled so', () => {
  for (const f of [f1, f2]) {
    assert.equal(f.door!.skinOuter!.material, 'PPGI');
    assert.equal(f.door!.skinInner!.material, 'SS');
    assert.equal(f.door!.label, 'Flush Door PP/SS');
    assert.equal(f.wallSkin.outer!.material, 'PPGI');
    assert.equal(f.wallSkin.inner!.material, 'SS');
    assert.equal(f.floorKind, 'pufSlab');
    assert.equal(f.floorTh, 60);
  }
});

t('the door position is how far along the bottom wall\'s own run it sits: 1090 in room 1, at the start in room 2', () => {
  // the bottom edge runs right to left; room 1 prints 625 | 625 | door | 1090, so 1090 comes first
  assert.equal(f1.door!.fromLeft, 1090);
  // room 2 prints 500 | 1180 | door against the right-hand corner, so the door is first
  assert.equal(f2.door!.fromLeft, 0);
});

t('only room 2\'s top wall is open', () => {
  assert.deepEqual(f1.open, [false, false, false, false]);
  assert.deepEqual(f2.open, [true, false, false, false]);
});

t('room 1: the drawing\'s own bottom wall (625 | 625 | door | 1090) is carried as exact widths; the rule would give 1180 + 1160', () => {
  // along the edge's own direction (right to left), door excluded
  assert.deepEqual(f1.panels[2], [1090, 625, 625]);
  const bottom = f1.warnings.find((w) => /^Wall bottom/.test(w))!;
  assert.match(bottom, /625 \+ 625 \+ door 1180 \+ 1090/);
  assert.match(bottom, /shop rule alone would split the same run into 1160 \+ 1180/);
  assert.match(bottom, /Exact widths/);
});

t('walls the rule fills with the same panels in the same order carry no override', () => {
  assert.equal(f1.panels[1], null); // right: 1180 x3 + 580, top to bottom
  assert.equal(f2.panels[2], null); // bottom: door, 1180, 500
  assert.equal(f2.panels[3], null); // left: 1180 x3 + 300 bottom to top
  assert.equal(f2.panels[0], null); // the open wall has none
});

t('walls with the rule\'s panels but the odd one at the other end are carried in the printed order, and say so', () => {
  assert.deepEqual(f1.panels[0], [1160, 1180, 1180]);
  assert.deepEqual(f1.panels[3], [580, 1180, 1180, 1180]);
  assert.deepEqual(f2.panels[1], [300, 1180, 1180, 1180]);
  const top = f1.warnings.find((w) => /^Wall top/.test(w))!;
  assert.match(top, /same panels/);
  assert.match(top, /other end/);
});

t('corners: four in room 1, two in room 2 — no corner panel against the open wall', () => {
  assert.deepEqual(f1.expected!.cornerPanels, [600, 600, 600, 600]);
  assert.deepEqual(f2.expected!.cornerPanels, [600, 600]);
  assert.deepEqual(f1.cornerLegs, ['', '', '', '']);
  assert.deepEqual(f2.cornerLegs, ['', '', '', '']);
});

t('what the drawing prints is kept per room to check the BOQ against', () => {
  assert.deepEqual(asc(f1.expected!.wallPanels), asc([1160, 1180, 1180, 1180, 1180, 1180, 580, 1090, 625, 625, 580, 1180, 1180, 1180]));
  assert.deepEqual(asc(f2.expected!.wallPanels), asc([300, 1180, 1180, 1180, 1180, 500, 1180, 1180, 1180, 300]));
  assert.deepEqual(f1.expected!.roof, [4060, 4660]);
  assert.deepEqual(f2.expected!.roof, [3400, 4110]);
});

t('open wall: warned as an assumption, citing the ceiling that backs it, and the nobody-builds-it consequence', () => {
  const open = f2.warnings.find((w) => /is read as open/.test(w))!;
  assert.match(open, /Wall top/);
  assert.match(open, /3400 x 4110 agrees/);
  assert.match(open, /3400 x 4080/);
  assert.match(open, /nobody's BOQ/);
  assert.equal(f1.warnings.some((w) => /is read as open/.test(w)), false);
});

t('the SS thickness and the PP/SS door-face order are flagged as assumptions in both rooms', () => {
  for (const f of [f1, f2]) {
    assert.ok(f.warnings.some((w) => /SS sheet: thickness is not printed, 0.5mm assumed/.test(w)));
    assert.ok(f.warnings.some((w) => /Door sheets: PP outside and SS inside is an assumption/.test(w)));
  }
});

t('a corner read beside the open wall is taken as a plain panel, said, and left out of the corner count', () => {
  const raw = JSON.parse(HI_15420);
  raw.rooms[1].walls.right[0] = { kind: 'corner', mm: 300 };
  raw.rooms[1].walls.left[0] = { kind: 'corner', mm: 300 };
  const g = parseExtraction(JSON.stringify(raw)).rooms[1].form!;
  assert.equal(g.warnings.filter((w) => /read as a corner/.test(w)).length, 2);
  assert.deepEqual(g.expected!.cornerPanels, [600, 600]);
  assert.deepEqual(asc(g.expected!.wallPanels), asc(f2.expected!.wallPanels));
  assert.deepEqual(g.panels, f2.panels);
});

t('a chain handed in for an open wall is ignored, not built from', () => {
  const raw = JSON.parse(HI_15420);
  raw.rooms[1].walls.top = [{ kind: 'panel', mm: 1180 }];
  const g = parseExtraction(JSON.stringify(raw)).rooms[1].form!;
  assert.ok(g.warnings.some((w) => /Wall top is marked open but a chain/.test(w)));
  assert.deepEqual(asc(g.expected!.wallPanels), asc(f2.expected!.wallPanels));
});

t('a door drawn on an open wall is not placed', () => {
  const raw = JSON.parse(HI_15420);
  raw.rooms[1].door.wall = 'top';
  const g = parseExtraction(JSON.stringify(raw)).rooms[1].form!;
  assert.equal(g.door, null);
  assert.ok(g.warnings.some((w) => /marked open .* the door is not placed/.test(w)));
});

t('printed widths that still close on the engine run are applied, wherever they put the odd panel', () => {
  const raw = JSON.parse(HI_15420);
  raw.rooms[0].walls.bottom[1].mm = 630; // 630 + 625 + 1085 still fills the 2340 run
  raw.rooms[0].walls.bottom[4].mm = 1085;
  const g = parseExtraction(JSON.stringify(raw)).rooms[0].form!;
  assert.deepEqual(g.panels[2], [1085, 625, 630]);
});

t('printed widths that pass the wall-length check but do not fill the engine run are not applied; the rule stands and it says so', () => {
  const raw = JSON.parse(HI_15420);
  // 4060 is one wall thickness short of 4120, which the length check allows for a butt end,
  // but this wall has corner panels at both ends, so its run is 2340 and these panels fill 2280
  raw.rooms[0].walls.bottom[4].mm = 1030;
  const g = parseExtraction(JSON.stringify(raw)).rooms[0].form!;
  assert.equal(g.panels[2], null);
  const w = g.warnings.find((x) => /^Wall bottom: the printed panels add to 2280/.test(x))!;
  assert.match(w, /run the engine has for this wall is 2340/);
});


console.log('\n  drawing upload — HI-15420 through the engine and the drawing\n');

const spec1 = specFromForm(r1.room, f1);
const spec2 = specFromForm(r2.room, f2);
const b1 = buildRoomBlock(spec1, 40);
const b2 = buildRoomBlock(spec2, 40);

t('room 1: the engine wall panels, corners and ceiling are the ones the drawing prints', () => {
  assert.deepEqual(expand(b1.rows, 'Wall Panel (Outer)'), asc(f1.expected!.wallPanels));
  assert.deepEqual(expand(b1.rows, 'Corner Panel (Outer)'), asc(f1.expected!.cornerPanels));
  const roof = b1.rows.filter((r) => r.desc.startsWith('Roof Panel'));
  const span = roof.reduce((s, r) => s + r.panelW! * r.panelQty!, 0);
  // a multi-panel ceiling is never one panel: the overall size is the span and the panel length
  assert.deepEqual(asc([span, roof[0].panelL!]), asc(f1.expected!.roof!));
});

t('room 2: the same, with the open wall giving no panels and no corner at either of its ends', () => {
  assert.deepEqual(expand(b2.rows, 'Wall Panel (Outer)'), asc(f2.expected!.wallPanels));
  assert.deepEqual(expand(b2.rows, 'Corner Panel (Outer)'), asc(f2.expected!.cornerPanels));
  const roof = b2.rows.filter((r) => r.desc.startsWith('Roof Panel'));
  const span = roof.reduce((s, r) => s + r.panelW! * r.panelQty!, 0);
  assert.deepEqual(asc([span, roof[0].panelL!]), asc(f2.expected!.roof!));
});

t('without the override the engine would not give room 1 its bottom wall — the override is what carries the drawing', () => {
  const rule = buildRoomBlock(specFromForm(r1.room, f1, false), 40);
  assert.notDeepEqual(expand(rule.rows, 'Wall Panel (Outer)'), asc(f1.expected!.wallPanels));
});

t('each door is in the BOQ as the drawing gives it: module, clear opening, hand, and the PP outside / SS inside sheets', () => {
  for (const [b, clearH] of [[b1, 1900], [b2, 1750]] as const) {
    const inner = b.rows.find((r) => r.desc === 'Inner Sheet')!;
    const outer = b.rows.find((r) => r.desc === 'Outer Sheet')!;
    assert.equal(inner.panelW, 1180);
    assert.equal(inner.blankW, 900 + 102); // the 60mm preset
    assert.equal(inner.blankL, clearH + 125);
    assert.equal(outer.blankW, 900 + 112);
    assert.equal(outer.blankL, clearH + 102);
    assert.match(inner.skin!, /^SS/);
    assert.match(outer.skin!, /^PPGI/);
    const leaf = b.rows.find((r) => /^Flush Door/.test(r.desc))!;
    assert.equal(leaf.desc, 'Flush Door PP/SS (RHS)');
    assert.equal(leaf.panelW, 900);
    assert.equal(leaf.panelL, clearH);
  }
});

t('floors are the clear span inside the walls, which is what the drawing prints as its internal size', () => {
  const floor = (b: typeof b1) => b.rows.find((r) => r.desc.startsWith('Puf Slab'))!;
  assert.deepEqual([floor(b1).panelW, floor(b1).panelL], [4000, 4600]);
  assert.deepEqual([floor(b2).panelW, floor(b2).panelL], [3340, 4080]);
});

t('the drawing places room 1 bottom wall as printed: 625 | 625 | door 1180 | 1090, left to right', () => {
  const layout = layoutRoom(spec1);
  const wall = spec1.walls.find((x) => x.id === 'E2')!;
  const run = layout.wallRuns.find((x) => x.wallId === 'E2')!;
  const along = wallSegments(run, wall, spec1.module); // the edge runs right to left
  const label = (s: { door?: boolean; width: number }) => (s.door ? `door ${s.width}` : String(s.width));
  assert.deepEqual(along.map(label), ['1090', 'door 1180', '625', '625']);
  assert.deepEqual([...along].reverse().map(label), ['625', '625', 'door 1180', '1090']);
});

t('room 2 draws its door against the right-hand corner and its panels as printed: 500 | 1180 | door', () => {
  const layout = layoutRoom(spec2);
  const wall = spec2.walls.find((x) => x.id === 'E2')!;
  const run = layout.wallRuns.find((x) => x.wallId === 'E2')!;
  const along = wallSegments(run, wall, spec2.module);
  const label = (s: { door?: boolean; width: number }) => (s.door ? `door ${s.width}` : String(s.width));
  assert.deepEqual([...along].reverse().map(label), ['500', '1180', 'door 1180']);
});

/* figures the drawing does not print: named, never filled in quietly */

console.log('\n  drawing upload — figures not printed are named, never quietly defaulted\n');

const withRoom = (edit: (r: any) => void, which = 0) => {
  const raw = JSON.parse(HI_15420);
  edit(raw.rooms[which]);
  return parseExtraction(JSON.stringify(raw)).rooms[which];
};

t('a door with no module and none in the chain gets the form\'s 1180, so the printed panels still close on the run the browser builds', () => {
  // regression: moduleW stayed null, the prediction left the door out, the panels
  // override closed on the door-less run, and the browser then placed a default
  // 1180 door — the engine threw "explicit panels ... but the run is ..." and
  // /api/render answered 400
  const c = (kind: string, mm: number) => ({ kind, mm });
  const got = withRoom((r) => {
    r.door.moduleW = null;
    r.walls.bottom = [c('corner', 300), c('panel', 1000), c('panel', 1200), c('panel', 1320), c('corner', 300)];
  });
  const d = got.form!;
  assert.equal(d.door!.moduleW, 1180, 'the browser places 1180, so the form carries it');
  assert.ok(d.warnings.some((w) => /module.*was not read.*1180/.test(w)));
  // whatever is applied must build with that door in place
  const spec = specFromForm(got.room, d);
  assert.doesNotThrow(() => buildRoomBlock(spec, 40));
});

t('a figure the reading leaves null is named with the default the form will use', () => {
  const g = withRoom((r) => {
    r.h = null;
    r.ceilTh = null;
    r.floor = { kind: 'pufSlab', th: null };
  }).form!;
  assert.ok(g.warnings.some((w) => /wall height was not read.*2590/.test(w)));
  assert.ok(g.warnings.some((w) => /ceiling thickness was not read.*60mm/.test(w)));
  assert.ok(g.warnings.some((w) => /floor thickness was not read.*60mm/.test(w)));
  const none = parseExtraction(JSON.stringify({ rooms: [{}] })).rooms[0].form!;
  assert.ok(none.warnings.some((w) => /width \/ length was not read.*3050 x 4575/.test(w)));
  assert.ok(none.warnings.some((w) => /wall thickness was not read.*100mm/.test(w)));
});

t('a missing clear opening is named', () => {
  const g = withRoom((r) => {
    r.door.clearW = null;
    r.door.clearH = null;
  }).form!;
  assert.ok(g.warnings.some((w) => /clear opening was not fully read.*860 x 1980/.test(w)));
});

t('a door printed in a chain but not read as a door is said to be missing from the BOQ', () => {
  const g = withRoom((r) => {
    r.door = null;
  }).form!;
  assert.equal(g.door, null);
  assert.ok(g.warnings.some((w) => /door \(1180\) is printed in the bottom wall's chain but no door was placed/.test(w)));
  const wrongWall = withRoom((r) => {
    r.door.wall = null;
  }).form!;
  assert.ok(wrongWall.warnings.some((w) => /printed in the bottom wall's chain but no door was placed/.test(w)));
});

t('a wall thickness with no door blank preset is warned, not left to fail at the BOQ', () => {
  const g = withRoom((r) => {
    r.wallTh = 80;
  }).form!;
  assert.ok(g.warnings.some((w) => /80mm wall, which has no door blank preset/.test(w)));
  // the verified 60mm reading says nothing of the kind
  assert.ok(!f1.warnings.some((w) => /door blank preset/.test(w)));
});

t('a ceiling with an odd piece says the print\'s order was not read', () => {
  assert.ok(f2.warnings.some((w) => /Ceiling: the calculator lays the panels .* \(the odd piece last\)/.test(w)));
});

t('the corner and roof sheets are said to follow the wall sheets, not to stay PPGI', () => {
  assert.ok(f1.warnings.some((w) => /corner and roof panels take the same sheets/.test(w)));
  assert.ok(!f1.warnings.some((w) => /stay PPGI 0.4/.test(w)));
});

t('prose around the JSON, a bare room and a bare array of rooms are still read', () => {
  const body = JSON.stringify({ jobNo: 'HI-1', rooms: [JSON.parse(HI_15420).rooms[0]], notes: '' });
  assert.equal(parseExtraction(`Here is the reading:\n${body}\n\nNote: unsure about R2`).rooms.length, 1);
  assert.equal(parseExtraction(JSON.stringify(JSON.parse(HI_15420).rooms[0])).rooms.length, 1);
  assert.equal(parseExtraction(JSON.stringify(JSON.parse(HI_15420).rooms)).rooms.length, 2);
  // a legacy `room` next to an empty `rooms` is not lost
  assert.equal(parseExtraction(JSON.stringify({ rooms: [], room: JSON.parse(HI_15420).rooms[0] })).rooms.length, 1);
});

console.log(`\n  ${n} passed\n`);
