/**
 * Drawing -> PDF, by hand, with no dependency.
 *
 * A PDF of lines and text is a content stream of a dozen operators — much like
 * the DXF this repo already writes by hand, and built from the same `Drawing`
 * that `toSvg` and `toDxf` take. All three read one geometry, so the screen,
 * AutoCAD and the emailed sheet cannot disagree.
 *
 * **A drawing never counts anything**, and neither does an export: not one
 * width, quantity or area is worked out here. Every number placed on the page
 * came out of `layoutRoom`.
 *
 * ---------------------------------------------------------------------------
 * 1:1 in millimetres, on a page somebody can open
 *
 * `DESIGN.md` asks for the sheet 1:1 in millimetres. Taken literally that means
 * a page as wide as the job — a six metre drawing is a six metre page, which is
 * past the PDF format's own 200 inch limit and is not a thing anyone can print
 * or read.
 *
 * So the *coordinates* are 1:1 and the *page* is a sheet. Every number written
 * into the content stream is the raw millimetre figure from the `Drawing`;
 * a single `cm` matrix maps millimetres to points, centres the drawing on the
 * page and flips the Y axis (a drawing counts down, PDF counts up). Nothing is
 * rescaled or redrawn on the way. **The ratio that matrix works out is printed
 * on the sheet**, because a drawing whose scale is not stated is a drawing
 * somebody will measure off wrongly. The DXF remains the 1:1 artefact that goes
 * to the machine — this is the one that goes to a customer.
 */

import type { Drawing, DrawDim, Layer } from '../draw/types.ts';
import { boundsOf } from '../draw/sheet.ts';

export interface PdfOptions {
  /**
   * Paper size in mm. Default A3. The *orientation* is not taken from this —
   * see `orient` — so `{ w: 420, h: 297 }` and `{ w: 297, h: 420 }` mean the
   * same sheet of paper.
   */
  page?: { w: number; h: number };
  /**
   * Turn the paper to suit the drawing, so a tall elevation gets a portrait
   * page and a wide plan a landscape one. On by default: it is the difference
   * between a drawing at 1:14 and the same drawing at 1:9 on the same paper.
   * Set false to hold the orientation given.
   */
  orient?: boolean;
  /** page margin, mm */
  margin?: number;
  /** printed under the drawing; the job number belongs here */
  footer?: string;
}

const A3_LANDSCAPE = { w: 420, h: 297 };
const MM2PT = 72 / 25.4;

/** The light palette `toSvg` prints with — these sheets go out with the BOQ. */
const INK = '#1d242c';
const COLOURS: Record<Layer, string> = {
  WALL: '#b4651a',
  PANEL: '#4a545f',
  DOOR: '#c2185b',
  DIM: '#1f7a4d',
  LIGHT: '#e3a008',
  TEXT: INK,
  CUT: '#c2185b',
};
const PAPER = '#f7f9fb';
const NON_STD = '#b7791f';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => (v / 255).toFixed(3);
  return `${f((n >> 16) & 255)} ${f((n >> 8) & 255)} ${f(n & 255)}`;
};

/**
 * The typography this repo writes that WinAnsiEncoding has no code point for.
 *
 * Found by looking at a rendered page, not by a test: every drawing title is
 * `Room — View`, and the em dash came out as `?` on the sheet. A drawing whose
 * caption reads `Freezer Room ? Wall N elevation` looks like a fault in the
 * tool. These are the characters the drawings and BOQ actually use.
 */
const TRANSLITERATE: Record<string, string> = {
  '—': '-', //  em dash
  '–': '-', //  en dash
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '×': 'x', //  multiplication sign
  '→': '->',
};

/**
 * Text in a PDF string literal.
 *
 * `(`, `)` and `\` end or escape the literal, so they are escaped. Everything
 * above 126 is written as an octal escape, which keeps the whole file ASCII
 * and therefore keeps a JavaScript string index equal to a byte offset. The
 * xref table is byte offsets, so that equality is not a nicety — it is the
 * difference between a file that opens and one every reader rejects.
 *
 * Past Latin-1 there is no code point to escape to, so the few characters this
 * repo actually writes are transliterated and anything else becomes `?`: a
 * visible substitution beats a glyph the reader drops silently.
 */
