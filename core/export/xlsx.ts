/**
 * BOQ -> `.xlsx`, by hand, with no dependency.
 *
 * A workbook is a ZIP of XML parts; `zip.ts` writes it stored, so no compressor
 * is needed and this repo still has no npm package in it.
 *
 * ---------------------------------------------------------------------------
 * The rule this file exists to keep
 *
 * **An export never counts anything.** Every figure written here comes from
 * `buildJob` and `jobFlashing` already worked out. Nothing is re-derived, and
 * in particular:
 *
 *   - Figures are written as the **rounded** value `core/format.ts` produces,
 *     as a *number* rather than a string, so the cell sorts and sums like a
 *     number but reads exactly as the printed sheet does.
 *   - **The totals row is the engine's own total, never an Excel `SUM`.** A
 *     formula in the workbook would recompute the column when it opens, from
 *     values that have each been rounded — and a spreadsheet formula quietly
 *     becoming a second opinion about a BOQ is precisely the failure this
 *     engine exists to prevent. The same reasoning keeps `toFixed` out of the
 *     browser.
 *
 * A row that the screen leaves blank is left blank here too. The workbook and
 * the screen have to be the same sheet, or the factory has two of them.
 */

import type { BoqBlock } from '../types.ts';
import type { RoomFlashing } from '../flashing.ts';
import { round, round2 } from '../format.ts';
import { zipStored, type ZipEntry } from './zip.ts';

export interface WorkbookJob {
  jobNo: string;
  density: number;
  /** room names, in the same order as `blocks` */
  rooms: string[];
  blocks: BoqBlock[];
  flashing: { rooms: RoomFlashing[]; totalRmtr: number; totalRmtrText: string };
}

/** `null` is an empty cell; a number is written as a number, a string as text. */
type Cell = string | number | null;

/* ---------- XML ---------- */

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Excel will not open a workbook whose sheet name it cannot take: no
 * `: \ / ? * [ ]`, 31 characters at most, never blank, and never two the same.
 * Names come from room names an estimator typed, so all four have to be
 * handled rather than assumed away.
 */
export function sheetName(wanted: string, taken: Set<string>): string {
  let base = wanted.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
  if (!base) base = 'Sheet';
  let name = base;
  let n = 2;
  while (taken.has(name.toLowerCase())) {
    const tail = ` (${n++})`;
    name = base.slice(0, 31 - tail.length) + tail;
  }
  taken.add(name.toLowerCase());
  return name;
}

/** One `<row>`; `bold` marks a header or a totals line. */
function rowXml(cells: Cell[], r: number, bold = false): string {
  const style = bold ? ' s="1"' : '';
  const out: string[] = [`<row r="${r}">`];
  cells.forEach((v, i) => {
    if (v === null || v === '') return; //  an empty cell is simply absent
    const ref = `${columnName(i)}${r}`;
    if (typeof v === 'number') {
      out.push(`<c r="${ref}"${style}><v>${v}</v></c>`);
    } else {
      // inline strings, so there is no shared-string table to keep in step
      out.push(`<c r="${ref}"${style} t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`);
    }
  });
  out.push('</row>');
  return out.join('');
}

