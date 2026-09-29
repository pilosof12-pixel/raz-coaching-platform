import test from 'node:test';
import assert from 'node:assert/strict';

import { collectHighRepTestingFlags, highRepGoal, normalizeHighRepGoalTesting } from '../engine/high_rep_goal_testing.js';

const INTAKE = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve strict pull-ups from 14 toward 18-20'],
};
const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (ex, sets, reps, rpe) => ['Fri', ex, 'BW', String(sets), String(reps), '3 min', String(rpe), 'Pull work.', ''].join('\t');
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const tested = [1, 2, 3, 4].map((w) => block(w, [row('Pull-up', 1, w === 3 ? 15 : 14, 9), row('Pull-up', 6, 1, 4)])).join('\n\n');

test('the goal and its demonstrated maximum are read from the intake', () => {
  assert.deepEqual(highRepGoal(INTAKE), { movement: 'pull-up', current: 14, target: 18 });
  assert.equal(highRepGoal({ primary_goals: ['Squat 200 kg'] }), null);
});

test('a near-max set in most weeks is a block of tests, not a block of training', () => {
  const flags = collectHighRepTestingFlags(tested, INTAKE);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V104_HIGH_REP_GOAL_TESTED_WEEKLY');
  assert.deepEqual(flags[0].weeks, [1, 2, 3, 4]);
});

test('one benchmark exposure survives and the rest become submaximal', () => {
  const out = normalizeHighRepGoalTesting(tested, INTAKE);
  assert.equal(out.repaired, true);
  const setsFor = (w) => out.program
    .match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?END_WEEK${w}_TSV`))[0]
    .split('\n').filter((l) => /^Fri\tPull-up\t/.test(l))[0].split('\t');
  // Week 1 keeps the benchmark: a rep-max is taken once and built from.
  assert.equal(setsFor(1)[4], '14');
  for (const w of [2, 3, 4]) {
    assert.equal(Number(setsFor(w)[4]) < 14, true, `week ${w} is no longer a test`);
    assert.equal(Number(setsFor(w)[6]) <= 7, true, `week ${w} effort comes down`);
  }
  assert.match(out.program, /two to three reps in reserve on every set/);
});

test('the rewrite is volume-neutral: it lowers intensity without adding fatigue', () => {
  // The coach's full prescription -- 3-4 sets of 7-10 -- would raise this
  // athlete's weekly pull-up volume by about forty percent, on someone whose
  // primary goal is a 3 km run and who has a shin-splint history. That is a
  // coaching decision, so the brief asks for it and this guarantees only that
  // the testing stops and the volume does not climb.
  const out = normalizeHighRepGoalTesting(tested, INTAKE);
  const total = (p, w) => p.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?END_WEEK${w}_TSV`))[0]
    .split('\n').filter((l) => /^Fri\tPull-up\t/.test(l))
    .reduce((n, l) => n + Number(l.split('\t')[3]) * Number(l.split('\t')[4]), 0);
  for (const w of [2, 3]) {
    const before = total(tested, w);
    const after = total(out.program, w);
    assert.ok(after <= before * 1.2, `week ${w}: ${before} -> ${after} reps must not balloon`);
  }
});

test('a single benchmark week is left alone', () => {
  const once = [1, 2, 3, 4].map((w) => block(w, [row('Pull-up', w === 1 ? 1 : 3, w === 1 ? 14 : 8, w === 1 ? 9 : 7)])).join('\n\n');
  assert.deepEqual(collectHighRepTestingFlags(once, INTAKE), []);
  assert.equal(normalizeHighRepGoalTesting(once, INTAKE).repaired, false);
});

test('the repair converges and is idempotent', () => {
  const once = normalizeHighRepGoalTesting(tested, INTAKE);
  assert.deepEqual(collectHighRepTestingFlags(once.program, INTAKE), []);
  const twice = normalizeHighRepGoalTesting(once.program, INTAKE);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the production bundle applies it', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeHighRepGoalTesting\(candidate, intake\)/);
});
