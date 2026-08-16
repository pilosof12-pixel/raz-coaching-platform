import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import { parseProgramModel, strengthDaysForWeek } from '../engine/program_model.js';
import {
  ADVANCED_HYBRID_LAUNCH_INTAKE,
  advancedHybridLaunchProgram,
} from './fixtures/advanced_hybrid_launch.js';

test('advanced hybrid launch intake has a feasible program that passes the full production validation chain', () => {
  const program = advancedHybridLaunchProgram();
  const result = validateProductionProgram(program, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(result.ok, true);

  const model = result.model || parseProgramModel(result.program, ADVANCED_HYBRID_LAUNCH_INTAKE);
  for (const week of model.weeks) {
    const strengthDays = strengthDaysForWeek(model, week.week).map((d) => d.day).sort();
    assert.deepEqual(strengthDays, ['friday', 'monday', 'sunday', 'tuesday']);
    const runs = week.days.flatMap((d) => d.exercises).filter((ex) => ex.modality === 'running');
    assert.equal(runs.length, 1, `week ${week.week} should keep one direct marathon-side-quest run at this starting state`);
  }
});

test('advanced hybrid launch gate keeps marathon work secondary instead of inventing extra hard conditioning', () => {
  const result = validateProductionProgram(advancedHybridLaunchProgram(), ADVANCED_HYBRID_LAUNCH_INTAKE);
  const model = result.model;
  for (const week of model.weeks) {
    const hardConditioning = week.days.flatMap((d) => d.exercises).filter((ex) => {
      const name = String(ex.display_name || '').toLowerCase();
      return ex.modality === 'conditioning' || /interval|sprint|burpee|emom|metcon/.test(name);
    });
    assert.equal(hardConditioning.length, 0);
  }
});
