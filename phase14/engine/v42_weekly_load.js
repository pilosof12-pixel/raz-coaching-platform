// Shared workload facts for the whole week.
//
// Recovery budgeting, one-stressor-at-a-time progression and session-duration
// realism all need the same numbers. Computing them once here keeps the rules
// consistent with each other: before this, each rule re-derived its own
// approximation and they could disagree about the same program.
//
// Nothing in this module judges a program. It only measures it. The judgements
// live in v42_recovery_budget.js and v42_progression_discipline.js.

import { parseWeek, sessionDurations, runRowKm } from './v34_workload_accounting.js';
import { classifyExercise, stressSignature, CATEGORY, ROLE, dayKey, WEEKDAYS } from './v38_movement_taxonomy.js';

const TISSUES = ['axial', 'lower', 'upperPull', 'upperPush', 'neural', 'impact', 'elbow'];

function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function txt(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

// How hard a set is, read from the row's own RPE target. Sets alone cannot
// separate 3x3 squats at RPE 8 from 2x10 cable rows at RPE 6.5, and treating
// them as equal made light accessory days measure as expensive ones.
export function rpeFactor(raw) {
  const nums = String(raw || '').match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return 1;
  const rpe = Math.max(...nums.map(Number).filter((n) => n >= 1 && n <= 10));
  if (!Number.isFinite(rpe)) return 1;
  // RPE 8 is the reference hard working set.
  return Math.max(0.3, Math.min(1.4, 0.3 + (rpe - 5) * 0.233));
}

// Reps a row actually prescribes, counting only countable repetitions. A
// duration or distance row contributes through its own channel instead.
function repsOf(raw) {
  const s = String(raw || '').trim();
  if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km|m)\b/i.test(s)) return null;
  return firstNum(s);
}

// --- the athlete's sport week -----------------------------------------------

// A sport session is whole-body work the gym plan does not control but must
// account for. Intensity scales a generic session cost; without a stated
// intensity a session is treated as moderate.
export const SPORT_SESSION_COST = {
  hard: { neural: 3, lower: 2, impact: 2, upperPull: 1, upperPush: 1, axial: 1, elbow: 0 },
  moderate: { neural: 2, lower: 1, impact: 1, upperPull: 1, upperPush: 1, axial: 0, elbow: 0 },
  easy: { neural: 1, lower: 1, impact: 1, upperPull: 0, upperPush: 0, axial: 0, elbow: 0 },
};

export function normalizeIntensity(raw) {
  const s = String(raw || '').toLowerCase();
  if (/hard|high|intense|competition|spar/.test(s)) return 'hard';
  if (/easy|light|technical|drill|recovery/.test(s)) return 'easy';
  return 'moderate';
}

// Map of dayKey -> intensity for the athlete's own sport sessions.
export function sportScheduleByDay(intake = {}) {
  const out = new Map();
  const schedule = Array.isArray(intake.sport_schedule) ? intake.sport_schedule : [];
  for (const entry of schedule) {
    const day = dayKey(entry?.day);
    if (!day) continue;
    out.set(day, normalizeIntensity(entry?.intensity));
  }
  return out;
}

// --- per-row cost ------------------------------------------------------------

function emptyLoad() { return Object.fromEntries(TISSUES.map((t) => [t, 0])); }
function addLoad(target, source, scale = 1) {
  for (const t of TISSUES) target[t] += (source[t] || 0) * scale;
  return target;
}

// A work row's tissue cost: its movement signature scaled by how many sets it
// prescribes. Sets are the unit the athlete actually repeats, so they carry the
// scaling; reps and load are already reflected in the signature's magnitude.
export function rowLoad(cells, parsed) {
  const name = String(cells[parsed.exercise] || '');
  if (!name.trim() || isWarmup(name)) return emptyLoad();
  const sets = Math.max(1, firstNum(cells[parsed.sets]) || 1);
  return addLoad(emptyLoad(), stressSignature(name), sets);
}

// An endurance row's cost tracks the distance covered, not the number of times
// the row is written down. Counting a 16 km run as "one set" understated it by
// more than threefold against a 3-set squat.
export const KM_PER_ENDURANCE_SET_EQUIVALENT = 5;

