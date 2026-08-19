import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import {
  progressionAnalysis,
  tacticalGppAnalysis,
} from '../engine/coaching_progression_gpp.js';
import {
  YOUTH_GYMNASTICS_INTAKE,
  TACTICAL_3K_INTAKE,
  youthGymnasticsGoldenProgram,
  tactical3KGoldenProgram,
} from './fixtures/golden_programs.js';

test('manual 9+ Youth candidate passes production QA with visible progression intent', () => {
  const program = youthGymnasticsGoldenProgram();
  const out = validateProductionProgram(program, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(out.ok, true);
  const progression = progressionAnalysis(program, YOUTH_GYMNASTICS_INTAKE, out.model);
  assert.deepEqual(progression.violations, []);
  assert.ok(progression.targets.some((x) => x.family === 'bar_muscle_up' && x.progressed));
  assert.ok(progression.targets.some((x) => x.family === 'handstand' && x.progressed));
});

test('manual 9+ Tactical 3K candidate passes production QA with priority-subordinated GPP', () => {
  const program = tactical3KGoldenProgram();
  const out = validateProductionProgram(program, TACTICAL_3K_INTAKE);
  assert.equal(out.ok, true);
  const gpp = tacticalGppAnalysis(program, TACTICAL_3K_INTAKE, out.model);
  assert.equal(gpp.applicable, true);
  assert.deepEqual(gpp.violations, []);
  for (const week of gpp.weeks) {
    assert.ok(week.totals.push >= 2);
    assert.ok(week.totals.core >= 2);
    assert.ok(week.low_cost_support_sets <= 12);
  }
});
