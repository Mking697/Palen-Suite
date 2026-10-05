/**
 * Standalone door and panel catalog sheets — HK-009 (three doors side by
 * side), HI-15822, HI-15821 and HI-15469 style. These are **not part of a
 * job's drawing set**: an estimator uses them to print one or several door
 * or panel types on their own, without building a room around them. They
 * share nothing with `RoomSpec` — only the plain figures a catalog sheet
 * needs — which is why they take their own small spec types rather than a
 * room.
 *
 * Like every other view in `core/draw/`, nothing here is a BOQ figure: a
 * catalog sheet is for the drawing office to read, not for `buildJob` to
 * price. If a door or panel from here is wanted in a job's BOQ, it is
 * entered on a room the ordinary way.
 */

import type { Mm } from '../types.ts';
import { emptyDrawing, type Drawing } from './types.ts';

export interface CatalogDoorSpec {
  /** e.g. "Flush Door 60 MM Thk. PP/PP." — printed as the caption */
  label: string;
  thickness: Mm;
  clearW: Mm;
  clearH: Mm;
  frameW: Mm;
  frameH: Mm;
  hand: 'LHS' | 'RHS';
  qty: number;
  /** frame leg either side of the leaf; defaults to half the frame/clear gap */
  frame?: Mm;
  chqHeight?: Mm;
  doorLift?: Mm;
  camlock?: boolean;
}

export interface CatalogPanelSpec {
  width: Mm;
  length: Mm;
  thickness: Mm;
  qty: number;
  lCut?: boolean;
  camlock?: boolean;
  flashingRequired?: boolean;
}

/** One door, drawn FRONT VIEW the way HK-009 and HI-15822 do. */
export function doorCatalogView(spec: CatalogDoorSpec): Drawing {
  const frame = spec.frame ?? Math.max(0, Math.round((spec.frameW - spec.clearW) / 2));
  const topGap = Math.max(0, spec.frameH - spec.clearH);
  const chq = spec.chqHeight ?? 0;

  const w = spec.frameW;
  const H = spec.frameH;
  const d = emptyDrawing(`Door — ${spec.label}, ${spec.hand} opening, qty ${spec.qty}`, w, H);
  d.subtitle =
    `CLEAR OPENING ${spec.clearW} X ${spec.clearH} MM · FRAME ${spec.frameW} X ${spec.frameH} MM · ` +
    `${spec.hand} OPENING · QTY ${spec.qty} NO's`;

  const line = (ax: Mm, ay: Mm, bx: Mm, by: Mm, layer: 'WALL' | 'PANEL' | 'DOOR' | 'LIGHT' = 'PANEL') =>
    d.lines.push({ x1: ax, y1: ay, x2: bx, y2: by, layer });
  const box = (ax: Mm, ay: Mm, bx: Mm, by: Mm, layer: 'WALL' | 'PANEL' | 'DOOR' | 'LIGHT' = 'PANEL') => {
    line(ax, ay, bx, ay, layer);
    line(bx, ay, bx, by, layer);
    line(bx, by, ax, by, layer);
    line(ax, by, ax, ay, layer);
  };

  // the frame, and the leaf set in by `frame` all round
  box(0, 0, w, H, 'WALL');
  const leafL = frame;
  const leafR = w - frame;
  const leafT = topGap;
  const leafB = H;
  box(leafL, leafT, leafR, leafB, 'DOOR');
  d.cells.push({
    x0: leafL,
    y0: leafT,
    x1: leafR,
    y1: leafB,
    text: `${spec.clearW} x ${spec.clearH}`,
    std: true,
  });

  if (chq > 0) {
    const top = Math.max(leafT, leafB - chq);
    line(leafL, top, leafR, top, 'LIGHT');
    const step = Math.max(40, (leafR - leafL) / 10);
    for (let x = leafL + step; x < leafR; x += step) {
      line(x, leafB, Math.min(leafR, x + (leafB - top)), top, 'LIGHT');
    }
  }

  // hardware callouts, hinge side following the stated hand
  const hingeX = spec.hand === 'LHS' ? leafL : leafR;
  const handleX = spec.hand === 'LHS' ? leafR : leafL;
  d.notes.push({ x: hingeX, y: leafT + (leafB - leafT) * 0.2, text: 'HINGE', scale: 0.55, layer: 'TEXT' });
  d.notes.push({ x: hingeX, y: leafB - (leafB - leafT) * 0.15, text: 'HINGE', scale: 0.55, layer: 'TEXT' });
  d.notes.push({ x: handleX, y: (leafT + leafB) / 2, text: 'HANDLE & LOCK', scale: 0.55, layer: 'TEXT' });
  d.notes.push({ x: (leafL + leafR) / 2, y: leafT + (leafB - leafT) * 0.35, text: 'EMERGENCY BUTTON', scale: 0.5, layer: 'TEXT' });

  d.dims.push(
    { dir: 'h', a: 0, b: w, base: 0, off: -Math.max(220, H * 0.08), text: String(Math.round(w)) },
    { dir: 'h', a: leafL, b: leafR, base: 0, off: -Math.max(120, H * 0.045), text: String(Math.round(spec.clearW)) },
    { dir: 'v', a: 0, b: H, base: w, off: Math.max(220, w * 0.1), text: String(Math.round(H)) },
    { dir: 'v', a: leafT, b: leafB, base: w, off: Math.max(120, w * 0.05), text: String(Math.round(leafB - leafT)) },
  );
  if (spec.doorLift) {
    d.notes.push({ x: w / 2, y: H - 20, text: `DOOR LIFT ${spec.doorLift} MM`, scale: 0.55, layer: 'TEXT' });
  }

  return d;
}

/**
 * A single panel type, elevation only — HI-15469 style: a bare panel with a
 * quantity label and the camlock detail circle alongside, no room context.
 */
export function panelCatalogView(spec: CatalogPanelSpec): Drawing {
  const w = spec.width;
  const H = spec.length;
  const d = emptyDrawing(`Wall Panel — ${spec.thickness}mm, ${spec.qty} Nos`, w, H);
  const bits = [`${spec.thickness}mm thick`];
  if (spec.lCut) bits.push('L-cut required');
  if (spec.camlock) bits.push('camlock');
  if (spec.flashingRequired) bits.push('flashing required');
  d.subtitle = `WALL PANEL ${spec.qty} NOS · ${bits.join(' · ')}`;
  d.fill = [
    [0, 0],
    [w, 0],
    [w, H],
    [0, H],
  ];
  d.lines.push(
    { x1: 0, y1: 0, x2: w, y2: 0, layer: 'WALL' },
    { x1: w, y1: 0, x2: w, y2: H, layer: 'WALL' },
    { x1: w, y1: H, x2: 0, y2: H, layer: 'WALL' },
    { x1: 0, y1: H, x2: 0, y2: 0, layer: 'WALL' },
  );
  d.notes.push({ x: w / 2, y: H / 2, text: `WALL PANEL - ${spec.qty} NOS`, rot: 90, scale: 0.75, layer: 'TEXT' });
  d.dims.push(
    { dir: 'h', a: 0, b: w, base: 0, off: -Math.max(80, H * 0.05), text: String(Math.round(w)) },
    { dir: 'v', a: 0, b: H, base: w, off: Math.max(80, w * 0.08), text: String(Math.round(H)) },
  );
  return d;
}
