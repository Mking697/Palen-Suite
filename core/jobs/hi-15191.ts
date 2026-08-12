/**
 * Job HI-15191 — Freezer + Ante room, Bhiwadi.
 * Input transcribed from the WALL PANEL LAYOUT drawing only.
 * Nothing from the BOQ sheet is fed in here; the BOQ is what we generate.
 */

import type { JobSpec } from '../types.ts';
import { compileWalls, rect } from '../plan.ts';

/**
 * Off the HI-15191 elevation drawing: the 1180 module carries 160 of frame
 * either side of the 860 leaf, AL. chequered sheet 600 up from the bottom, and
 * a 150 door lift. None of that reaches the BOQ — the door is blanked off its
 * clear opening — but the elevation drawing needs it.
 */
const DOOR = {
  label: 'Flush Door (LHS) PP',
  clearW: 860,
  clearH: 1980,
  moduleW: 1180,
  frame: 160,
  chqHeight: 600,
  liftAboveFloor: 150,
};

/** Plain rectangle, four corner panels, door on the wall facing the ante room. */
const FREEZER = rect(3050, 4575, {
  0: { id: 'N', door: DOOR },
  1: { id: 'E' },
  2: { id: 'S' },
  3: { id: 'W' },
});

/**
 * The ante room sits against the freezer, so the 3050 side they share is the
 * freezer's wall. That one fact gives the room 3 walls and 2 corner panels
 * instead of 4 and 4 — the compiler drops a shared edge and suppresses the
 * corner at both of its ends.
 */
const ANTE = rect(3050, 1525, {
  0: { shared: true },
  1: { id: 'E' },
  2: { id: 'S', door: DOOR },
  3: { id: 'W' },
});

export const HI_15191: JobSpec = {
  jobNo: 'HI-15191',
  density: 40,
  rooms: [
    {
      name: 'Freezer Room',
      ext: { w: 3050, l: 4575, h: 2590 },
      wallTh: 120,
      ceilTh: 120,
      floor: {
        kind: 'pufSlab',
        th: 100,
        desc: 'Puf Slab With Single Layer Tarfelt.',
      },
      module: 1180,
      cornerLeg: 300,
      minPanelWidth: 150,
      maxSplitPieces: 2,
      // this sheet prints the plural form
      labels: { wallOuter: 'Wall Panels (Outer)', wallInner: 'Wall Panels (Inner)' },
      outline: FREEZER,
      walls: compileWalls(FREEZER),
      ceiling: {
        splitAxis: 'l',
        wEnds: ['own', 'own'],
        lEnds: ['own', 'own'],
      },
    },
    {
      // the source sheet labels this block "Chiller Room" — that is a
      // copy-paste slip, the drawing calls it ANTE ROOM
      name: 'Ante Room',
      ext: { w: 3050, l: 1525, h: 2590 },
      wallTh: 60,
      ceilTh: 60,
      floor: {
        kind: 'pufSlab',
        th: 60,
        desc: 'Puf Slab With Single Layer Tarfelt.',
      },
      module: 1180,
      cornerLeg: 300,
      minPanelWidth: 150,
      maxSplitPieces: 2,
      // this sheet prints the plural form
      labels: { wallOuter: 'Wall Panels (Outer)', wallInner: 'Wall Panels (Inner)' },
      // sits against the freezer's 3050 wall, so the job layout draws the two
      // touching along it — the ante room is 1525 deep, above the freezer
      at: [0, -1525],
      outline: ANTE,
      walls: compileWalls(ANTE),
      ceiling: {
        splitAxis: 'l',
        wEnds: ['own', 'own'],
        // far end is this room's own wall, near end is the freezer's wall
        lEnds: ['own', 'shared'],
      },
    },
  ],
};