const pdfText = (s: string) => {
  let out = '';
  for (const ch of s) {
    const mapped = TRANSLITERATE[ch] ?? ch;
    for (const m of mapped) {
      const c = m.codePointAt(0)!;
      if (m === '(' || m === ')' || m === '\\') out += '\\' + m;
      else if (c < 32) out += ' ';
      else if (c < 127) out += m;
      else if (c < 256) out += '\\' + c.toString(8).padStart(3, '0');
      else out += '?';
    }
  }
  return out;
};

/**
 * Courier, for everything on the drawing.
 *
 * The SVG draws labels in `ui-monospace`, and Courier is the monospaced font
 * every PDF reader already has. It also makes centring exact rather than
 * estimated: every Courier glyph is 600/1000 of an em, so a string's width is
 * its length times 0.6 — no font metrics table, and no drifting labels.
 */
const COURIER_EM = 0.6;
const widthOf = (text: string, fs: number) => text.length * COURIER_EM * fs;

/** One drawing laid out on one page: the content stream and the paper it needs. */
interface Page {
  stream: string;
  w: number;
  h: number;
}

/** One drawing, on a page of its own. */
export function toPdf(d: Drawing, opts: PdfOptions = {}): Uint8Array {
  return assemble([pageOf(d, opts)]);
}

/**
 * Several drawings, one to a page — which is what a drawing PDF has to be.
 *
 * The composed sheet crams every view of a job onto one canvas, and that is
 * right on screen where it can be zoomed and clicked. Printed, HI-15191's
 * fourteen views came out at 1:159 on an A3 and no figure on it was readable.
 * A page each puts every view at a scale somebody can work from, and each page
 * still states its own. Found by rendering the file and looking at it, which is
 * the only way this kind of fault is ever found.
 */
export function toPdfPages(drawings: Drawing[], opts: PdfOptions = {}): Uint8Array {
  if (!drawings.length) throw new Error('a PDF needs at least one drawing');
  return assemble(drawings.map((d) => pageOf(d, opts)));
}

