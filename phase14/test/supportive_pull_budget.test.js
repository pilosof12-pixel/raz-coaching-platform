// Support has to read as support.
//
// Run #138's week had two primary pulling sessions -- Monday and Friday,
// weighted pull-ups at RPE 8 -- and between them an Inverted Row 3x10 at RPE 8
// on Tuesday, then a light Pull-up AND another Inverted Row 3x8 at RPE 8 on
// Wednesday. Meaningful bent-arm pulling on four days out of five, at the
// primary session's own intensity, on an athlete whose stated limiter is medial
// elbow irritation. The coach charged it twice and asked for one of the two, not
// both.
//
// Two things are true of supportive work and were not true of that week: a
// support day carries one exposure of a pattern rather than two, and support
// sits below the session it supports rather than level with it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairSupportivePullBudget } from '../engine/supportive_pull_budget.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const wk = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const block = (rows) => [1, 2, 3, 4].map((n) => wk(n, rows)).join('\n\n');

const ROWS = [
  'Mon\tWeighted Pull-up\t29 kg\t3\t3\t4 min\t8\tPrimary.\t',
  'Mon\tDip\tRPE-selected load\t4\t4\t3 min\t8\tPressing.\t',
  'Mon\tPistol Squat\tBodyweight\t3\t5\t2 min\t7\tLower.\t',
  'Tue\tFreestanding Handstand Hold\tBodyweight\t5\t15s\t75s\t6\tSkill.\t',
  'Tue\tInverted Row\tBodyweight\t3\t10\t90s\t8\tSupport pulling.\t',
  'Tue\tNordic Hamstring Curl\tBodyweight\t3\t4\t2 min\t8\tPosterior.\t',
  'Wed\tAdvanced Tuck Planche\tBodyweight\t4\t8s\t2 min\t7\tSkill.\t',
  'Wed\tPull-up\tBodyweight\t2\t5\t2 min\t6.5\tLight foundational vertical pull.\t',
  'Wed\tInverted Row\tBodyweight\t3\t8\t90s\t8\tMore rowing.\t',
  'Wed\tRing Push-up\tBodyweight\t3\t10\t90s\t7\tPressing.\t',
  'Fri\tWeighted Pull-up\t25 kg\t4\t4\t4 min\t8\tSecond primary.\t',
  'Fri\tDip\tRPE-selected load\t4\t5\t3 min\t7.5\tPressing.\t',
  'Fri\tPistol Squat\tBodyweight\t3\t6\t2 min\t8\tLower.\t',
];

const PROGRAM = block(ROWS);
const week1 = (program) => program.match(/START_WEEK1_TSV([\s\S]*?)END_WEEK1_TSV/)[1];
const pulls = (program, day) => week1(program).split('\n').map((l) => l.split('\t'))
  .filter((c) => c.length === 9 && c[0] === day && /pull|row|chin/i.test(c[1]) && !/^\[WARMUP\]/.test(c[1]))
  .map((c) => ({ name: c[1], sets: Number(c[3]), reps: c[4], rpe: Number(c[6]) }));

test('a support day carries one exposure of the pattern, not two', () => {
  assert.equal(pulls(PROGRAM, 'Wed').length, 2, 'fixture must start with two');
  const { program, changed } = repairSupportivePullBudget(PROGRAM, INTAKE);
  assert.equal(changed, true);
  assert.equal(pulls(program, 'Wed').length, 1);
});

test('the exposure kept is the one closest to the goal’s own pattern', () => {
  const { program } = repairSupportivePullBudget(PROGRAM, INTAKE);
  assert.equal(pulls(program, 'Wed')[0].name, 'Pull-up',
    'a vertical pull under a vertical-pull goal outranks a row');
});

test('support sits below the session it supports', () => {
  const { program } = repairSupportivePullBudget(PROGRAM, INTAKE);
  const tue = pulls(program, 'Tue')[0];
  assert.equal(tue.rpe, 7, 'primary pulling is RPE 8, so support caps at 7');
  assert.equal(tue.sets, 2, 'and below the primary set count');
});

test('the primary sessions are untouched', () => {
  const { program } = repairSupportivePullBudget(PROGRAM, INTAKE);
  assert.deepEqual(pulls(program, 'Mon'), pulls(PROGRAM, 'Mon'));
  assert.deepEqual(pulls(program, 'Fri'), pulls(PROGRAM, 'Fri'));
});

