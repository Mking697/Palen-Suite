/**
 * Ground truth transcribed by hand from the HI-15279 SHEET FABRICATION PDF.
 * Freezer and Chiller blocks only — the Ambient + Milk block is not modelled yet.
 */

import { row as r, type ExpectedBlock } from './expected.ts';

const DOOR_BLANK_60 =
  'this sheet prints the 60mm door blanks 10mm narrower than HI-15191, HI-15223 ' +
  'and HI-15252 do for the same 860x1980 opening — looks like an error here';

export const HI_15279_EXPECTED: ExpectedBlock[] = [
  {
    title: '100mm (Freezer Room)',
    rows: [
      r('Bottom PPGI +Puf + 12 mm Ply + 2mm AL. CHQ ON Top = 100mm', 1220, 3200, 1260, 3200, 3, 3, 100, 46.85, 11.712),
      r('Bottom PPGI +Puf + 12 mm Ply + 2mm AL. CHQ ON Top = 100mm', 710, 3200, 750, 3200, 1, 1, 100, 9.09, 2.272),
      r('Roof Panel', 1180, 3300, 1220, 3300, 3, 6, 100, 46.73, 11.682),
      r('Roof Panel', 930, 3300, 970, 3300, 1, 2, 100, 12.28, 3.069),
      r('Wall Panels (Outer)', 1180, 2745, 1220, 2745, 8, 8, 100, 103.65, 25.9128),
      r('Wall Panels (Inner)', 1180, 2645, 1220, 2645, null, 8, 100, 0, 0),
      r('Wall Panels (Outer)', 810, 2745, 850, 2745, 2, 2, 100, 17.79, 4.4469),
      r('Wall Panels (Inner)', 810, 2645, 850, 2645, null, 2, 100, 0, 0),
      r('Wall Panels (Outer)', 440, 2745, 480, 2745, 1, 1, 100, 4.83, 1.2078),
      r('Wall Panels (Inner)', 440, 2645, 480, 2645, null, 1, 100, 0, 0),
      r('Wall Panels (Outer)', 430, 2745, 470, 2745, 2, 2, 100, 9.44, 2.3607),
      r('Wall Panels (Inner)', 430, 2645, 470, 2645, null, 2, 100, 0, 0),
      r('Corner Panel (Outer)', 600, 2745, 640, 2745, 4, 4, 100, 26.35, 6.588),
      r('Corner Panel (Inner)', 405, 2645, 445, 2645, null, 4, 100, 0, 0),
      r('Inner Sheet', 1180, 2745, 1006, 2165, 1, 1, 100, 12.96, 3.2391),
      r('Outer Sheet', null, null, 982, 2104, null, 1, 100, 0, 0),
      r('Wallframe Vertical', null, null, 1220, 2760, null, 1, 100, 0, 0),
      r('Wallframe Top / Bottom', null, null, 1220, 1500, null, 1, 100, 0, 0),
      r('Flush Door PP (LHS)', 860, 1980, null, null, null, null, 100, 0, 0),
    ],
    totals: { panelQty: 26, ppgiQty: 50, plyQty: 4, chemWeight: 289.96, areaSqmt: 72.49 },
  },
  {
    title: '60mm (Chiller Room)',
    rows: [
      r('Bottom PPGI + Puf + 12 mm Ply + 2mm AL. CHQ=60mm', 1220, 3280, 1260, 3280, 6, 6, 60, 57.62, 24.0096),
      r('Roof Panel', 1180, 3340, 1220, 3340, 6, 12, 60, 56.75, 23.6472),
      r('Roof Panel', 270, 3340, 310, 3340, 1, 2, 60, 2.16, 0.9018),
      r('Wall Panel (Outer)', 1180, 2745, 1220, 2745, 13, 13, 60, 101.06, 42.1083),
      r('Wall Panel (Inner)', 1180, 2685, 1220, 2685, null, 13, 60, 0, 0),
      r('Wall Panel (Outer)', 240, 2745, 280, 2745, 1, 1, 60, 1.58, 0.6588),
      r('Wall Panel (Inner)', 240, 2685, 280, 2685, null, 1, 60, 0, 0),
      r('Wall Panel (Outer)', 200, 2745, 240, 2745, 1, 1, 60, 1.32, 0.549),
      r('Wall Panel (Inner)', 200, 2685, 240, 2685, null, 1, 60, 0, 0),
      r('Corner Panel (Outer)', 600, 2745, 640, 2745, 2, 2, 60, 7.91, 3.294),
      r('Corner Panel (Inner)', 485, 2685, 525, 2685, null, 2, 60, 0, 0),
      r('Inner Sheet', 1180, 2745, 952, 2105, 1, 1, 60, 7.77, 3.2391, { rule: { blankW: 962 }, note: DOOR_BLANK_60 }),
      r('Outer Sheet', null, null, 962, 2082, null, 1, 60, 0, 0, { rule: { blankW: 972 }, note: DOOR_BLANK_60 }),
      r('Wallframe Vertical', null, null, 1220, 2760, null, 1, 60, 0, 0),
      r('Wallframe Top / Bottom', null, null, 1220, 1500, null, 1, 60, 0, 0),
      r('Flush Door PP (LHS)', 860, 1980, null, null, null, null, 60, 0, 0),
    ],
    totals: { panelQty: 31, ppgiQty: 58, plyQty: 6, chemWeight: 236.18, areaSqmt: 98.41 },
    notes: [
      'The chiller owns only three walls — the fourth side is the freezer\'s, ' +
        'which is why it has two corner panels and not four.',
    ],
  },
];
