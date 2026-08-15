import { RetriableValidationError } from './exercise_dictionary.js';

// This validator is intentionally about display safety, not coaching semantics.
// ProgramModel owns exercise and session meaning. Here we only forbid internal
// implementation artifacts from crossing the client boundary.
const INTERNAL_OUTPUT_PATTERNS = Object.freeze([
  { code: 'review_placeholder', re: /\[REVIEW\]/i },
  { code: 'support_placeholder', re: /this exercise slot could not be safely generated|please contact support/i },
  { code: 'calibration_placeholder', re: /duplicate skill row removed|superseded by calibrated rung/i },
  { code: 'qa_marker', re: /QA_FORMULA_VIOLATION_COUNT|QA trace:/i },
  { code: 'internal_repair_text', re: /INTERNAL QUALITY REPAIR MODE|INTERNAL_QA_REPAIR/i },
  {
    code: 'validator_code',
    re: /\b(?:EXERCISE_HALLUCINATION|EQUIPMENT_VIOLATION|UNILATERAL_UNDERSTIMULATION|INTRADAY_ORDER_VIOLATION|SPORT_DAY_COUPLING_VIOLATION|WEEKLY_MRV_EXCEEDED|SKILL_PREREQ_VIOLATION|SKILL_UNDER_PROGRAMMED|NAMED_GOAL_DIRECT_EXPOSURE_MISSING|TARGET_MODALITY_EXPOSURE_REDUCED|PHASE15_QUALITY_VIOLATION)\b/i,
  },
]);

export function clientOutputLeaks(program) {
  const text = String(program || '');
  return INTERNAL_OUTPUT_PATTERNS
    .filter(({ re }) => re.test(text))
    .map(({ code }) => ({ code }));
}

export function validateClientOutputCleanliness(program) {
  const leaks = clientOutputLeaks(program);
  if (!leaks.length) return { ok: true, leaks: [] };

  const amendment =
    'PRIOR ATTEMPT FAILED CLIENT OUTPUT CLEANLINESS. ' +
    'Remove every internal QA marker, validator code, review placeholder and support placeholder. ' +
    'Return only the normal client facing coaching deliverable. Do not change valid coaching content merely to hide the error.';
  const err = new RetriableValidationError('PHASE15_QUALITY_VIOLATION', amendment, {
    leaks,
    boundary: 'client_output',
  });
  err.flags = leaks.map((leak) => ({ code: `CLIENT_OUTPUT_INTERNAL_LEAK:${leak.code}` }));
  throw err;
}
