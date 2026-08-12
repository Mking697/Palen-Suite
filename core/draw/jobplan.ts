/**
 * WALL PANEL LAYOUT for a whole job — every room on one sheet.
 *
 * This is what the drawing office actually issues: a freezer and its ante room
 * are one layout, drawn touching along the wall they share, not two unrelated
 * pictures. Rooms that share no wall are simply placed apart on the same sheet.
 *
 * Composition only. Each room's geometry still comes from `roomPlan`, which
 * gets it from `layoutRoom`, so nothing here can invent a panel.
 */

import type { JobSpec, RoomSpec } from '../types.ts';
import { emptyDrawing, type Drawing } from './types.ts';
import { roomPlan } from './roomplan.ts';

/** Rooms the job plan can show — the rest report why they cannot be drawn. */
export const drawableRooms = (job: JobSpec) => job.rooms.filter((r) => r.outline);

export function jobPlan(job: JobSpec): Drawing {
  const rooms = drawableRooms(job);
  if (rooms.length === 0) {
    throw new Error('No room in this job has a plan outline yet.');
  }

  const parts = rooms.map((room: RoomSpec) => roomPlan(room, room.at ?? [0, 0]));

  const d = emptyDrawing(
    `${job.jobNo} — Wall Panel Layout`,
    Math.max(...parts.map((p) => p.w)),
    Math.max(...parts.map((p) => p.l)),
  );
  d.subtitle =
    rooms.length === 1
      ? (parts[0].subtitle ?? '')
      : `${rooms.length} rooms · ${rooms.map((r) => r.name).join(', ')}`;

  for (const p of parts) {
    d.fill = undefined; // several rooms cannot share one background polygon
    d.lines.push(...p.lines);
    d.dims.push(...p.dims);
    d.notes.push(...p.notes);
    d.cells.push(...p.cells);
  }

  return d;
}
