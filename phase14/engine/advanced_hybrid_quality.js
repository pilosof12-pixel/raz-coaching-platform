import { RetriableValidationError } from './exercise_dictionary.js';
import { isHighConcurrencyHybrid, currentRunBaseline, marathonGoalTier } from './advanced_hybrid_concurrency.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function lower(v) { return String(v || '').toLowerCase(); }

function goalText(intake = {}, tier = 'all') {
  const groups = tier === 'primary' ? arr(intake.primary_goals)
    : tier === 'secondary' ? arr(intake.secondary_goals)
    : [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)];
  return groups.map(String).join(' | ').toLowerCase();
}

function parseWeeks(program) {
  const lines = String(program || '').split('\n');
  const weeks = new Map();
  let week = null;
  let header = null;
  for (const line of lines) {
    const start = line.match(/START_WEEK(\d+)_TSV/i);
    if (start) { week = Number(start[1]); weeks.set(week, []); header = null; continue; }
    if (/END_WEEK\d+_TSV/i.test(line)) { week = null; header = null; continue; }
    if (!week || !line.trim()) continue;
    if (!header) {
      header = line.split('\t').map((x) => lower(x).trim());
      continue;
    }
    const cells = line.split('\t');
    const get = (...names) => {
      for (const name of names) {
        const i = header.indexOf(name);
        if (i >= 0) return String(cells[i] || '').trim();
      }
      return '';
    };
    weeks.get(week).push({
      day: lower(get('day')),
      exercise: get('exercise'),
      load: get('weight', 'load / target', 'load/target'),
      sets: get('sets'),
      reps: get('reps', 'reps / duration', 'reps/duration'),
      effort: get('target rpe', 'effort'),
      notes: get('notes', 'coaching note'),
    });
  }
  return weeks;
}

