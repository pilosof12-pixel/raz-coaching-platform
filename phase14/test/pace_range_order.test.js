import test from 'node:test';
import assert from 'node:assert/strict';

import { collectPaceRangeOrderFlags, normalizePaceRangeOrder } from '../engine/pace_range_order.js';

test('a descending pace range is reordered, not rewritten', () => {
  // The Masters block prescribed "2:24-2:26/500 m" on one row and
  // "2:18-2:17/500 m" on another, contradicting its own convention four times.
  const row = 'Mon\tRowing Ergometer\t2:18-2:17/500 m\t4\t250 m\t2:00\t6\tRate 22-24.\t';
  const flags = collectPaceRangeOrderFlags(row);
  assert.deepEqual(flags.map((f) => f.code), ['PACE_RANGE_DESCENDING']);
  assert.deepEqual(flags.map((f) => f.range), ['2:18-2:17']);
  const out = normalizePaceRangeOrder(row);
  assert.equal(out.repaired, true);
  assert.match(out.program, /2:17-2:18\/500 m/);
  // Both numbers survive: this changes the order, never the prescription.
  assert.ok(out.program.includes('2:17') && out.program.includes('2:18'));
  assert.match(out.program, /Rate 22-24\./, 'the rest of the row is untouched');
});

test('an ascending range is already correct and is left alone', () => {
  const row = 'Fri\tRowing Ergometer\t2:24-2:26/500 m\t2\t750 m\t3:00\t6\tHold the split.\t';
  assert.deepEqual(collectPaceRangeOrderFlags(row), []);
  const out = normalizePaceRangeOrder(row);
  assert.equal(out.repaired, false);
  assert.equal(out.program, row);
});

test('equal endpoints are not a defect', () => {
  const row = 'Mon\tRun\t4:00-4:00/km\t1\t5 km\tN/A\t6\tSteady.\t';
  assert.deepEqual(collectPaceRangeOrderFlags(row), []);
  assert.equal(normalizePaceRangeOrder(row).repaired, false);
});

test('an ascending rest range is not mistaken for a pace', () => {
  // Rest is written the same way and is already ascending, so it must not move.
  const row = 'Mon\tBack Squat\t170 kg\t3\t3\t2:30-3:00\t8\tHeavy triple.\t';
  assert.equal(normalizePaceRangeOrder(row).repaired, false);
});

test('the repair converges', () => {
  const row = 'Mon\tRowing Ergometer\t2:16-2:15/500 m\t4\t250 m\t2:00\t7\tRate 24.\t';
  const once = normalizePaceRangeOrder(row);
  // Named so the gate-repair ledger can see PACE_RANGE_DESCENDING cleared by its
  // own repair, which is the only thing that counts as an answer.
  assert.deepEqual(collectPaceRangeOrderFlags(once.program).map((f) => f.code), []);
  const twice = normalizePaceRangeOrder(once.program);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the production chain applies it', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizePaceRangeOrder\(candidate\)/);
});
