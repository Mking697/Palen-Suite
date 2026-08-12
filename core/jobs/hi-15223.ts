/**
 * Job HI-15223 R3 — Chiller room, L-shaped plan with a butt joint.
 *
 * Input transcribed from the WALL PANEL LAYOUT drawing only.
 *
 * The plan is a 2590 x 3860 rectangle with a notch taken out of one bottom
 * corner, so it has six walls instead of four. Only the two top corners get a
 * corner panel — the re-entrant corners are butt joints, where a wall runs
 * into the face of the next one and loses a wall thickness off its run.
 *
 *        2590
 *   +--------------+
 *   |              |
 *   |              | 3555
 *   |     notch    |
 *   |   +----------+
 *   | 365          1600 (bottom)
 *   +---+
 *    990 (butt joint wall)
 *
 * NOT YET ON AN OUTLINE — the transcribed chain does not close.
 *
 *   horizontal:  top 2590 - bottom 1600 - buttWall 990  =  0     exact
 *   vertical:    right 3555 + notch 365 - left 3860     = +60    one wallTh
 *
 * Walking the six walls as a polygon therefore lands 60mm away from where it
 * started, so this room cannot be given an `outline` without inventing a
 * dimension. That the error is exactly one wall thickness, and only on the
 * side carrying all three butt joints, points at the chain mixing outer-face
 * and inner-face measurements at those joints — but which of the six is
 * measured to the other face is not decidable from the numbers alone.
 *
 * The BOQ is unaffected and still matches the sheet exactly: the engine
 * subtracts per wall and never closes the loop, which is precisely why the
 * inconsistency went unnoticed until the geometry was modelled. It has to be
 * resolved against the drawing before this room can be drawn. See README
 * "Open items" and DESIGN.md.
 */

import type { JobSpec } from '../types.ts';

export const HI_15223: JobSpec = {
  jobNo: 'HI-15223',
  density: 40,
  rooms: [
    {
      name: 'Chiller Room',
      ext: { w: 2590, l: 3860, h: 2745 },
      wallTh: 60,
      ceilTh: 60,
      floor: { kind: 'pufSlab', th: 60, desc: 'Puf Slab with tarfelt' },
      module: 1180,
      cornerLeg: 300,
      minPanelWidth: 150,
      maxSplitPieces: 2,
      walls: [
        // top, both corners            2590 - 600            = 1990 -> 1180 + 810
        { id: 'top', length: 2590, cornerStart: true, cornerEnd: true },
        // right, corner at top only    3555 - 300            = 3255 -> 1180 x2 + 895
        { id: 'right', length: 3555, cornerStart: true, cornerEnd: false },
        // bottom, butts the notch      1600 - 60             = 1540 -> 1180 + 360
        { id: 'bottom', length: 1600, cornerStart: false, cornerEnd: false, buttEnd: true },
        // notch upright, stands alone  365                          -> 365
        { id: 'notch', length: 365, cornerStart: false, cornerEnd: false },
        // notch return, the butt joint  990 - 60             = 930
        {
          id: 'buttWall',
          length: 990,
          cornerStart: false,
          cornerEnd: false,
          buttEnd: true,
          buttJoint: true,
        },
        // left, corner at top, door, butts the bottom
        // 3860 - 300 - 60 - 1180 door = 2320 -> 1180 + 1140
        {
          id: 'left',
          length: 3860,
          cornerStart: true,
          cornerEnd: false,
          buttEnd: true,
          door: {
            label: 'Flush Door  (LHS)SS/PP',
            clearW: 860,
            clearH: 1980,
            moduleW: 1180,
          },
        },
      ],
      ceiling: {
        splitAxis: 'l',
        wEnds: ['own', 'own'],
        lEnds: ['own', 'own'],
      },
    },
  ],
};
