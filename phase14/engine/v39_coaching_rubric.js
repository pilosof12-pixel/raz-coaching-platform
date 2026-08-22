// Coaching Acceptance Rubric v1.0 (frozen).
//
// Every previous layer answered "is this program self-consistent and
// structurally complete?". None answered the question the coach actually asks:
// "would I prescribe this?". This module scores a program on the six frozen
// dimensions, applies the frozen score caps, and reports which hard rules are
// unresolved.
//
// Design constraint taken from the specification itself: software rejects
// HARD-rule violations, flags SOFT and CONTEXT-DEPENDENT issues for review, and
// does not attempt to turn every coaching preference into a deterministic
// validator. So a SOFT finding lowers a dimension score and appears in the
// report; it never blocks a release on its own.

export const CLASSIFICATION = { HARD: 'hard', SOFT: 'soft', CONTEXT: 'context' };

export const DIMENSIONS = [
  'exercise_selection',
  'loading',
  'progression',
  'recovery_management',
  'specificity',
  'safety',
];

// Which rubric dimension each rule family speaks to, and how it is classified in
// the frozen specification. Codes are the ones the engine actually emits.
const RULE_REGISTRY = {
  // --- Coaching Specification v1.0 identifiers -----------------------------
  COACH_SPEC_V1_AH01_RECOVERY_HIERARCHY: { classification: CLASSIFICATION.HARD, dimension: 'recovery_management' },
  COACH_SPEC_V1_AH02_DUAL_HEAVY_SQUAT: { classification: CLASSIFICATION.HARD, dimension: 'recovery_management' },
  COACH_SPEC_V1_AH04_PULL_SPACING: { classification: CLASSIFICATION.HARD, dimension: 'recovery_management' },
  COACH_SPEC_V1_AH06_MAINTENANCE_OVERLOAD: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  COACH_SPEC_V1_AH07_UNCONDITIONAL_PROGRESSION: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  COACH_SPEC_V1_YG_ATTEMPT_QUALITY: { classification: CLASSIFICATION.HARD, dimension: 'safety' },
  COACH_SPEC_V1_YG04_BALANCE_SPECIFICITY: { classification: CLASSIFICATION.HARD, dimension: 'specificity' },
  COACH_SPEC_V1_YG06_POWER_OUTPUT: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  COACH_SPEC_V1_YG07_YOUTH_FAILURE: { classification: CLASSIFICATION.HARD, dimension: 'safety' },
  COACH_SPEC_V1_T3K_400_ONLY_BLOCK: { classification: CLASSIFICATION.HARD, dimension: 'specificity' },
  COACH_SPEC_V1_T3K_KEY_RUN_PRECEDED_BY_STRENGTH: { classification: CLASSIFICATION.HARD, dimension: 'recovery_management' },
  COACH_SPEC_V1_T3K_RUCK_MULTI_VARIABLE_PROGRESSION: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  COACH_SPEC_V1_T3K_SHIN_SYMPTOM_GATE_MISSING: { classification: CLASSIFICATION.HARD, dimension: 'safety' },
  // Cross-week event progression. Renamed from T3K-08 to T3K-10: the frozen
  // specification assigns T3K-08 to the sacrifice hierarchy, and two rules must
  // not share an identifier.
  COACH_SPEC_V1_T3K_EVENT_PROGRESSION_STATIC: { classification: CLASSIFICATION.HARD, dimension: 'specificity' },
  COACH_SPEC_V1_T3K_EVENT_PROGRESSION_NOT_RETAINED: { classification: CLASSIFICATION.HARD, dimension: 'specificity' },
  COACH_SPEC_V1_T3K_EVENT_PROGRESSION_INCOHERENT: { classification: CLASSIFICATION.HARD, dimension: 'progression' },

  // --- structural architecture (v38) --------------------------------------
  V38_INCOMPLETE_SESSION: { classification: CLASSIFICATION.HARD, dimension: 'exercise_selection' },
  V38_SKILL_WITHOUT_FOUNDATION: { classification: CLASSIFICATION.HARD, dimension: 'exercise_selection' },
  V38_CONSECUTIVE_CONFLICTING_EXPOSURE: { classification: CLASSIFICATION.HARD, dimension: 'recovery_management' },
  V38_CARRY_PACE_ONLY_PROGRESSION: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  V38_MISSING_MOVEMENT_CATEGORY: { classification: CLASSIFICATION.SOFT, dimension: 'exercise_selection' },
  // Recovery budgeting and progression discipline. A label that contradicts the
  // prescription is an objective error the athlete is misled by, so it is hard.
  // Where to place work against a sport week, and how many stress dimensions to
  // move at once, are coaching judgements with defensible answers.
  V42_LOW_COST_CLAIM_CONTRADICTED: { classification: CLASSIFICATION.HARD, dimension: 'recovery_management' },
  V42_PRIMARY_WORK_ON_HARD_SPORT_DAY: { classification: CLASSIFICATION.CONTEXT, dimension: 'recovery_management' },
  V42_CONDITIONING_STACKED_ON_SPORT_DAYS: { classification: CLASSIFICATION.SOFT, dimension: 'recovery_management' },
  V42_MULTIPLE_STRESSORS_RAISED: { classification: CLASSIFICATION.SOFT, dimension: 'progression' },
  // Governance. A skill quota with no stop condition and a maintenance lift
  // drifting upward are objective errors with deterministic repairs. Duration
  // estimates and coaching emphasis are reported, not enforced.
  V43_SKILL_QUOTA_WITHOUT_CEILING: { classification: CLASSIFICATION.HARD, dimension: 'safety' },
  V43_MAINTENANCE_AUTO_PROGRESSED: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  V43_SESSION_EXCEEDS_TIME_BUDGET: { classification: CLASSIFICATION.SOFT, dimension: 'recovery_management' },
  V43_NO_AUTOREGULATION_PATH: { classification: CLASSIFICATION.SOFT, dimension: 'safety' },
  V43_INJURY_RESPONSE_NOT_CAUSAL: { classification: CLASSIFICATION.SOFT, dimension: 'safety' },

  // --- prescription and narrative honesty ---------------------------------
  V34_NOTE_PER_SET_MISMATCH: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  V34_NOTE_TOTAL_MISMATCH: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  V34_NOTE_REP_WORD_MISMATCH: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  V34_PROGRESSION_LANGUAGE_MISMATCH: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  V34_NOTE_UNDEFINED_LOAD_REFERENCE: { classification: CLASSIFICATION.HARD, dimension: 'loading' },
  V34_NOTE_UNCONDITIONAL_ADDITION: { classification: CLASSIFICATION.SOFT, dimension: 'progression' },
  V34_WARMUP_HEAVIER_THAN_WORK: { classification: CLASSIFICATION.HARD, dimension: 'loading' },
  V34_WARMUP_TARGET_MISMATCH: { classification: CLASSIFICATION.HARD, dimension: 'loading' },
  V34_DUPLICATE_SPECIFIC_RAMP: { classification: CLASSIFICATION.SOFT, dimension: 'exercise_selection' },
  V35_NARRATIVE_PROGRESSION_CLAIM_UNSUPPORTED: { classification: CLASSIFICATION.HARD, dimension: 'progression' },
  V35_CONFLICTING_SYMPTOM_ALGORITHM: { classification: CLASSIFICATION.HARD, dimension: 'safety' },
  V35_SECONDARY_VOLUME_CREEP: { classification: CLASSIFICATION.SOFT, dimension: 'recovery_management' },
  V35_BLOCK_SPECIFICITY_OVERSTATED: { classification: CLASSIFICATION.SOFT, dimension: 'specificity' },
  V35_VOLUME_NARRATIVE_MISMATCH: { classification: CLASSIFICATION.SOFT, dimension: 'specificity' },
  V34_RUNNING_VOLUME_ABOVE_BASELINE: { classification: CLASSIFICATION.SOFT, dimension: 'safety' },
};

