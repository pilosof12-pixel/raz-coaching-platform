import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tacticalScheduleAnalysis,
  validateTacticalScheduleArchitectureSemantic,
  pullUpDoseAnalysis,
  validateKnownMaxPullUpDoseSemantic,
  tacticalGppAnalysis,
  validateTacticalGppCoverageSemantic,
} from '../engine/coaching_progression_gpp.js';
import {
  TACTICAL_3K_INTAKE,
  tactical3KGoldenProgram,
} from './fixtures/golden_programs.js';

function replaceEvery(program, from, to) {
  return String(program).split(from).join(to);
}

test('approved Tactical golden respects the explicit five-calendar-day budget and sensible impact clustering', () => {
  const result = tacticalScheduleAnalysis(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE);
  assert.equal(result.applicable, true);
  assert.deepEqual(result.violations, []);
  for (const week of result.weeks) {
    assert.equal(week.unique_training_days, 5);
    assert.ok(week.max_impact_streak <= 2);
    assert.deepEqual(week.adjacent_priority_pull_days, []);
  }
});

test('live-like seven-day Tactical layout fails the explicit calendar budget and impact clustering rules', () => {
  let bad = tactical3KGoldenProgram();
  bad = replaceEvery(bad, 'Mon\tRun\t', 'Sat\tRun\t');
  bad = replaceEvery(bad, 'Mon\tBack Squat\t', 'Mon\tBack Squat\t');
  bad = replaceEvery(bad, 'Mon\tPush-up\t', 'Mon\tPush-up\t');
  bad = replaceEvery(bad, 'Tue\tRun\t', 'Thu\tRun\t');
  bad = replaceEvery(bad, 'Wed\tWeighted Pull-up\t', 'Mon\tWeighted Pull-up\t');
  bad = replaceEvery(bad, 'Wed\tPull-up\t', 'Tue\tPull-up\t');
  bad = replaceEvery(bad, 'Wed\tPallof Press\t', 'Tue\tPallof Press\t');
  bad = replaceEvery(bad, 'Fri\tRun\t', 'Sun\tRun\t');
  bad = replaceEvery(bad, 'Fri\tDeadlift\t', 'Wed\tDeadlift\t');
  bad = replaceEvery(bad, 'Sat\tBackpack Carry\t', 'Fri\tBackpack Carry\t');

  assert.throws(
    () => validateTacticalScheduleArchitectureSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_SCHEDULE_ARCHITECTURE_VIOLATION',
  );
});

test('priority pull-up work cannot be concentrated on adjacent days when both exposures are substantive', () => {
  const bad = replaceEvery(
    tactical3KGoldenProgram(),
    'Wed\tPull-up\tBodyweight\t2\t',
    'Tue\tPull-up\tBodyweight\t3\t',
  );
  assert.throws(
    () => validateTacticalScheduleArchitectureSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_SCHEDULE_ARCHITECTURE_VIOLATION',
  );
});

test('known strict pull-up max calibrates repeated submaximal work instead of allowing 4x10-12 at RPE 8', () => {
  let bad = tactical3KGoldenProgram();
  bad = replaceEvery(bad, 'Wed\tPull-up\tBodyweight\t2\t8\t2 min\t7\t', 'Wed\tPull-up\tBodyweight\t4\t10-12\t2 min\t8-8.5\t');
  bad = replaceEvery(bad, 'Wed\tPull-up\tBodyweight\t2\t9\t2 min\t7\t', 'Wed\tPull-up\tBodyweight\t4\t10-12\t2 min\t8-8.5\t');
  bad = replaceEvery(bad, 'Wed\tPull-up\tBodyweight\t2\t10\t2 min\t7-8\t', 'Wed\tPull-up\tBodyweight\t4\t10-12\t2 min\t8-8.5\t');

  const analysis = pullUpDoseAnalysis(bad, TACTICAL_3K_INTAKE);
  assert.equal(analysis.known_max_reps, 14);
  assert.ok(analysis.violations.length >= 1);
  assert.throws(
    () => validateKnownMaxPullUpDoseSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'PULL_UP_DOSE_EXCEEDS_KNOWN_CAPACITY',
  );
});

test('non-priority Tactical pushing stays a support dose rather than matching the priority volume budget', () => {
  const bad = tactical3KGoldenProgram().replace(/Mon\tPush-up\tBodyweight\t(?:3|2)\t/g, 'Mon\tPush-up\tBodyweight\t7\t');
  const analysis = tacticalGppAnalysis(bad, TACTICAL_3K_INTAKE);
  assert.equal(analysis.push_is_goal, false);
  assert.equal(analysis.weeks.length, 4);
  assert.ok(analysis.weeks.every((week) => week.totals.push === 7));
  assert.ok(analysis.weeks.every((week) => week.over_budget === true));
  assert.throws(
    () => validateTacticalGppCoverageSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_GPP_COVERAGE_MISSING',
  );
});
