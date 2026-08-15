import { parseProgramModel, directGoalExposures } from './program_model.js';
import { RetriableValidationError } from './exercise_dictionary.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function athleteAge(intake = {}) {
  const direct = Number(intake.age || intake.age_years || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const m = `${txt(intake.notes)} ${txt(intake.current_numbers)}`.match(/(?:athlete\s+is|age\s*[:=]?)\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

export function isYouthIntake(intake = {}) {
  const age = athleteAge(intake);
  return age != null && age < 18;
}

function isTacticalHybridIntake(intake = {}) {
  const context = JSON.stringify({
    primary_goals: intake.primary_goals,
    secondary_goals: intake.secondary_goals,
    maintenance_goals: intake.maintenance_goals,
    notes: intake.notes,
    sport: intake.sport,
  });
  return /\b(?:tactical|military|special[- ]?operations|selection prep|combat[- ]?ready|operator)\b/i.test(context);
}

function hasProgressionIntent(goal = {}) {
  if (goal.tier === 'maintenance') return false;
  if (/\b(?:maintain|preserve|hold|keep)\b/i.test(String(goal.raw || ''))) return false;
  return goal.tier === 'primary' || goal.tier === 'secondary';
}

function numericTokens(raw) {
  return [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
}

function repUpperBound(raw) {
  const nums = numericTokens(raw);
  return nums.length ? Math.max(...nums) : null;
}

function durationSeconds(raw) {
  const s = String(raw || '').toLowerCase();
  const n = numericTokens(s)[0];
  if (!Number.isFinite(n)) return null;
  if (/\b(?:min|mins|minute|minutes)\b/.test(s)) return n * 60;
  if (/\b(?:sec|secs|second|seconds|s)\b/.test(s)) return n;
  return null;
}

function externalLoadValue(raw) {
  const s = String(raw || '').toLowerCase();
  if (!/\b(?:kg|lb|lbs|pounds?)\b/.test(s)) return null;
  if (/\bband\b/.test(s)) return null;
  const n = numericTokens(s)[0];
  return Number.isFinite(n) ? n : null;
}

// Higher means less assistance / a harder assisted rung. This intentionally
// reads the explicit Load/Target cell only. Coaching notes may explain the rule,
// but prose cannot manufacture progression evidence when the prescription itself
// is unchanged.
function assistanceRank(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (/\b(?:unassisted|no assistance|no band|bodyweight only)\b/.test(s)) return 5;
  if (/\blightest\b.*\bband\b|\bband\b.*\blightest\b/.test(s)) return 4;
  if (/\b(?:slightly lighter|lighter|light)\b.*\bband\b|\bband\b.*\b(?:slightly lighter|lighter|light)\b/.test(s)) return 3;
  if (/\b(?:moderate|medium)\b.*\bband\b|\bband\b.*\b(?:moderate|medium)\b/.test(s)) return 2;
  if (/\b(?:heavy|strong)\b.*\bband\b|\bband\b.*\b(?:heavy|strong)\b/.test(s)) return 1;
  if (/\bband\b/.test(s)) return 2;
  return null;
}

function exerciseState(exercise) {
  const dose = exercise?.dose || {};
  const sets = Number(dose.sets || 0);
  const reps = repUpperBound(dose.reps_raw || dose.reps);
  const duration = durationSeconds(dose.duration || dose.reps_raw || dose.reps);
  const load = externalLoadValue(dose.load);
  const assist = assistanceRank(dose.load);
  const targetUnits = Number.isFinite(sets) && sets > 0 && Number.isFinite(reps)
    ? sets * reps
    : null;
  return {
    display_name: String(exercise?.display_name || ''),
    base_movement: exercise?.base_movement || '',
    sets: Number.isFinite(sets) && sets > 0 ? sets : null,
    reps_upper: reps,
    duration_seconds: duration,
    target_units: targetUnits,
    external_load: load,
    assistance_rank: assist,
    execution_modifiers: [...(exercise?.execution_modifiers || [])].sort(),
  };
}

function weekState(exposures) {
  const states = exposures.map((x) => exerciseState(x.exercise || x));
  const finite = (key) => states.map((x) => x[key]).filter(Number.isFinite);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const sets = finite('sets');
  const units = finite('target_units');
  const reps = finite('reps_upper');
  const durations = finite('duration_seconds');
  const loads = finite('external_load');
  const assists = finite('assistance_rank');
  return {
    exposure_count: states.length,
    total_sets: sets.length ? sum(sets) : null,
    total_target_units: units.length ? sum(units) : null,
    max_reps_upper: reps.length ? Math.max(...reps) : null,
    max_duration_seconds: durations.length ? Math.max(...durations) : null,
    max_external_load: loads.length ? Math.max(...loads) : null,
    best_assistance_rank: assists.length ? Math.max(...assists) : null,
    variation_tokens: [...new Set(states.map((x) => `${x.display_name}|${x.execution_modifiers.join(',')}`))].sort(),
    prescriptions: states,
  };
}

function increased(prev, next, key, minDelta = 0) {
  return Number.isFinite(prev?.[key]) && Number.isFinite(next?.[key]) && next[key] > prev[key] + minDelta;
}

function forwardAxes(prev, next) {
  const axes = [];
  if (increased(prev, next, 'best_assistance_rank')) axes.push('less_assistance');
  if (increased(prev, next, 'max_external_load')) axes.push('load');
  if (increased(prev, next, 'max_reps_upper')) axes.push('reps');
  if (increased(prev, next, 'total_sets')) axes.push('sets');
  if (increased(prev, next, 'total_target_units')) axes.push('target_volume');
  if (increased(prev, next, 'max_duration_seconds')) axes.push('duration');
  const prevVariations = JSON.stringify(prev?.variation_tokens || []);
  const nextVariations = JSON.stringify(next?.variation_tokens || []);
  if (prevVariations !== nextVariations) axes.push('variation_or_execution');
  return [...new Set(axes)];
}

export function youthProgressionQualityAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!isYouthIntake(intake)) return { applicable: false, model, targets: [], violations: [] };

  const targets = [];
  const violations = [];
  for (const target of (model.goals || []).filter(hasProgressionIntent)) {
    const weeks = [];
    for (const week of model.weeks || []) {
      const exposures = directGoalExposures(model, target.family, week.week);
      weeks.push({ week: week.week, ...weekState(exposures) });
    }
    const buildWeeks = weeks.filter((w) => w.week <= 3 && w.exposure_count > 0);
    const evidence = [];
    for (let i = 1; i < buildWeeks.length; i++) {
      const axes = forwardAxes(buildWeeks[i - 1], buildWeeks[i]);
      if (axes.length) evidence.push({ from_week: buildWeeks[i - 1].week, to_week: buildWeeks[i].week, axes });
    }
    const meaningful = evidence.length > 0;
    const row = {
      family: target.family,
      tier: target.tier,
      goal: target.raw,
      meaningful_progression: meaningful,
      build_evidence: evidence,
      weeks,
    };
    targets.push(row);
    if (buildWeeks.length >= 3 && !meaningful) violations.push(row);
  }

  return { applicable: true, model, targets, violations };
}

export function validateYouthProgressionQualitySemantic(program, intake = {}, suppliedModel = null) {
  const result = youthProgressionQualityAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations
    .map((v) => `${v.tier} goal '${v.goal}' has no forward prescription change in Weeks 1-3`)
    .join('; ');
  throw new RetriableValidationError(
    'YOUTH_PROGRESSION_QUALITY_MISSING',
    'PRIOR ATTEMPT FAILED YOUTH PROGRESSION-QUALITY VALIDATION. ' +
      `${summary}. Do not hide progression in Notes and do not count a different rest period or RPE label as progression. ` +
      'Across Weeks 1-3, show at least one meaningful forward prescription change for each directly trained progression goal using an appropriate variable: less assistance, more clean reps or sets, a longer successful hold/attempt target, a harder verified variation or execution rung, or external load when relevant. ' +
      'Week 4 may consolidate or deload rather than exceed Week 3. Progression is an intended pathway, not a guarantee that the athlete must force the next rung if technique is not ready.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      progression_policy: 'youth_visible_forward_change_weeks_1_to_3',
    },
  );
}

