import { RetriableValidationError } from './exercise_dictionary.js';
import { parseProgramModel, WEEKDAY_ORDER } from './program_model.js';
import { isHighConcurrencyHybrid, externalSportSessions } from './advanced_hybrid_concurrency.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function text(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function lower(v) { return String(v || '').toLowerCase(); }
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  if (tier === 'secondary') return arr(intake.secondary_goals).map(String).join(' | ');
  if (tier === 'maintenance') return arr(intake.maintenance_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function age(intake = {}) {
  const n = Number(intake.age || intake.age_years || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function fail(code, amendment, details = {}) {
  throw new RetriableValidationError(code, amendment, details);
}
function work(week) {
  return (week?.days || []).flatMap((day) => (day.exercises || []).map((exercise) => ({ day: day.day, exercise })))
    .filter(({ exercise }) => exercise?.role !== 'warm_up' && exercise?.modality !== 'warm_up' && exercise?.modality !== 'recovery');
}
function sets(exercise) {
  const n = Number(exercise?.dose?.sets || 0);
  return Number.isFinite(n) ? n : 0;
}
function repUpper(exercise) {
  const raw = exercise?.dose?.reps_raw || exercise?.dose?.reps || '';
  const nums = [...String(raw).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}
function totalReps(exercise) {
  const r = repUpper(exercise);
  return Number.isFinite(r) ? sets(exercise) * r : 0;
}
function rpeUpper(exercise) {
  const e = exercise?.dose?.effort;
  if (!e) return null;
  if (e.range && Number.isFinite(Number(e.range.max))) return Number(e.range.max);
  const n = Number(e.value);
  return Number.isFinite(n) ? n : null;
}
function kgLoad(exercise) {
  const raw = String(exercise?.dose?.load || '');
  const plus = raw.match(/\+\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  if (plus) return Number(plus[1]);
  const m = raw.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function kmDose(exercise) {
  const raw = `${exercise?.dose?.load || ''} ${exercise?.dose?.reps_raw || ''} ${exercise?.notes || ''}`;
  const m = raw.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
}
function paceSecondsPerKm(exercise) {
  const raw = `${exercise?.dose?.load || ''} ${exercise?.dose?.reps_raw || ''} ${exercise?.notes || ''}`;
  const matches = [...raw.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((m) => Number(m[1]) * 60 + Number(m[2])).filter(Number.isFinite);
  return matches.length ? Math.min(...matches) : null;
}
function distanceMeters(exercise) {
  const raw = `${exercise?.dose?.reps_raw || ''} ${exercise?.dose?.reps || ''}`;
  const m = raw.match(/\b(\d{3,4})\s*m\b/i);
  if (m) return Number(m[1]);
  const km = raw.match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
  return km ? Number(km[1]) * 1000 : null;
}
function currentBackSquat1rm(intake = {}) {
  const src = `${text(intake.current_numbers)} ${text(intake.performance_markers)} ${text(intake.clarification_answers)}`;
  for (const re of [
    /back\s*squat[^\d]{0,24}(\d+(?:\.\d+)?)\s*kg[^\n|]{0,24}(?:1\s*rm|1rm|max)/i,
    /(?:1\s*rm|1rm|max)[^\n|]{0,24}back\s*squat[^\d]{0,24}(\d+(?:\.\d+)?)\s*kg/i,
  ]) {
    const m = src.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}
function dayIndex(day) { return WEEKDAY_ORDER.indexOf(String(day || '').toLowerCase()); }
function forwardDayGap(a, b) {
  const ia = dayIndex(a), ib = dayIndex(b);
  if (ia < 0 || ib < 0) return null;
  return (ib - ia + 7) % 7;
}
function isDirectBackSquat(exercise) { return /^back squat$/i.test(String(exercise?.display_name || '')); }
function isStrictOap(exercise) { return /^one-arm pull-up$/i.test(String(exercise?.display_name || '')); }
function isAssistedOap(exercise) { return /^assisted one-arm pull-up$/i.test(String(exercise?.display_name || '')); }
function isWeightedBilateralPull(exercise) { return /^weighted\s+(?:pull|chin)-?up$/i.test(String(exercise?.display_name || '')); }
function isPress(exercise) { return ['overhead_press'].includes(String(exercise?.base_movement || '')) || /^(?:overhead press|push press)$/i.test(String(exercise?.display_name || '')); }
function isRun(exercise) { return exercise?.modality === 'running' || exercise?.base_movement === 'run'; }
function isRuck(exercise) { return exercise?.modality === 'ruck' || exercise?.base_movement === 'ruck'; }

function meaningfulFamilyProgress(model, family) {
  const w1 = model.weeks?.find((w) => w.week === 1);
  const w3 = model.weeks?.find((w) => w.week === 3);
  if (!w1 || !w3) return false;
  const a = work(w1).map((x) => x.exercise);
  const b = work(w3).map((x) => x.exercise);

  if (family === 'squat') {
    const x = a.filter(isDirectBackSquat), y = b.filter(isDirectBackSquat);
    const l1 = Math.max(0, ...x.map(kgLoad).filter(Number.isFinite));
    const l3 = Math.max(0, ...y.map(kgLoad).filter(Number.isFinite));
    const reps1 = x.reduce((s, e) => s + totalReps(e), 0);
    const reps3 = y.reduce((s, e) => s + totalReps(e), 0);
    return l1 > 0 && l3 >= l1 * 1.02 && reps3 >= reps1 * 0.90;
  }
  if (family === 'oap') {
    const unilateral = (xs) => xs.filter((e) => isStrictOap(e) || isAssistedOap(e)).reduce((s, e) => s + totalReps(e), 0);
    const r1 = unilateral(a), r3 = unilateral(b);
    return r1 > 0 && r3 > r1 * 1.12;
  }
  if (family === 'press') {
    const rows1 = a.filter(isPress), rows3 = b.filter(isPress);
    const direct1 = rows1.filter((e) => /^overhead press$/i.test(String(e.display_name || '')));
    const direct3 = rows3.filter((e) => /^overhead press$/i.test(String(e.display_name || '')));
    const l1 = Math.max(0, ...direct1.map(kgLoad).filter(Number.isFinite));
    const l3 = Math.max(0, ...direct3.map(kgLoad).filter(Number.isFinite));
    const s1 = rows1.reduce((s, e) => s + sets(e), 0);
    const s3 = rows3.reduce((s, e) => s + sets(e), 0);
    return l1 > 0 && l3 >= l1 * 1.025 && Math.max(s1, s3) >= 7;
  }
  if (family === 'run') {
    const d1 = Math.max(0, ...a.filter(isRun).map(kmDose).filter(Number.isFinite));
    const d3 = Math.max(0, ...b.filter(isRun).map(kmDose).filter(Number.isFinite));
    return d1 > 0 && d3 > d1 * 1.05;
  }
  if (family === 'ruck') {
    const d1 = Math.max(0, ...a.filter(isRuck).map(kmDose).filter(Number.isFinite));
    const d3 = Math.max(0, ...b.filter(isRuck).map(kmDose).filter(Number.isFinite));
    return d1 > 0 && d3 > d1 * 1.05;
  }
  return false;
}

function hasConditionalProgressionLanguage(exercise) {
  const s = `${exercise?.notes || ''} ${exercise?.dose?.load || ''}`;
  return /\b(?:if|only if|provided|when|otherwise|repeat|hold|stay|unless|bar speed|rpe|quality|recovery|symptom|pain)\b/i.test(s);
}

export function validateAdvancedHybridCoachingSpecV1(program, intake = {}, suppliedModel = null) {
  if (!isHighConcurrencyHybrid(intake)) return { ok: true, skipped: true };
  const model = suppliedModel || parseProgramModel(program, intake);
  const squat1rm = currentBackSquat1rm(intake);
  const allGoalText = goals(intake);

  const families = [];
  if (/squat/i.test(allGoalText) && meaningfulFamilyProgress(model, 'squat')) families.push('squat');
  if (/one[- ]?arm\s*(?:pull|chin)|\boap\b/i.test(allGoalText) && meaningfulFamilyProgress(model, 'oap')) families.push('oap');
  if (/overhead\s*press|\bohp\b/i.test(allGoalText) && meaningfulFamilyProgress(model, 'press')) families.push('press');
  if (/marathon|\brun(?:ning)?\b|3\s*k/i.test(allGoalText) && meaningfulFamilyProgress(model, 'run')) families.push('run');
  if (/ruck/i.test(allGoalText) && meaningfulFamilyProgress(model, 'ruck')) families.push('ruck');
  if (families.length >= 4) {
    fail(
      'COACH_SPEC_V1_AH_RECOVERY_HIERARCHY_OVERLOADED',
      `Coaching Specification v1.0 AH-01: this high-concurrency athlete materially progresses ${families.join(', ')} across the same four-week block. Primary goals are ${goals(intake, 'primary') || 'unspecified'}; secondary goals are ${goals(intake, 'secondary') || 'none'}. PRESCRIPTIVE REPAIR: preserve primary-goal progression. Freeze at least one currently progressing secondary family by copying its Week 1 ACTUAL TSV dose into Weeks 2-3 (no increase in load, sets or reps). When Overhead Press is secondary, hold the strict OHP and complementary press dose at Week 1 levels before changing a primary family. Do not solve this with relabeling, justification text or low-cost wording. Change the actual dose so fewer than four families meet the material-progression detector, while preserving all other valid constraints.`,
      { families, external_sport_sessions: externalSportSessions(intake) },
    );
  }

  if (squat1rm && /squat/i.test(goals(intake, 'primary'))) {
    for (const week of model.weeks || []) {
      const rows = work(week).filter(({ exercise }) => isDirectBackSquat(exercise));
      const substantial = rows.filter(({ exercise }) => {
        const load = kgLoad(exercise);
        if (!Number.isFinite(load)) return false;
        const pct = load / squat1rm;
        const hardByRpe = pct >= 0.80 && sets(exercise) >= 3 && (rpeUpper(exercise) ?? 0) >= 8;
        const hardByWork = pct >= 0.80 && totalReps(exercise) >= 10;
        return hardByRpe || hardByWork;
      });
      if (substantial.length >= 2) {
        fail(
          'COACH_SPEC_V1_AH_DUAL_SQUAT_FATIGUE',
          `Coaching Specification v1.0 AH-02: Week ${week.week} contains two substantial Back Squat exposures at about >=80% of the supplied current 1RM. Keep one true primary loading exposure and make the second meaningfully lower-cost by reducing intensity, hard-set count, reps per set and/or RPE. Do not call a second substantial strength session "low cost".`,
          { week: week.week, current_1rm: squat1rm, rows: substantial.map(({ day, exercise }) => ({ day, load: kgLoad(exercise), sets: sets(exercise), reps: repUpper(exercise), rpe: rpeUpper(exercise) })) },
        );
      }
    }
  }

  if (/one[- ]?arm\s*(?:pull|chin)|\boap\b/i.test(goals(intake, 'primary'))) {
    for (const week of model.weeks || []) {
      const rows = work(week).filter(({ exercise }) => isStrictOap(exercise) || isAssistedOap(exercise) || isWeightedBilateralPull(exercise));
      const high = rows.filter(({ exercise }) => {
        if (isStrictOap(exercise) || isAssistedOap(exercise)) return (rpeUpper(exercise) ?? 0) >= 8 || totalReps(exercise) >= 4;
        return isWeightedBilateralPull(exercise) && (rpeUpper(exercise) ?? 0) >= 8 && sets(exercise) >= 3;
      });
      for (let i = 0; i < high.length; i++) for (let j = i + 1; j < high.length; j++) {
        const gap = Math.min(forwardDayGap(high[i].day, high[j].day) ?? 99, forwardDayGap(high[j].day, high[i].day) ?? 99);
        if (gap === 1) {
          fail(
            'COACH_SPEC_V1_AH_ADJACENT_HIGH_STRESS_PULLING',
            `Coaching Specification v1.0 AH-04: Week ${week.week} stacks demanding pulling on ${high[i].day} and ${high[j].day}. Separate substantive OAP/local pulling stress by roughly 48 hours when possible, or make the second exposure genuinely technical/easy (about RPE <=6-6.5). Preserve OAP specificity but move or reduce the lower-priority pulling stressor.`,
            { week: week.week, first: { day: high[i].day, exercise: high[i].exercise.display_name }, second: { day: high[j].day, exercise: high[j].exercise.display_name } },
          );
        }
      }
    }
  }

  const maintenance = lower(goals(intake, 'maintenance'));
  for (const family of ['run', 'ruck']) {
    if (!maintenance.includes(family === 'run' ? 'run' : 'ruck')) continue;
    if (meaningfulFamilyProgress(model, family) && !/justify|headroom|recovery allows|if recovery/i.test(String(program))) {
      fail(
        'COACH_SPEC_V1_AH_MAINTENANCE_AUTO_OVERLOAD',
        `Coaching Specification v1.0 AH-06: ${family} is explicitly a maintenance goal but the block automatically progresses its workload. Hold the maintenance dose approximately stable unless the program explicitly justifies why recovery headroom permits development without compromising primary goals.`,
        { family },
      );
    }
  }

  for (const nameRe of [/^back squat$/i, /^overhead press$/i]) {
    let previous = null;
    for (const week of [...(model.weeks || [])].sort((a, b) => a.week - b.week)) {
      const row = work(week).find(({ exercise }) => nameRe.test(String(exercise.display_name || '')));
      if (!row) continue;
      const load = kgLoad(row.exercise);
      if (previous && Number.isFinite(load) && Number.isFinite(previous.load) && load > previous.load + 0.1 && !hasConditionalProgressionLanguage(row.exercise)) {
        fail(
          'COACH_SPEC_V1_AH_UNCONDITIONAL_MAJOR_LIFT_PROGRESSION',
          `Coaching Specification v1.0 AH-07: Week ${week.week} increases ${row.exercise.display_name} from ${previous.load} kg to ${load} kg without a clear readiness condition. Advanced/high-concurrency progression must depend on achieved RPE, bar speed, technique, pain or recovery; otherwise repeat/hold the prior load.`,
          { week: week.week, exercise: row.exercise.display_name, previous_load: previous.load, load },
        );
      }
      previous = { load, week: week.week };
    }
  }

  return { ok: true, skipped: false, model };
}

function youthAcquisition(intake = {}) {
  const g = lower(goals(intake));
  const e = lower(`${text(intake.current_numbers)} ${text(intake.performance_markers)} ${text(intake.clarification_answers)} ${text(intake.notes)}`);
  return {
    bar: /bar muscle[- ]?up/.test(g),
    handstand: /freestanding handstand|unsupported handstand|handstand balance/.test(g),
    establishedWall: /wall[^.]{0,25}(?:15|20|25|30)\s*(?:s|sec)|handstand[^.]{0,25}(?:15|20|25|30)\s*(?:s|sec)/.test(e),
    fullBarPrereqs: /ring muscle[- ]?up/.test(e) && /(?:10|11|12|13|14|15)\s*(?:strict\s*)?pull[- ]?ups?/.test(e),
  };
}

// COACH-SPEC-V1-YOUTH-NEGATION-AWARE
function hasYouthFailureBasedPrescription(value) {
  const raw = String(value || '');
  if (/\bamrap\b/i.test(raw)) return true;
  const clauses = raw.split(/[.;\n]/);
  for (const clause of clauses) {
    if (!/(?:to|until)\s+failure|forced\s+reps?|grinders?|grinding/i.test(clause)) continue;
    const negated = /\b(?:do\s+not|don't|never|avoid|no|without|stop(?:\s+well)?\s+before|stay\s+short\s+of|leave[^.;\n]{0,30}in\s+reserve)\b/i.test(clause);
    if (!negated) return true;
  }
  return false;
}

export function validateYouthCoachingSpecV1HardRules(program, intake = {}, suppliedModel = null) {
  const athleteAge = age(intake);
  if (!(athleteAge != null && athleteAge < 18)) return { ok: true, skipped: true };
  const model = suppliedModel || parseProgramModel(program, intake);
  const state = youthAcquisition(intake);
  const raw = String(program || '');

  const globalStop = /stop[^.\n]{0,80}(?:quality|form|technique|entry|height|control|deterior|break)|(?:quality|form|technique|entry|height|control)[^.\n]{0,80}stop/i.test(raw);
  if ((state.bar || state.handstand) && !globalStop) {
    fail(
      'COACH_SPEC_V1_YG_SKILL_STOP_RULE_MISSING',
      'Coaching Specification v1.0 YG-01: youth skill practice needs an explicit quality-based stop rule. Attempt counts are ceilings, not quotas. Add a clear instruction to stop the exposure after repeated deterioration or loss of the target technical standard rather than completing ugly attempts.',
      {},
    );
  }

  for (const week of model.weeks || []) for (const day of week.days || []) for (const exercise of day.exercises || []) {
    if (exercise?.role === 'warm_up' || exercise?.modality === 'warm_up') continue;
    const name = String(exercise?.display_name || '');
    const notes = `${exercise?.notes || ''}`;
    const rest = String(exercise?.dose?.rest || '');
    const seconds = (() => {
      const m = rest.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b/i);
      return m ? Number(m[1]) : null;
    })();
    const highSkill = /handstand|muscle[- ]?up|transition|hip[- ]?to[- ]?bar|box jump|broad jump/i.test(name);
    if (highSkill && Number.isFinite(seconds) && seconds < 30) {
      fail(
        'COACH_SPEC_V1_YG_SKILL_REST_TOO_SHORT',
        `Coaching Specification v1.0 YG-03: Week ${week.week} ${day.day} gives ${name} only ${seconds}s rest. Skill/power rest must preserve execution quality rather than force conditioning. Use a flexible quality-preserving rest prescription.`,
        { week: week.week, day: day.day, exercise: name, rest },
      );
    }
    const failureText = `${notes} ${exercise?.dose?.reps_raw || ''}`
      .replace(/\b(?:do not|don't|never)\s+(?:train\s+)?to failure\b/gi, '')
      .replace(/\bstop[^.\n]{0,60}before[^.\n]{0,30}failure\b/gi, '')
      .replace(/\bno grinding\b/gi, '');
    if (/to failure|amrap|forced rep|grind(?:er|ing)?|until failure/i.test(failureText)) {
      fail(
        'COACH_SPEC_V1_YG_FAILURE_BASED_DEFAULT',
        `Coaching Specification v1.0 YG-07: Week ${week.week} ${day.day} uses failure/grinding language for youth work (${name}). Default youth strength/skill progression must remain technical and submaximal rather than failure-based.`,
        { week: week.week, day: day.day, exercise: name },
      );
    }
  }

  if (state.handstand && state.establishedWall) {
    for (const week of model.weeks || []) {
      const names = work(week).map(({ exercise }) => lower(exercise.display_name));
      const balance = names.some((n) => /controlled handstand kick[- ]?up|freestanding handstand|wall float|toe pull|heel pull/.test(n));
      if (!balance) {
        fail(
          'COACH_SPEC_V1_YG_HANDSTAND_BALANCE_SPECIFICITY_MISSING',
          `Coaching Specification v1.0 YG-04: Week ${week.week} trains a freestanding-handstand goal for an athlete who already has basic wall capacity, but includes no reduced-support/independent balance practice. Add controlled freestanding entries, wall floats, toe/heel pulls or another drill that requires actual balance correction.`,
          { week: week.week },
        );
      }
    }
  }

  return { ok: true, skipped: false, model };
}

export function collectYouthCoachingSpecV1ReviewSignals(program, intake = {}, suppliedModel = null) {
  const athleteAge = age(intake);
  if (!(athleteAge != null && athleteAge < 18)) return [];
  const model = suppliedModel || parseProgramModel(program, intake);
  const state = youthAcquisition(intake);
  const signals = [];

  for (const week of model.weeks || []) for (const day of week.days || []) {
    for (const exercise of day.exercises || []) {
      if (!/controlled handstand kick[- ]?up|freestanding handstand/i.test(String(exercise?.display_name || ''))) continue;
      const attempts = totalReps(exercise);
      if (attempts > 15) signals.push({ code: 'YG-02_ATTEMPT_VOLUME_REVIEW', week: week.week, day: day.day, attempts, exercise: exercise.display_name });
    }
  }

  if (state.bar && state.fullBarPrereqs) {
    const full = (model.weeks || []).some((week) => work(week).some(({ exercise }) => /^(?:bar muscle-up|banded muscle-up|muscle-up)$/i.test(String(exercise.display_name || ''))));
    if (!full) signals.push({ code: 'YG-05_FULL_SKILL_INTEGRATION_REVIEW' });
  }

  const w1 = model.weeks?.find((w) => w.week === 1), w3 = model.weeks?.find((w) => w.week === 3);
  if (w1 && w3) {
    const p1 = work(w1).map((x) => x.exercise).filter((e) => /explosive|jump|sprint/i.test(String(e.display_name || '')));
    for (const a of p1) {
      const b = work(w3).map((x) => x.exercise).find((e) => lower(e.display_name) === lower(a.display_name));
      if (b && Number.isFinite(repUpper(a)) && Number.isFinite(repUpper(b)) && repUpper(b) > repUpper(a)) {
        signals.push({ code: 'YG-06_POWER_REP_INFLATION_REVIEW', exercise: a.display_name, week1_reps: repUpper(a), week3_reps: repUpper(b) });
      }
    }
  }

  return signals;
}

function tacticalContext(intake = {}) {
  return lower(`${goals(intake)} ${text(intake.notes)} ${text(intake.sport)}`);
}
function isTactical3K(intake = {}) {
  return /(?:tactical|military|special[-–— ]?operations|selection|operator|combat[- ]?ready|\bruck\b)/.test(tacticalContext(intake)) && /\b3\s*k(?:m)?\b/.test(lower(goals(intake, 'primary'))); // COACH-SPEC-V1-TACTICAL-LIVE-CONTEXT
}
function shinHistory(intake = {}) {
  return /shin splint|shin pain|medial tibial|tibial stress/.test(lower(`${text(intake.injuries)} ${text(intake.notes)} ${text(intake.pain)}`));
}
function keyIntervalRows(week) {
  return work(week).filter(({ exercise }) => isRun(exercise) && sets(exercise) >= 2 && Number.isFinite(distanceMeters(exercise)));
}
function lowerBodyStrengthStress(day) {
  return (day?.exercises || []).some((exercise) => {
    if (exercise?.role === 'warm_up' || exercise?.modality === 'warm_up') return false;
    const base = String(exercise?.base_movement || '');
    if (!['squat', 'deadlift', 'split_squat', 'lunge'].includes(base)) return false;
    const rpe = rpeUpper(exercise) ?? 0;
    return (sets(exercise) >= 3 && totalReps(exercise) >= 9 && rpe >= 7.5) || (sets(exercise) >= 2 && rpe >= 8.5);
  });
}
// Per-repetition clock target for a key interval row, e.g. "400 m @ 1:42-1:45"
// yields 102s. Reuses the same clock idiom as paceSecondsPerKm but keeps the
// value per repetition so it can be normalised against the rep distance below.
function repClockSeconds(exercise) {
  const raw = `${exercise?.dose?.load || ''} ${exercise?.dose?.reps_raw || ''} ${exercise?.notes || ''}`;
  const matches = [...raw.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((m) => Number(m[1]) * 60 + Number(m[2])).filter(Number.isFinite);
  return matches.length ? Math.min(...matches) : null;
}
function restSeconds(exercise) {
  const raw = String(exercise?.dose?.rest || '');
  const clock = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const min = raw.match(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/i);
  if (min) return Number(min[1]) * 60;
  const sec = raw.match(/(\d+(?:\.\d+)?)\s*(?:sec|secs|seconds?)\b/i);
  return sec ? Number(sec[1]) : null;
}
// Aggregate the week's key event-specific running work into the coaching
// dimensions T3K-08 reasons about. Multiple key rows in one week are summed for
// volume, and represented by their longest repetition and fastest normalised
// velocity, so a week is compared on what it actually demands.
function eventSessionSnapshot(week) {
  const rows = keyIntervalRows(week).map((x) => x.exercise);
  if (!rows.length) return null;
  let volume = 0;
  let distance = null;
  let paceSecPerKm = null;
  let rest = null;
  for (const exercise of rows) {
    const d = distanceMeters(exercise);
    const reps = sets(exercise);
    if (Number.isFinite(d) && reps > 0) {
      volume += d * reps;
      if (distance == null || d > distance) distance = d;
      const clock = repClockSeconds(exercise);
      if (Number.isFinite(clock) && d > 0) {
        const normalised = clock / (d / 1000);
        if (paceSecPerKm == null || normalised < paceSecPerKm) paceSecPerKm = normalised;
      }
    }
    const r = restSeconds(exercise);
    if (Number.isFinite(r) && (rest == null || r > rest)) rest = r;
  }
  if (!(volume > 0) || !Number.isFinite(distance)) return null;
  return { week: week.week, volume_m: volume, distance_m: distance, pace_s_per_km: paceSecPerKm, rest_s: rest };
}
// T3K-08: the frozen brief already requires that "race specificity must increase
// across the block". T3K-02 only rejects an all-400 m block and
// EVENT_PROGRESSING_SESSION_MISSING only proves Week 1 has a key session, so a
// legitimate-looking session repeated identically for four weeks passes both.
// Enforce real week-over-week development on measured dose only -- never on
// wording -- while accepting any coherent periodisation rather than one model.
// Runs last in the Tactical validator so genuine safety/structure violations
// (T3K-05 preceding strength, T3K-06 ruck stacking, T3K-07 symptom gate) keep
// reporting first, matching the authored safety-before-specificity priority.
function tactical3KEventProgressionFailure(model) {
  const eventWeeks = (model.weeks || []).map(eventSessionSnapshot).filter(Boolean).sort((a, b) => a.week - b.week);
  if (eventWeeks.length < 3) return null;
  const base = eventWeeks[0];
  const later = eventWeeks.slice(1);
  const gained = (s) => {
    const longer = s.distance_m >= base.distance_m * 1.05;
    const bigger = s.volume_m >= base.volume_m * 1.08;
    const faster = Number.isFinite(s.pace_s_per_km) && Number.isFinite(base.pace_s_per_km)
      && s.pace_s_per_km <= base.pace_s_per_km * 0.985;
    // Density: same-or-more quality work at same-or-better velocity on less rest.
    const denser = Number.isFinite(s.rest_s) && Number.isFinite(base.rest_s)
      && s.rest_s <= base.rest_s * 0.90
      && s.volume_m >= base.volume_m * 0.98
      && (!Number.isFinite(s.pace_s_per_km) || !Number.isFinite(base.pace_s_per_km) || s.pace_s_per_km <= base.pace_s_per_km * 1.005);
    return { longer, bigger, faster, denser, any: longer || bigger || faster || denser };
  };
  if (!later.some((s) => gained(s).any)) {
    return {
      code: 'COACH_SPEC_V1_T3K_EVENT_PROGRESSION_STATIC',
      amendment: 'Coaching Specification v1.0 T3K-08: the primary 3K event-specific session repeats the same measured dose across the block, so there is no week-over-week race-specific development. Progress at least one coaching-meaningful dimension of the key session across the build weeks - repetition distance, repetition count / total quality volume, per-repetition clock target, or session density (equivalent work on less recovery). Changing only the wording, labels or coaching notes is not progression. A build-then-taper shape is welcome: the final week may reduce volume while holding or sharpening intensity.',
      details: { event_weeks: eventWeeks },
    };
  }
  // Retention: an isolated mid-block spike is not a developmental trajectory. By
  // the end of the build phase the block must still hold a gain over the Week 1
  // baseline in SOME dimension - the same one it gained, or another it was
  // transformed into. The final week is allowed to be the carrier instead, which
  // keeps a legitimate late peak / realisation week valid, but a block whose
  // build weeks all revert to baseline is rejected. This is what separates
  // "W1 4x600, W2 5x600, W3 4x600, W4 4x600" (gain thrown away, no taper
  // rationale) from "W1 4x600, W2 5x600, W3 4x800, W4 3x600 faster" (gain
  // extended into distance, then tapered).
  const lastBuild = later.length > 1 ? later[later.length - 2] : null;
  const finalWeek = later[later.length - 1];
  if (lastBuild && !gained(lastBuild).any && !gained(finalWeek).any) {
    return {
      code: 'COACH_SPEC_V1_T3K_EVENT_PROGRESSION_NOT_RETAINED',
      amendment: `Coaching Specification v1.0 T3K-08: the primary 3K session gains earlier in the block but Week ${lastBuild.week} onward returns to the Week 1 baseline, so no event-specific development is retained into the end of the build. One isolated spike is not a progression narrative. Either carry the gained quality forward - hold it, extend repetition distance, add quality volume, sharpen the per-repetition clock, or tighten recovery - or make the final week a genuine taper that preserves or sharpens intensity while volume comes down.`,
      details: { baseline: base, last_build_week: lastBuild, final_week: finalWeek },
    };
  }
  // Random oscillation guard: an intermediate build week that drops below the
  // Week 1 baseline on volume while gaining nothing on distance, velocity or
  // density is not periodisation. The final week is exempt because a taper is
  // expected to reduce volume by design.
  const regressed = later.slice(0, -1).find((s) => {
    const g = gained(s);
    return s.volume_m <= base.volume_m * 0.92 && !g.longer && !g.faster && !g.denser;
  });
  if (regressed) {
    return {
      code: 'COACH_SPEC_V1_T3K_EVENT_PROGRESSION_INCOHERENT',
      amendment: `Coaching Specification v1.0 T3K-08: Week ${regressed.week} reduces the primary 3K quality session below the Week 1 baseline without gaining repetition distance, per-repetition velocity or session density, so the block oscillates instead of developing. Give the build weeks a defensible direction - hold or advance the key session, and reserve genuine volume reduction for a final taper/realisation week that preserves or sharpens intensity.`,
      details: { week: regressed.week, baseline: base, regressed },
    };
  }
  return null;
}

function ruckSnapshot(week) {
  const row = work(week).map((x) => x.exercise).find(isRuck);
  if (!row) return null;
  const raw = `${row?.dose?.load || ''} ${row?.notes || ''}`;
  const loadMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*kg\b/i);
  return {
    week: week.week,
    load_kg: loadMatch ? Number(loadMatch[1]) : null,
    distance_km: kmDose(row),
    pace_s_per_km: paceSecondsPerKm(row),
  };
}

export function validateTactical3KCoachingSpecV1(program, intake = {}, suppliedModel = null) {
  if (!isTactical3K(intake)) return { ok: true, skipped: true };
  const model = suppliedModel || parseProgramModel(program, intake);

  const intervalRows = (model.weeks || []).flatMap((week) => keyIntervalRows(week).map((row) => ({ week: week.week, ...row })));
  const distances = intervalRows.map(({ exercise }) => distanceMeters(exercise)).filter(Number.isFinite);
  if (distances.length && distances.every((d) => d <= 400)) {
    fail(
      'COACH_SPEC_V1_T3K_400_ONLY_BLOCK',
      'Coaching Specification v1.0 T3K-02: the 3K development block relies exclusively on 400 m-or-shorter repetitions. Keep shorter reps where useful, but include at least one build-week race-specific exposure using longer repetitions (for example 600-1000 m or an equivalent sustained 3K-demand interval structure) so the athlete learns to sustain high aerobic power rather than only repeat short laps.',
      { interval_distances_m: distances },
    );
  }

  for (const week of model.weeks || []) {
    const keyDays = (week.days || []).filter((day) => keyIntervalRows({ days: [day] }).length > 0);
    for (const key of keyDays) {
      const idx = dayIndex(key.day);
      if (idx < 0) continue;
      const prevName = WEEKDAY_ORDER[(idx + 6) % 7];
      const prev = (week.days || []).find((d) => lower(d.day) === prevName);
      if (prev && lowerBodyStrengthStress(prev)) {
        fail(
          'COACH_SPEC_V1_T3K_KEY_RUN_PRECEDED_BY_STRENGTH',
          `Coaching Specification v1.0 T3K-05: Week ${week.week} places the primary 3K quality run on ${key.day} within 24 hours after substantial lower-body strength on ${prev.day}. Protect the primary run: move the key run/lift, or reduce the preceding lower-body dose to genuine maintenance-level work.`,
          { week: week.week, key_run_day: key.day, preceding_day: prev.day },
        );
      }
    }
  }

  const rucks = (model.weeks || []).map(ruckSnapshot).filter(Boolean).sort((a, b) => a.week - b.week);
  for (let i = 1; i < rucks.length; i++) {
    const a = rucks[i - 1], b = rucks[i];
    const loadUp = Number.isFinite(a.load_kg) && Number.isFinite(b.load_kg) && b.load_kg > a.load_kg + 0.1;
    const distanceUp = Number.isFinite(a.distance_km) && Number.isFinite(b.distance_km) && b.distance_km > a.distance_km * 1.01;
    const paceUp = Number.isFinite(a.pace_s_per_km) && Number.isFinite(b.pace_s_per_km) && b.pace_s_per_km < a.pace_s_per_km * 0.995;
    const progressed = [['load', loadUp], ['distance', distanceUp], ['pace', paceUp]].filter(([, yes]) => yes).map(([name]) => name);
    if (progressed.length > 1) {
      fail(
        'COACH_SPEC_V1_T3K_RUCK_MULTI_VARIABLE_PROGRESSION',
        `Coaching Specification v1.0 T3K-06: Weeks ${a.week}->${b.week} progress ruck ${progressed.join(' + ')} simultaneously. Progress one major ruck variable at a time (load, distance or pace), especially when running impact is also being developed.`,
        { from: a, to: b, progressed },
      );
    }
  }

  if (shinHistory(intake) && !/(?:shin|tibial)[^.\n]{0,120}(?:hold|repeat|reduce|cut|stop|symptom|pain)|(?:symptom|pain)[^.\n]{0,120}(?:hold|repeat|reduce|cut|stop)[^.\n]{0,80}(?:run|ruck|interval)/i.test(String(program))) {
    fail(
      'COACH_SPEC_V1_T3K_SHIN_SYMPTOM_GATE_MISSING',
      'Coaching Specification v1.0 T3K-07: the intake reports prior lower-leg overuse problems, but the program lacks an explicit symptom gate. State that impact progression stops/holds or the newest impact stressor is reduced when shin symptoms recur, rather than continuing calendar-based running/ruck progression.',
      {},
    );
  }

  const progression = tactical3KEventProgressionFailure(model);
  if (progression) fail(progression.code, progression.amendment, progression.details);

  return { ok: true, skipped: false, model };
}

export function buildCoachingSpecV1Brief(intake = {}) {
  const lines = [
    '=== COACHING SPECIFICATION v1.0 (FROZEN) ===',
    'Apply priority resolution in this order: safety > primary-goal readiness > specificity > recoverability > secondary development > maintenance > optional accessories. Repair the lowest-priority stressor first. Maintenance is not automatic improvement. Progress one major stress dimension at a time when risk or concurrent load is elevated.',
    'Every major advanced-athlete load increase must be conditional on achieved RPE/technique/readiness rather than calendar progression alone.',
  ];

  if (isHighConcurrencyHybrid(intake)) {
    lines.push(
      'ADVANCED HYBRID: make goal hierarchy visible in the actual dose. Do not progress every stated quality simultaneously. Primary goals own freshness; secondary goals use minimum effective meaningful work; maintenance stays approximately stable unless explicit recovery headroom justifies development.',
      'When two primary families coexist with multiple secondary families under heavy sport load, proactively hold secondary pressing at its Week 1 actual dose through build weeks unless the primary recovery budget clearly permits more. Do not wait for a repair pass to remove four-family progression.',
      'If squat is primary with >=4 demanding sport sessions/week, use one true primary squat loading exposure and one genuinely lower-cost squat exposure. A top set plus 1-2 back-offs is often more recoverable than four equally heavy work sets. The secondary exposure should meaningfully reduce intensity, hard sets, reps and/or RPE.',
      'For OAP/maximal pulling plus grappling/climbing-style sport stress, avoid substantive unilateral pulling on consecutive days. Aim for roughly 48h between hard local pulling exposures; an adjacent session is acceptable only when it is genuinely technique/easy work around RPE <=6-6.5.',
      'Secondary pressing should stay subordinate: roughly 4-8 meaningful direct pressing work sets/week is a useful default in this context; >10 deserves strong justification. Push press is support, not permission to create another large pressing block.',
      'Labels must match dose: low-cost/recovery/primer/technique sessions cannot hide substantial hard workload.',
    );
  }

  if (age(intake) != null && age(intake) < 18) {
    lines.push(
      'YOUTH/GYMNASTICS: skill attempt counts are ceilings, not quotas. Explicitly stop after repeated deterioration/loss of the technical standard. For discrete acquisition skills, roughly 8-15 excellent attempts is a useful default range; exceed it only when quality clearly remains high.',
      'Use enough rest to preserve learning/output (often 45-90+ seconds as needed). Do not turn skill work into conditioning.',
      'For a freestanding-handstand goal with established wall capacity, include actual balance correction/reduced-support work (controlled entries, wall floats, toe/heel pulls, etc.), not only longer static wall holds.',
      'When full bar-muscle-up prerequisites exist and safe assistance is available, include a few integrated assisted full-skill singles alongside components. Power work progresses output/height/speed/quality before reps per set.',
      'Youth strength defaults to technical submaximal work, no repeated grinders/failure, and session content must fit the stated time including rests/transitions.',
    );
  }

  if (isTactical3K(intake)) {
    lines.push(
      'TACTICAL 3K: because the 3K is primary, the weekly schedule must protect the key race-specific run. Do not place substantial lower-body strength in the preceding 24h; 24-48h separation still requires judgement.',
      'Race specificity must increase across the block. Do not use only 200-400m reps for every quality session; progress toward sustained work such as 600-1000m repetitions or an equivalent structure. A typical trained-athlete primary interval session often carries roughly 2-4 km of meaningful quality work, adjusted to phase and tolerance.',
      'Interval pace starts from current demonstrated capacity, not aspirational goal pace. If goal velocity is >5-8% faster than current race velocity, Week 1 must not put the majority of quality volume directly at goal pace.',
      'Ruck progression manipulates one major variable at a time: load OR distance OR pace. With prior shin issues, all impact progression is symptom-gated and the newest impact stressor is reduced/held first if symptoms return.',
      'When recovery is insufficient, sacrifice nonessential accessories first, then extra hypertrophy, secondary strength volume, secondary ruck progression and excess easy volume before reducing the primary 3K quality stimulus—unless safety/injury overrides the hierarchy.',
    );
  }

  return lines.join('\n');
}