function isRuck(name) { return /\bruck|weighted (?:march|carry walk)|backpack march\b/i.test(String(name || '')); }
function ruckRowKm(cells, parsed) {
  if (!isRuck(cells[parsed.exercise])) return 0;
  const s = String(cells[parsed.reps] || '');
  const km = s.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  const sets = Math.max(1, firstNum(cells[parsed.sets]) || 1);
  return km ? Number(km[1]) * sets : 0;
}

// Quality distance: repeated efforts at a prescribed distance, which is the
// metric an event-specific block is actually judged on.
function intervalMetres(cells, parsed) {
  const name = String(cells[parsed.exercise] || '');
  if (isWarmup(name)) return 0;
  const sets = firstNum(cells[parsed.sets]) || 0;
  if (sets < 2) return 0;
  const m = String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i);
  return m ? Number(m[1]) * sets : 0;
}

function isUnilateralPull(name) {
  const { category } = classifyExercise(name);
  if (category !== CATEGORY.VERTICAL_PULL) return false;
  return /one[- ]arm|single[- ]arm|1[- ]arm|archer|unilateral/i.test(String(name || ''));
}

// --- the week ----------------------------------------------------------------

// Per-day and whole-week measurements for one training week. `days` covers
// every weekday, including days with no gym work, because a sport-only day
// still spends recovery the gym plan has to respect.
export function weekLoadProfile(program, week, intake = {}) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const sport = sportScheduleByDay(intake);
  const minutesByDay = new Map(sessionDurations(program, week).map((d) => [String(d.day).trim(), d.minutes]));

  // Day labels are not always weekdays: an athlete with a flexible schedule gets
  // "Session A"/"Session B". Bucket by the label the program actually uses, and
  // keep the weekday key separately for the checks that need real adjacency.
  const rpeIndex = parsed.header.findIndex((h) => /rpe|rir/i.test(String(h || '')));
  const days = new Map();
  const bucket = (label) => {
    const name = String(label || '').trim();
    if (!name) return null;
    if (!days.has(name)) {
      days.set(name, {
        day: name,
        key: dayKey(name),
        gymLoad: emptyLoad(),
        sportLoad: emptyLoad(),
        sport: sport.get(dayKey(name)) || null,
        workSets: 0,
        exercises: 0,
        gymMinutes: minutesByDay.get(name) ?? 0,
        runningKm: 0,
        ruckKm: 0,
        rows: [],
        // Every note on the day, warm-up rows included. A claim about the whole
        // session is frequently written on the warm-up row, so a scan limited to
        // work rows would never see it.
        text: '',
      });
    }
    return days.get(name);
  };

  const totals = {
    runningKm: 0,
    ruckKm: 0,
    intervalQualityMetres: 0,
    skillAttempts: 0,
    unilateralPullReps: 0,
    setsByCategory: {},
    gymMinutes: 0,
  };

  for (const cells of parsed.rows) {
    const entry = bucket(cells[parsed.day]);
    const name = String(cells[parsed.exercise] || '').trim();
    if (!entry || !name) continue;
    const km = runRowKm(cells, parsed);
    const ruck = ruckRowKm(cells, parsed);
    entry.runningKm += km;
    entry.ruckKm += ruck;
    totals.runningKm += km;
    totals.ruckKm += ruck;
    entry.text += ` ${txt(parsed.load == null ? '' : cells[parsed.load])} ${txt(cells[parsed.notes])}`;
    if (isWarmup(name)) continue;

    const sets = Math.max(1, firstNum(cells[parsed.sets]) || 1);
    const reps = repsOf(cells[parsed.reps]);
    const { category, role } = classifyExercise(name);
    // Distance work is scaled by distance; everything else by set count.
    const distanceKm = km + ruck;
    // For distance work the dose is the distance, so a low effort rating does
    // not make 16 km cheap: the impact volume is spent either way.
    const rated = rpeFactor(rpeIndex == null || rpeIndex < 0 ? '' : cells[rpeIndex]);
    const intensity = distanceKm > 0 ? Math.max(rated, 0.8) : rated;
    const scale = (distanceKm > 0 ? Math.max(sets, distanceKm / KM_PER_ENDURANCE_SET_EQUIVALENT) : sets) * intensity;
    addLoad(entry.gymLoad, stressSignature(name), scale);
    entry.workSets += sets;
    entry.exercises += 1;
    entry.rows.push({
      exercise: name, sets, reps, category, role, km: distanceKm, intensity,
      stressUnits: Math.round(TISSUES.reduce((a, t) => a + (stressSignature(name)[t] || 0), 0) * scale * 10) / 10,
      rpe: rpeIndex == null || rpeIndex < 0 ? '' : String(cells[rpeIndex] || ''),
      load: cells[parsed.load], notes: cells[parsed.notes],
    });

    totals.setsByCategory[category] = (totals.setsByCategory[category] || 0) + sets;
    totals.intervalQualityMetres += intervalMetres(cells, parsed);
    if (role === ROLE.SKILL_PRACTICE && Number.isFinite(reps)) totals.skillAttempts += sets * reps;
    if (isUnilateralPull(name) && Number.isFinite(reps)) totals.unilateralPullReps += sets * reps;
  }

  // A sport-only day spends recovery even though the plan wrote nothing on it.
  for (const [key, intensity] of sport) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    if (![...days.values()].some((d) => d.key === key)) bucket(label).sport = intensity;
  }

  for (const entry of days.values()) {
    if (entry.sport) addLoad(entry.sportLoad, SPORT_SESSION_COST[entry.sport], 1);
    entry.totalLoad = addLoad(addLoad(emptyLoad(), entry.gymLoad), entry.sportLoad);
    entry.stressUnits = Math.round(TISSUES.reduce((sum, t) => sum + entry.totalLoad[t], 0) * 10) / 10;
    totals.gymMinutes += entry.gymMinutes;
  }

  totals.runningKm = Math.round(totals.runningKm * 10) / 10;
  totals.ruckKm = Math.round(totals.ruckKm * 10) / 10;
  totals.gymMinutes = Math.round(totals.gymMinutes);
  return { week, days: [...days.values()], totals };
}

