import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const OAP_PIPELINE_MARKER = 'ADVANCED-HYBRID-OAP-CONSOLIDATION-REPAIR-WIRED';
export const OAP_REVALIDATION_MARKER = 'ADVANCED-HYBRID-OAP-REPAIR-REVALIDATION-NORMALIZED';
export const OAP_COACHING_ALIGNMENT_MARKER = 'ADVANCED-HYBRID-OAP-PROGRESSION-AXIS-LOCK';
export const OAP_REPAIR_FEEDBACK_MARKER = 'ADVANCED-HYBRID-OAP-REPAIR-VOLUME-LOCK';

export function patchAdvancedHybridOapPipelineSource(input) {
  let source = String(input || '');

  if (!source.includes(OAP_PIPELINE_MARKER)) {
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
  }

  if (!source.includes(OAP_REVALIDATION_MARKER)) {
    const validationRe = /^(\s*)validatePhase15FinalProgram\(program, intake\);\s*$/gm;
    const matches = [...source.matchAll(validationRe)];
    if (!matches.length) throw new Error('Advanced Hybrid OAP revalidation anchor not found');
    source = source.replace(
      validationRe,
      (_match, indent) => `${indent}program = normalizeAdvancedHybridWeek4OapConsolidation(program, intake).program; // ${OAP_REVALIDATION_MARKER}\n${indent}validatePhase15FinalProgram(program, intake);`,
    );
  }

  if (!source.includes(OAP_COACHING_ALIGNMENT_MARKER)) {
    const developerStart = 'const OPENAI_COMPACT_DEVELOPER = [';
    const start = source.indexOf(developerStart);
    if (start < 0) throw new Error('Advanced Hybrid OAP developer prompt boundary missing');
    const joinAnchor = '].join("\\n");';
    const end = source.indexOf(joinAnchor, start);
    if (end < 0) throw new Error('Advanced Hybrid OAP developer prompt closing boundary missing');
    const beforeClose = source.slice(start, end);
    const separator = beforeClose.trimEnd().endsWith(',') ? '' : ',';
    const rule = `${separator}\n  "ADVANCED OAP PROGRESSION AXIS LOCK: when an athlete already owns strict One-Arm Pull-up reps and is in a high-concurrency strength plus combat-sport plan, do not create progression merely by adding strict OAP sets. Keep strict OAP attempt-set count stable through build weeks unless the intake or authored source specifically identifies volume tolerance as the limiter. Prefer better execution quality, rep quality within a low set count, less assistance on the assisted exposure, or another verified performance variable that does not manufacture extra fatigue. Week 4 must hold or reduce strict OAP sets versus Week 3 while preserving the best earned skill standard. Never move volume from accessories into extra strict OAP sets just to satisfy a general progression or consolidation check.", // ${OAP_COACHING_ALIGNMENT_MARKER}\n`;
    source = source.slice(0, end) + rule + source.slice(end);
  }

  if (source.includes('ADVANCED-HYBRID-NUMERIC-REPAIR-FEEDBACK') && !source.includes(OAP_REPAIR_FEEDBACK_MARKER)) {
    const feedbackAnchor = 'Do not replace removed sets with extra reps, harder effort, new exercises, intervals, finishers or conditioning. This is a measurable workload reduction, not a prose rewrite.';
    const feedbackCount = source.split(feedbackAnchor).length - 1;
    if (feedbackCount !== 1) throw new Error(`Advanced Hybrid OAP repair feedback anchor expected once, found ${feedbackCount}`);
    const lockedFeedback = 'STRICT OAP VOLUME LOCK: preserve Week 4 direct strict One-Arm Pull-up set count at or below Week 3. Never move sets removed from accessories, bilateral pulling, pressing or lower-body work into extra strict OAP attempts. Reduce fatigue around the primary skill while retaining its best earned quality. Do not replace removed sets with extra reps, harder effort, new exercises, intervals, finishers or conditioning. This is a measurable workload reduction, not a prose rewrite. [ADVANCED-HYBRID-OAP-REPAIR-VOLUME-LOCK]';
    source = source.replace(feedbackAnchor, lockedFeedback);
  }

  return source;
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`)) === selfPath) {
  const runtimePath = fileURLToPath(new URL('../server.phase15.js', import.meta.url));
  const before = fs.readFileSync(runtimePath, 'utf8');
  const after = patchAdvancedHybridOapPipelineSource(before);
  fs.writeFileSync(runtimePath, after);
  console.log('Advanced Hybrid OAP coaching axis and repair-loop convergence are wired before final QA.');
}