export function classifyFinding(code) {
  return RULE_REGISTRY[code] || { classification: CLASSIFICATION.SOFT, dimension: 'exercise_selection' };
}

// Deductions are deliberately blunt. The rubric's job is to separate "would
// prescribe" from "would not"; it is not trying to be a precise 0-10 judgement
// of coaching craft, which remains a human call.
const HARD_DEDUCTION = 3;
const SOFT_DEDUCTION = 1;

export function scoreProgram(findings = []) {
  const scores = Object.fromEntries(DIMENSIONS.map((d) => [d, 10]));
  const byDimension = Object.fromEntries(DIMENSIONS.map((d) => [d, []]));
  const hardViolations = [];
  const softFlags = [];

  // Deduct per distinct RULE, not per instance. A rule broken in all four weeks
  // is one unresolved rule; counting instances would zero a dimension for a
  // single repeated fault and make the score meaningless.
  const seen = new Map();
  for (const f of findings) {
    if (!seen.has(f.code)) seen.set(f.code, { code: f.code, instances: 0, message: f.message });
    seen.get(f.code).instances += 1;
  }
  for (const { code, instances, message } of seen.values()) {
    const { classification, dimension } = classifyFinding(code);
    const entry = { code, classification, instances, message };
    byDimension[dimension].push(entry);
    if (classification === CLASSIFICATION.HARD) {
      hardViolations.push(entry);
      scores[dimension] = Math.max(0, scores[dimension] - HARD_DEDUCTION);
    } else {
      softFlags.push(entry);
      scores[dimension] = Math.max(0, scores[dimension] - SOFT_DEDUCTION);
    }
  }

  const mean = DIMENSIONS.reduce((s, d) => s + scores[d], 0) / DIMENSIONS.length;
  let overall = Math.round(mean * 10) / 10;
  const capsApplied = [];

  // Frozen score caps.
  if (hardViolations.length) {
    overall = Math.min(overall, 7.9);
    capsApplied.push('unresolved HARD RULE violation -> max 7.9');
  }
  if (scores.safety < 8) {
    overall = Math.min(overall, 7.9);
    capsApplied.push('safety below 8 -> max 7.9');
  }
  if (scores.recovery_management < 7) {
    overall = Math.min(overall, 8.4);
    capsApplied.push('recovery management below 7 -> max 8.4');
  }
  if (scores.specificity < 7) {
    overall = Math.min(overall, 8.4);
    capsApplied.push('specificity below 7 -> max 8.4');
  }
  overall = Math.round(overall * 10) / 10;

  // The frozen definition of a genuine 9+.
  const meetsNinePlus = hardViolations.length === 0
    && DIMENSIONS.every((d) => scores[d] >= 8)
    && scores.safety >= 9
    && overall >= 9;

  return { scores, overall, hardViolations, softFlags, capsApplied, byDimension, meetsNinePlus };
}

