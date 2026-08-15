import {
  validateSportDayCoupling as validateLegacySportDayCoupling,
  RetriableValidationError,
} from './exercise_dictionary.js';
import {
  normalizeDay,
  parseProgramModel,
  strengthDaysForWeek,
} from './program_model.js';

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
  // day as a gym day and is now owned by ProgramModel semantics below.
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
