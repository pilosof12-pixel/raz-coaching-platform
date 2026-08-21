import { parseProgramModel, strengthDaysForWeek } from './program_model.js';
import { RetriableValidationError } from './exercise_dictionary.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
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

function goalText(intake = {}) {
  return [
    ...arr(intake.primary_goals),
    ...arr(intake.secondary_goals),
    ...arr(intake.maintenance_goals),
  ].map(String).join(' | ');
}

function has3KGoal(intake = {}) {
  return /\b3\s*(?:km|k)\b/i.test(goalText(intake));
}

function hasShinImpactHistory(intake = {}) {
  const context = `${txt(intake.injuries)} ${txt(intake.notes)} ${txt(intake.pain)}`;
  return /\b(?:shin(?:[- ]?splints?)?|medial tibial|tibial stress)\b/i.test(context);
}

function sessionLengthCeilingMinutes(intake = {}) {
  const s = String(intake.session_length || intake.session_duration || '');
  const nums = [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}

function substantiveStrengthExercises(day) {
  return (day?.exercises || []).filter((exercise) => {
    if (!exercise) return false;
    if (exercise.role === 'warm_up' || exercise.modality === 'warm_up' || exercise.modality === 'recovery') return false;
    if (['running', 'ruck', 'sport', 'conditioning'].includes(exercise.modality)) return false;
    return true;
  });
}

function movementIdentity(exercise) {
  return String(exercise?.base_movement || exercise?.display_name || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tacticalStrengthCompletenessAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  const ceilingMinutes = sessionLengthCeilingMinutes(intake);
  if (!isTacticalHybridIntake(intake) || !Number.isFinite(ceilingMinutes) || ceilingMinutes < 60) {
    return { applicable: false, model, session_ceiling_minutes: ceilingMinutes, weeks: [], violations: [] };
  }

  const weeks = [];
  const violations = [];
  for (const week of model.weeks || []) {
    const strengthDays = strengthDaysForWeek(model, week.week);
    if (strengthDays.length < 2) continue;
    const dayRows = strengthDays.map((day) => {
      const exercises = substantiveStrengthExercises(day);
      const distinct = [...new Set(exercises.map(movementIdentity).filter(Boolean))];
      const token = distinct.length < 2;
      return {
        day: day.day,
        substantive_strength_exercises: exercises.map((x) => x.display_name),
        distinct_movement_count: distinct.length,
        token_strength_session: token,
      };
    });
    const tokenDays = dayRows.filter((x) => x.token_strength_session);
    const row = { week: week.week, strength_days: dayRows, token_days: tokenDays };
    weeks.push(row);
    if (tokenDays.length) violations.push(row);
  }

  return { applicable: true, model, session_ceiling_minutes: ceilingMinutes, weeks, violations };
}

export function validateTacticalStrengthCompletenessSemantic(program, intake = {}, suppliedModel = null) {
  const result = tacticalStrengthCompletenessAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations.map((week) => {
    const days = week.token_days.map((d) => `${d.day} (${d.substantive_strength_exercises.join(', ') || 'no substantive strength work'})`).join(', ');
    return `Week ${week.week}: token strength session on ${days}`;
  }).join(' ');
  throw new RetriableValidationError(
    'TACTICAL_STRENGTH_SESSION_TOO_THIN',
    'PRIOR ATTEMPT FAILED TACTICAL STRENGTH-SESSION COMPLETENESS VALIDATION. ' +
      `${summary}. This intake allows 60+ minute sessions and asks for a tactical/hybrid result, so a real strength day should normally include the primary lift/skill plus at least one useful second movement or support piece. ` +
      'Do not satisfy this by adding junk volume, circuits or unrelated HIIT. Keep the second piece low-cost and subordinate to the named 3K, ruck, pulling and key-strength priorities; suitable examples include Push-up, Overhead Press, Pallof Press, Side Plank, Reverse Lunge, Bulgarian Split Squat, Farmer Carry or Suitcase Carry when equipment and recovery fit. ' +
      'If time or recovery is genuinely constrained, trim support first, but do not present a token single-lift gym appearance as the normal three-day strength plan when the stated session budget can support more.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      session_ceiling_minutes: result.session_ceiling_minutes,
      completeness_policy: 'primary_plus_useful_support_when_time_allows',
    },
  );
}

function clockSeconds(token) {
  const m = String(token || '').match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  const minutes = Number(m[1]);
  const seconds = Number(m[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;
  return minutes * 60 + seconds;
}

function timeTokens(raw) {
  return [...String(raw || '').matchAll(/\b\d{1,2}:\d{2}\b/g)]
    .map((m) => clockSeconds(m[0]))
    .filter(Number.isFinite);
}

function distanceMeters(raw) {
  const m = String(raw || '').match(/\b(\d{3,4})\s*m\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 100 && n <= 3000 ? n : null;
}

function intervalPrescription(exercise, week, day) {
  if (exercise?.modality !== 'running') return null;
  const sets = Number(exercise?.dose?.sets || 0);
  const distance = distanceMeters(exercise?.dose?.reps_raw || exercise?.dose?.reps);
  const times = timeTokens(exercise?.dose?.load);
  if (!Number.isFinite(sets) || sets < 2 || !Number.isFinite(distance) || !times.length) return null;
  const fastest = Math.min(...times);
  const slowest = Math.max(...times);
  const midpoint = (fastest + slowest) / 2;
  return {
    week,
    day,
    sets,
    distance_m: distance,
    work_m: sets * distance,
    fastest_400_s: fastest * 400 / distance,
    midpoint_400_s: midpoint * 400 / distance,
    load: exercise?.dose?.load || '',
    reps: exercise?.dose?.reps_raw || exercise?.dose?.reps || '',
  };
}

function current400RepeatBenchmark(intake = {}) {
  const context = `${txt(intake.notes)} ${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;
  const re = /400\s*m[^.\n]{0,80}?(\d{1,2}:\d{2})(?:\s*[-–—to]+\s*(\d{1,2}:\d{2}))?/i;
  const m = context.match(re);
  if (!m) return null;
  const a = clockSeconds(m[1]);
  const b = clockSeconds(m[2] || m[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { fastest_400_s: Math.min(a, b), midpoint_400_s: (a + b) / 2, raw: m[0] };
}

export function tactical3KIntervalProgressionAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  const shinRisk = hasShinImpactHistory(intake);
  if (!isTacticalHybridIntake(intake) || !has3KGoal(intake)) {
    return { applicable: false, model, shin_risk: shinRisk, current_repeat: null, weeks: [], violations: [] };
  }

  const currentRepeat = current400RepeatBenchmark(intake);
  const weeks = [];
  const violations = [];
  for (const week of model.weeks || []) {
    const candidates = [];
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        const row = intervalPrescription(exercise, week.week, day.day);
        if (row) candidates.push(row);
      }
    }
    if (!candidates.length) continue;
    candidates.sort((a, b) => b.work_m - a.work_m);
    weeks.push(candidates[0]);
  }

  const week1 = weeks.find((x) => x.week === 1);
  if (currentRepeat && week1 && week1.fastest_400_s < currentRepeat.fastest_400_s * 0.96) {
    violations.push({
      type: 'week1_pace_leap_beyond_current_repeat_anchor',
      week: 1,
      current_fastest_400_s: currentRepeat.fastest_400_s,
      planned_fastest_400_s: week1.fastest_400_s,
      row: week1,
    });
  }

  if (shinRisk) {
    const buildWeeks = weeks.filter((x) => x.week <= 3).sort((a, b) => a.week - b.week);
    for (let i = 1; i < buildWeeks.length; i++) {
      const prev = buildWeeks[i - 1];
      const next = buildWeeks[i];
      const volumeUp = next.work_m > prev.work_m * 1.08;
      const paceFaster = next.midpoint_400_s < prev.midpoint_400_s * 0.985;
      if (volumeUp && paceFaster) {
        violations.push({
          type: 'simultaneous_interval_volume_and_pace_jump',
          from_week: prev.week,
          to_week: next.week,
          previous: prev,
          next,
        });
      }
    }

    const w3 = weeks.find((x) => x.week === 3);
    const w4 = weeks.find((x) => x.week === 4);
    if (w3 && w4) {
      const expressionFaster = w4.midpoint_400_s < w3.midpoint_400_s * 0.98;
      const workNotReduced = w4.work_m >= w3.work_m * 0.95;
      if (expressionFaster && workNotReduced) {
        violations.push({
          type: 'week4_faster_expression_without_interval_volume_reduction',
          previous: w3,
          next: w4,
        });
      }
    }
  }

  return { applicable: true, model, shin_risk: shinRisk, current_repeat: currentRepeat, weeks, violations };
}

export function validateTactical3KIntervalProgressionSemantic(program, intake = {}, suppliedModel = null) {
  const result = tactical3KIntervalProgressionAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations.map((v) => {
    if (v.type === 'week1_pace_leap_beyond_current_repeat_anchor') return 'Week 1 interval pace jumps well beyond the demonstrated repeat benchmark';
    if (v.type === 'simultaneous_interval_volume_and_pace_jump') return `Weeks ${v.from_week}->${v.to_week} materially increase both interval work and pace despite shin-impact history`;
    if (v.type === 'week4_faster_expression_without_interval_volume_reduction') return 'Week 4 gets materially faster without reducing interval work despite shin-impact history';
    return v.type;
  }).join('; ');
  throw new RetriableValidationError(
    'TACTICAL_3K_INTERVAL_PROGRESSION_VIOLATION',
    'PRIOR ATTEMPT FAILED TACTICAL 3K INTERVAL-PROGRESSION VALIDATION. ' +
      `${summary}. Anchor the first interval week to demonstrated repeat capacity rather than jumping straight to aspirational goal pace. ` +
      'When the intake reports prior shin-impact irritation, do not materially increase both interval work and interval pace in the same build step. Progress one main running stress lever, let the athlete absorb it, then progress another. ' +
      'A Week-4 expression can be faster, but pair that with lower interval/aerobic volume so the athlete expresses speed under less accumulated fatigue rather than stacking intensity on top of peak work.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      shin_risk: result.shin_risk,
      current_repeat: result.current_repeat,
      interval_policy: 'benchmark_anchored_single_lever_progression',
    },
  );
}

export function buildTactical3KGppQualityBrief(intake = {}) {
  if (!isTacticalHybridIntake(intake)) return '';
  const rules = [
    '=== TACTICAL 3K / GPP QUALITY ===',
    '* EXERCISE-COLUMN IDENTITY: use exact Exercise name Run for easy, long, threshold and interval running rows, and exact Exercise name Backpack Carry for loaded ruck/march rows. Put pace, distance, 20 kg load, interval structure and easy/long/threshold labels in Weight, Reps/Duration or Notes instead of inventing a new Exercise name. This is the TACTICAL-ENDURANCE-EXERCISE-IDENTITY rule.',
    '* CANONICAL SUPPORT NAMING: Rest, Off and Recovery Day are schedule states, not exercises, so omit non-training days from TSV rows entirely. For posterior-chain knee-flexion support use exact names Leg Curl, Lying Leg Curl, Seated Leg Curl or Nordic Hamstring Curl. Do not invent Ring Hamstring Curl or other equipment-prefixed variants. Keep this small support work subordinate to the 3K, ruck, pull-up and key-strength priorities. This is the TACTICAL-CANONICAL-SUPPORT-NAMING rule.',
    '* A tactical strength week should not be three token gym check-ins. When the stated session budget is 60+ minutes, each real strength day should normally contain the primary lift/skill plus at least one useful second movement or low-cost support piece. Keep support subordinate to the named run, ruck, pulling and key-strength priorities; never pad the session with random circuits or junk volume.',
  ];
  if (has3KGoal(intake)) {
    rules.push(
      '* 3K INTERVAL PROGRESSION: anchor Week 1 to demonstrated recent repeat ability rather than jumping immediately to goal pace. For an athlete with shin-impact history, progress one main interval stress lever at a time: pace, total work, or rep duration/distance. Do not materially raise pace and interval work together in the same build step.',
      '* WEEK 4 3K EXPRESSION: faster repeat pace is appropriate only when interval/aerobic volume comes down enough to reduce accumulated fatigue. The block should finish with a controlled expression of speed, not the hardest pace stacked on the highest work volume.',
    );
  }
  return rules.join('\n');
}
