/**
 * Turns a RoomSpec into the flat list of panels the room needs.
 * Pure geometry — no BOQ formatting, no weights.
 */

import type { Mm, RoomSpec, EndKind, WallSpec } from './types.ts';
import { splitRun, type SplitOptions } from './split.ts';

export interface WallPanelRun {
  wallId: string;
  /** external run of the wall */
  length: Mm;
  /** corner legs removed */
  clearRun: Mm;
  /** module widths, door module already excluded */
  widths: Mm[];
  hasDoor: boolean;
}

export interface RoomLayout {
  wallRuns: WallPanelRun[];
  /** flat list of every ordinary wall panel width in the room */
  wallWidths: Mm[];
  /** widths that come off butt joint walls — priced and blanked differently */
  buttJointWidths: Mm[];
  /** number of corner panels (each one eats a leg off two walls) */
  cornerCount: number;
  ceiling: { panelLength: Mm; widths: Mm[]; w: Mm; l: Mm };
  floor: { w: Mm; l: Mm; widths: Mm[] | null };
}

/**
 * Panel widths for one wall. Auto by default; the two overrides exist because
 * the draftsman, not the rule, has the last word on how a run is broken up.
 */
function wallPanels(wall: WallSpec, run: Mm, split: SplitOptions): Mm[] {
  if (wall.panels) {
    const sum = wall.panels.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - run) > wall.panels.length) {
      throw new Error(
        `Wall ${wall.id}: explicit panels ${wall.panels.join('+')} = ${sum}, ` +
          `but the run is ${run}. Check the wall length or the panel list.`,
      );
    }
    return wall.panels;
  }
  if (wall.equalPieces && wall.equalPieces > 0) {
    if (!(run > 0.5)) return [];
    const each = Math.round(run / wall.equalPieces);
    return Array.from({ length: wall.equalPieces }, () => each);
  }
  return splitRun(run, split);
}

/** Half the wall thickness is notched out at every own-wall end (the L cut). */
function ceilingSpan(ext: Mm, wallTh: Mm, ends: [EndKind, EndKind]): Mm {
  let span = ext;
  for (const end of ends) if (end === 'own') span -= wallTh / 2;
  return Math.round(span);
}

/** Floor sits fully inside the room, no notch. */
function internalSpan(ext: Mm, wallTh: Mm, ends: [EndKind, EndKind]): Mm {
  let span = ext;
  for (const end of ends) if (end === 'own') span -= wallTh;
  return Math.round(span);
}

export function layoutRoom(room: RoomSpec): RoomLayout {
  const { module, cornerLeg, minPanelWidth, maxSplitPieces, balancePieces } = room;
  const split = { module, minPanelWidth, maxSplitPieces, balancePieces };

  const wallRuns: WallPanelRun[] = [];
  let cornerEnds = 0;

  for (const wall of room.walls) {
    if (wall.cornerStart) cornerEnds++;
    if (wall.cornerEnd) cornerEnds++;

    let clearRun = wall.length;
    if (wall.cornerStart) clearRun -= cornerLeg;
    if (wall.cornerEnd) clearRun -= cornerLeg;
    // a butt end runs into the face of the next wall, losing one thickness
    if (wall.buttStart) clearRun -= room.wallTh;
    if (wall.buttEnd) clearRun -= room.wallTh;

    const forPanels = wall.door ? clearRun - wall.door.moduleW : clearRun;
    const widths = wallPanels(wall, forPanels, split);

    wallRuns.push({
      wallId: wall.id,
      length: wall.length,
      clearRun,
      widths,
      hasDoor: !!wall.door,
    });
  }

  // each corner panel is shared by the two walls meeting there
  const cornerCount = cornerEnds / 2;

  const cw = ceilingSpan(room.ext.w, room.wallTh, room.ceiling.wEnds);
  const cl = ceilingSpan(room.ext.l, room.wallTh, room.ceiling.lEnds);
  const splitAlong = room.ceiling.splitAxis === 'w' ? cw : cl;
  const panelLength = room.ceiling.splitAxis === 'w' ? cl : cw;

  const floorW =
    room.floor.kind === 'pufSlab'
      ? room.ext.w
      : internalSpan(room.ext.w, room.wallTh, room.ceiling.wEnds);
  const floorL =
    room.floor.kind === 'pufSlab'
      ? room.ext.l
      : internalSpan(room.ext.l, room.wallTh, room.ceiling.lEnds);

  return {
    wallRuns,
    wallWidths: room.walls
      .filter((w) => !w.buttJoint)
      .flatMap((w) => wallRuns.find((r) => r.wallId === w.id)!.widths),
    buttJointWidths: room.walls
      .filter((w) => w.buttJoint)
      .flatMap((w) => wallRuns.find((r) => r.wallId === w.id)!.widths),
    cornerCount,
    ceiling: {
      panelLength,
      widths: splitRun(splitAlong, split),
      w: cw,
      l: cl,
    },
    floor: {
      w: floorW,
      l: floorL,
      widths:
        room.floor.kind === 'panelised'
          ? splitRun(floorW, { ...split, module: room.floor.module ?? 1220 })
          : null,
    },
  };
}
