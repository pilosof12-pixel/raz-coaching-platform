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
import { repairYouthPrimarySkillOrder, repairHybridMarathonEventAnchor } from './deterministic_coaching_repairs.js';
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
    if (/START_WEEK\d+_TSV/.test(line)) { inBlock = true; header = null; exIdx = -1; out.push(line); continue; }
    if (/END_WEEK\d+_TSV/.test(line)) { inBlock = false; header = null; exIdx = -1; out.push(line); continue; }
    if (!inBlock || !line.trim()) { out.push(line); continue; }
    const rowDelim = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : delim);
    if (!header) { delim = rowDelim; header = line.split(delim).map((c) => c.trim().toLowerCase()); exIdx = header.indexOf('exercise'); out.push(line); continue; }
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
  return Boolean(err instanceof RetriableValidationError || err instanceof SkillCalibrationError || err?.code === 'PHASE15_QUALITY_VIOLATION');
}
function flattenError(err) {
  if (err?.code === 'PHASE15_QUALITY_VIOLATION' && Array.isArray(err.flags) && err.flags.length) {
    return err.flags.map((flag) => ({ code: String(flag?.code || 'PHASE15_QUALITY_VIOLATION'), amendment: String(flag?.amendment || flag?.message || err?.amendment || err?.message || ''), details: flag?.details || {}, source_error: err }));
  }
  return [{ code: String(err?.code || 'INTERNAL_QUALITY_VIOLATION'), amendment: String(err?.amendment || err?.message || err?.code || 'Unknown quality failure'), details: err?.details || {}, source_error: err }];
}
function dedupeFlags(flags) {
  const seen = new Set(), out = [];
  for (const flag of flags) { const key = `${flag.code}|${flag.amendment}`; if (seen.has(key)) continue; seen.add(key); out.push(flag); }
  return out;
}
function runRepairable(flags, fn) {
  try { return { ok: true, value: fn() }; }
  catch (err) { if (!isRepairable(err)) throw err; flags.push(...flattenError(err)); return { ok: false, value: null }; }
}
function aggregateError(flags) {
  const clean = dedupeFlags(flags);
  if (clean.length === 1 && clean[0].source_error?.code === 'PHASE15_QUALITY_VIOLATION' && Array.isArray(clean[0].source_error?.flags) && clean[0].source_error.flags.length) return clean[0].source_error;
  const amendment = [
    clean.length > 1 ? 'PRIOR ATTEMPT FAILED MULTIPLE REPAIRABLE VALIDATORS IN THE SAME CANDIDATE.' : 'PRIOR ATTEMPT FAILED A REPAIRABLE PRODUCTION VALIDATOR.',
    clean.length > 1 ? 'Repair ALL defects below in one pass. Do not fix one item by violating another item.' : 'Repair the defect below while preserving every already-valid program requirement.',
    ...clean.map((flag, i) => `${i + 1}. ${flag.code}: ${flag.amendment}`),
  ].join('\n');
  const err = new RetriableValidationError('PHASE15_QUALITY_VIOLATION', amendment, { violations: clean.map(({ code, amendment, details }) => ({ code, amendment, details })) });
  err.flags = clean.map(({ code, amendment, details }) => ({ code, amendment, details }));
  err.aggregate = true;
  return err;
}

export function collectRepairableValidationFailures(program, intake = {}, options = {}) {
  const skipSkillCalibration = options?.skipSkillCalibration === true;
  let candidate = stripNonExerciseScheduleRows(program, intake);
  const flags = [];
  let warnings = [], schedule = [], mrv_trim = null;

  const dictionary = runRepairable(flags, () => validateExercisesAgainstDictionary(candidate, intake));
  if (dictionary.ok) candidate = dictionary.value.program;
  if (!skipSkillCalibration) {
    const skills = runRepairable(flags, () => validateAndCalibrateSkills(candidate, intake));
    if (skills.ok) candidate = skills.value.program;
  }
  runRepairable(flags, () => validateEquipmentAgainstLocation(candidate, intake));
  runRepairable(flags, () => enforceUnilateralIntensityFloor(candidate, intake));
  const ordered = runRepairable(flags, () => enforceIntradayConditioningOrder(candidate, intake));
  if (ordered.ok && typeof ordered.value === 'string') candidate = ordered.value;

  mrv_trim = trimExcessSupportVolume(candidate, intake);
  if (mrv_trim.repaired) candidate = mrv_trim.program;

  // Deterministic repairs are deliberately narrow: row order and event-role annotation only.
  // They never add exercises, sets, reps, load, distance or training days.
  candidate = repairYouthPrimarySkillOrder(candidate, intake);
  candidate = repairHybridMarathonEventAnchor(candidate, intake);

  let model = parseProgramModel(candidate, intake);
  const semanticChecks = [
    () => validateSportDayCouplingSemantic(candidate, intake, model),
    () => validateDirectGoalExposureSemantic(candidate, intake, model),
    () => validateGoalComponentCoverageSemantic(candidate, intake, model),
    () => validateProgressionArchitectureSemantic(candidate, intake, model),
    () => validateYouthProgressionQualitySemantic(candidate, intake, model),
    () => validateYouthConsolidationRetentionSemantic(candidate, intake, model),
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
    if (i === 0 && checked.ok) { warnings = checked.value?.warnings || []; schedule = checked.value?.schedule || []; }
  }

  candidate = reformatWarmupCells(candidate);
  candidate = repairPhase15Program(candidate);
  runRepairable(flags, () => validatePhase15FinalProgram(candidate, intake));

  return {
    ok: flags.length === 0,
    program: candidate,
    model,
    flags: dedupeFlags(flags),
    warnings,
    schedule,
    mrv_trim: mrv_trim ? { repaired: Boolean(mrv_trim.repaired), reductions: mrv_trim.reductions || [], unresolved: Boolean(mrv_trim.unresolved) } : null,
    skill_calibration_skipped: skipSkillCalibration,
  };
}

export function validateRepairableProgramBundle(program, intake = {}, options = {}) {
  const result = collectRepairableValidationFailures(program, intake, options);
  if (!result.ok) throw aggregateError(result.flags);
  return result;
}
