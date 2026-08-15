import {
  validateExercisesAgainstDictionary,
  validateEquipmentAgainstLocation,
  enforceUnilateralIntensityFloor,
  enforceIntradayConditioningOrder,
  validateWeeklyVolumeBudget,
  reformatWarmupCells,
  validateAndCalibrateSkills,
} from './exercise_dictionary.js';
import { repairPhase15Program } from './phase15_program_qa.js';
import { validatePhase15FinalProgram } from './phase15_final_qa.js';
import { parseProgramModel } from './program_model.js';
import {
  validateDirectGoalExposureSemantic,
  validateSportDayCouplingSemantic,
} from './semantic_program_qa.js';

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

  validateWeeklyVolumeBudget(candidate, intake);
  candidate = reformatWarmupCells(candidate);
  candidate = repairPhase15Program(candidate);
  validatePhase15FinalProgram(candidate, intake);

  return {
    ok: true,
    program: candidate,
    model: validateDirectGoalExposureSemantic(candidate, intake).model,
    warnings: sportCalendar.warnings || [],
    schedule: sportCalendar.schedule || [],
  };
}
