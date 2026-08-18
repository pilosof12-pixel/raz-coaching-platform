import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const OAP_PIPELINE_MARKER = 'ADVANCED-HYBRID-OAP-CONSOLIDATION-REPAIR-WIRED';

export function patchAdvancedHybridOapPipelineSource(input) {
  let source = String(input || '');
  if (source.includes(OAP_PIPELINE_MARKER)) return source;

  const importAnchor = 'import { normalizeYouthPrimarySkillOrder } from "./engine/youth_skill_order_normalizer.js"; // YOUTH-SKILL-ORDER-REPAIR-WIRED';
  const importCount = source.split(importAnchor).length - 1;
  if (importCount !== 1) throw new Error(`Advanced Hybrid OAP pipeline import anchor expected once, found ${importCount}`);
  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { normalizeAdvancedHybridWeek4OapConsolidation } from "./engine/advanced_hybrid_oap_consolidation_normalizer.js"; // ${OAP_PIPELINE_MARKER}`,
  );

  const programAnchor = '    let program = normalizeYouthPrimarySkillOrder(enrichSpecificWarmups(repairUnbenchmarkedVariationLoads(fixInvalidExerciseNames(raw), intake)), intake).program; // step 1: DETERMINISTIC-UNBENCHMARKED-LOAD-REPAIR + SPECIFIC-WARMUP-ENRICHMENT + YOUTH-SKILL-ORDER-REPAIR';
  const programCount = source.split(programAnchor).length - 1;
  if (programCount !== 1) throw new Error(`Advanced Hybrid OAP pipeline program anchor expected once, found ${programCount}`);
  source = source.replace(
    programAnchor,
    `${programAnchor}\n    program = normalizeAdvancedHybridWeek4OapConsolidation(program, intake).program; // ${OAP_PIPELINE_MARKER}`,
  );

  return source;
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`)) === selfPath) {
  const runtimePath = fileURLToPath(new URL('../server.phase15.js', import.meta.url));
  const before = fs.readFileSync(runtimePath, 'utf8');
  const after = patchAdvancedHybridOapPipelineSource(before);
  fs.writeFileSync(runtimePath, after);
  console.log('Advanced Hybrid Week 4 OAP deterministic convergence wired before final QA.');
}