// The athlete's own sport and conditioning commitments are not optional work
// the plan may spend; they are fixed costs it has to fit around.
export function fixedWeeklyCommitmentLoad(intake = {}) {
  const sport = sportScheduleByDay(intake);
  const load = emptyLoad();
  for (const intensity of sport.values()) addLoad(load, SPORT_SESSION_COST[intensity], 1);
  return { sessions: sport.size, load, stressUnits: TISSUES.reduce((s, t) => s + load[t], 0) };
}

export function statedRecoveryQuality(intake = {}) {
  const s = `${txt(intake.recovery_rating)} ${txt(intake.sleep_hours)}`.toLowerCase();
  if (/excellent|great|very good/.test(s)) return 'high';
  if (/poor|bad|limited|broken/.test(s)) return 'low';
  return 'normal';
}

// Elevated risk means a progression mistake is more likely to cost the athlete
// training time: a documented injury history, or a week already dense with
// stress the plan does not control.
export function elevatedRiskContext(intake = {}) {
  const injuryText = `${txt(intake.injuries)} ${txt(intake.pain)} ${txt(intake.notes)}`;
  const injuryHistory = /shin|tibial|stress fracture|plantar|achilles|tendin|impingement|strain|sprain|hernia|disc/i.test(injuryText)
    && !/none reported/i.test(txt(intake.injuries));
  const fixed = fixedWeeklyCommitmentLoad(intake);
  const denseSportWeek = fixed.sessions >= 4;
  const reasons = [];
  if (injuryHistory) reasons.push('documented injury history');
  if (denseSportWeek) reasons.push(`${fixed.sessions} sport sessions the plan does not control`);
  if (statedRecoveryQuality(intake) === 'low') reasons.push('self-reported poor recovery');
  return { elevated: reasons.length > 0, reasons, injuryHistory, fixedSessions: fixed.sessions };
}

export { TISSUES };
