import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProgressionGppBrief,
  progressionAnalysis,
  tacticalGppAnalysis,
  validateTacticalGppCoverageSemantic,
} from '../engine/coaching_progression_gpp.js';
import {
  TACTICAL_3K_INTAKE,
  YOUTH_GYMNASTICS_INTAKE,
  tactical3KGoldenProgram,
  youthGymnasticsGoldenProgram,
} from './fixtures/golden_programs.js';

test('Youth brief selects quality/assistance/bodyweight progression rather than mandatory fatigue', () => {
  const brief = buildProgressionGppBrief(YOUTH_GYMNASTICS_INTAKE);
  assert.match(brief, /YOUTH PROGRESSION/);
  assert.match(brief, /assistance, balance time, ROM/i);
  assert.match(brief, /without requiring failure/i);
});

test('Tactical brief makes GPP a small floor subordinate to named priorities', () => {
  const brief = buildProgressionGppBrief(TACTICAL_3K_INTAKE);
  assert.match(brief, /TACTICAL \/ HYBRID GPP PRIORITY BUDGET/);
  assert.match(brief, /receive most of the recoverable volume/i);
  assert.match(brief, /first volume trimmed/i);
  assert.match(brief, /pushing exposure and one low-cost trunk exposure/i);
  assert.match(brief, /not random conditioning/i);
});

test('approved Youth golden exposes progression in both primary skill families', () => {
  const result = progressionAnalysis(youthGymnasticsGoldenProgram(), YOUTH_GYMNASTICS_INTAKE);
  assert.deepEqual(result.violations, []);
  assert.ok(result.targets.some((x) => x.family === 'bar_muscle_up' && x.progressed));
  assert.ok(result.targets.some((x) => x.family === 'handstand' && x.progressed));
});

test('approved Tactical golden keeps low-cost push/core GPP within the priority budget', () => {
  const result = tacticalGppAnalysis(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE);
  assert.equal(result.applicable, true);
  assert.deepEqual(result.violations, []);
  for (const week of result.weeks) {
    assert.equal(week.totals.push, 3);
    assert.equal(week.totals.core, 2);
    assert.equal(week.low_cost_support_sets, 5);
  }
});

test('Tactical GPP cannot expand until it competes with the named priority budget', () => {
  const bloated = tactical3KGoldenProgram().split('\n').map((line) => {
    if (!line.includes('\t')) return line;
    const cells = line.split('\t');
    if (cells[1] === 'Push-up') cells[3] = '10';
    if (cells[1] === 'Pallof Press') cells[3] = '4';
    return cells.join('\t');
  }).join('\n');
  assert.throws(
    () => validateTacticalGppCoverageSemantic(bloated, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_GPP_COVERAGE_MISSING',
  );
});
