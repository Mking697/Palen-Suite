/**
 * Drawing -> DXF string. Ported from legacy `dxfFromGeom`.
 *
 * Two things are deliberately unchanged from legacy, because AutoCAD users
 * downstream depend on them:
 *   - the Y axis is flipped, since DXF counts upward and the drawing counts down
 *   - the layer names WALL / PANEL / DOOR / DIM / LIGHT / TEXT / CUT
 */

import type { Drawing, Layer } from './types.ts';

/** Text height in mm for each kind of label. Legacy used these figures. */
const H_CELL = 130;
const H_DIM = 150;
const H_NOTE = 150;

export function toDxf(d: Drawing): string {
  const Y = (y: number) => d.l - y;
  const out: string[] = ['0', 'SECTION', '2', 'ENTITIES'];

  const line = (x1: number, y1: number, x2: number, y2: number, layer: Layer) => {
    out.push(
      '0', 'LINE',
      '8', layer,
      '10', String(x1), '20', String(Y(y1)), '30', '0',
      '11', String(x2), '21', String(Y(y2)), '31', '0',
    );
  };

  const text = (x: number, y: number, h: number, s: string, layer: Layer, rot = 0) => {
    out.push(
      '0', 'TEXT',
      '8', layer,
      '10', String(x), '20', String(Y(y)), '30', '0',
      '40', String(h),
      '1', s,
      '50', String(rot),
      // 72/11 = horizontally centred on the given point
      '72', '1',
      '11', String(x), '21', String(Y(y)), '31', '0',
    );
  };

  for (const l of d.lines) line(l.x1, l.y1, l.x2, l.y2, l.layer);

  for (const c of d.cells) {
    text((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, H_CELL, c.text, 'TEXT');
  }

  for (const n of d.notes) {
    // DXF rotation is anticlockwise, the drawing's is clockwise
    text(n.x, n.y, H_NOTE * (n.scale ?? 1), n.text, n.layer ?? 'TEXT', -(n.rot ?? 0));
  }

  for (const dim of d.dims) {
    if (dim.dir === 'h') {
      const y = dim.base;
      const yo = y + dim.off;
      line(dim.a, y, dim.a, yo, 'DIM');
      line(dim.b, y, dim.b, yo, 'DIM');
      line(dim.a, yo, dim.b, yo, 'DIM');
      text(
        (dim.a + dim.b) / 2,
        yo + (dim.off < 0 ? -H_DIM * 1.1 : H_DIM * 1.1),
        H_DIM,
        dim.text,
        'DIM',
      );
    } else {
      const x = dim.base;
      const xo = x + dim.off;
      line(x, dim.a, xo, dim.a, 'DIM');
      line(x, dim.b, xo, dim.b, 'DIM');
      line(xo, dim.a, xo, dim.b, 'DIM');
      text(
        xo + (dim.off < 0 ? -H_DIM * 1.1 : H_DIM * 0.4),
        (dim.a + dim.b) / 2,
        H_DIM,
        dim.text,
        'DIM',
        90,
      );
    }
  }

  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}
