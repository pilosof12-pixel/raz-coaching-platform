import {
  validateSportDayCoupling as validateLegacySportDayCoupling,
  estimateSportStress,
  MRV_CEILINGS,
  RetriableValidationError,
} from './exercise_dictionary.js';
import {
  normalizeDay,
  parseProgramModel,
  strengthDaysForWeek,
} from './program_model.js';
import {
  applyDirectGoalSemantics,
  directGoalExposureViolations,
} from './program_goal_semantics.js';

function requestedStrengthSessions(intake = {}) {
  const value = Number(intake.days_per_week || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function availableStrengthDays(intake = {}) {
  if (!Array.isArray(intake.available_gym_days) || !intake.available_gym_days.length) return null;
  return new Set(intake.available_gym_days.map(normalizeDay));
}

export function strengthFrequencyViolations(model, intake = {}) {
  const requested = requestedStrengthSessions(intake);
  const available = availableStrengthDays(intake);
  const violations = [];

  for (const week of model?.weeks || []) {
    const strengthDays = strengthDaysForWeek(model, week.week);
    if (available) {
      for (const day of strengthDays) {
        if (!available.has(day.day)) {
          violations.push({
            type: 'gym_day_unavailable',
            week: week.week,
            days: [day.day],
            semantic_modality: 'strength_or_skill_strength',
          });
        }
      }
    }
    if (requested && strengthDays.length !== requested) {
      violations.push({
        type: 'gym_day_count_mismatch',
        week: week.week,
        requested,
        scheduled: strengthDays.length,
        scheduled_days: strengthDays.map((day) => day.day),
        semantic_modality: 'strength_or_skill_strength',
      });
    }
  }
  return violations;
}

export function validateSportDayCouplingSemantic(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);

  // Preserve the useful V19 collision analysis, but explicitly disable its old
  // gym-frequency accounting. That accounting treated every non-rest endurance
  // day as a strength session and is now owned by ProgramModel semantics below.
  const collisionResult = validateLegacySportDayCoupling(program, {
    ...intake,
    days_per_week: 0,
    available_gym_days: [],
  });

  const violations = strengthFrequencyViolations(model, intake);
  if (violations.length) {
    const requested = requestedStrengthSessions(intake);
    const summary = violations.map((v) => {
      if (v.type === 'gym_day_count_mismatch') {
        return `Week ${v.week}: expected ${v.requested} strength/skill-strength days, found ${v.scheduled} (${v.scheduled_days.join(', ') || 'none'}).`;
      }
      return `Week ${v.week}: strength/skill-strength work is scheduled on unavailable day(s) ${v.days.join(', ')}.`;
    }).join(' ');
    const amendment =
      'PRIOR ATTEMPT FAILED SPORT/CALENDAR VALIDATION. ' +
      `days_per_week means requested strength sessions, not total active calendar days. ${summary} ` +
      'Keep run-only, ruck-only, sport-only and conditioning-only days in the weekly calendar for fatigue/collision analysis, but do not count them toward the requested strength-session frequency.';
    throw new RetriableValidationError('SPORT_DAY_COUPLING_VIOLATION', amendment, {
      requested_strength_sessions: requested,
      violations,
      semantic_model_version: model.version,
    });
  }

  return {
    ...collisionResult,
    ok: true,
    semantic_model_version: model.version,
    strength_days_by_week: Object.fromEntries(
      (model.weeks || []).map((week) => [
        week.week,
        strengthDaysForWeek(model, week.week).map((day) => day.day),
      ])
    ),
    model,
  };
}

export function validateDirectGoalExposureSemantic(program, intake = {}, suppliedModel = null) {
  const model = applyDirectGoalSemantics(suppliedModel || parseProgramModel(program, intake));
  const violations = directGoalExposureViolations(model);

  if (violations.length) {
    const modalityFamilies = new Set(['running', 'ruck']);
    const onlyModalityExposure = violations.every((v) => modalityFamilies.has(v.family));
    const code = onlyModalityExposure
      ? 'TARGET_MODALITY_EXPOSURE_REDUCED'
      : 'NAMED_GOAL_DIRECT_EXPOSURE_MISSING';
    const summary = violations.map((v) =>
      `Week ${v.week}: ${v.tier} goal '${v.goal}' has no direct ${v.family} exposure.`
    ).join(' ');
    const amendment =
      'PRIOR ATTEMPT FAILED DIRECT GOAL EXPOSURE VALIDATION. ' +
      `${summary} Exercise notes do not count as target movement or modality exposure. ` +
      'Restore the named movement or target-specific modality while preserving unrelated valid work.';
    throw new RetriableValidationError(code, amendment, {
      violations,
      semantic_model_version: model.version,
    });
  }

  return {
    ok: true,
    semantic_model_version: model.version,
    model,
  };
}

const EMPTY_PATTERN_TOTALS = () => ({
  pull: 0,
  push: 0,
  squat: 0,
  hinge: 0,
  core: 0,
  aerobic: 0,
});

const PULL_BASES = new Set([
  'pull_up', 'bar_muscle_up', 'ring_muscle_up', 'muscle_up', 'front_lever', 'row_strength',
]);
const PUSH_BASES = new Set([
  'handstand_push_up', 'planche', 'overhead_press', 'bench_press', 'dip',
]);
const SQUAT_BASES = new Set(['pistol_squat', 'split_squat', 'squat', 'lunge']);
const HINGE_BASES = new Set(['deadlift']);
const CORE_BASES = new Set(['human_flag']);

// The ProgramModel owns movement identity. This function maps that stable semantic
// identity to the older broad workload buckets without reparsing display text.
export function movementPatternForExercise(exercise) {
  if (!exercise || exercise.role === 'warm_up' || exercise.modality === 'warm_up' || exercise.modality === 'recovery') return null;
  if (['running', 'ruck', 'conditioning'].includes(exercise.modality)) return 'aerobic';

  const base = String(exercise.base_movement || '');
  if (PULL_BASES.has(base)) return 'pull';
  if (PUSH_BASES.has(base)) return 'push';
  if (SQUAT_BASES.has(base)) return 'squat';
  if (HINGE_BASES.has(base)) return 'hinge';
  if (CORE_BASES.has(base)) return 'core';

  // Compatibility fallback uses the already-normalized base-movement key, never
  // the final TSV display string or Notes. This keeps one semantic parse boundary.
  if (/(^|_)(pull|chin|row|curl|pulldown|pullover)(_|$)/.test(base)) return 'pull';
  if (/(^|_)(press|bench|dip|push|fly|raise|pushdown)(_|$)/.test(base)) return 'push';
  if (/(^|_)(squat|lunge|step|leg_press|leg_extension|calf)(_|$)/.test(base)) return 'squat';
  if (/(^|_)(deadlift|rdl|hinge|hip_thrust|good_morning|nordic|leg_curl|glute)(_|$)/.test(base)) return 'hinge';
  if (/(^|_)(plank|hollow|l_sit|sit_up|crunch|leg_raise|knee_raise|dead_bug|bird_dog|core|rollout)(_|$)/.test(base)) return 'core';
  return null;
}

export function weeklyStrengthVolumeFromModel(model) {
  const out = {};
  for (const week of model?.weeks || []) {
    const totals = EMPTY_PATTERN_TOTALS();
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        const pattern = movementPatternForExercise(exercise);
        if (!pattern) continue;
        const sets = Number(exercise?.dose?.sets || 0);
        if (Number.isFinite(sets) && sets > 0) totals[pattern] += sets;
      }
    }
    out[week.week] = totals;
  }
  return out;
}

