/**
 * Turns a RoomSpec into the flat list of panels the room needs.
 * Pure geometry — no BOQ formatting, no weights.
 */

import type { Mm, RoomSpec, EndKind, WallSpec } from './types.ts';
import { splitRun, type SplitOptions } from './split.ts';
import { hasDoorTop, lCutDefault } from './rules.ts';

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
  floor: { w: Mm; l: Mm; panelLength: Mm; widths: Mm[] | null };
  /**
   * The panel over the door, on a wall tall enough for the shop to make one —
   * see `DOOR_TOP_MIN_WALL_HEIGHT`. Null on a shorter wall, where the door
   * assembly is the full height of the wall and there is no separate piece.
   *
   * `w` is the door module and `l` the gap left above the clear opening, so the
   * door and this panel together fill the module top to bottom and nothing in
   * that stretch of wall is counted twice. One panel: no door module wider than
   * the panel module has come up, so nothing is split here.
   */
  doorTop: { w: Mm; l: Mm } | null;
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

/**
 * Half the wall thickness is notched out at every own-wall end — the L cut.
 * Without the cut there is no rebate for the ceiling to sit into, so it runs
 * the full external size.
 */
function ceilingSpan(ext: Mm, wallTh: Mm, ends: [EndKind, EndKind], lCut: boolean): Mm {
  if (!lCut) return ext;
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

  const lCut = room.lCut ?? lCutDefault(room.wallTh);
  const cw = ceilingSpan(room.ext.w, room.wallTh, room.ceiling.wEnds, lCut);
  const cl = ceilingSpan(room.ext.l, room.wallTh, room.ceiling.lEnds, lCut);
  const splitAlong = room.ceiling.splitAxis === 'w' ? cw : cl;
  const panelLength = room.ceiling.splitAxis === 'w' ? cl : cw;

  /*
   * The floor sits between the walls whichever kind it is — a wall never stands
   * on it, so its area is the clear area inside them.
   *
   * HI-15191 and HI-15223 print their puf slabs at the full external size, as
   * if the slab ran on under the walls. The shop says that is wrong (14 August
   * 2026), so the rule is kept and those rows are recorded as deviations in the
   * expected fixtures rather than followed. The panelised floors were already
   * internal, and HI-15279 still matches line for line.
   */
  const floorW = internalSpan(room.ext.w, room.wallTh, room.ceiling.wEnds);
  const floorL = internalSpan(room.ext.l, room.wallTh, room.ceiling.lEnds);

  // the floor splits along its own axis, the same way the ceiling does. 'w' is
  // the default because that is what the one verified panelised floor prints,
  // so a job that does not state an axis comes out exactly as it does today.
  const floorAxis = room.floor.splitAxis ?? 'w';
  const floorSplitAlong = floorAxis === 'w' ? floorW : floorL;
  const floorPanelLength = floorAxis === 'w' ? floorL : floorW;

  /*
   * The piece over the door, on a wall tall enough to be built that way. The
   * BOQ prices one door per room — the first wall that carries one — so the
   * top panel is that door's, and it is the same door the assembly rows use.
   */
  const door = room.walls.find((w) => w.door)?.door;
  const doorTop =
    door && hasDoorTop(room.ext.h)
      ? { w: door.moduleW, l: Math.round(room.ext.h - door.clearH) }
      : null;

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
      panelLength: floorPanelLength,
      widths:
        room.floor.kind === 'panelised'
          ? splitRun(floorSplitAlong, { ...split, module: room.floor.module ?? 1220 })
          : null,
    },
    doorTop,
  };
}
