/**
 * Line-by-line diff of every generated BOQ against its production sheet.
 * Run:  node core/verify/run.ts
 *
 * A row marked ! is a place where the printed sheet disagrees with the rule the
 * other sheets follow. The engine keeps the rule; the sheet value and the reason
 * are both printed. Those are reported, not counted as engine failures.
 */

import { buildJob } from '../boq.ts';
import { fmt2, round2 } from '../format.ts';
import type { BoqBlock, BoqRow, JobSpec } from '../types.ts';
import type { ExpectedBlock, ExpectedRow } from './expected.ts';

import { HI_15191 } from '../jobs/hi-15191.ts';
import { HI_15191_EXPECTED } from './hi-15191.expected.ts';
import { HI_15223 } from '../jobs/hi-15223.ts';
import { HI_15223_EXPECTED } from './hi-15223.expected.ts';
import { HI_15279 } from '../jobs/hi-15279.ts';
import { HI_15279_EXPECTED } from './hi-15279.expected.ts';

const CASES: Array<{ job: JobSpec; expected: ExpectedBlock[] }> = [
  { job: HI_15191, expected: HI_15191_EXPECTED },
  { job: HI_15223, expected: HI_15223_EXPECTED },
  { job: HI_15279, expected: HI_15279_EXPECTED },
];

const OK = '✓';
const BAD = '✗';
const DEV = '!';
const RULE = '='.repeat(108);

const n = (v: number | null | undefined) =>
  v === null || v === undefined || v === 0 ? '' : String(v);
const cell = (s: string, w: number, right = true) =>
  right ? s.padStart(w) : s.padEnd(w);
const size = (a?: number, b?: number) => (a && b ? `${a} x ${b}` : '');

const sameWeight = (a: number, b: number) => round2(a) === round2(b);
const sameArea = (a: number, b: number) => Math.abs(a - b) < 1e-6;
function sameNum(a: number | undefined, b: number | null) {
  const av = a ?? null;
  if (av === null && b === null) return true;
  if (av === null || b === null) return false;
  return Math.abs(av - b) < 1e-6;
}

function compareRow(got: BoqRow | undefined, want: ExpectedRow) {
  if (!got) return { pass: false, deviated: false, fails: ['row missing'] };
  const fails: string[] = [];
  const push = (ok: boolean, msg: string) => {
    if (!ok) fails.push(msg);
  };

  // on a field the sheet contradicts, compare against the rule instead
  type F = 'ppgiQty' | 'panelQty' | 'blankW' | 'blankL';
  const target = (f: F) => (want.rule && f in want.rule ? want.rule[f]! : want[f]);
  const deviated = !!want.rule && Object.keys(want.rule).length > 0;

  push(got.desc === want.desc, `desc "${got.desc}" != "${want.desc}"`);
  push(sameNum(got.panelW, want.panelW), `panelW ${got.panelW} != ${want.panelW}`);
  push(sameNum(got.panelL, want.panelL), `panelL ${got.panelL} != ${want.panelL}`);
  push(sameNum(got.blankW, target('blankW')), `blankW ${got.blankW} != ${target('blankW')}`);
  push(sameNum(got.blankL, target('blankL')), `blankL ${got.blankL} != ${target('blankL')}`);
  push(sameNum(got.panelQty, target('panelQty')), `panel ${got.panelQty} != ${target('panelQty')}`);
  push(sameNum(got.ppgiQty, target('ppgiQty')), `ppgi ${got.ppgiQty} != ${target('ppgiQty')}`);
  push(got.thk === want.thk, `thk ${got.thk} != ${want.thk}`);
  push(sameWeight(got.chemWeight, want.chemWeight), `wt ${fmt2(got.chemWeight)} != ${want.chemWeight}`);
  push(sameArea(got.areaSqmt, want.areaSqmt), `area ${got.areaSqmt} != ${want.areaSqmt}`);

  return { pass: fails.length === 0, deviated, fails };
}

