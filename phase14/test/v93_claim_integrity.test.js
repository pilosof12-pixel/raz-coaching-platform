import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  SUBJECTS, narrativeClaims, weeklyMeasures, subjectRises,
  collectClaimIntegrityFlags, buildClaimIntegrityBrief,
} from '../engine/v93_claim_integrity.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

// Four weeks whose Monday easy run takes the given duration.
const easyRunBlock = (narrative, minutes) => [
  narrative, '',
  ...minutes.map((min, i) => [
    `START_WEEK${i + 1}_TSV`, HEAD,
    `Mon\tRun\tEasy conversational, ~5:20-5:50/km\t1\t${min} min\tN/A\t4\tKeep it easy.\t`,
    `END_WEEK${i + 1}_TSV`, '',
  ].join('\n')),
].join('\n');

test('a promise to lengthen the easy runs is flagged when the weeks are identical', () => {
  const flat = easyRunBlock('While shins stay normal, rebuild toward the top of your range by adding a few minutes to the easy runs.', [25, 25, 25, 25]);
  const flags = collectClaimIntegrityFlags(flat, {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V93_STATED_PROGRESSION_ABSENT');
  assert.equal(flags[0].subject, 'easy run');
  assert.match(flags[0].detail, /min 25 \/ 25 \/ 25 \/ 25/);
});

test('the same promise is clean once the weeks actually carry it', () => {
  const rising = easyRunBlock('While shins stay normal, rebuild toward the top of your range by adding a few minutes to the easy runs.', [25, 30, 35, 30]);
  assert.deepEqual(collectClaimIntegrityFlags(rising, {}), []);
});

// Without this guard "increasing only if the bar feels light" turned a
// maintenance instruction into a promise to add load every week.
test('a clause that says the dose is held is not read as a promise', () => {
  assert.deepEqual(narrativeClaims('Squat load is held the same all block, increasing only if the bar feels light.'), []);
});

test('a flat block that does not promise anything is not flagged', () => {
  const held = easyRunBlock('The easy runs are held at 25 min all block while the intervals take the new load.', [25, 25, 25, 25]);
  assert.deepEqual(collectClaimIntegrityFlags(held, {}), []);
});

// The clause-level reading is the whole reason this generalises safely: one
// sentence routinely makes a promise about one thing and a hold about another.
test('a verb belongs to its own clause, not to every subject in the sentence', () => {
  const claims = narrativeClaims('Pull-up work builds gradually week by week, while the ruck stays at 20 kg.');
  assert.deepEqual(claims.map((c) => c.subject), ['pull-up work']);
});

test('a leading subordinate clause does not cancel the promise that follows it', () => {
  const claims = narrativeClaims('While shins and next-day soreness stay normal, rebuild toward the top of your 18-20 km range by adding a few minutes to the easy runs.');
  assert.deepEqual(claims.map((c) => c.subject), ['easy run']);
});

test('what the block says it will not do is not a promise to do it', () => {
  assert.deepEqual(narrativeClaims('Hold the easy runs at 25 min, never by adding a fourth running day.'), []);
});

test('taking load off a symptomatic joint is not a progression claim', () => {
  assert.deepEqual(narrativeClaims('If elbows or biceps tendon get cranky, make Monday One-Arm Pull-up all singles and add a little help on Tuesday.'), []);
});

// Pace is the only variable a capped ruck session can move, and reading it as a
// number that must grow made every well-programmed ruck look frozen.
test('a faster pace counts as progression even when load and time are fixed', () => {
  const ruck = ['The ruck pace improves gradually across the block.', '',
    ...['9:25-9:35', '9:20-9:30', '9:15-9:25', '9:15-9:25'].map((pace, i) => [
      `START_WEEK${i + 1}_TSV`, HEAD,
      `Mon\tBackpack Carry\t20 kg; ${pace}/km\t1\t60 min\tN/A\t5\tBrisk walk only.\t`,
      `END_WEEK${i + 1}_TSV`, '',
    ].join('\n'))].join('\n');
  const subject = SUBJECTS.find((s) => s.key === 'ruck');
  assert.equal(subjectRises(weeklyMeasures(ruck, subject)), 'pace');
  assert.deepEqual(collectClaimIntegrityFlags(ruck, {}), []);
});

test('a distance in the reps cell is not read as a rep count', () => {
  const intervals = ['The interval work builds in volume each week.', '',
    ...[[6, 400], [4, 600], [5, 600], [4, 500]].map(([sets, m], i) => [
      `START_WEEK${i + 1}_TSV`, HEAD,
      `Mon\tRun\t1:42-1:45 / 400 m\t${sets}\t${m} m\t2:00\t8\tinterval repeats\t`,
      `END_WEEK${i + 1}_TSV`, '',
    ].join('\n'))].join('\n');
  const subject = SUBJECTS.find((s) => s.key === 'interval session');
  const series = weeklyMeasures(intervals, subject);
  assert.equal(series.length, 4);
  for (const week of series) assert.equal(week.reps, undefined, '"400 m" must not read as 400 reps');
  assert.deepEqual(series.map((s) => s.m), [400, 600, 600, 500]);
  assert.equal(subjectRises(series), 'm');
});

// The point of the check is delivered output, not fixtures written to trip it.
test('it stays silent on the programs the coach did not fault for this', () => {
  for (const f of ['run81_advanced_hybrid.txt', 'run88_advanced_hybrid.txt', 'run97_mma_camp_delivered.txt',
    'run100_masters_return.txt', 'run101_weightlifter_peak.txt', 'run96_weightlifter_intensification.txt']) {
    assert.deepEqual(collectClaimIntegrityFlags(read(f), {}), [], f);
  }
});

// The defect the coach charged -0.50 for, in the file that was delivered.
test('it catches the tactical block that promised a rebuild it never wrote', () => {
  const flags = collectClaimIntegrityFlags(read('run81_tactical_3k.txt'), {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].subject, 'easy run');
});

test('the brief tells the model both halves of the rule', () => {
  const brief = buildClaimIntegrityBrief({});
  assert.match(brief, /must actually show a larger number/);
  assert.match(brief, /held at maintenance/);
});
