import test from 'node:test';
import assert from 'node:assert/strict';

import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE, advancedHybridLaunchProgram } from './fixtures/advanced_hybrid_launch.js';
import { YOUTH_GYMNASTICS_INTAKE, youthGymnasticsGoldenProgram } from './fixtures/golden_programs.js';

function cleanlinessContexts(program) {
  const raw = String(program || '');
  const re = /\[REVIEW\]|contact\s+support|placeholder(?:\s+exercise|\s+row)?|could not be safely generated/ig;
  return [...raw.matchAll(re)].map((m) => raw.slice(Math.max(0, m.index - 160), Math.min(raw.length, m.index + m[0].length + 220)).replace(/\n/g, ' ↵ '));
}

function suspiciousLines(program) {
  return String(program || '').split('\n').filter((line) => /\[REVIEW\]|Session\s+[A-Z].*\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|Quantum|Unknown|Halluc/i.test(line)).slice(0, 20);
}

function concise(result) {
  return {
    ok: result.ok,
    flags: result.flags || [],
    cleanlinessContexts: cleanlinessContexts(result.program),
    suspiciousLines: suspiciousLines(result.program),
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
