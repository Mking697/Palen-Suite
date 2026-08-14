/**
 * Ground truth transcribed by hand from the HI-15223 SHEET FABRICATION PDF.
 *
 * Two things about this sheet differ from the other three, and the engine
 * deliberately does not copy them — see the notes at the bottom of the block.
 */

import { row as r, type ExpectedBlock } from './expected.ts';

const ROOF_PPGI =
  'sheet prints 1 skin per roof panel; HI-15191, HI-15252 and HI-15279 all print 2';

/** Same disagreement as both HI-15191 blocks — see that file for the reasoning. */
const SLAB_UNDER_WALLS =
  'sheet sizes the slab to the external envelope; the floor sits inside the walls, ' +
  'so the rule takes the internal clear span';
const DOOR_PPGI =
  'sheet leaves this door-assembly PPGI cell blank; the other three sheets count it';

export const HI_15223_EXPECTED: ExpectedBlock[] = [
  {
    title: '60mm (Chiller Room)',
    rows: [
      r('Puf Slab with tarfelt', 2590, 3860, null, null, 1, null, 60, 23.99, 9.9974, {
        rule: { panelW: 2470, panelL: 3740, chemWeight: 22.17, areaSqmt: 9.2378 },
        note: SLAB_UNDER_WALLS,
      }),
      r('Roof Panel', 1180, 2530, 1220, 2530, 3, 3, 60, 21.49, 8.9562, { rule: { ppgiQty: 6 }, note: ROOF_PPGI }),
      r('Roof Panel', 260, 2530, 300, 2530, 1, 1, 60, 1.58, 0.6578, { rule: { ppgiQty: 2 }, note: ROOF_PPGI }),
      r('Wall Panel (Outer)', 1180, 2745, 1220, 2745, 5, 5, 60, 38.87, 16.1955),
      r('Wall Panel (Inner)', 1180, 2685, 1220, 2685, null, 5, 60, 0, 0),
      r('Wall Panel (Outer)', 1140, 2745, 1180, 2745, 1, 1, 60, 7.51, 3.1293),
      r('Wall Panel (Inner)', 1140, 2685, 1180, 2685, null, 1, 60, 0, 0),
      r('Wall Panel (Outer)', 895, 2745, 935, 2745, 1, 1, 60, 5.90, 2.456775),
      r('Wall Panel (Inner)', 895, 2685, 935, 2685, null, 1, 60, 0, 0),
      r('Wall Panel (Outer)', 810, 2745, 850, 2745, 1, 1, 60, 5.34, 2.22345),
      r('Wall Panel (Inner)', 810, 2685, 850, 2685, null, 1, 60, 0, 0),
      r('Wall Panel (Outer)', 365, 2745, 405, 2745, 1, 1, 60, 2.40, 1.001925),
      r('Wall Panel (Inner)', 365, 2685, 405, 2685, null, 1, 60, 0, 0),
      r('Wall Panel (Outer)', 360, 2745, 400, 2745, 1, 1, 60, 2.37, 0.9882),
      r('Wall Panel (Inner)', 360, 2685, 400, 2685, null, 1, 60, 0, 0),
      r('Wall Panel (Outer) Butt Joint', 930, 2745, 1030, 2745, 1, 1, 60, 6.13, 2.55285),
      r('Wall Panel (Inner)  Butt Joint', 880, 2685, 920, 2685, null, 1, 60, 0, 0),
      r('Corner Panel (Outer)', 600, 2745, 640, 2745, 2, 2, 60, 7.91, 3.294),
      r('Corner Panel (Inner)', 485, 2685, 525, 2685, null, 2, 60, 0, 0),
      r('Inner Sheet', 1180, 2745, 962, 2105, 1, null, 60, 7.77, 3.2391, { rule: { ppgiQty: 1 }, note: DOOR_PPGI }),
      r('Outer Sheet', null, null, 972, 2082, null, 1, 60, 0, 0),
      r('Wallframe Vertical', null, null, 1220, 2760, null, null, 60, 0, 0, { rule: { ppgiQty: 1 }, note: DOOR_PPGI }),
      r('Wallframe Top / Bottom', null, null, 1220, 1500, null, 1, 60, 0, 0),
      r('Flush Door  (LHS)SS/PP', 860, 1980, null, null, null, null, 60, 0, 0),
    ],
    totals: { panelQty: 19, ppgiQty: 32, chemWeight: 131.26, areaSqmt: 54.69 },
    ruleTotals: { ppgiQty: 38, chemWeight: 129.44, areaSqmt: 53.93 },
    notes: [
      'PPGI total: sheet prints 32, the consistent rule gives 38 (+4 roof skins, +2 door).',
      'Floor: the sheet prints the slab 2590 x 3860 (9.9974 m2, 23.99 kg) to the ' +
        'external envelope. Inside the walls it is 2470 x 3740 — 9.2378 m2 and ' +
        '22.17 kg — which is what the totals above carry.',
      'The sheet prints the 360 wall row before the 365 one; the engine sorts widest first.',
      'Butt joint inner skin is 50mm narrower than the outer. Only one sample so far — needs a second job to confirm.',
    ],
  },
];
