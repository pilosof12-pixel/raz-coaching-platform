import { parseProgramModel } from './program_model.js';
import { RetriableValidationError } from './exercise_dictionary.js';

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

function isYouthIntake(intake = {}) {
  const age = athleteAge(intake);
  return age != null && age < 18;
}

function numericTokens(raw) {
  return [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)]
    .map((m) => Number(m[0]))
    .filter(Number.isFinite);
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
  if (!/\b(?:kg|lb|lbs|pounds?)\b/.test(s) || /\bband\b/.test(s)) return null;
  const n = numericTokens(s)[0];
  return Number.isFinite(n) ? n : null;
}

// Higher means less assistance / a harder assisted rung.
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

function exerciseKey(exercise) {
  return String(exercise?.display_name || '')
    .toLowerCase()
    .replace(/[-–—_\/]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function exerciseState(exercise) {
  const dose = exercise?.dose || {};
  const sets = Number(dose.sets || 0);
  const reps = repUpperBound(dose.reps_raw || dose.reps);
  return {
    sets: Number.isFinite(sets) && sets > 0 ? sets : null,
    reps_upper: reps,
    target_units: Number.isFinite(sets) && sets > 0 && Number.isFinite(reps) ? sets * reps : null,
    duration_seconds: durationSeconds(dose.duration || dose.reps_raw || dose.reps),
    external_load: externalLoadValue(dose.load),
    assistance_rank: assistanceRank(dose.load),
    text: `${dose.load || ''} ${exercise?.notes || ''}`.trim(),
    modality: exercise?.modality || '',
  };
}

function aggregate(exercises) {
  const states = exercises.map(exerciseState);
  const finite = (key) => states.map((x) => x[key]).filter(Number.isFinite);
  const max = (key) => {
    const values = finite(key);
    return values.length ? Math.max(...values) : null;
  };
  const sets = finite('sets');
  const units = finite('target_units');
  return {
    exposure_count: states.length,
    total_sets: sets.length ? sets.reduce((a, b) => a + b, 0) : null,
    total_target_units: units.length ? units.reduce((a, b) => a + b, 0) : null,
    max_reps_upper: max('reps_upper'),
    max_duration_seconds: max('duration_seconds'),
    max_external_load: max('external_load'),
    best_assistance_rank: max('assistance_rank'),
    text: states.map((x) => x.text).filter(Boolean).join(' | '),
    modality: states.find((x) => x.modality)?.modality || '',
  };
}

function activeRegressionContext(intake = {}) {
  if (intake?.pain?.active === true) return true;
  const context = `${txt(intake?.pain?.description)} ${txt(intake?.injuries)} ${txt(intake?.notes)}`.toLowerCase();
  return /\b(?:currently symptomatic|active pain|pain flare|flare-up|worsening symptoms|currently injured)\b/.test(context);
}

function explicitRetentionCue(state) {
  const s = String(state?.text || '').toLowerCase();
  const quality = /\b(?:retain|preserve|match|express|keep|best)\b/.test(s);
  const reference = /\b(?:week\s*3|weeks?\s*2\s*[-–—to]+\s*3|best of the block|best .*block|earned|progressed|highest clean|best clean|best balance|best entry)\b/.test(s);
  return quality && reference;
}

function improvedPeak(w1, w2, w3, key) {
  const baseline = w1?.[key];
  if (!Number.isFinite(baseline)) return null;
  const later = [w2?.[key], w3?.[key]].filter(Number.isFinite);
  if (!later.length) return null;
  const peak = Math.max(...later);
  if (!(peak > baseline)) return null;
  return { baseline, peak, retention_floor: baseline + (peak - baseline) * 0.5 };
}

function scalarRetentionFailures(w1, w2, w3, w4) {
  const specs = [
    ['reps', 'max_reps_upper'],
    ['duration', 'max_duration_seconds'],
    ['load', 'max_external_load'],
    ['less_assistance', 'best_assistance_rank'],
  ];
  const failures = [];
  for (const [axis, key] of specs) {
    const progress = improvedPeak(w1, w2, w3, key);
    if (!progress) continue;
    const final = w4?.[key];
    if (Number.isFinite(final) && final >= progress.retention_floor) continue;
    // A Week-3 reference is legitimate for a consolidation target such as
    // "retain the lightest clean Week-3 band" even when the parser cannot
    // assign that free-text reference an ordinal assistance value.
    if (axis === 'less_assistance' && explicitRetentionCue(w4)) continue;
    failures.push({ axis, ...progress, week4: Number.isFinite(final) ? final : null });
  }
  return failures;
}

function collectComparableExercises(model) {
  const rows = new Map();
  for (const week of model.weeks || []) {
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        if (exercise?.modality === 'warm_up' || exercise?.role === 'warm_up') continue;
        if (['running', 'ruck', 'sport', 'conditioning'].includes(exercise?.modality)) continue;
        const key = exerciseKey(exercise);
        if (!key) continue;
        if (!rows.has(key)) rows.set(key, { key, exercise: exercise.display_name, by_week: new Map() });
        const row = rows.get(key);
        if (!row.by_week.has(week.week)) row.by_week.set(week.week, []);
        row.by_week.get(week.week).push(exercise);
      }
    }
  }
  return [...rows.values()];
}

