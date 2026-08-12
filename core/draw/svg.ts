/**
 * Drawing -> SVG string. Ported from legacy `svgFromGeom`.
 *
 * Pure string building, no DOM, so it works server-side and in a test. The
 * palette defaults to a printable light sheet rather than the legacy dark
 * screen, because these drawings go out with the BOQ.
 */

import type { Drawing, DrawDim, Layer } from './types.ts';

export interface SvgOptions {
  /** longest edge of the rendered element, px */
  maxWidth?: number;
  theme?: 'light' | 'dark';
}

const LIGHT = {
  bg: '#ffffff',
  paper: '#f7f9fb',
  ink: '#1d242c',
  wall: '#b4651a',
  panel: '#4a545f',
  door: '#c2185b',
  dim: '#1f7a4d',
  light: '#e3a008',
  cut: '#c2185b',
  nonStd: '#b7791f',
};

const DARK = {
  bg: '#0d1117',
  paper: '#141b24',
  ink: '#e6edf3',
  wall: '#d08b3c',
  panel: '#8b95a1',
  door: '#fb7185',
  dim: '#4ade80',
  light: '#ffd23f',
  cut: '#fb7185',
  nonStd: '#ffd23f',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toSvg(d: Drawing, opts: SvgOptions = {}): string {
  const C = opts.theme === 'dark' ? DARK : LIGHT;
  const span = Math.max(d.w, d.l, 1);

  // every visual constant scales with the drawing so a 2m room and a 20m room
  // both come out legible
  const FS = Math.max(90, span * 0.02);
  const SW = Math.max(6, span * 0.0018);
  const DSW = Math.max(4, span * 0.0011);
  const TG = FS * 0.55;

  const padX = Math.max(d.w * 0.3, FS * 11);
  const padY = Math.max(d.l * 0.3, FS * 11);

  const layerColour: Record<Layer, string> = {
    WALL: C.wall,
    PANEL: C.panel,
    DOOR: C.door,
    DIM: C.dim,
    LIGHT: C.light,
    TEXT: C.ink,
    CUT: C.cut,
  };

  const p: string[] = [];

  if (d.fill?.length) {
    p.push(
      `<polygon points="${d.fill.map((pt) => pt.join(',')).join(' ')}" fill="${C.paper}"/>`,
    );
  }

  for (const l of d.lines) {
    const col = layerColour[l.layer];
    const sw = l.layer === 'DOOR' ? SW * 2.2 : l.layer === 'WALL' ? SW * 1.4 : SW;
    p.push(
      `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${col}" ` +
        `stroke-width="${sw}" stroke-linecap="square"` +
        (l.dash ? ` stroke-dasharray="${SW * 4} ${SW * 4}"` : '') +
        `/>`,
    );
  }

  for (const c of d.cells) {
    const cx = (c.x0 + c.x1) / 2;
    const cy = (c.y0 + c.y1) / 2;
    const cw = Math.abs(c.x1 - c.x0);
    const ch = Math.abs(c.y1 - c.y0);
    const horiz = cw >= ch;
    const along = horiz ? cw : ch;
    const across = horiz ? ch : cw;
    // shrink to fit the panel it labels, but never below readable
    let fs = Math.min(FS, across * 0.6, (along * 0.85) / (c.text.length * 0.58));
    fs = Math.max(fs, FS * 0.34);
    const col = c.std ? C.dim : C.nonStd;
    const rot = horiz ? '' : ` transform="rotate(-90 ${cx} ${cy})"`;
    p.push(
      `<text x="${cx}" y="${cy + fs * 0.35}" font-size="${fs}" fill="${col}" ` +
        `font-family="ui-monospace, monospace" text-anchor="middle"${rot}>${esc(c.text)}</text>`,
    );
  }

  for (const dim of d.dims) p.push(...dimSvg(dim, C.dim, DSW, FS, TG));

  for (const n of d.notes) {
    const size = FS * (n.scale ?? 1);
    const col = layerColour[n.layer ?? 'TEXT'];
    const rot = n.rot ? ` transform="rotate(${n.rot} ${n.x} ${n.y})"` : '';
    p.push(
      `<text x="${n.x}" y="${n.y}" font-size="${size}" fill="${col}" ` +
        `font-family="ui-monospace, monospace" text-anchor="middle"${rot}>${esc(n.text)}</text>`,
    );
  }

  const vw = d.w + padX * 2;
  const vh = d.l + padY * 2;
  const width = Math.min(opts.maxWidth ?? 900, vw);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padX} ${-padY} ${vw} ${vh}" ` +
    `width="${width}" style="background:${C.bg};max-width:100%;height:auto">` +
    p.join('') +
    `</svg>`
  );
}

function dimSvg(d: DrawDim, col: string, sw: number, fs: number, gap: number): string[] {
  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    out.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${sw}"/>`,
    );

  if (d.dir === 'h') {
    const y = d.base;
    const yo = y + d.off;
    line(d.a, y, d.a, yo);
    line(d.b, y, d.b, yo);
    line(d.a, yo, d.b, yo);
    const ty = yo + (d.off < 0 ? -gap : gap + fs * 0.8);
    out.push(
      `<text x="${(d.a + d.b) / 2}" y="${ty}" font-size="${fs}" fill="${col}" ` +
        `font-family="ui-monospace, monospace" text-anchor="middle">${esc(d.text)}</text>`,
    );
  } else {
    const x = d.base;
    const xo = x + d.off;
    line(x, d.a, xo, d.a);
    line(x, d.b, xo, d.b);
    line(xo, d.a, xo, d.b);
    const tx = xo + (d.off < 0 ? -gap : gap);
    const my = (d.a + d.b) / 2;
    out.push(
      `<text x="${tx}" y="${my}" font-size="${fs}" fill="${col}" ` +
        `font-family="ui-monospace, monospace" text-anchor="middle" ` +
        `transform="rotate(-90 ${tx} ${my})">${esc(d.text)}</text>`,
    );
  }
  return out;
}
