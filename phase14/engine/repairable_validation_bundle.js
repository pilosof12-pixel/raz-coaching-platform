import {
  RetriableValidationError,
  SkillCalibrationError,
  validateExercisesAgainstDictionary,
  validateEquipmentAgainstLocation,
  enforceUnilateralIntensityFloor,
  enforceIntradayConditioningOrder,
  reformatWarmupCells,
  validateAndCalibrateSkills,
  coreExerciseName,
  norm,
} from './exercise_dictionary.js';
import { repairPhase15Program } from './phase15_program_qa.js';
import { validatePhase15FinalProgram } from './phase15_final_qa.js';
import { parseProgramModel } from './program_model.js';
import { trimExcessSupportVolume } from './mrv_support_trim.js';
import { enrichSpecificWarmups } from './specific_warmup_enrichment.js';
import { normalizeFinalNoteCoherence } from './final_note_coherence.js'; // FINAL-NOTE-COHERENCE-WIRED
import { validatePrescriptionConsistency } from './v34_prescription_consistency.js'; // V34-PRESCRIPTION-CONSISTENCY-WIRED
import { normalizeAdvancedHybridWeek4OapConsolidation } from './advanced_hybrid_oap_consolidation_normalizer.js';
import { normalizeAdvancedHybridOHPComplement } from './advanced_hybrid_ohp_normalizer.js';
import { normalizeYouthPrimarySkillOrder } from './youth_skill_order_normalizer.js';
import { normalizeYouthAcquisitionGoalFloors } from './youth_goal_floor_normalizer.js';
import { normalizeYouthSessionQuality } from './youth_session_quality_normalizer.js';
import { normalizeYouthWeek4Consolidation } from './youth_consolidation_normalizer.js';
import { validateYouthSessionQualitySemantic } from './youth_session_quality.js';
import { normalizeTacticalGppFloor } from './tactical_gpp_normalizer.js';
import { normalizeTacticalWeightedPullExposure } from './tactical_weighted_pull_normalizer.js';
import {
  validateDirectGoalExposureSemantic,
  validateSportDayCouplingSemantic,
  validateWeeklyVolumeBudgetSemantic,
} from './semantic_program_qa.js';
import {
  validateProgressionArchitectureSemantic,
  validateTacticalGppCoverageSemantic,
  validateTacticalScheduleArchitectureSemantic,
  validateKnownMaxPullUpDoseSemantic,
} from './coaching_progression_gpp.js';
import {
  validateTactical3KIntervalProgressionSemantic,
  validateTacticalStrengthCompletenessSemantic,
} from './tactical_3k_gpp_quality.js';
import {
  validateHardRunWarmupSemantic,
  validateYouthProgressionQualitySemantic,
} from './coaching_acceptance_quality.js';
import { validateYouthConsolidationRetentionSemantic } from './coaching_consolidation_quality.js';
import { validateGoalComponentCoverageSemantic } from './goal_progression_graph.js';
import {
  validateYouthManualAcceptanceSemantic,
  validateAdvancedHybridManualAcceptanceSemantic,
} from './manual_acceptance_quality.js';

const NON_EXERCISE_ROW_NAMES = new Set(['rest', 'rest day', 'off', 'off day', 'recovery day']);