export function formatScorecard(result, label = 'program') {
  const lines = [`Coaching Acceptance Rubric v1.0 — ${label}`];
  for (const d of DIMENSIONS) {
    const issues = result.byDimension[d];
    lines.push(`  ${d.padEnd(22)} ${String(result.scores[d]).padStart(4)}/10${issues.length ? `  (${issues.length} finding${issues.length > 1 ? 's' : ''})` : ''}`);
  }
  lines.push(`  ${'OVERALL'.padEnd(22)} ${String(result.overall).padStart(4)}/10`);
  if (result.capsApplied.length) lines.push(`  caps applied: ${result.capsApplied.join('; ')}`);
  lines.push(`  meets frozen 9+ standard: ${result.meetsNinePlus ? 'YES' : 'no'}`);
  if (result.hardViolations.length) {
    lines.push('  unresolved HARD rules:');
    for (const v of result.hardViolations) lines.push(`    - ${v.code}${v.instances > 1 ? ` (x${v.instances})` : ''}`);
  }
  if (result.softFlags.length) {
    lines.push('  flagged for review (SOFT/CONTEXT, not release-blocking):');
    for (const v of result.softFlags) lines.push(`    - ${v.code}${v.instances > 1 ? ` (x${v.instances})` : ''}`);
  }
  return lines.join('\n');
}