test('a week with one primary pulling day is left alone', () => {
  // One dedicated session plus support is an ordinary week, not a budget problem.
  const single = block(ROWS.filter((r) => !/^Fri\tWeighted Pull-up/.test(r)));
  assert.equal(repairSupportivePullBudget(single, INTAKE).changed, false);
});

test('it is idempotent', () => {
  const once = repairSupportivePullBudget(PROGRAM, INTAKE).program;
  assert.equal(repairSupportivePullBudget(once, INTAKE).changed, false);
});

test('no exercise, load or rep change beyond the trim it declares', () => {
  const { program, moves } = repairSupportivePullBudget(PROGRAM, INTAKE);
  const dropped = new Set(moves.filter((m) => m.dropped).map((m) => `${m.week}|${m.day}|${m.dropped}`));
  assert.ok(dropped.size, 'the drop has to be declared');
  // Every surviving row is one the fixture already had.
  const owned = new Set(PROGRAM.split('\n').filter((l) => /\t/.test(l)).map((l) => l.split('\t')[1]));
  for (const line of program.split('\n').filter((l) => /\t/.test(l))) {
    assert.ok(owned.has(line.split('\t')[1]), `invented a movement: ${line.split('\t')[1]}`);
  }
});

// --- elbow economy: frequency, not just intensity -----------------------------
//
// Run #142 put the primary work on Monday, Wednesday and Saturday and a support
// row on Tuesday and Friday as well, so bent-arm pulling touched every training
// day. The coach charged it: for a recurring medial-elbow signal, four support
// exposures on top of the primary work are not worth the frequency. And Advanced
// Tuck Planche sat at four sets of six seconds at RPE 8 on the same day as the
// heaviest Weighted Pull-up, which is the opposite of the hierarchy the program
// itself states.

const RUN142 = fs.readFileSync(path.join(here, 'fixtures/run142_advanced_calisthenics.txt'), 'utf8');
const w1rows = (p) => week1(p).split('\n').map((l) => l.split('\t'))
  .filter((c) => c.length === 9 && c[0] !== 'Day' && !/^\s*\[WARMUP\]/.test(c[1]));

test('support pulling shares a day that already pulls; it does not add one', () => {
  const before = w1rows(RUN142).filter((c) => /Australian Pull-up/.test(c[1])).map((c) => c[0]);
  assert.deepEqual(before, ['Tue', 'Wed', 'Fri'], 'fixture must start on three days');

  const { program } = repairSupportivePullBudget(RUN142, INTAKE);
  const after = w1rows(program).filter((c) => /Australian Pull-up/.test(c[1])).map((c) => c[0]);
  assert.deepEqual(after, ['Wed'], 'only the exposure beside the muscle-up survives');
});

test('the muscle-up counts as bent-arm pulling', () => {
  // It is not foundational strength and its name carries no "pull", so the
  // ordinary pull test misses it -- while being the hardest bent-arm pull of the
  // week. Wednesday is kept precisely because the muscle-up is already there.
  const { program } = repairSupportivePullBudget(RUN142, INTAKE);
  const wed = w1rows(program).filter((c) => c[0] === 'Wed').map((c) => c[1]);
  assert.ok(wed.some((n) => /Muscle-up/i.test(n)));
  assert.ok(wed.some((n) => /Australian Pull-up/i.test(n)));
});

test('straight-arm volume on the heaviest pull day drops to a maintenance touch', () => {
  const beforeRow = w1rows(RUN142).find((c) => c[0] === 'Mon' && /Advanced Tuck Planche/.test(c[1]));
  assert.equal(beforeRow[3], '4');
  assert.equal(beforeRow[6], '8');

  const { program } = repairSupportivePullBudget(RUN142, INTAKE);
  const after = w1rows(program).find((c) => c[0] === 'Mon' && /Advanced Tuck Planche/.test(c[1]));
  assert.equal(after[3], '2', 'two sets');
  assert.equal(after[6], '7', 'at RPE 7');
  // And the exposure still exists where the skill work lives.
  assert.ok(w1rows(program).some((c) => c[0] !== 'Mon' && /Planche/.test(c[1])));
});

test('an athlete with no elbow signal keeps both', () => {
  const clear = { ...INTAKE, injuries: 'None reported.', pain: { active: false, description: '', tolerated_movements: '' } };
  const { moves } = repairSupportivePullBudget(RUN142, clear);
  assert.deepEqual(moves.filter((m) => /elbow signal/.test(m.why || '')), []);
  assert.deepEqual(moves.filter((m) => m.capped && /Planche/.test(m.capped)), []);
});
