import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import { parseProgramModel, strengthDaysForWeek } from '../engine/program_model.js';
import {
  ADVANCED_HYBRID_LAUNCH_INTAKE,
  advancedHybridLaunchProgram,
} from './fixtures/advanced_hybrid_launch.js';

function validateLaunchProgram() {
  try {
    return validateProductionProgram(advancedHybridLaunchProgram(), ADVANCED_HYBRID_LAUNCH_INTAKE);
  } catch (error) {
    const flags = Array.isArray(error?.flags)
      ? error.flags.map((flag) => `${flag.code}:${flag.amendment || flag.message || ''}`).join(' | ')
      : '';
    const violations = Array.isArray(error?.details?.violations)
      ? error.details.violations.map((v) => `${v.type || v.code || 'violation'}:${JSON.stringify(v)}`).join(' | ')
      : '';
    throw new Error(`advanced hybrid production validation failed: ${error?.code || 'UNKNOWN'} ${flags} ${violations}`.trim(), { cause: error });
  }
}

test('advanced hybrid launch intake has a feasible program that passes the full production validation chain', () => {
  const result = validateLaunchProgram();
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
  const result = validateLaunchProgram();
  const model = result.model;
  for (const week of model.weeks) {
    const hardConditioning = week.days.flatMap((d) => d.exercises).filter((ex) => {
      const name = String(ex.display_name || '').toLowerCase();
      return ex.modality === 'conditioning' || /interval|sprint|burpee|emom|metcon/.test(name);
    });
    assert.equal(hardConditioning.length, 0);
  }
});
