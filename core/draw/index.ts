/**
 * Every drawing a room produces, in the order they belong in the job pack.
 *
 * A room without an outline cannot be drawn — that is deliberate. HI-15223 is
 * in that state today because its transcribed wall lengths do not close a
 * polygon; see README "Open items".
 */

import type { RoomSpec } from '../types.ts';
import type { Drawing } from './types.ts';
import { roomPlan } from './roomplan.ts';
import { wallElevations } from './elevation.ts';
import { ceilingPlan, floorPlan } from './ceiling.ts';
import { doorElevations } from './door.ts';
import { roomSpecTable, roomTileColour } from './spec.ts';

export * from './types.ts';
export { toSvg } from './svg.ts';
export { toDxf } from './dxf.ts';
export { roomPlan } from './roomplan.ts';
export { jobPlan, drawableRooms } from './jobplan.ts';
export { wallElevations } from './elevation.ts';
export { ceilingPlan, floorPlan } from './ceiling.ts';
export { doorElevations, doorElevation, defaultFrame } from './door.ts';
export { composeSheet, boundsOf, type Box, type Sheet, type SheetCell, type SheetOptions } from './sheet.ts';
export { roomSpecTable, roomTileColour } from './spec.ts';
export { model3d, type Face3, type FaceKind, type Model3, type Pt3 } from './model3d.ts';

/**
 * A room's own drawings. The plan is deliberately not among them — the layout
 * belongs to the job, so that connected rooms are drawn together. See
 * `jobPlan`.
 *
 * `colourIndex` picks the room's specification tile colour — each room on a
 * job gets its own, cycling through `roomTileColour`, so several rooms on one
 * sheet stay easy to tell apart, the way HK-005 and HI-15815 colour theirs.
 */
export function roomDrawings(room: RoomSpec, colourIndex = 0): Drawing[] {
  return [
    // off by default — the shop, 5 October 2026: a wall elevation per wall
    // cluttered every sheet, and it is wanted only when `showElevations` asks
    // for it. The door elevation is unaffected and is still drawn below
    // whenever the room has a door.
    ...(room.showElevations ? wallElevations(room) : []),
    ...doorElevations(room),
    // a ceiling or a floor the customer did not take is not drawn either: a
    // sheet showing a panel nobody is buying is a sheet somebody cuts from
    ...(room.ceiling.fitted === false ? [] : [ceilingPlan(room)]),
    ...(room.floor.fitted === false ? [] : [floorPlan(room)]),
    // the room's own WALL / CEILING / FLOOR / DOOR box, sitting with its views
    roomSpecTable(room, roomTileColour(colourIndex)),
  ];
}

/** True when the room carries the geometry the drawings need. */
export const canDraw = (room: RoomSpec) => !!room.outline;
