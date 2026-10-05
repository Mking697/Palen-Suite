/**
 * Room specification table — the coloured WALL / CEILING / FLOOR / DOOR box
 * every source sheet prints beside its views (HI-14516D, HK-005, HI-15815…).
 * It is a **translation only**, exactly like every other view in `core/draw/`:
 * every figure printed here is already on `RoomSpec`, nothing is derived.
 *
 * The shop asked for this on 5 October 2026, alongside wall elevations
 * becoming opt-in: every room's own box, sitting with that room's views.
 */

import type { Mm, RoomSpec } from '../types.ts';
import { emptyDrawing, type Drawing } from './types.ts';

/** One colour per room on a job, cycling if there are more rooms than colours. */
const TILE_COLOURS = ['#fde7ef', '#e3f2e9', '#e3ecfb', '#fff3d9', '#f1e6fb', '#e6f7f7'];

export const roomTileColour = (index: number): string =>
  TILE_COLOURS[index % TILE_COLOURS.length];

const fmtMm = (v: Mm) => Math.round(v).toLocaleString('en-IN');

/** "Puf Slab With Single Layer Tarfelt." style description for a wall/ceiling skin. */
function skinDesc(room: RoomSpec, th: Mm): string {
  const skin = room.skin;
  const outer = skin?.outer?.material ?? 'PP';
  const inner = skin?.inner?.material ?? 'PP';
  return `${th} MM THICK ${outer}/${inner}.`;
}

function doorDesc(room: RoomSpec): string[] {
  const doors = (room.outline ? [] : room.walls)
    .map((w) => w.door)
    .filter((d): d is NonNullable<typeof d> => !!d);
  // outline rooms compile their walls elsewhere; read doors straight off the
  // edge overrides instead, so this reads the same job either way
  const fromEdges = room.outline
    ? Object.values(room.outline.edges ?? {})
        .map((e) => e.door)
        .filter((d): d is NonNullable<typeof d> => !!d)
    : [];
  const all = [...doors, ...fromEdges];
  if (!all.length) return ['NOT REQUIRED.'];
  return all.map((d) => {
    const lines = [d.label, `CLEAR OPENING :- ${d.clearW} X ${d.clearH} MM,`];
    if (d.chqHeight) lines.push(`AL. CHQ. SHEET BOTH SIDE- ${d.chqHeight} MM,`);
    if (d.liftAboveFloor) lines.push(`DOOR LIFT :- ${d.liftAboveFloor} MM.`);
    return lines.join(' ');
  });
}

/**
 * The room's spec table as its own view: a title row with the external size,
 * then WALL / CEILING / FLOOR / DOOR rows, each as plain text — the table
 * every source sheet prints is text, not a drawing, and this stays one.
 */
export function roomSpecTable(room: RoomSpec, colour: string): Drawing {
  const W = 1700;
  const ROW_H = 230;
  const HEAD_H = 300;

  const floorText = room.floor.fitted === false ? 'NOT REQUIRED.' : (room.floor.desc || `${room.floor.th} MM THICK PUF SLAB.`);
  const ceilText = room.ceiling.fitted === false ? 'NOT REQUIRED.' : skinDesc(room, room.ceilTh);
  const doorLines = doorDesc(room);
  const rows: [string, string[]][] = [
    ['WALL', [skinDesc(room, room.wallTh)]],
    ['CEILING', [ceilText]],
    ['FLOOR', [floorText]],
    ['DOOR', doorLines],
  ];

  const bodyH = rows.reduce((h, [, lines]) => h + ROW_H * Math.max(1, lines.length), 0);
  const H = HEAD_H + bodyH;

  const d = emptyDrawing(`${room.name} — Specification`, W, H);
  d.tiles = [{ x0: 0, y0: 0, x1: W, y1: H, fill: colour }];

  // border
  const box = (x0: Mm, y0: Mm, x1: Mm, y1: Mm) => {
    d.lines.push(
      { x1: x0, y1: y0, x2: x1, y2: y0, layer: 'TEXT' },
      { x1: x1, y1: y0, x2: x1, y2: y1, layer: 'TEXT' },
      { x1: x1, y1: y1, x2: x0, y2: y1, layer: 'TEXT' },
      { x1: x0, y1: y1, x2: x0, y2: y0, layer: 'TEXT' },
    );
  };
  box(0, 0, W, H);
  d.lines.push({ x1: 0, y1: HEAD_H, x2: W, y2: HEAD_H, layer: 'TEXT' });

  d.notes.push({
    x: W / 2,
    y: HEAD_H * 0.42,
    text: `${room.name.toUpperCase()} :-`,
    scale: 1.05,
  });
  d.notes.push({
    x: W / 2,
    y: HEAD_H * 0.78,
    text: `${fmtMm(room.ext.w)} X ${fmtMm(room.ext.l)} X ${fmtMm(room.ext.h)} MM (EXT)`,
    scale: 0.85,
  });

  const labelColW = W * 0.22;
  let y = HEAD_H;
  for (const [label, lines] of rows) {
    const h = ROW_H * Math.max(1, lines.length);
    d.lines.push({ x1: 0, y1: y, x2: W, y2: y, layer: 'TEXT', dash: true });
    d.lines.push({ x1: labelColW, y1: y, x2: labelColW, y2: y + h, layer: 'TEXT', dash: true });
    d.notes.push({ x: labelColW / 2, y: y + h / 2 + 30, text: label, scale: 0.85 });
    lines.forEach((line, i) => {
      d.notes.push({
        x: labelColW + (W - labelColW) / 2,
        y: y + ROW_H * (i + 0.6),
        text: line,
        scale: 0.6,
      });
    });
    y += h;
  }

  return d;
}