function pageOf(d: Drawing, opts: PdfOptions = {}): Page {
  const margin = opts.margin ?? 12;

  // the same visual constants toSvg uses, so the two look like one drawing
  const span = Math.max(d.w, d.l, 1);
  const FS = Math.max(90, span * 0.02);
  const SW = Math.max(6, span * 0.0018);
  const DSW = Math.max(4, span * 0.0011);

  /*
   * The page is sized to what the drawing actually occupies, not to `w` and
   * `l`. Those are the extent of the *object*, and a dimension chain hangs
   * outside the room it measures — sizing to them crops the chain off the page.
   * `toSvg` pads by 30% instead, which is right on a screen that scrolls and
   * wrong on a sheet: it left the drawing at a fifth of an A3 with white all
   * round it. Found by looking at a rendered page.
   *
   * `boundsOf` is the sheet composer's own function, walking every line, label
   * and dimension. Reused rather than reimplemented, so a view that fits its
   * frame on the composed sheet fits this page for the same reason.
   */
  const box = boundsOf(d);
  const pad = FS * 1.5;
  const vx0 = box.x0 - pad;
  const vy0 = box.y0 - pad;
  const vw = box.x1 - box.x0 + pad * 2;
  const vh = box.y1 - box.y0 + pad * 2;

  /*
   * Turn the paper to suit the drawing. A wall elevation is taller than it is
   * wide and a ceiling plan is wider than it is tall; forcing both onto one
   * orientation leaves half the sheet blank and shrinks the drawing to fit the
   * wrong dimension. Same paper, turned.
   */
  const paper = opts.page ?? A3_LANDSCAPE;
  const long = Math.max(paper.w, paper.h);
  const short = Math.min(paper.w, paper.h);
  const page =
    opts.orient === false
      ? paper
      : vh > vw
        ? { w: short, h: long }
        : { w: long, h: short };

  const pageW = page.w * MM2PT;
  const pageH = page.h * MM2PT;

  const footerH = 16; //  pt, room for one line of caption
  const availW = pageW - margin * MM2PT * 2;
  const availH = pageH - margin * MM2PT * 2 - footerH;

  /** points per millimetre: the fit. 1:1 when it equals MM2PT. */
  const k = Math.min(availW / vw, availH / vh);
  const offX = margin * MM2PT + (availW - vw * k) / 2;
  const offY = margin * MM2PT + footerH + (availH - vh * k) / 2;

  /** Drawing millimetres -> page points. Used only for text, which is upright. */
  const px = (x: number) => offX + (x - vx0) * k;
  const py = (y: number) => offY + (vh - (y - vy0)) * k;

  const body: string[] = [];
  const text: string[] = [];

  /* ---------- the geometry, in millimetres under one matrix ---------- */

  body.push('q');
  // a b c d e f cm — d is negative, which is the Y flip
  body.push(
    `${k.toFixed(6)} 0 0 ${(-k).toFixed(6)} ` +
      `${(offX - k * vx0).toFixed(3)} ${(offY + k * (vh + vy0)).toFixed(3)} cm`,
  );
  body.push('1 J 1 j'); //  round caps and joins, as the SVG draws them

  if (d.fill?.length) {
    body.push(`${rgb(PAPER)} rg`);
    d.fill.forEach((pt, i) => body.push(`${pt[0]} ${pt[1]} ${i === 0 ? 'm' : 'l'}`));
    body.push('h f');
  }

  let stroke = '';
  let width = -1;
  let dashed = false;
  for (const l of d.lines) {
    const col = rgb(COLOURS[l.layer]);
    if (col !== stroke) body.push(`${(stroke = col)} RG`);
    const sw = l.layer === 'DOOR' ? SW * 2.2 : l.layer === 'WALL' ? SW * 1.4 : SW;
    if (sw !== width) body.push(`${(width = sw).toFixed(3)} w`);
    if (!!l.dash !== dashed) {
      dashed = !!l.dash;
      body.push(dashed ? `[${(SW * 4).toFixed(2)} ${(SW * 4).toFixed(2)}] 0 d` : '[] 0 d');
    }
    body.push(`${l.x1} ${l.y1} m ${l.x2} ${l.y2} l S`);
  }
  if (dashed) body.push('[] 0 d');

  // dimension chains: the same three lines toSvg and toDxf draw
  body.push(`${rgb(COLOURS.DIM)} RG`);
  body.push(`${DSW.toFixed(3)} w`);
  for (const dim of d.dims) {
    for (const [x1, y1, x2, y2] of dimLines(dim)) {
      body.push(`${x1} ${y1} m ${x2} ${y2} l S`);
    }
  }
  body.push('Q');

  /* ---------- the labels, upright in page space ---------- */

  /** One label, centred on (x, y) in drawing millimetres. */
  const label = (x: number, y: number, mmSize: number, s: string, col: string, rot = 0) => {
    if (!s) return;
    const fs = mmSize * k;
    if (fs < 1.2) return; //  below this nothing is readable; the DXF has it all
    const a = (-rot * Math.PI) / 180; //  PDF turns anticlockwise, the drawing clockwise
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const half = widthOf(s, fs) / 2;
    // centre on the point: step back half the string along the baseline, and
    // down a third of the cap height across it
    const bx = px(x) - half * cos + fs * 0.35 * sin;
    const by = py(y) - half * sin - fs * 0.35 * cos;
    text.push(
      'BT',
      `${rgb(col)} rg`,
      `/F1 ${fs.toFixed(3)} Tf`,
      `${cos.toFixed(6)} ${sin.toFixed(6)} ${(-sin).toFixed(6)} ${cos.toFixed(6)} ` +
        `${bx.toFixed(3)} ${by.toFixed(3)} Tm`,
      `(${pdfText(s)}) Tj`,
      'ET',
    );
  };

  for (const c of d.cells) {
    const cx = (c.x0 + c.x1) / 2;
    const cy = (c.y0 + c.y1) / 2;
    const cw = Math.abs(c.x1 - c.x0);
    const ch = Math.abs(c.y1 - c.y0);
    const horiz = cw >= ch;
    const along = horiz ? cw : ch;
    const across = horiz ? ch : cw;
    // shrink to fit the panel it labels, but never below readable — the same
    // arithmetic toSvg uses, so a label that fits on screen fits here
    const base = c.fs ?? FS;
    let fs = Math.min(base, across * 0.6, (along * 0.85) / (c.text.length * 0.58));
    fs = Math.max(fs, base * 0.34);
    label(cx, cy, fs, c.text, c.std ? COLOURS.DIM : NON_STD, horiz ? 0 : -90);
  }

  for (const dim of d.dims) {
    const fs = dim.fs ?? FS;
    const gap = fs * 0.55;
    if (dim.dir === 'h') {
      const yo = dim.base + dim.off;
      label(
        (dim.a + dim.b) / 2,
        yo + (dim.off < 0 ? -gap : gap + fs * 0.8),
        fs,
        dim.text,
        COLOURS.DIM,
      );
    } else {
      const xo = dim.base + dim.off;
      label(xo + (dim.off < 0 ? -gap : gap), (dim.a + dim.b) / 2, fs, dim.text, COLOURS.DIM, -90);
    }
  }

  for (const n of d.notes) {
    label(n.x, n.y, (n.fs ?? FS) * (n.scale ?? 1), n.text, COLOURS[n.layer ?? 'TEXT'], n.rot ?? 0);
  }

  /* ---------- the caption ---------- */

  /*
   * The scale is stated because it is not 1:1 — see the note at the top. A
   * ratio of 1:20 means twenty millimetres of room to one on the page; it is
   * rounded to something a person can read, and the DXF is named as the thing
   * to measure off instead.
   */
  const ratio = MM2PT / k;
  const scaleText = ratio >= 1.005 ? `1:${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}` : '1:1';
  const caption = [d.title, d.subtitle, opts.footer, `Scale ${scaleText} on ${page.w}x${page.h}mm`]
    .filter(Boolean)
    .join('   ·   ');

  text.push(
    'BT',
    `${rgb(INK)} rg`,
    '/F2 8 Tf',
    `${(margin * MM2PT).toFixed(2)} ${(margin * MM2PT).toFixed(2)} Td`,
    `(${pdfText(caption)}) Tj`,
    'ET',
  );

  return { stream: body.concat(text).join('\n'), w: pageW, h: pageH };
}