export function youthConsolidationRetentionAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!isYouthIntake(intake)) return { applicable: false, model, exercises: [], violations: [] };
  if (activeRegressionContext(intake)) {
    return { applicable: true, waived: true, waiver_reason: 'active_pain_or_injury_context', model, exercises: [], violations: [] };
  }

  const exercises = [];
  const violations = [];
  for (const row of collectComparableExercises(model)) {
    const weeks = [1, 2, 3, 4].map((week) => ({ week, ...aggregate(row.by_week.get(week) || []) }));
    const [w1, w2, w3, w4] = weeks;
    if ([w1, w2, w3, w4].some((w) => !w.exposure_count)) continue;

    const scalarFailures = scalarRetentionFailures(w1, w2, w3, w4);
    const buildVolumeProgressed = (
      (Number.isFinite(w1.total_sets) && Math.max(w2.total_sets || 0, w3.total_sets || 0) > w1.total_sets) ||
      (Number.isFinite(w1.total_target_units) && Math.max(w2.total_target_units || 0, w3.total_target_units || 0) > w1.total_target_units)
    );
    const skillQualityReset = w1.modality === 'skill' && buildVolumeProgressed &&
      Number.isFinite(w4.total_sets) && Number.isFinite(w1.total_sets) && w4.total_sets <= w1.total_sets &&
      !explicitRetentionCue(w4) && scalarFailures.length === 0;

    const item = {
      exercise: row.exercise,
      modality: w1.modality,
      weeks,
      scalar_retention_failures: scalarFailures,
      skill_quality_reset: skillQualityReset,
    };
    exercises.push(item);
    if (scalarFailures.length || skillQualityReset) violations.push(item);
  }

  return { applicable: true, waived: false, model, exercises, violations };
}

export function validateYouthConsolidationRetentionSemantic(program, intake = {}, suppliedModel = null) {
  const result = youthConsolidationRetentionAnalysis(program, intake, suppliedModel);
  if (!result.applicable || result.waived || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations.map((v) => {
    const axes = v.scalar_retention_failures.map((x) => x.axis);
    if (v.skill_quality_reset) axes.push('skill_quality');
    return `${v.exercise}: Week 4 reset on ${axes.join(', ')}`;
  }).join('; ');
  throw new RetriableValidationError(
    'YOUTH_CONSOLIDATION_RESET_TO_BASELINE',
    'PRIOR ATTEMPT FAILED YOUTH WEEK-4 CONSOLIDATION VALIDATION. ' +
      `${summary}. A consolidation/deload week should reduce FATIGUE, not erase the performance standard earned in Weeks 2-3. ` +
      'Do not simply copy the Week-1 prescription after reps, load, assistance, duration or skill quality progressed. Prefer fewer sets/attempts while retaining at least an intermediate-to-Week-3 clean standard. ' +
      'For assisted skills, keep the best clean Week-2/3 assistance and reduce volume before increasing assistance again. For handstand or explosive skill work, use fewer attempts/sets while explicitly matching or expressing the best clean Week-3 balance, height, speed or execution quality. ' +
      'A larger regression is appropriate only when the intake provides a genuine active pain/injury/recovery reason; never force progression through symptoms.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      consolidation_policy: 'reduce_fatigue_preserve_earned_standard',
    },
  );
}

export function buildConsolidationQualityBrief(intake = {}) {
  if (!isYouthIntake(intake)) return '';
  return [
    '=== WEEK 4 CONSOLIDATION / EXPRESSION ===',
    '* Week 4 may lower fatigue, but it must not automatically reset earned capability to Week 1. Reduce sets/attempts first while preserving the higher clean performance standard reached in Weeks 2-3.',
    '* Example: 3x5 -> 3x6 -> 3x7 should normally consolidate around fewer sets at roughly 6-7 clean reps, not return to 3x5. Moderate band -> lighter -> lightest clean band should normally retain the best clean Week-2/3 assistance with fewer sets, not return to the moderate band.',
    '* For handstand or other skill work, fewer attempts are fine in Week 4, but the target should match/express the best Week-3 entry, balance, height, speed, ROM or execution quality rather than lowering the skill standard.',
    '* If active pain, injury symptoms or a genuine recovery constraint in the intake requires a larger regression, state the reason and prioritize symptom-safe loading. Do not invent a recovery problem simply to justify a reset.',
  ].join('\n');
}