export function stripNonExerciseScheduleRows(program, intake = {}) {
  const isHebrew = String(intake.language || '').toLowerCase() === 'he';
  const lines = String(program || '').split('\n');
  const out = [];
  let inBlock = false;
  let header = null;
  let exIdx = -1;
  let delim = '\t';

  for (const line of lines) {
    if (/START_WEEK\d+_TSV/.test(line)) {
      inBlock = true;
      header = null;
      exIdx = -1;
      out.push(line);
      continue;
    }
    if (/END_WEEK\d+_TSV/.test(line)) {
      inBlock = false;
      header = null;
      exIdx = -1;
      out.push(line);
      continue;
    }
    if (!inBlock || !line.trim()) {
      out.push(line);
      continue;
    }

    const rowDelim = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : delim);
    if (!header) {
      delim = rowDelim;
      header = line.split(delim).map((c) => c.trim().toLowerCase());
      exIdx = header.indexOf('exercise');
      out.push(line);
      continue;
    }

    if (exIdx >= 0) {
      const cells = line.split(rowDelim);
      const raw = exIdx < cells.length ? cells[exIdx] : '';
      const core = coreExerciseName(raw, isHebrew);
      if (NON_EXERCISE_ROW_NAMES.has(norm(core))) continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function isRepairable(err) {
  return Boolean(
    err instanceof RetriableValidationError ||
    err instanceof SkillCalibrationError ||
    err?.code === 'PHASE15_QUALITY_VIOLATION'
  );
}

function flattenError(err) {
  if (err?.code === 'PHASE15_QUALITY_VIOLATION' && Array.isArray(err.flags) && err.flags.length) {
    return err.flags.map((flag) => ({
      code: String(flag?.code || 'PHASE15_QUALITY_VIOLATION'),
      amendment: String(flag?.amendment || flag?.message || err?.amendment || err?.message || ''),
      details: flag?.details || {},
      source_error: err,
    }));
  }
  return [{
    code: String(err?.code || 'INTERNAL_QUALITY_VIOLATION'),
    amendment: String(err?.amendment || err?.message || err?.code || 'Unknown quality failure'),
    details: err?.details || {},
    source_error: err,
  }];
}

function dedupeFlags(flags) {
  const seen = new Set();
  const out = [];
  for (const flag of flags) {
    const key = `${flag.code}|${flag.amendment}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(flag);
  }
  return out;
}

function runRepairable(flags, fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (!isRepairable(err)) throw err;
    flags.push(...flattenError(err));
    return { ok: false, value: null };
  }
}

function aggregateError(flags) {
  const clean = dedupeFlags(flags);

  if (
    clean.length === 1 &&
    clean[0].source_error?.code === 'PHASE15_QUALITY_VIOLATION' &&
    Array.isArray(clean[0].source_error?.flags) &&
    clean[0].source_error.flags.length
  ) {
    return clean[0].source_error;
  }

  const amendment = [
    clean.length > 1
      ? 'PRIOR ATTEMPT FAILED MULTIPLE REPAIRABLE VALIDATORS IN THE SAME CANDIDATE.'
      : 'PRIOR ATTEMPT FAILED A REPAIRABLE PRODUCTION VALIDATOR.',
    clean.length > 1
      ? 'Repair ALL defects below in one pass. Do not fix one item by violating another item.'
      : 'Repair the defect below while preserving every already-valid program requirement.',
    ...clean.map((flag, i) => `${i + 1}. ${flag.code}: ${flag.amendment}`),
  ].join('\n');
  const err = new RetriableValidationError(
    'PHASE15_QUALITY_VIOLATION',
    amendment,
    { violations: clean.map(({ code, amendment, details }) => ({ code, amendment, details })) },
  );
  err.flags = clean.map(({ code, amendment, details }) => ({ code, amendment, details }));
  err.aggregate = true;
  return err;
}

function applyDeterministicCandidateRepairs(program, intake = {}) {
  let candidate = String(program || '');
  const repairs = [];

  const warmed = enrichSpecificWarmups(candidate);
  if (warmed !== candidate) {
    candidate = warmed;
    repairs.push({ type: 'specific_warmup_enrichment' });
  }

  const advancedOapConsolidation = normalizeAdvancedHybridWeek4OapConsolidation(candidate, intake);
  candidate = advancedOapConsolidation.program;
  if (advancedOapConsolidation.repaired) repairs.push({ type: 'advanced_hybrid_week4_oap_consolidation', rows: advancedOapConsolidation.repairs });

  const advancedOhpComplement = normalizeAdvancedHybridOHPComplement(candidate, intake);
  candidate = advancedOhpComplement.program;
  if (advancedOhpComplement.repaired) repairs.push({ type: 'advanced_hybrid_ohp_complement', rows: advancedOhpComplement.repairs });

  const youthFloors = normalizeYouthAcquisitionGoalFloors(candidate, intake);
  candidate = youthFloors.program;
  if (youthFloors.repaired) repairs.push({ type: 'youth_acquisition_goal_floor', rows: youthFloors.repairs });

  const youthSessionQuality = normalizeYouthSessionQuality(candidate, intake);
  candidate = youthSessionQuality.program;
  if (youthSessionQuality.repaired) repairs.push({ type: 'youth_session_quality', rows: youthSessionQuality.repairs });

  const tacticalWeightedPull = normalizeTacticalWeightedPullExposure(candidate, intake);
  candidate = tacticalWeightedPull.program;
  if (tacticalWeightedPull.repaired) repairs.push({ type: 'tactical_weighted_pull', rows: tacticalWeightedPull.repairs });

  const tacticalGpp = normalizeTacticalGppFloor(candidate, intake);
  candidate = tacticalGpp.program;
  if (tacticalGpp.repaired) repairs.push({ type: 'tactical_gpp_floor', rows: tacticalGpp.repairs });

  const youthOrder = normalizeYouthPrimarySkillOrder(candidate, intake);
  candidate = youthOrder.program;
  if (youthOrder.reordered) repairs.push({ type: 'youth_primary_skill_order', moves: youthOrder.moves });

  const youthConsolidation = normalizeYouthWeek4Consolidation(candidate, intake);
  candidate = youthConsolidation.program;
  if (youthConsolidation.repaired) repairs.push({ type: 'youth_week4_consolidation', rows: youthConsolidation.repairs });

  return { program: candidate, repairs };
}

export function collectRepairableValidationFailures(program, intake = {}, options = {}) {
  const skipSkillCalibration = options?.skipSkillCalibration === true;
  let candidate = stripNonExerciseScheduleRows(program, intake);
  const flags = [];
  let warnings = [];
  let schedule = [];
  let mrv_trim = null;
  let deterministic_repairs = [];

  // Normalize the model-authored exercise vocabulary first. Deterministic coaching
  // floors are only applied after that initial dictionary pass so they operate on
  // stable movement identity rather than trying to infer intent from a rejected
  // exercise name.
  const dictionary = runRepairable(flags, () => validateExercisesAgainstDictionary(candidate, intake));
  if (dictionary.ok) candidate = dictionary.value.program;

  if (!skipSkillCalibration) {
    const skills = runRepairable(flags, () => validateAndCalibrateSkills(candidate, intake));
    if (skills.ok) candidate = skills.value.program;
  }

  if (dictionary.ok) {
    const normalized = applyDeterministicCandidateRepairs(candidate, intake);
    candidate = normalized.program;
    deterministic_repairs = normalized.repairs;

    // The repair layer inserts only canonical source-authored movements, but run
    // the same dictionary gate again so production never grants itself a bypass.
    const repairedDictionary = runRepairable(flags, () => validateExercisesAgainstDictionary(candidate, intake));
    if (repairedDictionary.ok) candidate = repairedDictionary.value.program;
  }

  runRepairable(flags, () => validateEquipmentAgainstLocation(candidate, intake));
  runRepairable(flags, () => enforceUnilateralIntensityFloor(candidate, intake));

  const ordered = runRepairable(flags, () => enforceIntradayConditioningOrder(candidate, intake));
  if (ordered.ok && typeof ordered.value === 'string') candidate = ordered.value;

  mrv_trim = trimExcessSupportVolume(candidate, intake);
  if (mrv_trim.repaired) candidate = mrv_trim.program;

  let model = parseProgramModel(candidate, intake);
  const semanticChecks = [
    () => validateSportDayCouplingSemantic(candidate, intake, model),
    () => validateDirectGoalExposureSemantic(candidate, intake, model),
    () => validateGoalComponentCoverageSemantic(candidate, intake, model),
    () => validateProgressionArchitectureSemantic(candidate, intake, model),
    () => validateYouthProgressionQualitySemantic(candidate, intake, model),
    () => validateYouthConsolidationRetentionSemantic(candidate, intake, model),
    () => validateYouthSessionQualitySemantic(candidate, intake, model),
    () => validateYouthManualAcceptanceSemantic(candidate, intake, model),
    () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, model),
    () => validateTacticalScheduleArchitectureSemantic(candidate, intake, model),
    () => validateKnownMaxPullUpDoseSemantic(candidate, intake, model),
    () => validateTacticalGppCoverageSemantic(candidate, intake, model),
    () => validateTacticalStrengthCompletenessSemantic(candidate, intake, model),
    () => validateTactical3KIntervalProgressionSemantic(candidate, intake, model),
    () => validateHardRunWarmupSemantic(candidate, intake, model),
    () => validateWeeklyVolumeBudgetSemantic(candidate, intake, model),
  ];

  for (let i = 0; i < semanticChecks.length; i++) {
    const checked = runRepairable(flags, semanticChecks[i]);
    if (checked.ok && checked.value?.model) model = checked.value.model;
    if (i === 0 && checked.ok) {
      warnings = checked.value?.warnings || [];
      schedule = checked.value?.schedule || [];
    }
  }

  candidate = reformatWarmupCells(candidate);
  candidate = repairPhase15Program(candidate);

  // Final-boundary convergence: the legacy formatting/repair pass must not be
  // able to reintroduce a defect after deterministic candidate repair. Re-apply
  // only narrow, idempotent repairs here, then re-run affected semantic gates
  // before the final release validator.
  const finalAdvancedOap = normalizeAdvancedHybridWeek4OapConsolidation(candidate, intake);
  candidate = finalAdvancedOap.program;
  if (finalAdvancedOap.repaired) deterministic_repairs.push({ type: 'final_advanced_hybrid_week4_oap_consolidation', rows: finalAdvancedOap.repairs });

  const finalAdvancedOhp = normalizeAdvancedHybridOHPComplement(candidate, intake);
  candidate = finalAdvancedOhp.program;
  if (finalAdvancedOhp.repaired) deterministic_repairs.push({ type: 'final_advanced_hybrid_ohp_complement', rows: finalAdvancedOhp.repairs });

  const finalTacticalPull = normalizeTacticalWeightedPullExposure(candidate, intake);
  candidate = finalTacticalPull.program;
  if (finalTacticalPull.repaired) deterministic_repairs.push({ type: 'final_tactical_weighted_pull', rows: finalTacticalPull.repairs });

  const finalYouthConsolidation = normalizeYouthWeek4Consolidation(candidate, intake);
  candidate = finalYouthConsolidation.program;
  if (finalYouthConsolidation.repaired) deterministic_repairs.push({ type: 'final_youth_week4_consolidation', rows: finalYouthConsolidation.repairs });

  // Last deterministic repair: every prescription above is now settled, so any
  // quantitative claim a note still makes about its own row can be checked
  // against the final structured fields.
  const finalNoteCoherence = normalizeFinalNoteCoherence(candidate, intake);
  candidate = finalNoteCoherence.program;
  if (finalNoteCoherence.repaired) deterministic_repairs.push({ type: 'final_note_coherence', rows: finalNoteCoherence.repairs });

  const finalModel = parseProgramModel(candidate, intake);
  runRepairable(flags, () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateTacticalScheduleArchitectureSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateKnownMaxPullUpDoseSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateYouthConsolidationRetentionSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateYouthSessionQualitySemantic(candidate, intake, finalModel));
  // v34: runs AFTER every deterministic prescription repair, so it compares
  // notes against final structured fields.
  runRepairable(flags, () => validatePrescriptionConsistency(candidate, intake, RetriableValidationError));
  runRepairable(flags, () => validatePhase15FinalProgram(candidate, intake));

  return {
    ok: flags.length === 0,
    program: candidate,
    model,
    flags: dedupeFlags(flags),
    warnings,
    schedule,
    deterministic_repairs,
    mrv_trim: mrv_trim ? {
      repaired: Boolean(mrv_trim.repaired),
      reductions: mrv_trim.reductions || [],
      unresolved: Boolean(mrv_trim.unresolved),
    } : null,
    skill_calibration_skipped: skipSkillCalibration,
  };
}

export function validateRepairableProgramBundle(program, intake = {}, options = {}) {
  const result = collectRepairableValidationFailures(program, intake, options);
  if (!result.ok) throw aggregateError(result.flags);
  return result;
}