/** The three lines of a dimension chain, in drawing millimetres. */
function dimLines(d: DrawDim): Array<[number, number, number, number]> {
  if (d.dir === 'h') {
    const y = d.base;
    const yo = y + d.off;
    return [
      [d.a, y, d.a, yo],
      [d.b, y, d.b, yo],
      [d.a, yo, d.b, yo],
    ];
  }
  const x = d.base;
  const xo = x + d.off;
  return [
    [x, d.a, xo, d.a],
    [x, d.b, xo, d.b],
    [xo, d.a, xo, d.b],
  ];
}

/**
 * The file around the content stream: catalog, page tree, one page, two fonts.
 *
 * `xref` is a table of byte offsets, which is why `pdfText` keeps every byte
 * ASCII — otherwise a string index and a byte offset part company on the first
 * accented character and every reader rejects the file.
 */
function assemble(pages: Page[]): Uint8Array {
  /*
   * Object numbering, fixed so the references can be written before the
   * objects are: 1 catalog, 2 page tree, then a page and its content stream in
   * pairs from 3, then the two fonts. A page is at 3 + 2i and its stream at
   * 4 + 2i, so the fonts land after every pair.
   */
  const pageObj = (i: number) => 3 + i * 2;
  const fontA = 3 + pages.length * 2;
  const fontB = fontA + 1;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] ` +
      `/Count ${pages.length} >>`,
  ];

  pages.forEach((p, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w.toFixed(2)} ${p.h.toFixed(2)}] ` +
        `/Resources << /Font << /F1 ${fontA} 0 R /F2 ${fontB} 0 R >> >> ` +
        `/Contents ${pageObj(i) + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${p.stream.length} >>\nstream\n${p.stream}\nendstream`);
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });

  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  // every byte is ASCII by construction, so this is the byte-for-byte file the
  // offsets above were measured against
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** `HI-15191-drawing.pdf`, safe on every filesystem Drive and Windows care about. */
export const pdfFileName = (jobNo: string, what = 'drawing') =>
  `${(jobNo || 'JOB').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'JOB'}-${what}.pdf`;

export const PDF_MIME = 'application/pdf';
