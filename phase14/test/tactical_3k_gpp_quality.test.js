import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTactical3KGppQualityBrief,
  tactical3KIntervalProgressionAnalysis,
  tacticalStrengthCompletenessAnalysis,
  validateTactical3KIntervalProgressionSemantic,
  validateTacticalStrengthCompletenessSemantic,
} from '../engine/tactical_3k_gpp_quality.js';
import { validateProductionProgram } from '../engine/production_validation.js';
import {
  TACTICAL_3K_INTAKE,
  tactical3KGoldenProgram,
} from './fixtures/golden_programs.js';

function replaceEvery(program, from, to) {
  return String(program).split(from).join(to);
}

test('approved Tactical 3K golden has complete strength sessions and single-lever interval progression', () => {
  const program = tactical3KGoldenProgram();
  const strength = tacticalStrengthCompletenessAnalysis(program, TACTICAL_3K_INTAKE);
  const running = tactical3KIntervalProgressionAnalysis(program, TACTICAL_3K_INTAKE);

  assert.equal(strength.applicable, true);
  assert.deepEqual(strength.violations, []);
  assert.equal(strength.weeks.length, 4);
  for (const week of strength.weeks) {
    assert.equal(week.strength_days.length, 3);
    assert.ok(week.strength_days.every((day) => day.distinct_movement_count >= 2));
  }

  assert.equal(running.applicable, true);
  assert.equal(running.shin_risk, true);
  assert.equal(running.current_repeat.fastest_400_s, 102);
  assert.deepEqual(running.violations, []);
  assert.equal(running.weeks.length, 4);
  assert.equal(validateProductionProgram(program, TACTICAL_3K_INTAKE).ok, true);
});

test('weekly push/core totals cannot hide a token deadlift-only third gym session', () => {
  const program = tactical3KGoldenProgram();
  const bad = program.replace(/^Fri\tOverhead Press\t.*$/gm, '');
  const strength = tacticalStrengthCompletenessAnalysis(bad, TACTICAL_3K_INTAKE);

  assert.ok(strength.violations.length >= 1);
  assert.ok(strength.violations.some((week) =>
    week.token_days.some((day) => String(day.day || '').toLowerCase() === 'fri')
  ));
  assert.throws(
    () => validateTacticalStrengthCompletenessSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_STRENGTH_SESSION_TOO_THIN',
  );
});

test('shin-history 3K build cannot increase interval work and pace materially in the same step', () => {
  const bad = replaceEvery(
    tactical3KGoldenProgram(),
    '1:42-1:45 / 400 m\t7\t400 m',
    '1:39-1:41 / 400 m\t7\t400 m',
  );
  const running = tactical3KIntervalProgressionAnalysis(bad, TACTICAL_3K_INTAKE);

  assert.ok(running.violations.some((v) => v.type === 'simultaneous_interval_volume_and_pace_jump'));
  assert.throws(
    () => validateTactical3KIntervalProgressionSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_3K_INTERVAL_PROGRESSION_VIOLATION',
  );
});

test('Week 1 interval prescription cannot leap straight past the demonstrated repeat benchmark', () => {
  const bad = tactical3KGoldenProgram().replace(
    '1:42-1:45 / 400 m\t6\t400 m',
    '1:34-1:36 / 400 m\t6\t400 m',
  );
  const running = tactical3KIntervalProgressionAnalysis(bad, TACTICAL_3K_INTAKE);

  assert.ok(running.violations.some((v) => v.type === 'week1_pace_leap_beyond_current_repeat_anchor'));
  assert.throws(
    () => validateTactical3KIntervalProgressionSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_3K_INTERVAL_PROGRESSION_VIOLATION',
  );
});

test('Week 4 may express faster 3K speed only when interval work is reduced from the peak build', () => {
  const good = tactical3KIntervalProgressionAnalysis(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE);
  const w3 = good.weeks.find((x) => x.week === 3);
  const w4 = good.weeks.find((x) => x.week === 4);
  assert.ok(w4.midpoint_400_s < w3.midpoint_400_s);
  assert.ok(w4.work_m < w3.work_m);
  assert.deepEqual(good.violations, []);

  const bad = tactical3KGoldenProgram().replace(
    '1:39-1:41 / 400 m\t6\t400 m',
    '1:39-1:41 / 400 m\t8\t400 m',
  );
  const badAnalysis = tactical3KIntervalProgressionAnalysis(bad, TACTICAL_3K_INTAKE);
  assert.ok(badAnalysis.violations.some((v) => v.type === 'week4_faster_expression_without_interval_volume_reduction'));
});

test('generation brief states complete gym sessions and benchmark-anchored single-lever 3K progression', () => {
  const brief = buildTactical3KGppQualityBrief(TACTICAL_3K_INTAKE);
  assert.match(brief, /three token gym check-ins/i);
  assert.match(brief, /primary lift\/skill plus at least one useful second movement/i);
  assert.match(brief, /anchor Week 1 to demonstrated recent repeat ability/i);
  assert.match(brief, /one main interval stress lever at a time/i);
  assert.match(brief, /WEEK 4 3K EXPRESSION/i);
});
