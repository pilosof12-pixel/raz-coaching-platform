import {
  validateExercisesAgainstDictionary,
  validateEquipmentAgainstLocation,
  enforceUnilateralIntensityFloor,
  enforceIntradayConditioningOrder,
  reformatWarmupCells,
  validateAndCalibrateSkills,
} from './exercise_dictionary.js';
import { validateClientOutputCleanliness } from './client_output_qa.js';
import { repairPhase15Program } from './phase15_program_qa.js';
import { validatePhase15FinalProgram } from './phase15_final_qa.js';
import { parseProgramModel } from './program_model.js';
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

// Single offline entry point for the deterministic validation chain that runs
// after the server's last-mile exercise-name/load normalization and before a
// candidate is accepted. Keep this order aligned with the production runtime.
export function validateProductionProgram(program, intake = {}) {
  let candidate = String(program || '');

  const dictionaryResult = validateExercisesAgainstDictionary(candidate, intake);
  candidate = dictionaryResult.program;

  const skillResult = validateAndCalibrateSkills(candidate, intake);
  candidate = skillResult.program;

  validateEquipmentAgainstLocation(candidate, intake);
  enforceUnilateralIntensityFloor(candidate, intake);
  candidate = enforceIntradayConditioningOrder(candidate, intake);

  let model = parseProgramModel(candidate, intake);
  const sportCalendar = validateSportDayCouplingSemantic(candidate, intake, model);
  model = sportCalendar.model;
  model = validateDirectGoalExposureSemantic(candidate, intake, model).model;
  model = validateProgressionArchitectureSemantic(candidate, intake, model).model;
  model = validateYouthProgressionQualitySemantic(candidate, intake, model).model;
  model = validateYouthConsolidationRetentionSemantic(candidate, intake, model).model;
  model = validateTacticalScheduleArchitectureSemantic(candidate, intake, model).model;
  model = validateKnownMaxPullUpDoseSemantic(candidate, intake, model).model;
  model = validateTacticalGppCoverageSemantic(candidate, intake, model).model;
  model = validateTacticalStrengthCompletenessSemantic(candidate, intake, model).model;
  model = validateTactical3KIntervalProgressionSemantic(candidate, intake, model).model;
  model = validateHardRunWarmupSemantic(candidate, intake, model).model;
  model = validateWeeklyVolumeBudgetSemantic(candidate, intake, model).model;

  candidate = reformatWarmupCells(candidate);
  candidate = repairPhase15Program(candidate);
  validatePhase15FinalProgram(candidate, intake);
  validateClientOutputCleanliness(candidate);

  return {
    ok: true,
    program: candidate,
    model: validateDirectGoalExposureSemantic(candidate, intake).model,
    warnings: sportCalendar.warnings || [],
    schedule: sportCalendar.schedule || [],
  };
}