function sheetXml(rows: Array<{ cells: Cell[]; bold?: boolean }>, widths: number[]): string {
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const body = rows.map((r, i) => rowXml(r.cells, i + 1, r.bold)).join('');
  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

/* ---------- the sheets ---------- */

/** The BOQ table's columns, in the order the screen and the printed sheet use. */
const BOQ_HEAD = [
  'Description',
  'Panel Size',
  'Blank Size',
  'Sheet Panel',
  'Sheet',
  'Sheet Qty',
  'PLY 12mm',
  'Thk',
  'Chemical Wt (kg)',
  'Area Sqmt',
];
const BOQ_WIDTHS = [46, 16, 16, 11, 11, 10, 10, 7, 17, 12];

const size = (a?: number, b?: number) => (a && b ? `${a} x ${b}` : null);
const qty = (v?: number) => (v ? v : null);

function boqSheet(job: WorkbookJob, block: BoqBlock, roomName: string): string {
  const rows: Array<{ cells: Cell[]; bold?: boolean }> = [
    { cells: [`Job No: ${job.jobNo}`], bold: true },
    { cells: [roomName ? `${roomName} — ${block.title}` : block.title], bold: true },
    { cells: [block.spec] },
    { cells: [`PUF density: ${job.density} kg/m³`] },
    { cells: [] },
    { cells: BOQ_HEAD, bold: true },
  ];

  for (const r of block.rows) {
    rows.push({
      cells: [
        r.desc,
        size(r.panelW, r.panelL),
        size(r.blankW, r.blankL),
        qty(r.panelQty),
        r.ppgiQty ? (r.skin ?? null) : null,
        qty(r.ppgiQty),
        qty(r.plyQty),
        qty(r.thk),
        // rounded the way the sheet prints it, and written as a number
        r.chemWeight ? round2(r.chemWeight) : null,
        // the screen shows row areas to five places and totals to two; the
        // workbook follows the screen rather than inventing a third rounding
        r.areaSqmt ? round(r.areaSqmt, 5) : null,
      ],
    });
  }

  const t = block.totals;
  rows.push({
    cells: [
      'Total',
      null,
      null,
      t.panelQty,
      null,
      t.ppgiQty,
      qty(t.plyQty),
      null,
      // the engine's own totals, as literal numbers. Never =SUM(...) — see the
      // note at the top of this file.
      round2(t.chemWeight),
      round2(t.areaSqmt),
    ],
    bold: true,
  });

  return sheetXml(rows, BOQ_WIDTHS);
}

const FLASH_HEAD = ['Room', 'Flashing', 'Profile', 'Width mm', 'Sheet', 'RMTR', 'Source', 'Note'];
const FLASH_WIDTHS = [22, 20, 18, 11, 14, 10, 10, 60];

/**
 * Flashing, on its own sheet.
 *
 * It is a separate purchase, bought by the running metre, so it carries its own
 * total and never joins the panel counts — the same separation the screen and
 * `core/flashing.ts` keep. `Source` says whether a row was worked out from the
 * room or typed in by the estimator: two numbers that mean different things
 * must never look the same on a sheet.
 */
function flashingSheet(job: WorkbookJob): string {
  const rows: Array<{ cells: Cell[]; bold?: boolean }> = [
    { cells: [`Job No: ${job.jobNo} — Flashing`], bold: true },
    { cells: ['Bought by the running metre. Never part of the panel counts.'] },
    { cells: [] },
    { cells: FLASH_HEAD, bold: true },
  ];

  for (const room of job.flashing.rooms) {
    for (const r of room.rows) {
      rows.push({
        cells: [
          room.room,
          r.label,
          r.profile,
          r.width || null,
          `${r.material} ${r.thickness}`,
          round2(r.rmtr),
          r.source === 'typed' ? 'typed in' : 'rule',
          r.note || null,
        ],
      });
    }
    rows.push({
      cells: [room.room, 'Room total', null, null, null, round2(room.totalRmtr)],
      bold: true,
    });
  }

  rows.push({ cells: [] });
  rows.push({
    cells: ['Total running metre', null, null, null, null, round2(job.flashing.totalRmtr)],
    bold: true,
  });

  return sheetXml(rows, FLASH_WIDTHS);
}

/**
 * The job roll-up, and only when there is more than one room — the same rule
 * the screen follows, where a single-room job's "job total" would just repeat
 * the block above it.
 */
function grandSheet(job: WorkbookJob): string {
  const g = job.blocks.reduce(
    (t, b) => ({
      panelQty: t.panelQty + b.totals.panelQty,
      ppgiQty: t.ppgiQty + b.totals.ppgiQty,
      plyQty: t.plyQty + b.totals.plyQty,
      chemWeight: t.chemWeight + b.totals.chemWeight,
      areaSqmt: t.areaSqmt + b.totals.areaSqmt,
    }),
    { panelQty: 0, ppgiQty: 0, plyQty: 0, chemWeight: 0, areaSqmt: 0 },
  );

  const rows: Array<{ cells: Cell[]; bold?: boolean }> = [
    { cells: [`Job No: ${job.jobNo} — job total`], bold: true },
    { cells: [job.rooms.join(' · ')] },
    { cells: [] },
    { cells: ['Panels', g.panelQty] },
    { cells: ['Sheet skins', g.ppgiQty] },
  ];
  if (g.plyQty) rows.push({ cells: ['PLY 12mm', g.plyQty] });
  rows.push({ cells: ['Chemical weight (kg)', round2(g.chemWeight)] });
  rows.push({ cells: ['Area (m²)', round2(g.areaSqmt)] });
  rows.push({ cells: ['Flashing (running metre)', round2(job.flashing.totalRmtr)] });

  return sheetXml(rows, [30, 16]);
}

/* ---------- the package ---------- */

const utf8 = (s: string) => new TextEncoder().encode(s);

export function toXlsx(job: WorkbookJob): Uint8Array {
  const taken = new Set<string>();
  const sheets: Array<{ name: string; xml: string }> = [];

  job.blocks.forEach((block, i) => {
    const room = job.rooms[i] ?? '';
    sheets.push({
      name: sheetName(room || block.title, taken),
      xml: boqSheet(job, block, room),
    });
  });

  if (job.blocks.length > 1) {
    sheets.push({ name: sheetName('Job total', taken), xml: grandSheet(job) });
  }
  sheets.push({ name: sheetName('Flashing', taken), xml: flashingSheet(job) });

  const parts: ZipEntry[] = [];

  const overrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  parts.push({
    name: '[Content_Types].xml',
    data: utf8(
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        overrides +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
  });

  parts.push({
    name: '_rels/.rels',
    data: utf8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
        '</Relationships>',
    ),
  });

  parts.push({
    name: 'xl/workbook.xml',
    data: utf8(
      `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
        sheets
          .map(
            (s, i) =>
              `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join('') +
        '</sheets></workbook>',
    ),
  });

  parts.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: utf8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
  });

  // two fonts (normal and bold) and the two fills Excel expects to find at
  // indexes 0 and 1, and nothing else — this workbook has no colours
  parts.push({
    name: 'xl/styles.xml',
    data: utf8(
      `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
        '<fonts count="2">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
        '</fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '</cellXfs></styleSheet>',
    ),
  });

  sheets.forEach((s, i) => {
    parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(s.xml) });
  });

  return zipStored(parts);
}

/** `HI-15191-BOQ.xlsx`, safe on every filesystem Drive and Windows care about. */
export const xlsxFileName = (jobNo: string) =>
  `${(jobNo || 'JOB').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'JOB'}-BOQ.xlsx`;

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
