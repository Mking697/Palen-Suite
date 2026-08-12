/**
 * Ceiling and floor panel layouts.
 *
 * Both read their panel widths straight off `layoutRoom` — the ceiling from
 * the notched span, the floor from the internal clear span or the slab.
 */

import type { Mm, RoomSpec } from '../types.ts';
import { layoutRoom } from '../layout.ts';
import { emptyDrawing, type Drawing } from './types.ts';

/** Lay `widths` out along one axis of a w x l rectangle and label each panel. */
function stripes(
  d: Drawing,
  widths: Mm[],
  along: 'x' | 'y',
  w: Mm,
  l: Mm,
  module: Mm,
  span: Mm,
) {
  d.lines.push(
    { x1: 0, y1: 0, x2: w, y2: 0, layer: 'WALL' },
    { x1: w, y1: 0, x2: w, y2: l, layer: 'WALL' },
    { x1: w, y1: l, x2: 0, y2: l, layer: 'WALL' },
    { x1: 0, y1: l, x2: 0, y2: 0, layer: 'WALL' },
  );

  let at = 0;
  for (const pw of widths) {
    const std = Math.abs(pw - module) < 1;
    if (at > 1) {
      if (along === 'x') d.lines.push({ x1: at, y1: 0, x2: at, y2: l, layer: 'PANEL' });
      else d.lines.push({ x1: 0, y1: at, x2: w, y2: at, layer: 'PANEL' });
    }

    const cell =
      along === 'x'
        ? { x0: at, y0: 0, x1: at + pw, y1: l }
        : { x0: 0, y0: at, x1: w, y1: at + pw };
    d.cells.push({ ...cell, text: `${Math.round(pw)} x ${Math.round(span)}`, std });

    d.dims.push(
      along === 'x'
        ? { dir: 'h', a: at, b: at + pw, base: 0, off: -Math.max(300, l * 0.07), text: String(Math.round(pw)) }
        : { dir: 'v', a: at, b: at + pw, base: 0, off: -Math.max(300, w * 0.07), text: String(Math.round(pw)) },
    );
    at += pw;
  }

  d.dims.push(
    { dir: 'h', a: 0, b: w, base: l, off: Math.max(700, l * 0.18), text: String(Math.round(w)) },
    { dir: 'v', a: 0, b: l, base: w, off: Math.max(700, w * 0.18), text: String(Math.round(l)) },
  );
}

export function ceilingPlan(room: RoomSpec): Drawing {
  const L = layoutRoom(room);
  const { w, l, widths, panelLength } = L.ceiling;

  const d = emptyDrawing(`${room.name} — Ceiling Panel Layout`, w, l);
  d.subtitle =
    `${Math.round(w)} x ${Math.round(l)} mm · ${widths.length} panels · ` +
    `split along ${room.ceiling.splitAxis === 'w' ? 'width' : 'length'} · ${room.ceilTh}mm`;
  d.fill = [
    [0, 0],
    [w, 0],
    [w, l],
    [0, l],
  ];

  stripes(d, widths, room.ceiling.splitAxis === 'w' ? 'x' : 'y', w, l, room.module, panelLength);
  return d;
}

export function floorPlan(room: RoomSpec): Drawing {
  const L = layoutRoom(room);
  const { w, l, widths } = L.floor;

  const d = emptyDrawing(`${room.name} — Floor Layout`, w, l);
  d.fill = [
    [0, 0],
    [w, 0],
    [w, l],
    [0, l],
  ];

  if (room.floor.kind === 'pufSlab' || !widths) {
    d.subtitle = `${Math.round(w)} x ${Math.round(l)} mm · single slab · ${room.floor.th}mm`;
    stripes(d, [w], 'x', w, l, w, l);
    d.cells = [{ x0: 0, y0: 0, x1: w, y1: l, text: `${Math.round(w)} x ${Math.round(l)}`, std: true }];
    return d;
  }

  const module = room.floor.module ?? 1220;
  d.subtitle =
    `${Math.round(w)} x ${Math.round(l)} mm · ${widths.length} panels on ${module} · ${room.floor.th}mm`;
  stripes(d, widths, 'x', w, l, module, l);
  return d;
}
