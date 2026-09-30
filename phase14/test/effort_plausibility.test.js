import test from 'node:test';
import assert from 'node:assert/strict';

import { collectImplausibleEffortFlags, normalizeImplausibleEffort } from '../engine/effort_plausibility.js';

const INTAKE = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  current_numbers: 'Back Squat: 140 kg x 5\nWeighted Pull-up: +30 kg x 5',
};
const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (ex, load, reps, rpe) => ['Mon', ex, load, '1', String(reps), '3 min', String(rpe), 'Pull work.', ''].join('\t');
const program = (rows) => [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');

test('a set near a demonstrated benchmark cannot be labelled trivial', () => {
  const flags = collectImplausibleEffortFlags(program([row('Weighted Pull-up', '+27.5 kg added load', 4, 3)]), INTAKE);
  assert.equal(flags.length, 4);
  assert.equal(flags[0].code, 'V105_EFFORT_IMPLAUSIBLE_FOR_LOAD');
  assert.equal(flags[0].benchmark, '30 kg x 5');
});

test('genuinely light work against the same benchmark is left alone', () => {
  // A real maintenance dose is light because the LOAD is light. That is what
  // the effort column is entitled to say.
  assert.deepEqual(collectImplausibleEffortFlags(program([row('Weighted Pull-up', '+10 kg added load', 4, 3)]), INTAKE), []);
  // And a near-benchmark load already described as hard needs no correction.
  assert.deepEqual(collectImplausibleEffortFlags(program([row('Weighted Pull-up', '+27.5 kg added load', 4, 8)]), INTAKE), []);
});

test('nothing is judged without a benchmark to judge it against', () => {
  assert.deepEqual(collectImplausibleEffortFlags(program([row('Weighted Pull-up', '+27.5 kg added load', 4, 3)]), {}), []);
});

test('the effort is corrected to a band and the reason is stated', () => {
  const out = normalizeImplausibleEffort(program([row('Weighted Pull-up', '+27.5 kg added load', 4, 3)]), INTAKE);
  assert.equal(out.repaired, true);
  const cells = out.program.split('\n').find((l) => l.includes('\tWeighted Pull-up\t')).split('\t');
  assert.equal(cells[6], '7.5-8.5');
  assert.match(cells[7], /about 92% of your benchmark set of 30 kg x 5/);
  // Load, sets and reps are untouched: this describes the work, it does not change it.
  assert.equal(cells[2], '+27.5 kg added load');
  assert.equal(cells[3], '1');
  assert.equal(cells[4], '4');
});

test('a load above the benchmark gets the hardest band', () => {
  const out = normalizeImplausibleEffort(program([row('Weighted Pull-up', '+32.5 kg added load', 4, 3)]), INTAKE);
  const cells = out.program.split('\n').find((l) => l.includes('\tWeighted Pull-up\t')).split('\t');
  assert.equal(cells[6], '8-9');
});

test('the repair converges and is idempotent', () => {
  const before = program([row('Weighted Pull-up', '+27.5 kg added load', 4, 3)]);
  const once = normalizeImplausibleEffort(before, INTAKE);
  assert.deepEqual(collectImplausibleEffortFlags(once.program, INTAKE), []);
  const twice = normalizeImplausibleEffort(once.program, INTAKE);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the production bundle applies it', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeImplausibleEffort\(candidate, intake\)/);
});