function runWarmupText(day, run) {
  return [
    String(run?.notes || ''),
    ...(day?.exercises || [])
      .filter((exercise) => exercise?.modality === 'warm_up' || exercise?.role === 'warm_up')
      .map((exercise) => `${exercise.display_name || ''} ${exercise.notes || ''} ${exercise?.dose?.duration || ''}`),
  ].join(' | ').toLowerCase();
}

function isHardRun(exercise) {
  if (exercise?.modality !== 'running') return false;
  const sets = Number(exercise?.dose?.sets || 0);
  const reps = String(exercise?.dose?.reps_raw || exercise?.dose?.reps || '').toLowerCase();
  const notes = String(exercise?.notes || '').toLowerCase();
  return sets >= 3 || /\b(?:interval|repeat|repeats|vo2|maximal aerobic|3k pace|5k pace)\b/.test(notes) || /\b(?:200|300|400|500|600|800|1000)\s*m\b/.test(reps);
}

function hasSpecificRunWarmup(day, run) {
  const s = runWarmupText(day, run);
  return /\b(?:warm[- ]?up|easy (?:run|running|jog)|jog(?:ging)? before|run(?:ning)? before|strides?|running drills?|drills? and strides?)\b/.test(s);
}

export function hardRunWarmupAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!isTacticalHybridIntake(intake)) return { applicable: false, model, violations: [], hard_runs: [] };
  const hardRuns = [];
  const violations = [];
  for (const week of model.weeks || []) {
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        if (!isHardRun(exercise)) continue;
        const hasWarmup = hasSpecificRunWarmup(day, exercise);
        const row = {
          week: week.week,
          day: day.day,
          exercise: exercise.display_name,
          has_specific_run_warmup: hasWarmup,
        };
        hardRuns.push(row);
        if (!hasWarmup) violations.push(row);
      }
    }
  }
  return { applicable: true, model, hard_runs: hardRuns, violations };
}

