import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OAP_PIPELINE_MARKER,
  OAP_REVALIDATION_MARKER,
  OAP_COACHING_ALIGNMENT_MARKER,
  patchAdvancedHybridOapPipelineSource,
} from '../scripts/apply_advanced_hybrid_oap_pipeline_wiring.mjs';

function fixture() {
  return [
    'import { normalizeYouthPrimarySkillOrder } from "./engine/youth_skill_order_normalizer.js"; // YOUTH-SKILL-ORDER-REPAIR-WIRED',
    'const OPENAI_COMPACT_DEVELOPER = [',
    '  "Use realistic current-performance anchors. Goal numbers are targets, not current capacities. Prefer low fatigue and specificity when sport load is high. Do not assign a high RPE to a load that is obviously too light for the athlete\'s current benchmark.",',
    '];',
    'async function generateValidatedProgram(intake) {',
    '  const raw = await runEngineRaw("x");',
    '    let program = normalizeYouthPrimarySkillOrder(enrichSpecificWarmups(repairUnbenchmarkedVariationLoads(fixInvalidExerciseNames(raw), intake)), intake).program; // step 1: DETERMINISTIC-UNBENCHMARKED-LOAD-REPAIR + SPECIFIC-WARMUP-ENRICHMENT + YOUTH-SKILL-ORDER-REPAIR',
    '  for (let attempt = 1; attempt <= 4; attempt++) {',
    '    validatePhase15FinalProgram(program, intake);',
    '    program = await runEngineRaw("repair candidate");',
    '  }',
    '  return program;',
    '}',
  ].join('\n');
}

test('production runtime normalizes every Advanced Hybrid OAP candidate before final QA', () => {
  const out = patchAdvancedHybridOapPipelineSource(fixture());
  assert.match(out, new RegExp(OAP_PIPELINE_MARKER));
  assert.match(out, new RegExp(OAP_REVALIDATION_MARKER));
  assert.match(out, new RegExp(OAP_COACHING_ALIGNMENT_MARKER));

  const validationIndex = out.indexOf('validatePhase15FinalProgram(program, intake)');
  const revalidationIndex = out.lastIndexOf('normalizeAdvancedHybridWeek4OapConsolidation(program, intake).program', validationIndex);
  assert.ok(revalidationIndex >= 0 && revalidationIndex < validationIndex);
  assert.match(
    out,
    /program = normalizeAdvancedHybridWeek4OapConsolidation\(program, intake\)\.program; \/\/ ADVANCED-HYBRID-OAP-REPAIR-REVALIDATION-NORMALIZED\n\s*validatePhase15FinalProgram\(program, intake\);/,
  );
});

test('Advanced Hybrid OAP prompt forbids manufactured strict-set progression', () => {
  const out = patchAdvancedHybridOapPipelineSource(fixture());
  assert.match(out, /do not create progression merely by adding strict OAP sets/i);
  assert.match(out, /Never move volume from accessories into extra strict OAP sets/i);
});

test('Advanced Hybrid OAP pipeline wiring is idempotent', () => {
  const once = patchAdvancedHybridOapPipelineSource(fixture());
  const twice = patchAdvancedHybridOapPipelineSource(once);
  assert.equal(twice, once);
});

test('Advanced Hybrid OAP pipeline wiring fails closed when expected runtime anchors drift', () => {
  assert.throws(
    () => patchAdvancedHybridOapPipelineSource('const program = somethingElse;'),
    /import anchor expected once, found 0/,
  );
});
