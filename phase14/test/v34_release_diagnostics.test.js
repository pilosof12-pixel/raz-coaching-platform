import test from 'node:test';
import assert from 'node:assert/strict';

import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE, advancedHybridLaunchProgram } from './fixtures/advanced_hybrid_launch.js';
import { YOUTH_GYMNASTICS_INTAKE, youthGymnasticsGoldenProgram } from './fixtures/golden_programs.js';

function concise(result) {
  return {
    ok: result.ok,
    flags: (result.flags || []).map((f) => ({ code: f.code, message: f.message })),
    clientCleanMatches: String(result.program || '').match(/\[REVIEW\]|contact\s+support|placeholder(?:\s+exercise|\s+row)?|could not be safely generated/ig) || [],
  };
}

test('[V34 diagnostic] expose release-critical aggregate failures without changing behavior', () => {
  const hybrid = collectRepairableValidationFailures(
    advancedHybridLaunchProgram(),
    ADVANCED_HYBRID_LAUNCH_INTAKE,
  );
  const youth = collectRepairableValidationFailures(
    youthGymnasticsGoldenProgram(),
    YOUTH_GYMNASTICS_INTAKE,
  );
  console.log('V34_RELEASE_DIAGNOSTIC_HYBRID=' + JSON.stringify(concise(hybrid)));
  console.log('V34_RELEASE_DIAGNOSTIC_YOUTH=' + JSON.stringify(concise(youth)));
  assert.ok(true);
});
