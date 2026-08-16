import { validateClientOutputCleanliness } from './client_output_qa.js';
import { validateDirectGoalExposureSemantic } from './semantic_program_qa.js';
import { validateRepairableProgramBundle } from './repairable_validation_bundle.js';

// Single offline entry point for the deterministic validation chain that runs
// after the server's last-mile exercise-name/load normalization and before a
// candidate is accepted. Production and offline QA now share the same aggregate
// repairable-validation bundle so one candidate exposes all repairable defects
// instead of consuming one generation attempt per fail-fast validator.
export function validateProductionProgram(program, intake = {}) {
  const result = validateRepairableProgramBundle(program, intake);
  const candidate = result.program;

  // Client-output cleanliness remains a transport boundary rather than a coaching
  // repair signal. It is still checked here and again on the runtime save boundary.
  validateClientOutputCleanliness(candidate);

  return {
    ok: true,
    program: candidate,
    model: validateDirectGoalExposureSemantic(candidate, intake).model,
    warnings: result.warnings || [],
    schedule: result.schedule || [],
  };
}