function volumeCapacityFactor(intake = {}) {
  let factor = 1.0;
  const sleep = String(intake.sleep_hours || '').toLowerCase();
  const recovery = String(intake.recovery_rating || '').toLowerCase();
  if (/under\s*6|<\s*6/.test(sleep)) factor -= 0.12;
  else if (/8\+|8\s*\+|8 or more/.test(sleep)) factor += 0.05;
  if (/poor/.test(recovery)) factor -= 0.15;
  else if (/excellent/.test(recovery)) factor += 0.05;
  return Math.max(0.72, Math.min(1.10, factor));
}

// External sport is an already-tolerated baseline, not newly prescribed gym
// volume. It must reduce available headroom, but a large existing sport schedule
// must never hard-fail MRV by itself. Otherwise a five-day combat athlete can be
// mathematically impossible to program even with zero added core/aerobic work.
// Cap the baseline debit at 75% of the recovery-adjusted reference. The remaining
// 60% up to the existing 135% hard-fail threshold is still available for program
// work. Excessive added work therefore still fails; the global MRV threshold is
// unchanged.
export function sportBaselineDebit(pattern, rawSport, reference) {
  const raw = Number(rawSport || 0);
  if (!Number.isFinite(raw) || raw <= 0 || !(reference > 0)) return 0;
  return Math.min(raw, reference * 0.75);
}

