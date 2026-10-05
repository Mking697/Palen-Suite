/**
 * Detail of the panel edge — the small circled "DETAIL OF 'A'" / "DETAIL OF
 * 'B'" cross-section every source sheet carries next to its elevation
 * (HI-14516D, HI-15824, HI-15469): the camlock tongue step cut into a wall
 * panel's edge so two panels interlock.
 *
 * **Derived from three samples, not stated by the shop** — see CLAUDE.md's
 * rule that a figure read off samples rather than told to us says so. All
 * three print the step at exactly half the panel thickness: HI-14516D's 80mm
 * panel steps 40, HI-15824's 120mm panel steps 60, HI-15469's 60mm panel
 * steps 30. No sample yet shows a wall thickness whose ceiling thickness
 * differs from it, so this cannot be told apart from "half the ceiling
 * thickness" either — flagged in README.md "Open items" for the shop to
 * confirm once such a job exists.
 */

import type { Mm, RoomSpec } from '../types.ts';
import { emptyDrawing, type Drawing } from './types.ts';

/** The step cut into a panel's edge for its camlock tongue. */
export const camlockStep = (panelTh: Mm): Mm => panelTh / 2;

export function panelJointDetail(room: RoomSpec): Drawing {
  const th = room.wallTh;
  const step = camlockStep(th);
  // enough height to show the step clearly; not a real dimension of anything
  const H = th * 3;
  const W = th * 2.4;

  const d = emptyDrawing(`${room.name} — Detail of panel joint, ${th}mm thick panel`, W, H);
  d.subtitle = `camlock tongue, step ${step}mm — half the ${th}mm panel · derived from samples, not shop-stated`;

  const x0 = W * 0.15;
  const x1 = x0 + th;
  const yMidTop = H * 0.3;
  const yMidBot = H * 0.7;

  // the panel body, full thickness
  const line = (ax: Mm, ay: Mm, bx: Mm, by: Mm) => d.lines.push({ x1: ax, y1: ay, x2: bx, y2: by, layer: 'PANEL' });
  line(x0, 0, x0, H);
  line(x0, 0, x1, 0);
  line(x0, H, x1, H);
  // the camlock step: the tongue projects half-thickness beyond the panel
  // face over the middle third of the height
  line(x1, 0, x1, yMidTop);
  line(x1, yMidTop, x1 + step, yMidTop);
  line(x1 + step, yMidTop, x1 + step, yMidBot);
  line(x1 + step, yMidBot, x1, yMidBot);
  line(x1, yMidBot, x1, H);

  d.notes.push({ x: x0 - W * 0.08, y: H / 2, text: 'WALL PANEL', rot: 90, scale: 0.7 });
  d.notes.push({ x: x1 + step / 2, y: (yMidTop + yMidBot) / 2, text: 'CAMLOCK', rot: 90, scale: 0.55 });

  d.dims.push(
    { dir: 'h', a: x0, b: x1, base: 0, off: -Math.max(90, H * 0.08), text: String(Math.round(th)) },
    { dir: 'h', a: x1, b: x1 + step, base: yMidTop, off: -Math.max(70, H * 0.06), text: String(Math.round(step)) },
  );

  return d;
}
