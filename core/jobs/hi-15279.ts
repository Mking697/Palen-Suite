/**
 * Job HI-15279 — Bhiwadi Thara. Four rooms in a row: Freezer, Chiller,
 * Ambient and Milk & Butter, sharing partition walls.
 *
 * Input transcribed from the WALL PANEL LAYOUT drawing only.
 *
 * Covered here: Freezer (100mm) and Chiller (60mm). The Ambient + Milk block
 * is not modelled yet — it needs BOQ-group merging, partition wall panels and
 * a Door TOP, and its wall dimension chain is not legible in the PDF text.
 *
 * Two walls carry a draftsman override. Both are visible on the drawing and
 * neither is derivable from the automatic rule:
 *   - Freezer door wall splits its 1620 run into two equal 810s so the door
 *     sits dead centre:  300 | 810 | door 1180 | 810 | 300 = 3400
 *   - Chiller door wall splits its 440 balance into 240 + 200, not evenly
 */

import type { JobSpec } from '../types.ts';
import { compileWalls, rect } from '../plan.ts';

const DOOR = {
  label: 'Flush Door PP (LHS)',
  clearW: 860,
  clearH: 1980,
  moduleW: 1180,
};

/**
 * 4570 x 3400, four corner panels. The door wall is split into two equal
 * pieces so the door sits dead centre: 300 | 810 | door 1180 | 810 | 300.
 */
const FREEZER = rect(4570, 3400, {
  0: { id: 'N' },
  1: { id: 'E' },
  2: { id: 'S' },
  3: { id: 'W', door: DOOR, equalPieces: 2 },
});

/**
 * The chiller sits against the freezer, so its 3400 side on that end is the
 * freezer's wall — three walls, two corner panels. The door wall splits its
 * 440 balance 240 + 200 per the drawing, which no rule produces.
 */
const CHILLER = rect(7380, 3400, {
  0: { id: 'N' },
  1: { id: 'E', door: DOOR, panels: [1180, 240, 200] },
  2: { id: 'S' },
  3: { shared: true },
});

export const HI_15279: JobSpec = {
  jobNo: 'HI-15279',
  density: 40,
  rooms: [
    {
      name: 'Freezer Room',
      ext: { w: 4570, l: 3400, h: 2745 },
      wallTh: 100,
      ceilTh: 100,
      floor: {
        kind: 'panelised',
        th: 100,
        module: 1220,
        desc: 'Bottom PPGI +Puf + 12 mm Ply + 2mm AL. CHQ ON Top = 100mm',
      },
      module: 1180,
      cornerLeg: 300,
      minPanelWidth: 150,
      maxSplitPieces: 2,
      labels: { wallOuter: 'Wall Panels (Outer)', wallInner: 'Wall Panels (Inner)' },
      // 4570 - 600 = 3970 -> 1180 x3 + 430   (x2 walls)
      // 3400 - 600 = 2800 -> 1180 x2 + 440
      // door wall: 3400 - 600 - 1180 = 1620, split evenly -> 810 + 810
      outline: FREEZER,
      walls: compileWalls(FREEZER),
      ceiling: { splitAxis: 'w', wEnds: ['own', 'own'], lEnds: ['own', 'own'] },
    },
    {
      name: 'Chiller Room',
      ext: { w: 7380, l: 3400, h: 2745 },
      wallTh: 60,
      ceilTh: 60,
      floor: {
        kind: 'panelised',
        th: 60,
        module: 1220,
        desc: 'Bottom PPGI + Puf + 12 mm Ply + 2mm AL. CHQ=60mm',
      },
      module: 1180,
      cornerLeg: 300,
      minPanelWidth: 150,
      maxSplitPieces: 2,
      // 7380 - 300 = 7080 -> 1180 x6 exactly   (x2 walls)
      // door wall: 3400 - 600 - 1180 = 1620 -> 1180 + 240 + 200 per the drawing
      // sits to the right of the freezer, sharing its 3400 wall
      at: [4570, 0],
      outline: CHILLER,
      walls: compileWalls(CHILLER),
      ceiling: { splitAxis: 'w', wEnds: ['own', 'shared'], lEnds: ['own', 'own'] },
    },
  ],
};
