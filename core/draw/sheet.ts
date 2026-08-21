/**
 * Many drawings -> one sheet, the way a drawing office issues them: every view
 * on a single bordered canvas with its own title, instead of a stack of
 * separate pictures.
 *
 * The composition is a **translation only**. No view is scaled, rotated or
 * redrawn, so every millimetre on the sheet is the millimetre the engine
 * worked out and the DXF comes out 1:1 like the single-view exports always
 * have. This file places what the other drawing modules already built; in
 * keeping with the rest of `core/draw/`, it counts nothing of its own.
 *
 * Text is the one thing that cannot simply ride along. A renderer sizes labels
 * from the whole drawing's span, which on a sheet is the sheet — so each view's
 * elements carry the size they were drawn at (`fs`) and keep the look they have
 * on their own.
 */

import type { Drawing, DrawDim, DrawLine, Mm, Pt } from './types.ts';
import { emptyDrawing } from './types.ts';

/** Gap between views, as a share of the widest view. */
const GUTTER = 0.14;
/** Room under a view for its title, as a share of the tallest view. */
const CAPTION = 0.13;
/** Margin between the outermost views and the sheet border. */
const MARGIN = 0.1;

/**
 * How a single view sizes its own text. Mirrors the rule in `svg.ts`, which is
 * the renderer this has to agree with; a view is only legible on the sheet if
 * its labels come out the size they do on their own.
 */
const viewFs = (d: Drawing): Mm => Math.max(90, Math.max(d.w, d.l, 1) * 0.02);

/** Sheet furniture goes on TEXT — the drawing office's layers are a fixed set. */
const FURNITURE = 'TEXT' as const;

export interface SheetOptions {
  /** printed along the bottom of the border */
  title?: string;
  /** how many views per row; by default a squarish grid */
  columns?: number;
}

/** Where a view ended up, so a viewer can find the one that was clicked. */
export interface SheetCell {
  title: string;
  x0: Mm;
  y0: Mm;
  x1: Mm;
  y1: Mm;
}

export interface Sheet {
  drawing: Drawing;
  cells: SheetCell[];
}

export interface Box {
  x0: Mm;
  y0: Mm;
  x1: Mm;
  y1: Mm;
}

/**
 * Everything a view actually occupies — not `w` and `l`, which are only the
 * extent of the *object*. A dimension hangs outside the room it measures and a
 * caption sits below it, so sizing a cell to `w` and `l` puts the chain through
 * the neighbouring view. This walks every element instead, text included, and
 * is why a view stays inside its own frame.
 *
 * Exported because `core/export/pdf.ts` needs the same answer for the same
 * reason: a page sized to `w` and `l` would crop the dimension chain, and one
 * sized to a guessed margin wastes most of the paper.
 */
export function boundsOf(d: Drawing): Box {
  const fs = viewFs(d);
  const b: Box = { x0: 0, y0: 0, x1: d.w, y1: d.l };
  const grow = (x: Mm, y: Mm) => {
    b.x0 = Math.min(b.x0, x);
    b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x);
    b.y1 = Math.max(b.y1, y);
  };

  for (const p of d.fill ?? []) grow(p[0], p[1]);
  for (const l of d.lines) {
    grow(l.x1, l.y1);
    grow(l.x2, l.y2);
  }
  for (const c of d.cells) {
    grow(c.x0, c.y0);
    grow(c.x1, c.y1);
  }
  for (const n of d.notes) {
    // a centred label, roughly 0.6 of the font size per character
    const half = n.text.length * fs * (n.scale ?? 1) * 0.31;
    grow(n.x - half, n.y - fs);
    grow(n.x + half, n.y + fs * 0.7);
  }
  for (const dm of d.dims) {
    // the witness line, the dimension line, and the figure beyond it
    const beyond = dm.off + Math.sign(dm.off || 1) * fs * 2;
    if (dm.dir === 'h') {
      grow(dm.a, dm.base);
      grow(dm.b, dm.base + beyond);
    } else {
      grow(dm.base, dm.a);
      grow(dm.base + beyond, dm.b);
    }
  }
  return b;
}

/**
 * Lay every view out on one canvas, left to right and top to bottom in the
 * order given. Returns a `Drawing`, so `toSvg` and `toDxf` render a sheet
 * without knowing that is what it is.
 */