function printBlock(got: BoqBlock, want: ExpectedBlock) {
  console.log(`\n  ${want.title}`);
  console.log(`  ${got.spec}\n`);
  const head =
    '  ' + cell('', 2, false) + cell('Description', 32, false) +
    cell('Panel Size', 14) + cell('Blank Size', 14) + cell('Pnl', 5) +
    cell('PPGI', 6) + cell('Thk', 5) + cell('Weight', 10) + cell('Area Sqmt', 12);
  console.log(head);
  console.log('  ' + '-'.repeat(head.length - 2));

  let failures = 0;
  let deviations = 0;
  const seen = new Set<string>();
  const len = Math.max(got.rows.length, want.rows.length);

  for (let i = 0; i < len; i++) {
    const g = got.rows[i];
    const w = want.rows[i];
    if (!w) {
      console.log(`  ${BAD} EXTRA ROW GENERATED: ${g?.desc}`);
      failures++;
      continue;
    }
    const { pass, deviated, fails } = compareRow(g, w);
    if (!pass) failures++;
    if (pass && deviated) deviations++;

    console.log(
      '  ' +
        cell(!pass ? BAD : deviated ? DEV : OK, 2, false) +
        cell(w.desc, 32, false) +
        cell(size(g?.panelW, g?.panelL), 14) +
        cell(size(g?.blankW, g?.blankL), 14) +
        cell(n(g?.panelQty), 5) +
        cell(n(g?.ppgiQty), 6) +
        cell(String(g?.thk ?? ''), 5) +
        cell(g?.chemWeight ? fmt2(g.chemWeight) : '', 10) +
        cell(g?.areaSqmt ? String(+g.areaSqmt.toFixed(6)) : '', 12),
    );
    if (!pass) console.log(`      ${BAD} ${fails.join('  |  ')}`);
    else if (deviated && w.note && !seen.has(w.note)) {
      seen.add(w.note);
      const printed = Object.keys(w.rule ?? {})
        .map((f) => `${f} ${w[f as keyof ExpectedRow] ?? 'blank'}`)
        .join(', ');
      console.log(`      ${DEV} sheet prints ${printed} — ${w.note}`);
    }
  }

  console.log('  ' + '-'.repeat(head.length - 2));

  const rt = want.ruleTotals ?? {};
  const ppgiTarget = rt.ppgiQty ?? want.totals.ppgiQty;
  const panelTarget = rt.panelQty ?? want.totals.panelQty;
  const tp = got.totals.panelQty === panelTarget;
  const tg = got.totals.ppgiQty === ppgiTarget;
  const tl = got.totals.plyQty === (rt.plyQty ?? want.totals.plyQty ?? 0);
  const tw = sameWeight(got.totals.chemWeight, want.totals.chemWeight);
  const ta = round2(got.totals.areaSqmt) === round2(want.totals.areaSqmt);
  const allOk = tp && tg && tl && tw && ta;
  if (!allOk) failures++;
  if (!tl) {
    console.log(`      ${BAD} PLY total ${got.totals.plyQty} != ${want.totals.plyQty ?? 0}`);
  }

  console.log(
    '  ' + cell(allOk ? OK : BAD, 2, false) + cell('Total =>', 32, false) +
      cell('', 14) + cell('', 14) +
      cell(String(got.totals.panelQty), 5) + cell(String(got.totals.ppgiQty), 6) +
      cell('', 5) + cell(fmt2(got.totals.chemWeight), 10) +
      cell(fmt2(got.totals.areaSqmt), 12),
  );
  console.log(
    '    ' + cell('sheet prints', 32, false) + cell('', 14) + cell('', 14) +
      cell(String(want.totals.panelQty), 5) + cell(String(want.totals.ppgiQty), 6) +
      cell('', 5) + cell(fmt2(want.totals.chemWeight), 10) +
      cell(fmt2(want.totals.areaSqmt), 12),
  );

  for (const note of want.notes ?? []) console.log(`\n  ${DEV} ${note}`);

  return { failures, deviations };
}

let allFailures = 0;
let allDeviations = 0;

for (const { job, expected } of CASES) {
  console.log(`\n${RULE}`);
  console.log(`  JOB ${job.jobNo}  —  generated BOQ vs production sheet   (density ${job.density} kg/m3)`);
  console.log(RULE);
  const blocks = buildJob(job);
  if (blocks.length !== expected.length) {
    console.log(`  ${BAD} block count ${blocks.length} != ${expected.length}`);
    allFailures++;
  }
  for (let i = 0; i < expected.length; i++) {
    const res = printBlock(blocks[i], expected[i]);
    allFailures += res.failures;
    allDeviations += res.deviations;
  }
}

console.log(`\n${RULE}`);
if (allFailures === 0) {
  console.log(`  ${OK} ALL ROWS MATCH across ${CASES.length} jobs`);
  if (allDeviations) {
    console.log(
      `  ${DEV} ${allDeviations} row(s) where a printed sheet contradicts its own rule — listed above`,
    );
  }
} else {
  console.log(`  ${BAD} ${allFailures} mismatch(es)`);
}
console.log('');
process.exit(allFailures === 0 ? 0 : 1);