export function validateWeeklyVolumeBudgetSemantic(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  const strengthByWeek = weeklyStrengthVolumeFromModel(model);
  const rawSport = estimateSportStress(intake);
  const factor = volumeCapacityFactor(intake);
  const weeks = [];
  const allOver = [];

  for (const week of model?.weeks || []) {
    const strength = strengthByWeek[week.week] || EMPTY_PATTERN_TOTALS();
    const totals = EMPTY_PATTERN_TOTALS();
    const sport = EMPTY_PATTERN_TOTALS();
    const over = [];
    const advisory = [];

    for (const pattern of Object.keys(totals)) {
      const reference = MRV_CEILINGS[pattern] * factor;
      sport[pattern] = sportBaselineDebit(pattern, rawSport[pattern] || 0, reference);
      totals[pattern] = (strength[pattern] || 0) + sport[pattern];
      const ratio = reference > 0 ? totals[pattern] / reference : 0;
      if (ratio > 1.35) {
        const item = {
          week: week.week,
          pattern,
          total: Math.round(totals[pattern] * 10) / 10,
          ceiling: Math.round(reference * 10) / 10,
          ratio,
          strength: strength[pattern] || 0,
          sport: Math.round(sport[pattern] * 10) / 10,
          raw_sport: rawSport[pattern] || 0,
        };
        over.push(item);
        allOver.push(item);
      } else if (ratio > 1.0) {
        advisory.push({
          week: week.week,
          pattern,
          total: Math.round(totals[pattern] * 10) / 10,
          reference: Math.round(reference * 10) / 10,
          ratio,
          strength: strength[pattern] || 0,
          sport: Math.round(sport[pattern] * 10) / 10,
          raw_sport: rawSport[pattern] || 0,
        });
      }
    }

    weeks.push({
      week: week.week,
      strength,
      sport: { ...sport },
      raw_sport: { ...rawSport },
      totals,
      over,
      advisory,
      sport_accounting: 'tolerated_baseline_debit_capped_at_75pct_reference',
    });
  }

  if (allOver.length) {
    const list = allOver
      .map((item) => `Week ${item.week} ${item.pattern}: ${item.total} (${item.strength} program + ${item.sport} sport baseline debit; raw sport heuristic ${item.raw_sport}) vs reference ${item.ceiling}`)
      .join('; ');
    const amendment =
      'PRIOR ATTEMPT FAILED WEEKLY VOLUME VALIDATION. ' +
      `The following single-week workload is grossly above the internal reference band: [${list}]. ` +
      'External sport is treated as an already-tolerated baseline that reduces programming headroom; it is not allowed to hard-fail the week by itself. ' +
      'These references are heuristics, not biological MRV facts. Reduce redundant accessory work first, preserve primary and direct-goal exposures, and re-check recovery. ' +
      'Never sum multiple program weeks and compare that four-week total with a one-week reference.';
    throw new RetriableValidationError('WEEKLY_MRV_EXCEEDED', amendment, {
      over: allOver,
      weeks,
      factor,
      semantic_model_version: model.version,
      accounting_scope: 'per_week',
      sport_accounting: 'tolerated_baseline_debit_capped_at_75pct_reference',
    });
  }

  return {
    ok: true,
    weeks,
    factor,
    semantic_model_version: model.version,
    accounting_scope: 'per_week',
    sport_accounting: 'tolerated_baseline_debit_capped_at_75pct_reference',
    model,
  };
}
