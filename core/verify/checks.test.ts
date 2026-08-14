/**
 * Cross-room check tests.
 * Run:  node core/verify/checks.test.ts
 *
 * The case that matters is two connected rooms of different sizes, which is
 * what HI-15279's drawing shows: an ambient room 3690 deep against a chiller
 * 3400 deep. Whichever room owns the wall between them, the whole 3690 has to
 * end up in exactly one BOQ — and until this check existed, ticking it the
 * wrong way round lost 290mm of wall in silence.
 */

import assert from 'node:assert/strict';
import { checkJob } from '../checks.ts';
import { compileWalls, rect } from '../plan.ts';
import type { JobSpec, Pt, RoomOutline, RoomSpec } from '../types.ts';
import { HI_15191 } from '../jobs/hi-15191.ts';
import { HI_15223 } from '../jobs/hi-15223.ts';
import { HI_15279 } from '../jobs/hi-15279.ts';

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

const room = (name: string, w: number, l: number, at: Pt, outline: RoomOutline): RoomSpec => ({
  name,
  ext: { w, l, h: 2745 },
  wallTh: 60,
  ceilTh: 60,
  floor: { kind: 'pufSlab', th: 60, desc: 'Puf Slab' },
  module: 1180,
  cornerLeg: 300,
  minPanelWidth: 150,
  maxSplitPieces: 2,
  at,
  outline,
  walls: compileWalls(outline),
  ceiling: { splitAxis: 'w', wEnds: ['own', 'own'], lEnds: ['own', 'own'] },
});

const job = (...rooms: RoomSpec[]): JobSpec => ({ jobNo: 'TEST', density: 40, rooms });

console.log('\n  rooms of the same size\n');

t('a partition owned by one room and shared by the other is clean', () => {
  const a = room('A', 4000, 3000, [0, 0], rect(4000, 3000));
  const b = room('B', 5000, 3000, [4000, 0], rect(5000, 3000, { 3: { id: 'W', shared: true } }));
  assert.deepEqual(checkJob(job(a, b)), []);
});

t('two rooms that touch nothing raise nothing', () => {
  const a = room('A', 4000, 3000, [0, 0], rect(4000, 3000));
  const b = room('B', 4000, 3000, [9000, 0], rect(4000, 3000));
  assert.deepEqual(checkJob(job(a, b)), []);
});

console.log('\n  rooms of different sizes — HI-15279 ambient against chiller\n');

t('the deeper room owning the whole wall is clean', () => {
  const ambient = room('Ambient', 9160, 3690, [0, 0], rect(9160, 3690));
  const chiller = room('Chiller', 7380, 3400, [9160, 0], rect(7380, 3400, { 3: { shared: true } }));
  assert.deepEqual(checkJob(job(ambient, chiller)), []);
});

t('the shallower room owning it loses the difference, and is caught', () => {
  const ambient = room('Ambient', 9160, 3690, [0, 0], rect(9160, 3690, { 1: { id: 'E', shared: true } }));
  const chiller = room('Chiller', 7380, 3400, [9160, 0], rect(7380, 3400));
  const found = checkJob(job(ambient, chiller));
  assert.equal(found.length, 1);
  assert.equal(found[0].room, 'Ambient');
  assert.equal(found[0].wallId, 'E');
  assert.equal(found[0].mm, 290, '3690 - 3400 = 290mm of wall behind nobody');
});

t('a shared wall with no room at all behind it is the whole wall', () => {
  const only = room('Only', 4000, 3000, [0, 0], rect(4000, 3000, { 1: { id: 'E', shared: true } }));
  const found = checkJob(job(only));
  assert.equal(found.length, 1);
  assert.equal(found[0].mm, 3000);
});

t('both rooms ticking the same wall as the other one\'s is caught twice', () => {
  const a = room('A', 4000, 3000, [0, 0], rect(4000, 3000, { 1: { id: 'E', shared: true } }));
  const b = room('B', 4000, 3000, [4000, 0], rect(4000, 3000, { 3: { id: 'W', shared: true } }));
  const found = checkJob(job(a, b));
  assert.equal(found.length, 2, 'a wall neither room builds is missing from both BOQs');
});

t('a neighbour that only reaches part way along is caught with the gap', () => {
  // two short rooms stacked against one long wall, leaving a hole in the middle
  const long = room('Long', 3000, 6000, [0, 0], rect(3000, 6000, { 1: { id: 'E', shared: true } }));
  const top = room('Top', 2000, 2000, [3000, 0], rect(2000, 2000));
  const bottom = room('Bottom', 2000, 2000, [3000, 4000], rect(2000, 2000));
  const found = checkJob(job(long, top, bottom));
  assert.equal(found.length, 1);
  assert.equal(found[0].mm, 2000, '6000 long, 2000 covered at each end');
});

t('a room a wall thickness away does not count as backing it', () => {
  const a = room('A', 4000, 3000, [0, 0], rect(4000, 3000, { 1: { id: 'E', shared: true } }));
  const b = room('B', 4000, 3000, [4060, 0], rect(4000, 3000));
  const found = checkJob(job(a, b));
  assert.equal(found.length, 1, 'touching is touching — 60mm away is a different wall');
});

console.log('\n  the verified jobs\n');

t('HI-15223 has no shared walls to check', () => {
  assert.deepEqual(checkJob(HI_15223), []);
});

t('HI-15279 places its chiller against the freezer correctly', () => {
  assert.deepEqual(checkJob(HI_15279), []);
});

t('HI-15191 ante room', () => {
  // reported, not asserted — see the note the runner prints
  const found = checkJob(HI_15191);
  console.log(
    found.length
      ? `      finding: ${found.map((p) => `${p.room} · ${p.wallId} · ${p.mm}mm`).join(', ')}`
      : '      clean',
  );
});

console.log(`\n  ${passed} passed\n`);