function isWarmup(row) { return /\[warmup\]|warm[ -]?up/i.test(row.exercise); }
function isRun(row) { return /^(?:run|running)$/i.test(String(row.exercise).trim()); }
function numericSets(row) { const n = Number(String(row.sets).match(/\d+(?:\.\d+)?/)?.[0] || 0); return Number.isFinite(n) ? n : 0; }
function numericKm(row) {
  const s = `${row.load} ${row.reps} ${row.notes}`;
  const m = s.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
}
function numericRpe(row) {
  const m = String(row.effort || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function hasNumericLoad(row) { return /\b\d+(?:\.\d+)?\s*kg\b/i.test(row.load) || /\b\d+(?:\.\d+)?\s*%\b/.test(row.load); }

function benchmarked(intake, nameRe) {
  const src = `${intake.current_numbers || ''}\n${arr(intake.performance_markers).join('\n')}`;
  return nameRe.test(src) && /\d+(?:\.\d+)?\s*kg/i.test(src);
}

function warmupHasRamp(rows, day) {
  const text = rows.filter((r) => r.day === day && isWarmup(r)).map((r) => `${r.load} ${r.reps} ${r.notes}`).join(' | ');
  const kgAnchors = text.match(/(?:\b\d+(?:\.\d+)?\s*kg\b[^|;]{0,18}(?:x|×)\s*\d+)|(?:\b\d+(?:\.\d+)?\s*kg\b)/gi) || [];
  const pctAnchors = text.match(/\b\d+(?:\.\d+)?\s*%\b/g) || [];
  const barAnchor = /(?:empty\s+bar|barbell\s*(?:x|×)\s*\d+|bar\s*(?:x|×)\s*\d+)/i.test(text);
  return kgAnchors.length >= 3 || pctAnchors.length >= 3 || (barAnchor && kgAnchors.length >= 2);
}

function fail(code, amendment, details = {}) {
  throw new RetriableValidationError(code, amendment, details);
}

export function validateAdvancedHybridQualitySemantic(program, intake = {}) {
  if (!isHighConcurrencyHybrid(intake)) return { ok: true, skipped: true };

  const weeks = parseWeeks(program);
  if (weeks.size < 4) return { ok: true, skipped: false };
  const primary = goalText(intake, 'primary');
  const allGoals = goalText(intake);
  const fixedDays = arr(intake.available_gym_days).map(lower).filter(Boolean).sort();

  for (const [week, rows] of weeks) {
    const work = rows.filter((r) => !isWarmup(r));
    const strengthDays = [...new Set(work.filter((r) => !isRun(r) && !/zone\s*2|bike|row|ruck|swim/i.test(r.exercise)).map((r) => r.day).filter(Boolean))].sort();
    if (fixedDays.length && JSON.stringify(strengthDays) !== JSON.stringify(fixedDays)) {
      fail('ADVANCED_HYBRID_CALENDAR_DRIFT', `Week ${week} must use the athlete's exact fixed strength days: ${fixedDays.join(', ')}. Do not invent or omit lifting days.`, { week, strengthDays, fixedDays });
    }

    if (/squat/.test(primary)) {
      const squats = work.filter((r) => /^back squat$/i.test(r.exercise));
      if (squats.length < 2) fail('ADVANCED_HYBRID_SQUAT_SPECIFICITY', `Week ${week} needs two direct Back Squat exposures for a primary squat goal: one compact heavy exposure and one lower-cost volume/specificity exposure. Trim accessories before removing squat specificity.`, { week });
      if (benchmarked(intake, /back squat/i) && squats.some((r) => !hasNumericLoad(r))) {
        fail('ADVANCED_HYBRID_BENCHMARK_LOADING', `Week ${week} has a supplied Back Squat benchmark, so direct Back Squat work must use benchmark-anchored kg or percentage prescriptions rather than generic RPE-selected loading.`, { week, exercise: 'Back Squat' });
      }
      for (const row of squats) if (!warmupHasRamp(rows, row.day)) {
        fail('HEAVY_STRENGTH_RAMP_MISSING', `Week ${week} ${row.day || 'strength day'} Back Squat needs a real progressive ramp before work sets. Include an empty-bar/general prep plus at least 2-3 progressively heavier load anchors with reps; duplicated generic [WARMUP] rows do not count.`, { week, day: row.day, exercise: 'Back Squat' });
      }
    }

    if (/one[- ]?arm\s*(?:pull|chin)|\boap\b/.test(primary)) {
      const hasStrict = work.some((r) => /^one-arm pull-up$/i.test(r.exercise));
      const hasAssisted = work.some((r) => /^assisted one-arm pull-up$/i.test(r.exercise));
      if (!hasStrict || !hasAssisted) fail('ADVANCED_HYBRID_OAP_SPECIFICITY', `Week ${week} must protect both demonstrated strict One-Arm Pull-up skill-strength and a second assistance/volume exposure. Do not regress an athlete already performing strict OAPs to prerequisite-only work.`, { week, hasStrict, hasAssisted });
    }

    if (/overhead\s*press|\bohp\b/.test(allGoals)) {
      const ohp = work.filter((r) => /^overhead press$/i.test(r.exercise));
      const hasPushPress = work.some((r) => /^push press$/i.test(r.exercise));
      if (!ohp.length || !hasPushPress) fail('ADVANCED_HYBRID_OHP_ARCHITECTURE', `Week ${week} needs one direct strict Overhead Press exposure plus one low-cost complementary vertical press exposure such as Push Press when recovery allows.`, { week });
      if (benchmarked(intake, /overhead press/i) && ohp.some((r) => !hasNumericLoad(r))) {
        fail('ADVANCED_HYBRID_BENCHMARK_LOADING', `Week ${week} has a supplied Overhead Press benchmark, so strict OHP work must use benchmark-anchored kg or percentage prescriptions rather than generic RPE-selected loading.`, { week, exercise: 'Overhead Press' });
      }
      for (const row of ohp) if (!warmupHasRamp(rows, row.day)) {
        fail('HEAVY_STRENGTH_RAMP_MISSING', `Week ${week} ${row.day || 'strength day'} Overhead Press needs progressive load ramp sets before work sets, not repeated generic warm-up rows.`, { week, day: row.day, exercise: 'Overhead Press' });
      }
    }

    const weightedPull = work.filter((r) => /^weighted (?:chin|pull)-?up$/i.test(r.exercise));
    if (benchmarked(intake, /weighted (?:chin|pull)-?up/i) && weightedPull.some((r) => !hasNumericLoad(r))) {
      fail('ADVANCED_HYBRID_BENCHMARK_LOADING', `Week ${week} has a supplied weighted chin/pull-up benchmark, so bilateral support work must stay benchmark-anchored instead of reverting to generic RPE-selected loading.`, { week, exercise: 'Weighted Chin/Pull-up' });
    }

    if (marathonGoalTier(intake) === 'secondary') {
      const runs = work.filter(isRun);
      if (runs.length !== 1 || !/easy|zone\s*2|conversational/i.test(`${runs[0]?.load || ''} ${runs[0]?.notes || ''}`)) {
        fail('ADVANCED_HYBRID_MARATHON_SUBORDINATION', `Week ${week} should contain one substantive easy/conversational marathon-support run while the marathon remains secondary to primary strength/skill goals. Do not add extra hard endurance work.`, { week, runs: runs.length });
      }
    }

    if (work.some((r) => /interval|sprint|burpee|emom|metcon|finisher/i.test(`${r.exercise} ${r.notes}`))) {
      fail('ADVANCED_HYBRID_EXTRA_HARD_CONDITIONING', `Week ${week} adds hard conditioning despite five MMA sessions. Remove optional intervals, sprints, finishers or metcons unless explicitly required by a higher-priority goal.`, { week });
    }
  }

  const w3 = weeks.get(3) || [];
  const w4 = weeks.get(4) || [];
  const strengthSets = (rows) => rows.filter((r) => !isWarmup(r) && !isRun(r)).reduce((sum, r) => sum + numericSets(r), 0);
  const w3Sets = strengthSets(w3), w4Sets = strengthSets(w4);
  const w3Rpe = Math.max(0, ...w3.map(numericRpe).filter((n) => n != null));
  const w4Rpe = Math.max(0, ...w4.map(numericRpe).filter((n) => n != null));
  const w3Run = (w3.filter(isRun).map(numericKm).find((n) => n != null));
  const w4Run = (w4.filter(isRun).map(numericKm).find((n) => n != null));
  if (!(w4Sets < w3Sets) || w4Rpe > w3Rpe || (w3Run != null && w4Run != null && w4Run >= w3Run)) {
    fail('ADVANCED_HYBRID_WEEK4_NOT_CONSOLIDATING', `Week 4 must genuinely consolidate this high-concurrency block: reduce total strength work sets versus Week 3, do not raise peak prescribed RPE, and reduce the secondary long-run dose when distance is prescribed. A Week 4 label alone is not consolidation.`, { w3Sets, w4Sets, w3Rpe, w4Rpe, w3Run, w4Run });
  }

  const baseline = currentRunBaseline(intake);
  if (baseline.weekly_km) {
    const w1Run = (weeks.get(1) || []).filter(isRun).map(numericKm).find((n) => n != null);
    if (w1Run != null && w1Run > baseline.weekly_km) fail('ADVANCED_HYBRID_RUN_BASELINE_EXCEEDED', `Week 1 direct running must not exceed the demonstrated current weekly running volume of about ${baseline.weekly_km} km.`, { baseline: baseline.weekly_km, w1Run });
  }

  return { ok: true, skipped: false };
}
