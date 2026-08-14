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

export * from './types.ts';
export { toSvg } from './svg.ts';
export { toDxf } from './dxf.ts';
export { roomPlan } from './roomplan.ts';
export { jobPlan, drawableRooms } from './jobplan.ts';
export { wallElevations } from './elevation.ts';
export { ceilingPlan, floorPlan } from './ceiling.ts';
export { doorElevations, doorElevation, defaultFrame } from './door.ts';
export { composeSheet, type Sheet, type SheetCell, type SheetOptions } from './sheet.ts';
export { model3d, type Face3, type FaceKind, type Model3, type Pt3 } from './model3d.ts';

/**
 * A room's own drawings. The plan is deliberately not among them — the layout
 * belongs to the job, so that connected rooms are drawn together. See
 * `jobPlan`.
 */
export function roomDrawings(room: RoomSpec): Drawing[] {
  return [
    ...wallElevations(room),
    ...doorElevations(room),
    ceilingPlan(room),
    floorPlan(room),
  ];
}

/** True when the room carries the geometry the drawings need. */
export const canDraw = (room: RoomSpec) => !!room.outline;