export function validateHardRunWarmupSemantic(program, intake = {}, suppliedModel = null) {
  const result = hardRunWarmupAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations.map((v) => `Week ${v.week} ${v.day}: hard Run exposure has no specific running warm-up`).join('; ');
  throw new RetriableValidationError(
    'HARD_RUN_WARMUP_MISSING',
    'PRIOR ATTEMPT FAILED HARD-RUN WARM-UP VALIDATION. ' +
      `${summary}. A hard interval/repeat session should include a specific running warm-up on the same day, either as a warm-up row or explicitly in the Run coaching note. ` +
      'Use easy running/jogging plus appropriate dynamic running drills and, when suitable, a few relaxed strides before the work intervals. Do not satisfy this with generic light cardio listed on an unrelated gym day.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      warmup_policy: 'hard_run_specific_same_day_preparation',
    },
  );
}

export function buildAcceptanceQualityBrief(intake = {}) {
  const rules = [];
  if (isYouthIntake(intake)) {
    rules.push(
      '=== YOUTH VISIBLE PROGRESSION QUALITY ===',
      '* Do not hide the four-week progression only in prose. For each primary youth progression goal, Weeks 1-3 must show at least one meaningful forward change in the TSV prescription itself. Rest-only, RPE-only or rewritten Notes do not count.',
      '* Use the variable that fits the movement: reduce assistance, increase clean reps/sets conservatively, increase successful attempt or balance/hold target, add a pause/tempo/ROM demand, or move to a verified harder rung. Change one main variable at a time when possible.',
      '* For bar muscle-up acquisition, assistance reduction or a verified turnover/high-pull rung is usually better than simply piling on failed reps. For freestanding handstand acquisition, successful entries and independent balance quality/time matter more than longer wall holds or fatigue attempts.',
      '* Week 4 may consolidate or deload. It does not need to beat Week 3, but the client should still be able to see what variable the block attempted to progress and what quality criterion allows the next step.',
    );
  }
  if (isTacticalHybridIntake(intake)) {
    rules.push(
      '=== HARD RUN PREPARATION ===',
      '* Every hard interval/repeat Run session needs a specific same-day running warm-up. Put it in a [WARMUP] row or in the Run Notes: easy running/jogging, appropriate dynamic running drills and, when suitable, a few relaxed strides before the work reps. Generic light cardio on another gym day does not count.',
    );
  }
  return rules.join('\n');
}
