// "Bodyweight" is a load, not an empty cell.
//
// Run #138's calisthenics athlete was given a deliberate light foundational pull
// on the day after his heavy pull day: Pull-up, Bodyweight, 2x5 at RPE 6.5,
// noted "light foundational vertical pull ... without stealing Thursday
// readiness". The competition-load anchor looked at that cell, found no digits
// in it, treated it as unwritten, and replaced it with a percentage of the
// athlete's WEIGHTED pull-up max -- "25 kg (82% of current max)". A 2x5 at
// RPE 6.5 became a near-maximal weighted set beside a heavy pull day.
//
// UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE then correctly rejected it, because
// a plain Pull-up has no benchmark of its own. The model regenerated, the anchor
// rewrote the cell, and the gate rejected it again -- four times, for 509
// seconds, before the program shipped with the rule unresolved.
//
// The anchor still has to do its job on the lift it was written for: a snatch
// reading "RPE-selected load" on an athlete with a 112 kg best is exactly the
// cell it exists to fill in.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairUnanchoredCompetitionLoad } from '../engine/endurance_block_repair.js';

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const wrap = (rows) => [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`)
  .join('\n\n');

const CALI_INTAKE = {
  experience: 'Advanced (3+ years)',
  primary_goals: ['Weighted pull-up with 40 kg for 3'],
  current_numbers: 'Weighted pull-up: 32 kg x 3',
};

const CALI = wrap([
  'Mon\tWeighted Pull-up\t29 kg\t3\t3\t4 min\t8\tPrimary.\t',
  'Tue\tPull-up\tBodyweight\t2\t5\t2 min\t6.5\tLight foundational vertical pull.\t',
]);

test('a bodyweight pull is not overwritten with a percentage of the weighted max', () => {
  const { program } = repairUnanchoredCompetitionLoad(CALI, CALI_INTAKE);
  const pullUp = program.split('\n')
    .map((l) => l.split('\t'))
    .filter((c) => c.length === 9 && /^pull-up$/i.test((c[1] || '').trim()));
  assert.ok(pullUp.length, 'the Pull-up rows must survive');
  for (const cells of pullUp) {
    assert.equal(cells[2], 'Bodyweight', 'the prescription the coach wrote must be left alone');
  }
});

const OLY_INTAKE = {
  experience: 'Advanced (3+ years)',
  primary_goals: ['Snatch 120 kg at the national qualifier in 8 weeks'],
  current_numbers: 'Snatch: 112 kg best in training',
};

const OLY = wrap(['Mon\tSnatch\tRPE-selected load\t5\t2\t3 min\t8\tCompetition lift.\t']);

test('an autoregulated competition lift is still anchored to a percentage of max', () => {
  const { program, changed } = repairUnanchoredCompetitionLoad(OLY, OLY_INTAKE);
  assert.equal(changed, true, 'narrowing the guard must not switch the anchor off');
  const snatch = program.split('\n')
    .map((l) => l.split('\t'))
    .find((c) => c.length === 9 && /^snatch$/i.test((c[1] || '').trim()));
  assert.match(snatch[2], /\d+(?:\.\d+)?\s*kg.*% of current max/i);
});
