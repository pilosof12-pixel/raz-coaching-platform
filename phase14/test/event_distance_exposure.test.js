import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  EVENT_DISTANCE_NEVER_MET,
  buildEventDistanceBrief,
  collectEventDistanceFlags,
  normalizeEventDistanceExposure,
} from '../engine/event_distance_exposure.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const A = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const TACTICAL = A.tactical_3k;
const read = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const DELIVERED = read('tactical_3k-program.txt');

const carry = (program, week) => {
  const parsed = parseWeek(program, week);
  const cells = parsed.rows.find((c) => /Backpack Carry/i.test(String(c[parsed.exercise])) && !/\[WARMUP\]/i.test(String(c[parsed.exercise])));
  return cells ? { km: cells[parsed.reps], load: cells[parsed.load], note: cells[parsed.notes] } : null;
};

test('a 10 km goal that never sees 10 km is flagged', () => {
  // Pace moves 9:25 -> 9:15 -> 9:05, which is real work. The distance never does.
  for (const w of [1, 2, 3, 4]) assert.match(carry(DELIVERED, w).km, /^8 km/);
  const flags = collectEventDistanceFlags(DELIVERED, TACTICAL);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, EVENT_DISTANCE_NEVER_MET);
  assert.equal(flags[0].goal_km, 10);
  assert.equal(flags[0].longest_km, 8);
});

test('Week 3 becomes the event-distance exposure', () => {
  const out = normalizeEventDistanceExposure(DELIVERED, TACTICAL);
  assert.equal(out.repaired, true);
  assert.match(carry(out.program, 3).km, /^10 km/);
  // "Or retain 8 km early and make Week 3 the specific 10 km exposure."
  assert.match(carry(out.program, 1).km, /^8 km/);
  assert.match(carry(out.program, 2).km, /^8 km/);
  // W4 keeps its reduced volume.
  assert.match(carry(out.program, 4).km, /^8 km/);
});

test('one variable at a time: the distance moves, so the pace does not', () => {
  const out = normalizeEventDistanceExposure(DELIVERED, TACTICAL);
  assert.equal(carry(out.program, 3).load, carry(out.program, 2).load,
    'Week 3 carries the pace Week 2 already held');
  assert.match(carry(out.program, 3).note, /the distance is the only thing that changed/i);
});

test('a goal the block is not close to is left alone', () => {
  // 6.3 km of practice against a 10 km goal is a 59% jump; that is a
  // conversation about block length, not a repair. And nobody runs a marathon
  // in training, which is why this rule reads loaded carries only.
  assert.deepEqual(collectEventDistanceFlags(read('run114_tactical_3k.txt'), TACTICAL), []);
  assert.equal(normalizeEventDistanceExposure(read('run114_tactical_3k.txt'), TACTICAL).repaired, false);
  // A duration-prescribed carry names no distance to meet.
  assert.deepEqual(collectEventDistanceFlags(read('run81_tactical_3k.txt'), TACTICAL), []);
});

test('avatars without a loaded-carry distance goal are out of scope', () => {
  for (const id of ['advanced_hybrid', 'youth_gymnastics']) {
    assert.deepEqual(collectEventDistanceFlags(DELIVERED, A[id]), [], id);
    assert.equal(buildEventDistanceBrief(A[id]), '', id);
  }
  assert.match(buildEventDistanceBrief(TACTICAL), /10 km/);
});

test('the repair converges and is idempotent', () => {
  const once = normalizeEventDistanceExposure(DELIVERED, TACTICAL);
  assert.deepEqual(collectEventDistanceFlags(once.program, TACTICAL), []);
  const twice = normalizeEventDistanceExposure(once.program, TACTICAL);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the brief is bulleted and the chain applies the repair', () => {
  for (const line of buildEventDistanceBrief(TACTICAL).split('\n')) {
    assert.ok(line.startsWith('*') || line.startsWith('  '), line.slice(0, 40));
  }
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeEventDistanceExposure\(candidate, intake\)/);
});
