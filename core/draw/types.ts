/**
 * Drawing intermediate representation.
 *
 * The legacy calculator already had the right idea: `buildGeom` produced a
 * renderer-independent bag of lines, dimensions and notes, and `svgFromGeom` /
 * `dxfFromGeom` drew it. That split is kept — the geometry is built once and
 * both the screen and AutoCAD read the same thing, so they cannot disagree.
 *
 * Layer names are the legacy ones. The drawing office already expects them in
 * the DXF, so they are not up for renaming.
 */

import type { Mm, Pt } from '../types.ts';

export type Layer = 'WALL' | 'PANEL' | 'DOOR' | 'DIM' | 'LIGHT' | 'TEXT' | 'CUT';

export interface DrawLine {
  x1: Mm;
  y1: Mm;
  x2: Mm;
  y2: Mm;
  layer: Layer;
  dash?: boolean;
}

/** A dimension chain entry. `base` is the line it hangs off, `off` how far. */
export interface DrawDim {
  dir: 'h' | 'v';
  a: Mm;
  b: Mm;
  base: Mm;
  off: Mm;
  text: string;
}

export interface DrawNote {
  x: Mm;
  y: Mm;
  text: string;
  /** degrees, clockwise, matching SVG rotate */
  rot?: number;
  layer?: Layer;
  /** relative size, 1 = normal label */
  scale?: number;
}

/** A panel, labelled with the size that will be printed on it. */
export interface DrawCell {
  x0: Mm;
  y0: Mm;
  x1: Mm;
  y1: Mm;
  text: string;
  /** false when the panel is not a full module — drawn in the warning colour */
  std: boolean;
}

export interface Drawing {
  /** e.g. "Freezer Room — Wall Panel Layout" */
  title: string;
  subtitle?: string;
  /** extent of the drawn object, used to size the viewport */
  w: Mm;
  l: Mm;
  /** solid background shape, usually the room outline */
  fill?: Pt[];
  lines: DrawLine[];
  dims: DrawDim[];
  notes: DrawNote[];
  cells: DrawCell[];
}

export const emptyDrawing = (title: string, w: Mm, l: Mm): Drawing => ({
  title,
  w,
  l,
  lines: [],
  dims: [],
  notes: [],
  cells: [],
});