export function composeSheet(views: Drawing[], opts: SheetOptions = {}): Sheet {
  const drawn = views.filter((v) => v.w > 0 && v.l > 0);
  if (!drawn.length) return { drawing: emptyDrawing(opts.title ?? 'Sheet', 0, 0), cells: [] };

  const cols = opts.columns ?? Math.min(3, Math.ceil(Math.sqrt(drawn.length)));
  const rows = Math.ceil(drawn.length / cols);

  // one cell size for the whole sheet, taken from the widest and tallest view
  // *including its dimensions and labels*, so nothing crosses a frame
  const boxes = drawn.map(boundsOf);
  const maxW = Math.max(...boxes.map((b) => b.x1 - b.x0));
  const maxL = Math.max(...boxes.map((b) => b.y1 - b.y0));
  const gutter = maxW * GUTTER;
  const caption = maxL * CAPTION;
  const cellW = maxW + gutter;
  const cellH = maxL + caption + gutter;
  const margin = maxW * MARGIN;

  const sheetW = cols * cellW - gutter + margin * 2;
  const sheetH = rows * cellH - gutter + margin * 2 + caption;

  const out = emptyDrawing(opts.title ?? 'Drawing Sheet', sheetW, sheetH);
  const fill: Pt[] = [];
  const cells: SheetCell[] = [];

  drawn.forEach((view, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = boxes[i];
    // centre the view's real extent in its cell, so a narrow elevation is not
    // stranded left and a wide plan does not lean out of its frame
    const ox = margin + col * cellW + (maxW - (bx.x1 - bx.x0)) / 2 - bx.x0;
    const oy = margin + row * cellH + (maxL - (bx.y1 - bx.y0)) / 2 - bx.y0;
    const fs = viewFs(view);

    if (view.fill?.length) {
      // one polygon per view is not expressible in a single `fill`, so each
      // becomes an outline on the panel layer instead of a solid
      const pts = view.fill.map((p): Pt => [p[0] + ox, p[1] + oy]);
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        out.lines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], layer: 'PANEL' });
      }
      if (i === 0) fill.push(...pts);
    }

    for (const l of view.lines) out.lines.push(shiftLine(l, ox, oy));
    for (const c of view.cells) out.cells.push({ ...c, x0: c.x0 + ox, y0: c.y0 + oy, x1: c.x1 + ox, y1: c.y1 + oy, fs });
    for (const n of view.notes) out.notes.push({ ...n, x: n.x + ox, y: n.y + oy, fs });
    for (const dm of view.dims) out.dims.push(shiftDim(dm, ox, oy, fs));

    // the view's own frame and caption
    const x0 = margin + col * cellW - gutter / 2;
    const y0 = margin + row * cellH - gutter / 2;
    box(out, x0, y0, x0 + cellW, y0 + cellH);
    cells.push({ title: view.title, x0, y0, x1: x0 + cellW, y1: y0 + cellH });

    out.notes.push({
      x: x0 + cellW / 2,
      y: margin + row * cellH + maxL + caption * 0.55,
      text: view.title,
      layer: FURNITURE,
      fs,
      scale: 1.15,
    });
    if (view.subtitle) {
      out.notes.push({
        x: x0 + cellW / 2,
        y: margin + row * cellH + maxL + caption * 0.85,
        text: view.subtitle,
        layer: FURNITURE,
        fs,
        scale: 0.78,
      });
    }
  });

  // the sheet border and its title block
  box(out, 0, 0, sheetW, sheetH);
  const titleFs = viewFs(out) * 0.5;
  out.lines.push({
    x1: 0, y1: sheetH - caption, x2: sheetW, y2: sheetH - caption, layer: FURNITURE,
  });
  out.notes.push({
    x: sheetW / 2,
    y: sheetH - caption * 0.35,
    text: out.title,
    layer: FURNITURE,
    fs: titleFs,
  });

  if (fill.length) out.fill = fill;
  return { drawing: out, cells };
}

function box(d: Drawing, x0: Mm, y0: Mm, x1: Mm, y1: Mm) {
  const pts: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    d.lines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], layer: FURNITURE });
  }
}

const shiftLine = (l: DrawLine, ox: Mm, oy: Mm): DrawLine => ({
  ...l,
  x1: l.x1 + ox,
  y1: l.y1 + oy,
  x2: l.x2 + ox,
  y2: l.y2 + oy,
});

/**
 * A horizontal dim measures along x and hangs off a y line; a vertical one is
 * the other way round. `off` is a delta and does not move.
 */
const shiftDim = (d: DrawDim, ox: Mm, oy: Mm, fs: Mm): DrawDim =>
  d.dir === 'h'
    ? { ...d, a: d.a + ox, b: d.b + ox, base: d.base + oy, fs }
    : { ...d, a: d.a + oy, b: d.b + oy, base: d.base + ox, fs };
