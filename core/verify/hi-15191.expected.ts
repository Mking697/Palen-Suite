/**
 * Ground truth transcribed by hand from the HI-15191 SHEET FABRICATION PDF.
 * Column order: desc, panelW, panelL, blankW, blankL, panel, ppgi, thk, weight, area
 * `null` means the cell is blank on the printed sheet.
 */

import { row as r, type ExpectedBlock } from './expected.ts';

/**
 * Both blocks size their puf slab to the room's *external* envelope, as if the
 * slab ran on under the walls. The shop says it does not — the floor sits
 * between the walls and no wall ever stands on it — so the engine takes the
 * internal clear span and these printed figures are recorded rather than
 * followed. HI-15223 prints its slab the same way; HI-15279's panelised floors
 * are already internal and match line for line.
 */
const SLAB_UNDER_WALLS =
  'sheet sizes the slab to the external envelope; the floor sits inside the walls, ' +
  'so the rule takes the internal clear span';

export const HI_15191_EXPECTED: ExpectedBlock[] = [
  {
    title: '120mm (Freezer Room)',
    rows: [
      r('Puf Slab With Single Layer Tarfelt.', 3050, 4575, null, null, 1, null, 100, 55.82, 13.95375, {
        rule: { panelW: 2810, panelL: 4335, chemWeight: 48.73, areaSqmt: 12.18135 },
        note: SLAB_UNDER_WALLS,
      }),
      r('Roof Panel', 1180, 2930, 1220, 2930, 3, 6, 120, 49.79, 10.3722),
      r('Roof Panel', 915, 2930, 955, 2930, 1, 2, 120, 12.87, 2.68095),
      r('Wall Panels (Outer)', 1180, 2590, 1220, 2590, 7, 7, 120, 102.69, 21.3934),
      r('Wall Panels (Inner)', 1180, 2470, 1220, 2470, null, 7, 120, 0, 0),
      r('Wall Panels (Outer)', 635, 2590, 675, 2590, 4, 4, 120, 31.58, 6.5786),
      r('Wall Panels (Inner)', 635, 2470, 675, 2470, null, 4, 120, 0, 0),
      r('Wall Panels (Outer)', 435, 2590, 475, 2590, 2, 2, 120, 10.82, 2.2533),
      r('Wall Panels (Inner)', 435, 2470, 475, 2470, null, 2, 120, 0, 0),
      r('Corner Panel (Outer)', 600, 2590, 640, 2590, 4, 4, 120, 29.84, 6.216),
      r('Corner Panel (Inner)', 365, 2470, 405, 2470, null, 4, 120, 0, 0),
      r('Inner Sheet', 1180, 2590, 1055, 2208, 1, 1, 120, 14.67, 3.0562),
      r('Outer Sheet', null, null, 992, 2104, null, 1, 120, 0, 0),
      r('Wallframe Vertical', null, null, 1220, 2605, null, 1, 120, 0, 0),
      r('Wallframe Top / Bottom', null, null, 1220, 1500, null, 1, 120, 0, 0),
      r('Flush Door (LHS) PP', 860, 1980, null, null, null, null, 120, 0, 0),
    ],
    totals: { panelQty: 23, ppgiQty: 46, chemWeight: 308.06, areaSqmt: 66.50 },
    ruleTotals: { chemWeight: 300.97, areaSqmt: 64.73 },
    notes: [
      'Floor: the sheet prints the slab 3050 x 4575 (13.95375 m2, 55.82 kg) to the ' +
        'external envelope. Inside the walls it is 2810 x 4335 — 12.18135 m2 and ' +
        '48.73 kg — which is what the totals above carry.',
    ],
  },
  {
    title: '60mm (Ante Room)',
    rows: [
      r('Puf Slab With Single Layer Tarfelt.', 3050, 1525, null, null, 1, null, 60, 11.16, 4.65125, {
        rule: { panelW: 2930, panelL: 1465, chemWeight: 10.30, areaSqmt: 4.29245 },
        note: SLAB_UNDER_WALLS,
      }),
      r('Roof Panel', 1180, 2990, 1220, 2990, 1, 2, 60, 8.47, 3.5282),
      r('Roof Panel', 315, 2990, 355, 2990, 1, 2, 60, 2.26, 0.94185),
      r('Wall Panels (Outer)', 635, 2590, 675, 2590, 2, 2, 60, 7.89, 3.2893),
      r('Wall Panels (Inner)', 635, 2530, 675, 2530, null, 2, 60, 0, 0),
      r('Wall Panels (Outer)', 613, 2590, 653, 2590, 4, 4, 60, 15.24, 6.35068),
      r('Wall Panels (Inner)', 613, 2530, 653, 2530, null, 4, 60, 0, 0),
      r('Corner Panel (Outer)', 600, 2590, 640, 2590, 2, 2, 60, 7.46, 3.108),
      r('Corner Panel (Inner)', 485, 2530, 525, 2530, null, 2, 60, 0, 0),
      r('Inner Sheet', 1180, 2590, 962, 2105, 1, 1, 60, 7.33, 3.0562),
      r('Outer Sheet', null, null, 972, 2082, null, 1, 60, 0, 0),
      r('Wallframe Vertical', null, null, 1220, 2605, null, 1, 60, 0, 0),
      r('Wallframe Top / Bottom', null, null, 1220, 1500, null, 1, 60, 0, 0),
      r('Flush Door (LHS) PP', 860, 1980, null, null, null, null, 60, 0, 0),
    ],
    totals: { panelQty: 12, ppgiQty: 24, chemWeight: 59.82, areaSqmt: 24.93 },
    ruleTotals: { chemWeight: 58.96, areaSqmt: 24.57 },
    notes: [
      'Floor: the sheet prints the slab 3050 x 1525 (4.65125 m2, 11.16 kg) to the ' +
        'external envelope. Inside the walls it is 2930 x 1465 — 4.29245 m2 and ' +
        '10.30 kg — which is what the totals above carry.',
    ],
  },
];
