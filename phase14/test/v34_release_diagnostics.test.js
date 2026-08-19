import test from 'node:test';
import assert from 'node:assert/strict';

import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE, advancedHybridLaunchProgram } from './fixtures/advanced_hybrid_launch.js';
import { YOUTH_GYMNASTICS_INTAKE, youthGymnasticsGoldenProgram } from './fixtures/golden_programs.js';

function contexts(program, re) {
  const raw = String(program || '');
  return [...raw.matchAll(re)].map((m) => raw.slice(Math.max(0, m.index - 120), Math.min(raw.length, m.index + m[0].length + 220)).replace(/\n/g, ' ↵ ')).slice(0, 20);
}

function selectedLines(program, re) {
  return String(program || '').split('\n').filter((line) => re.test(line)).slice(0, 80);
}

function concise(result) {
  return {
    ok: result.ok,
    flags: result.flags || [],
    cleanlinessContexts: contexts(result.program, /\[REVIEW\]|contact\s+support|placeholder(?:\s+exercise|\s+row)?|could not be safely generated/ig),
    selectedLines: selectedLines(result.program, /\[REVIEW\]|handstand|muscle-up|ring dip|pull-up|session\s+[ab]|monday|thursday/i),
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
