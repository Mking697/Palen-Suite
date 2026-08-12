/**
 * TYPICAL ELEVATION of a door in its wall — the drawing HI-15191 issues
 * alongside the layout.
 *
 * Looking at the door face on: the wall panels either side, the ceiling panel
 * over it, the puf slab under it, and inside the door module the frame leg,
 * the leaf, the chequered sheet up its bottom and the lift it stands on.
 *
 * Everything here is drawing detail. The BOQ blanks a door off its clear
 * opening and nothing on this drawing changes that.
 */

import type { DoorSpec, Mm, RoomSpec } from '../types.ts';
import { compileWalls } from '../plan.ts';
import { emptyDrawing, type Drawing } from './types.ts';

/** Frame leg either side of the leaf, when the job does not state one. */
export const defaultFrame = (door: DoorSpec): Mm =>
  door.frame ?? Math.max(0, Math.round((door.moduleW - door.clearW) / 2));

/** How much wall to show either side of the module, for context. */
const WALL_CONTEXT = 420;

/** Every door in the room, one elevation each. */
export function doorElevations(room: RoomSpec): Drawing[] {
  const walls = room.outline ? compileWalls(room.outline) : room.walls;
  return walls.filter((w) => w.door).map((w) => doorElevation(room, w.door!, w.id));
}

export function doorElevation(room: RoomSpec, door: DoorSpec, wallId: string): Drawing {
  const H = room.ext.h;
  const floorTh = room.floor.th;
  const ceilTh = room.ceilTh;
  const frame = defaultFrame(door);

  const w = door.moduleW + WALL_CONTEXT * 2;
  const d = emptyDrawing(
    `${room.name} — Typical elevation, ${room.wallTh}mm door on wall ${wallId}`,
    w,
    H,
  );
  d.subtitle =
    `${door.label} · clear ${door.clearW} x ${door.clearH} · frame ${frame} each side` +
    (door.chqHeight ? ` · AL. CHQ ${door.chqHeight}` : '') +
    (door.liftAboveFloor ? ` · lift ${door.liftAboveFloor}` : '');
  d.fill = [
    [0, 0],
    [w, 0],
    [w, H],
    [0, H],
  ];

  const x0 = WALL_CONTEXT; //                     module starts
  const x1 = x0 + door.moduleW; //                module ends
  const leafL = x0 + frame;
  const leafR = x1 - frame;

  const floorTop = H - floorTh;
  const lift = door.liftAboveFloor ?? 0;
  const doorBottom = floorTop - lift;
  const doorTop = Math.max(ceilTh, doorBottom - door.clearH);

  const line = (x1_: Mm, y1: Mm, x2: Mm, y2: Mm, layer: Parameters<typeof push>[0]) =>
    push(layer, x1_, y1, x2, y2);
  function push(layer: 'WALL' | 'PANEL' | 'DOOR' | 'LIGHT', a: Mm, b: Mm, c: Mm, e: Mm) {
    d.lines.push({ x1: a, y1: b, x2: c, y2: e, layer });
  }
  const box = (
    ax: Mm,
    ay: Mm,
    bx: Mm,
    by: Mm,
    layer: 'WALL' | 'PANEL' | 'DOOR' | 'LIGHT',
  ) => {
    line(ax, ay, bx, ay, layer);
    line(bx, ay, bx, by, layer);
    line(bx, by, ax, by, layer);
    line(ax, by, ax, ay, layer);
  };

  // the room in section: ceiling over, slab under, wall either side
  box(0, 0, w, H, 'WALL');
  line(0, ceilTh, w, ceilTh, 'WALL');
  line(0, floorTop, w, floorTop, 'WALL');
  d.notes.push({ x: w / 2, y: floorTop + floorTh * 0.7, text: 'PUF SLAB', scale: 0.7 });
  d.notes.push({ x: WALL_CONTEXT / 2, y: H / 2, text: 'WALL PANEL', rot: 90, scale: 0.75 });
  d.notes.push({ x: w - WALL_CONTEXT / 2, y: H / 2, text: 'WALL PANEL', rot: 90, scale: 0.75 });
  d.notes.push({ x: w / 2, y: ceilTh * 0.7, text: 'CEILING PANEL', scale: 0.7 });

  // the door module, its two frame legs and the leaf between them
  box(x0, ceilTh, x1, floorTop, 'PANEL');
  box(leafL, doorTop, leafR, doorBottom, 'DOOR');
  d.cells.push({
    x0: leafL,
    y0: doorTop,
    x1: leafR,
    y1: doorBottom,
    text: `${door.clearW} x ${door.clearH}`,
    std: true,
  });

  // chequered sheet, measured up the leaf from its bottom edge
  if (door.chqHeight) {
    const top = Math.max(doorTop, doorBottom - door.chqHeight);
    line(leafL, top, leafR, top, 'LIGHT');
    // a few strokes so it reads as sheet rather than another panel
    const step = Math.max(60, (leafR - leafL) / 12);
    for (let x = leafL + step; x < leafR; x += step) {
      line(x, doorBottom, Math.min(leafR, x + (doorBottom - top)), top, 'LIGHT');
    }
    d.dims.push({
      dir: 'v',
      a: top,
      b: doorBottom,
      base: leafR,
      off: -Math.max(150, w * 0.05),
      text: String(door.chqHeight),
    });
    d.notes.push({
      x: (leafL + leafR) / 2,
      y: doorBottom + (floorTop - doorBottom) / 2 + 40,
      text: 'AL. CHQ. SHEET',
      layer: 'LIGHT',
      scale: 0.6,
    });
  }

  /* ---- dimensions ---- */

  const upper = -Math.max(220, H * 0.08);
  d.dims.push(
    // module, and the frame | leaf | frame chain inside it
    { dir: 'h', a: x0, b: x1, base: 0, off: upper * 2, text: String(door.moduleW) },
    { dir: 'h', a: x0, b: leafL, base: 0, off: upper, text: String(frame) },
    { dir: 'h', a: leafL, b: leafR, base: 0, off: upper, text: String(door.clearW) },
    { dir: 'h', a: leafR, b: x1, base: 0, off: upper, text: String(frame) },
    // clear height and the whole wall
    {
      dir: 'v',
      a: doorTop,
      b: doorBottom,
      base: leafR,
      off: Math.max(200, w * 0.07),
      text: String(door.clearH),
    },
    { dir: 'v', a: 0, b: H, base: w, off: Math.max(320, w * 0.12), text: String(H) },
    // the build-up top and bottom
    { dir: 'v', a: 0, b: ceilTh, base: 0, off: -Math.max(200, w * 0.07), text: String(ceilTh) },
    {
      dir: 'v',
      a: floorTop,
      b: H,
      base: 0,
      off: -Math.max(200, w * 0.07),
      text: String(floorTh),
    },
  );

  if (lift > 0) {
    d.dims.push({
      dir: 'v',
      a: doorBottom,
      b: floorTop,
      base: leafL,
      off: -Math.max(200, w * 0.07),
      text: String(lift),
    });
  }
  if (door.liftAboveGround) {
    d.dims.push({
      dir: 'v',
      a: doorBottom,
      b: H,
      base: 0,
      off: -Math.max(420, w * 0.15),
      text: `${door.liftAboveGround} from ground`,
    });
  }

  return d;
}
