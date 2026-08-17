import { RetriableValidationError } from './exercise_dictionary.js';
import { parseProgramModel } from './program_model.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function age(intake = {}) {
  const n = Number(intake.age || intake.age_years || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function goals(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals)].map(String).join(' | ');
}
function evidence(intake = {}) {
  return [intake.current_numbers, intake.performance_markers, intake.clarification_answers, intake.notes].map(txt).join(' | ');
}
function acquisitionState(intake = {}) {
  const goalText = goals(intake);
  const source = evidence(intake);
  return {
    bar: /(?:first\s+)?bar muscle[- ]?up/i.test(goalText) && (/\bfirst\b/i.test(goalText) || /cannot perform[^.]{0,40}bar muscle[- ]?up|no (?:clean )?bar muscle[- ]?up/i.test(source)),
    handstand: /freestanding handstand|handstand balance|unsupported handstand/i.test(goalText) && /no reliable unsupported balance|no reliable.*freestanding|cannot.*freestanding|wall[- ]?facing handstand|back[- ]?to[- ]?wall/i.test(source),
  };
}
function work(day) {
  return (day?.exercises || []).filter((x) => x.role !== 'warm_up' && x.modality !== 'warm_up' && x.modality !== 'recovery');
}
function directBar(exercise) {
  return exercise?.base_movement === 'bar_muscle_up';
}
function independentBalance(exercise) {
  const name = String(exercise?.display_name || '');
  return exercise?.base_movement === 'handstand' && /controlled handstand kick[- ]?up|kick[- ]?up|freestanding handstand/i.test(name);
}
function staticHandstand(exercise) {
  return exercise?.base_movement === 'handstand' && /hold/i.test(String(exercise?.display_name || ''));
}

export function youthSessionQualityAnalysis(program, intake = {}, suppliedModel = null) {
  const athleteAge = age(intake);
  const state = acquisitionState(intake);
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!(athleteAge != null && athleteAge < 18) || (!state.bar && !state.handstand)) {
    return { applicable: false, model, violations: [], state };
  }

  const violations = [];
  for (const week of model.weeks || []) {
    const activeDays = (week.days || []).filter((day) => work(day).length > 0);
    for (const day of activeDays) {
      const exercises = work(day);
      const missing = [];
      if (state.bar && !exercises.some(directBar)) missing.push('bar_muscle_up');
      if (state.handstand && !exercises.some(independentBalance)) missing.push('independent_handstand_balance');
      if (missing.length) {
        violations.push({
          type: 'session_primary_skill_coverage',
          week: week.week,
          day: day.day,
          missing,
          exercises: exercises.map((x) => x.display_name),
        });
      }

      const staticRows = exercises.filter(staticHandstand);
      if (staticRows.length > 1) {
        violations.push({
          type: 'redundant_handstand_capacity',
          week: week.week,
          day: day.day,
          exercises: staticRows.map((x) => x.display_name),
        });
      }
    }
  }

  return { applicable: true, model, violations, state };
}

export function validateYouthSessionQualitySemantic(program, intake = {}, suppliedModel = null) {
  const result = youthSessionQualityAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };

  const coverage = result.violations.filter((v) => v.type === 'session_primary_skill_coverage');
  const redundant = result.violations.filter((v) => v.type === 'redundant_handstand_capacity');
  const code = coverage.length ? 'YOUTH_PRIMARY_SKILL_SESSION_COVERAGE_MISSING' : 'YOUTH_REDUNDANT_HANDSTAND_CAPACITY';
  const summary = [
    ...coverage.map((v) => `Week ${v.week} ${v.day} is missing direct ${v.missing.join(' + ')} practice`),
    ...redundant.map((v) => `Week ${v.week} ${v.day} duplicates static handstand capacity (${v.exercises.join(' + ')})`),
  ].join('; ');

  throw new RetriableValidationError(
    code,
    'PRIOR ATTEMPT FAILED YOUTH PER-SESSION SKILL-QUALITY VALIDATION. ' +
      `${summary}. For a two-session Youth acquisition block, both primary skills must be practiced directly while fresh in each structured session. ` +
      'The Exercise cell itself must identify bar-muscle-up transition practice; a coaching Note cannot turn a generic Pull-up into a bar-muscle-up exposure. ' +
      'Use one substantive wall-supported handstand-capacity row per session rather than stacking duplicate static holds. Preserve age-appropriate quality, low fatigue and no repeated failed attempts.',
    { violations: result.violations, semantic_model_version: result.model.version },
  );
}
