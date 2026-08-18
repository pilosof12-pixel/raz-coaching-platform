import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OAP_PIPELINE_MARKER,
  patchAdvancedHybridOapPipelineSource,
} from '../scripts/apply_advanced_hybrid_oap_pipeline_wiring.mjs';

function fixture() {
  return [
    'import { normalizeYouthPrimarySkillOrder } from "./engine/youth_skill_order_normalizer.js"; // YOUTH-SKILL-ORDER-REPAIR-WIRED',
    'async function generateValidatedProgram(intake) {',
    '  const raw = await runEngineRaw("x");',
    '    let program = normalizeYouthPrimarySkillOrder(enrichSpecificWarmups(repairUnbenchmarkedVariationLoads(fixInvalidExerciseNames(raw), intake)), intake).program; // step 1: DETERMINISTIC-UNBENCHMARKED-LOAD-REPAIR + SPECIFIC-WARMUP-ENRICHMENT + YOUTH-SKILL-ORDER-REPAIR',
    '  validatePhase15FinalProgram(program, intake);',
    '  return program;',
    '}',
  ].join('\n');
}

test('production runtime applies deterministic Advanced Hybrid Week 4 OAP repair before final QA', () => {
  const out = patchAdvancedHybridOapPipelineSource(fixture());
  assert.match(out, /normalizeAdvancedHybridWeek4OapConsolidation/);
  assert.match(out, new RegExp(OAP_PIPELINE_MARKER));
  assert.ok(
    out.indexOf('normalizeAdvancedHybridWeek4OapConsolidation(program, intake).program') <
      out.indexOf('validatePhase15FinalProgram(program, intake)'),
  );
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
