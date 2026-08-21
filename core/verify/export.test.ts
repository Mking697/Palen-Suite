/**
 * Export tests — the workbook and the PDF.
 * Run:  node core/verify/export.test.ts
 *
 * The rule these enforce is the one the drawings already live under, carried
 * one step further: **an export never counts anything.** Every figure in the
 * workbook has to be a figure `buildJob` produced, at the same rounding the
 * screen prints — and the totals row has to be the engine's own number rather
 * than a formula Excel would evaluate for itself.
 *
 * The workbook is opened back up and read here rather than being checked as an
 * opaque blob. A test that cannot see inside the file it wrote only proves that
 * bytes came out.
 */

import assert from 'node:assert/strict';
import { buildJob } from '../boq.ts';
import { jobFlashing } from '../flashing.ts';
import { roomDrawings, jobPlan } from '../draw/index.ts';
import { round2 } from '../format.ts';
import { toXlsx, sheetName, columnName, xlsxFileName } from '../export/xlsx.ts';
import { toPdf, toPdfPages, pdfFileName } from '../export/pdf.ts';
import { crc32, zipStored, unzipStored } from '../export/zip.ts';
import { HI_15191 } from '../jobs/hi-15191.ts';
import { HI_15279 } from '../jobs/hi-15279.ts';
import type { WorkbookJob } from '../export/xlsx.ts';
import type { JobSpec } from '../types.ts';

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${(e as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

const workbookFor = (job: JobSpec): WorkbookJob => ({
  jobNo: job.jobNo,
  density: job.density,
  rooms: job.rooms.map((r) => r.name),
  blocks: buildJob(job),
  flashing: jobFlashing(job),
});

const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array());

console.log('\n  the zip underneath\n');

t('a stored archive reads back as what went in', () => {
  const data = new TextEncoder().encode('hello, sheet fabrication');
  const back = unzipStored(zipStored([{ name: 'a/b.txt', data }]));
  assert.equal(text(back.get('a/b.txt')), 'hello, sheet fabrication');
});

t('CRC32 is the standard one', () => {
  // the check value every CRC-32 implementation agrees on
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

t('the same job twice is byte for byte the same file', () => {
  /*
   * The timestamp on every entry is fixed rather than the clock. Pushing an
   * unchanged job twice must not look like a change — and it lets a test assert
   * on bytes at all.
   */
  const a = toXlsx(workbookFor(HI_15191));
  const b = toXlsx(workbookFor(HI_15191));
  assert.deepEqual(a, b);
});

console.log('\n  the workbook\n');

const wb = unzipStored(toXlsx(workbookFor(HI_15191)));

t('it is a workbook Excel will open — every part present and related', () => {
  for (const part of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ]) {
    assert.ok(wb.has(part), `missing ${part}`);
  }
  const rels = text(wb.get('xl/_rels/workbook.xml.rels'));
  // every sheet the workbook names must have a relationship pointing at a part
  const ids = [...text(wb.get('xl/workbook.xml')).matchAll(/r:id="(rId\d+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2, 'no sheets');
  for (const id of ids) assert.ok(rels.includes(`Id="${id}"`), `no relationship for ${id}`);
  for (const id of ids) {
    const target = rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))![1];
    assert.ok(wb.has(`xl/${target}`), `${id} points at a part that is not there: ${target}`);
  }
});

t('one sheet per room, plus flashing', () => {
  const names = [...text(wb.get('xl/workbook.xml')).matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, [...HI_15191.rooms.map((r) => r.name), 'Job total', 'Flashing']);
});

t('every printed figure is the engine\'s, at the rounding the sheet uses', () => {
  const block = buildJob(HI_15191)[0]!;
  const sheet = text(wb.get('xl/worksheets/sheet1.xml'));

  // a row that owns foam carries its chemical weight, rounded half-up
  const withFoam = block.rows.find((r) => r.chemWeight)!;
  assert.ok(
    sheet.includes(`<v>${round2(withFoam.chemWeight)}</v>`),
    `chemical weight ${round2(withFoam.chemWeight)} is not in the sheet`,
  );

  // and the description it belongs to
  assert.ok(sheet.includes(`<t>${withFoam.desc}</t>`), 'the row description is missing');

  // the block's totals, as the engine worked them out
  assert.ok(sheet.includes(`<v>${block.totals.panelQty}</v>`), 'no panel total');
  assert.ok(sheet.includes(`<v>${round2(block.totals.chemWeight)}</v>`), 'no chemical total');
  assert.ok(sheet.includes(`<v>${round2(block.totals.areaSqmt)}</v>`), 'no area total');
});

t('the totals row is a number, never a formula', () => {
  /*
   * This is the whole reason the workbook is written by hand rather than handed
   * a column of values and a SUM. Every figure has already been rounded half-up
   * to agree with the printed sheet; an Excel formula would re-add them on open
   * and quietly become a second opinion about a BOQ that was checked line by
   * line. Same reasoning that keeps toFixed out of the browser.
   */
  for (const [name, part] of wb) {
    if (!name.startsWith('xl/worksheets/')) continue;
    const xml = text(part);
    assert.ok(!xml.includes('<f>'), `${name} carries a formula`);
    assert.ok(!/SUM\(/i.test(xml), `${name} carries a SUM`);
  }
});

t('flashing is on its own sheet, and says which rows were typed in', () => {
  const flashing = jobFlashing(HI_15191);
  const last = [...wb.keys()].filter((k) => k.startsWith('xl/worksheets/')).pop()!;
  const sheet = text(wb.get(last));
  assert.ok(sheet.includes('Flashing'), 'not the flashing sheet');
  assert.ok(
    sheet.includes(`<v>${round2(flashing.totalRmtr)}</v>`),
    'the running metre total is not the engine\'s',
  );
  // a rule row and a typed row must never read as the same kind of number
  assert.ok(sheet.includes('<t>rule</t>'), 'no source column');
});

t('a room name Excel cannot take is made safe, and stays unique', () => {
  const taken = new Set<string>();
  assert.equal(sheetName('Chiller / Freezer [A]', taken), 'Chiller Freezer A');
  assert.equal(sheetName('Chiller / Freezer [A]', taken), 'Chiller Freezer A (2)');
  assert.equal(sheetName('', taken), 'Sheet');
  assert.ok(sheetName('x'.repeat(60), taken).length <= 31, 'a name over 31 characters');
});

t('a two-room job gets its roll-up, a one-room job does not', () => {
  const one = text(unzipStored(toXlsx(workbookFor(HI_15191))).get('xl/workbook.xml'));
  const two = text(unzipStored(toXlsx(workbookFor(HI_15279))).get('xl/workbook.xml'));
  // HI-15191 has two rooms and HI-15279 has more; both roll up. A single-room
  // job must not, because the roll-up would just repeat the block above it.
  const single: JobSpec = { ...HI_15191, rooms: [HI_15191.rooms[0]!] };
  const solo = text(unzipStored(toXlsx(workbookFor(single))).get('xl/workbook.xml'));
  assert.ok(one.includes('Job total'), 'a multi-room job should roll up');
  assert.ok(two.includes('Job total'), 'a multi-room job should roll up');
  assert.ok(!solo.includes('Job total'), 'a one-room job should not');
});

t('column letters run past Z', () => {
  assert.equal(columnName(0), 'A');
  assert.equal(columnName(25), 'Z');
  assert.equal(columnName(26), 'AA');
});

t('a file name is safe to put in a Drive folder', () => {
  assert.equal(xlsxFileName('HI-15191'), 'HI-15191-BOQ.xlsx');
  assert.equal(xlsxFileName('HI/15191 rev A'), 'HI-15191-rev-A-BOQ.xlsx');
  assert.equal(xlsxFileName(''), 'JOB-BOQ.xlsx');
  assert.equal(pdfFileName('HI-15191'), 'HI-15191-drawing.pdf');
});

console.log('\n  the PDF\n');

const drawing = roomDrawings(HI_15191.rooms[0]!)[0]!;
const pdf = toPdf(drawing, { footer: 'HI-15191' });
const pdfText = new TextDecoder('latin1').decode(pdf);

t('it is a PDF, and it ends the way a PDF ends', () => {
  assert.ok(pdfText.startsWith('%PDF-1.4'), 'no header');
  assert.ok(pdfText.trimEnd().endsWith('%%EOF'), 'no trailer');
});

t('every byte is ASCII, because the xref is byte offsets', () => {
  /*
   * A string index equals a byte offset only while every character is one byte.
   * The moment an accented character goes in unescaped they part company, every
   * offset in the xref table is wrong, and readers reject the file outright.
   */
  const bad = pdf.findIndex((b) => b > 126);
  assert.equal(bad, -1, `a non-ASCII byte at ${bad}`);
});

t('the xref offsets point at the objects they claim to', () => {
  const offsets = [...pdfText.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, 6, 'one page: catalog, tree, page, stream, two fonts');
  offsets.forEach((off, i) => {
    assert.ok(
      pdfText.startsWith(`${i + 1} 0 obj`, off),
      `object ${i + 1} is not at the offset the xref gives`,
    );
  });
  const startxref = Number(pdfText.match(/startxref\n(\d+)/)![1]);
  assert.ok(pdfText.startsWith('xref', startxref), 'startxref does not point at the table');
});

t('the declared stream length is the stream that is there', () => {
  const declared = Number(pdfText.match(/<< \/Length (\d+) >>/)![1]);
  const from = pdfText.indexOf('stream\n') + 'stream\n'.length;
  const to = pdfText.indexOf('\nendstream');
  assert.equal(to - from, declared, 'a reader would run off the end of the stream');
});

t('the drawing is drawn — a line for every line the geometry has', () => {
  // the stroke operator appears at least once per drawn line; the geometry is
  // placed, never re-derived, so the count cannot be short
  const strokes = (pdfText.match(/ l S\n/g) ?? []).length;
  const expected = drawing.lines.length + drawing.dims.length * 3;
  assert.equal(strokes, expected, `${strokes} strokes for ${expected} lines`);
});

t('every panel label reaches the page', () => {
  for (const cell of drawing.cells.slice(0, 6)) {
    assert.ok(pdfText.includes(`(${cell.text}) Tj`), `panel label missing: ${cell.text}`);
  }
});

t('the scale is stated on the sheet', () => {
  // a drawing whose scale is not printed is one somebody will measure off
  assert.ok(/Scale 1:\d/.test(pdfText), 'no scale on the sheet');
  assert.ok(pdfText.includes('HI-15191'), 'the job number should be in the caption');
});

t('a whole-job sheet fits the page too, whatever its size', () => {
  const big = toPdf(jobPlan(HI_15191), { footer: 'HI-15191' });
  const s = new TextDecoder('latin1').decode(big);
  const cm = s.match(/^([\d.]+) 0 0 -([\d.]+) /m)!;
  const k = Number(cm[1]);
  assert.ok(k > 0, 'the fit matrix is not positive');
  // A3 landscape is 420mm wide; the drawing plus its margins must land inside
  const span = Math.max(jobPlan(HI_15191).w, jobPlan(HI_15191).l);
  assert.ok(k * span < 420 * (72 / 25.4), 'the drawing runs off the page');
});

t('many drawings become many pages, each one referenced and each one real', () => {
  /*
   * A single composed sheet is unreadable printed — HI-15191's fourteen views
   * land at 1:159 on an A3 — so a drawing PDF is a page per view. The page tree
   * has to name every one of them and every reference has to resolve, or a
   * reader shows the first page and stops.
   */
  const views = HI_15191.rooms.flatMap((r) => roomDrawings(r));
  assert.ok(views.length > 5, 'this job should have plenty of views');
  const many = new TextDecoder('latin1').decode(toPdfPages(views, { footer: 'HI-15191' }));

  const count = Number(many.match(/\/Count (\d+)/)![1]);
  assert.equal(count, views.length, 'the page tree should count every view');

  const kids = many.match(/\/Kids \[([^\]]+)\]/)![1].trim().split(/\s+0 R\s*/).filter(Boolean);
  assert.equal(kids.length, views.length, 'every page should be a kid of the tree');
  for (const k of kids) {
    assert.ok(new RegExp(`^${k} 0 obj\\n<< /Type /Page `, 'm').test(many), `no page object ${k}`);
  }

  // and the xref still lines up, which is what a reader actually follows
  const offsets = [...many.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, views.length * 2 + 4, 'two objects a page, plus tree and fonts');
  offsets.forEach((off, i) => {
    assert.ok(many.startsWith(`${i + 1} 0 obj`, off), `object ${i + 1} is not where the xref says`);
  });

  // each page states its own scale, because each is fitted separately
  assert.ok((many.match(/Scale 1:/g) ?? []).length === views.length, 'a scale per page');
});

t('a title with a bracket or a backslash cannot break the content stream', () => {
  const odd = { ...drawing, title: 'Room (A) \\ B', notes: [...drawing.notes] };
  const out = new TextDecoder('latin1').decode(toPdf(odd));
  assert.ok(out.includes('Room \\(A\\) \\\\ B'), 'the caption was not escaped');
});

console.log(`\n  ${passed} passed\n`);
