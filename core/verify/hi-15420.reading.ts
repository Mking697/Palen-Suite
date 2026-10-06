/**
 * HI-15420 — two chiller rooms on one sheet, 60mm throughout, puf slab floors,
 * one 900-wide RHS door each, lift 110. The reading is what the model's answer
 * looks like once the drawing has been read and every chain checked against its
 * overall dimension; it is a fixture, copied from the reading, not computed.
 *
 * Shared by vision.test.ts (what the server derives from it) and web.test.ts
 * (what the browser does with that), so the two cannot drift apart.
 */

export const HI_15420 = JSON.stringify({
  jobNo: 'HI-15420',
  rooms: [
    {
      name: 'CHILLER ROOM.1',
      w: 4120,
      l: 4720,
      h: 2240,
      wallTh: 60,
      ceilTh: 60,
      floor: { kind: 'pufSlab', th: 60 },
      ceiling: { w: 4060, l: 4660 },
      door: { wall: 'bottom', clearW: 900, clearH: 1900, moduleW: 1180, hand: 'RHS', skinOuter: 'PP', skinInner: 'SS', chqHeight: null, lift: 110 },
      walls: {
        top: [
          { kind: 'corner', mm: 300 },
          { kind: 'panel', mm: 1160 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'corner', mm: 300 },
        ],
        right: [
          { kind: 'corner', mm: 300 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 580 },
          { kind: 'corner', mm: 300 },
        ],
        bottom: [
          { kind: 'corner', mm: 300 },
          { kind: 'panel', mm: 625 },
          { kind: 'panel', mm: 625 },
          { kind: 'door', mm: 1180 },
          { kind: 'panel', mm: 1090 },
          { kind: 'corner', mm: 300 },
        ],
        left: [
          { kind: 'corner', mm: 300 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 580 },
          { kind: 'corner', mm: 300 },
        ],
      },
      buttJoints: [],
      openWalls: [],
      wallSheets: { outer: 'PPGI', inner: 'SS' },
    },
    {
      name: 'CHILLER ROOM.2',
      w: 3460,
      l: 4140,
      h: 2080,
      wallTh: 60,
      ceilTh: 60,
      floor: { kind: 'pufSlab', th: 60 },
      ceiling: { w: 3400, l: 4110 },
      door: { wall: 'bottom', clearW: 900, clearH: 1750, moduleW: 1180, hand: 'RHS', skinOuter: 'PP', skinInner: 'SS', chqHeight: null, lift: 110 },
      walls: {
        top: [],
        right: [
          { kind: 'panel', mm: 300 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'corner', mm: 300 },
        ],
        bottom: [
          { kind: 'corner', mm: 300 },
          { kind: 'panel', mm: 500 },
          { kind: 'panel', mm: 1180 },
          { kind: 'door', mm: 1180 },
          { kind: 'corner', mm: 300 },
        ],
        left: [
          { kind: 'panel', mm: 300 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'panel', mm: 1180 },
          { kind: 'corner', mm: 300 },
        ],
      },
      buttJoints: [],
      openWalls: ['top'],
      wallSheets: { outer: 'PP', inner: 'SS' },
    },
  ],
  notes:
    "R2 top wall is a red dashed line with no panel chain, read as an open wall; the 3340 internal dimension is printed below it. At the open top end of R2's left and right walls the 300 dimension is printed but NO magenta corner L is drawn, so those two 300s are transcribed as plain panels. R2 has a hatched, framed 860 wide x 1350 long block against the right wall, no label, not transcribed. Door swings OUTWARD in both rooms; no aluminium CHQ sheet height printed.",
});
