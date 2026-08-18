import { RetriableValidationError } from './exercise_dictionary.js';
import { parseProgramModel } from './program_model.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function tacticalContext(intake = {}) {
  return `${goals(intake)} ${txt(intake.notes)} ${txt(intake.sport)}`;
}
function isTacticalIntake(intake = {}) {
  return /\b(?:tactical|military|special[- ]?operations|selection prep|combat[- ]?ready|operator)\b/i.test(tacticalContext(intake));
}
function hasPullUpGoal(intake = {}) {
  return /\b(?:strict\s+)?pull[- ]?ups?\b/i.test(goals(intake));
}
function hasWeightedPullBenchmark(intake = {}) {
  const source = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;
  return /weighted\s+(?:pull|chin)[- ]?up[^\n|]{0,35}\+?\s*\d+(?:\.\d+)?\s*kg/i.test(source);
}
function addedKg(raw = '') {
  const m = String(raw || '').match(/\+\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function fail(code, amendment, details = {}) {
  throw new RetriableValidationError(code, amendment, details);
}

export function validateTacticalManualAcceptanceSemantic(program, intake = {}, suppliedModel = null) {
  if (!isTacticalIntake(intake)) return { ok: true, skipped: true };
  const model = suppliedModel || parseProgramModel(program, intake);
  const requireWeightedPull = hasPullUpGoal(intake) && hasWeightedPullBenchmark(intake);

  for (const week of model.weeks || []) {
    const work = (week.days || []).flatMap((day) => (day.exercises || []).map((exercise) => ({ day: day.day, exercise })))
      .filter(({ exercise }) => exercise?.role !== 'warm_up' && exercise?.modality !== 'warm_up');

    if (requireWeightedPull) {
      const weighted = work.filter(({ exercise }) => /^weighted\s+(?:pull|chin)[- ]?up$/i.test(String(exercise?.display_name || '')));
      const explicit = weighted.filter(({ exercise }) => Number.isFinite(addedKg(exercise?.dose?.load)) && addedKg(exercise?.dose?.load) > 0);
      if (!explicit.length) {
        fail(
          'TACTICAL_WEIGHTED_PULL_EXPOSURE_AMBIGUOUS',
          `Week ${week.week} needs one explicit weighted pull-up/chin-up strength exposure because the intake provides a weighted pulling benchmark and a strict pull-up progression goal. Use the canonical Exercise name Weighted Pull-up or Weighted Chin-up and an explicit source-grounded +kg load. Do not write a generic Pull-up row with "RPE-selected load" and then imply in Notes that it is weighted. The current weighted benchmark is capacity, not an automatic multi-set prescription, so choose a sensible submaximal +kg load and preserve the separate strict bodyweight pull-up exposure.`,
          { week: week.week, weighted_rows: weighted.map((x) => ({ day: x.day, exercise: x.exercise?.display_name, load: x.exercise?.dose?.load })) },
        );
      }
    }

    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        if (exercise?.role !== 'warm_up' && exercise?.modality !== 'warm_up') continue;
        const note = String(exercise?.notes || '');
        if (/ramp\s+(?:backpack\s+carry|ruck|loaded\s+march)[^.;\n]*\bkg\s*x\s*\d/i.test(note)) {
          fail(
            'TACTICAL_RUCK_WARMUP_MISREPRESENTED',
            `Week ${week.week} ${day.day}: the ruck/backpack warm-up is written like a barbell ramp using kg x reps. A multi-kilometre loaded march is not warmed up with strength-style rep ramps. Use simple walking/ankle-calf preparation and an easy first few minutes under the pack, or omit a separate ruck warm-up row; keep the actual ruck load and distance in the work row.`,
            { week: week.week, day: day.day, note },
          );
        }
      }
    }
  }

  return { ok: true, skipped: false, model };
}
