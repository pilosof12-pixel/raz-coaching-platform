// engine/v74_camp_economy.js
//
// Near competition an exercise must buy something, not merely cost little.
//
// The reviewed fight camp filled two 40-minute sessions with six exercises
// each: pull-up, hip thrust, chest-supported row, push-up, side plank, prowler.
// Every one was cheap and none of them bought speed, and a cheap exercise that
// buys nothing is still junk volume when the athlete has seven sparring
// sessions and a weight cut in the same week.
//
// So late-camp sessions get an exercise budget, and generic accessories are
// what gets cut. What survives has to earn it: strength maintenance, a speed
// exposure, sport-specific tissue work such as neck and grip, or low-cost
// trunk work.
//
// Nothing here applies before late camp, or to any athlete without an event.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise } from './v38_movement_taxonomy.js';
import { STATE, stateForWeek, competitionProfile } from './v68_competition_state.js';
import { isPowerExposure } from './v72_combat_power.js';

// The session budget by how close the event is.
const EXERCISE_BUDGET = {
  [STATE.LATE_CAMP]: 5,
  [STATE.TAPER]: 4,
  [STATE.COMPETITION_WEEK]: 3,
};

// What the review said a camp session should be made of: one or two meaningful
// strength-maintenance patterns, a little high-quality explosive work, short
// alactic sled work, neck and grip if relevant, and low-cost trunk work.
const NECK_GRIP = /\b(?:neck|grip|farmer|wrist)\b/i;
const TRUNK = /\b(?:plank|pallof|dead bug|anti-rotation)\b/i;
const SLED = /\b(?:prowler|sled|push drive)\b/i;
// Compound patterns that hold strength. Two of these is maintenance; four is a
// gym programme with the sport bolted on.
const STRENGTH_PATTERN = /\b(?:pull-?up|chin-?up|squat|deadlift|trap ?bar|press|bench|row|dip|hip thrust|lunge|split squat)\b/i;
const MAX_STRENGTH_PATTERNS = 2;

// Cut order within the surplus: the most generic first. A row is not wrong, it
// is just the least defensible thing in the room eight days from a fight.
const CUT_ORDER = [
  /\b(?:curl|extension|fly|pec deck|lateral raise|calf)\b/i,
  /\b(?:row|pulldown|pull-?over)\b/i,
  /\b(?:hip thrust|glute bridge|leg press|split squat|lunge)\b/i,
  /\b(?:push-?up|bench|dip|press)\b/i,
  /\b(?:pull-?up|chin-?up|squat|deadlift|trap ?bar)\b/i,
];

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }

// Judged per session, because "one or two strength patterns" is a statement
// about the session and not about any single exercise.
export function surplusInSession(names = []) {
  let strengthKept = 0;
  let trunkKept = 0;
  const surplus = [];
  names.forEach((name, i) => {
    const n = String(name || '');
    if (isPowerExposure(n) || NECK_GRIP.test(n) || SLED.test(n)) return;
    if (TRUNK.test(n)) {
      trunkKept += 1;
      if (trunkKept > 1) surplus.push(i);
      return;
    }
    if (STRENGTH_PATTERN.test(n)) {
      strengthKept += 1;
      if (strengthKept > MAX_STRENGTH_PATTERNS) surplus.push(i);
      return;
    }
    surplus.push(i);
  });
  return surplus;
}

export function earnsItsPlace(name) {
  return surplusInSession([name]).length === 0;
}

function sessionsOf(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const days = new Map();
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    const day = String(cells[parsed.day] || '').trim();
    if (!name || !day || isWarmup(name)) return;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push({ index, name });
  });
  return { parsed, days };
}

export function collectEconomyFlags(program, intake = {}, now = Date.now()) {
  if (!competitionProfile(intake, now)) return [];
  const flags = [];

  for (let week = 1; week <= 4; week += 1) {
    const state = stateForWeek(intake, week, now);
    const budget = EXERCISE_BUDGET[state];
    if (!budget) continue;
    const data = sessionsOf(program, week);
    if (!data) continue;

    for (const [day, rows] of data.days) {
      if (rows.length <= budget) continue;
      const surplusIdx = surplusInSession(rows.map((r) => r.name));
      // The rule is about junk, not arithmetic. A session where every exercise
      // buys strength, speed or tissue readiness is a full session, not a busy
      // one -- and flagging it would refuse work no repair should remove.
      if (!surplusIdx.length) continue;
      const surplus = surplusIdx.map((i) => rows[i].name);
      flags.push({
        code: 'V74_CAMP_SESSION_TOO_BUSY',
        week, day, count: rows.length, budget,
        detail: `Week ${week} ${day} carries ${rows.length} exercises in a ${state.replace(/_/g, ' ')} session, against a budget of ${budget}. `
          + `Near competition an exercise must buy strength retention, speed, technical readiness or sport-specific tissue work -- being cheap is not a reason to keep it. `
          + `Least defensible here: ${surplus.slice(0, 4).join(', ') || 'generic accessory work'}.`,
      });
    }
  }
  return flags;
}

export function repairCampEconomy(program, intake = {}, now = Date.now()) {
  if (!competitionProfile(intake, now)) return String(program || '');
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    const state = stateForWeek(intake, week, now);
    const budget = EXERCISE_BUDGET[state];
    if (!budget) continue;
    const data = sessionsOf(out, week);
    if (!data) continue;
    const { parsed } = data;

    const drop = new Set();
    for (const [, rows] of data.days) {
      if (rows.length <= budget) continue;
      let over = rows.length - budget;
      // Only ever cut work that does not earn its place, in the stated order.
      const surplusIdx = new Set(surplusInSession(rows.map((r) => r.name)));
      const droppable = rows.filter((_, i) => surplusIdx.has(i));
      for (const pattern of CUT_ORDER) {
        if (over <= 0) break;
        for (const r of droppable) {
          if (over <= 0) break;
          if (drop.has(r.index)) continue;
          if (!pattern.test(r.name)) continue;
          drop.add(r.index);
          over -= 1;
        }
      }
    }
    if (!drop.size) continue;

    const rows = parsed.rows.filter((_, i) => !drop.has(i)).map((c) => c.slice());
    // Say why the session got shorter, on the row that leads it.
    if (Number.isInteger(parsed.notes) && rows.length) {
      const lead = rows.find((c) => {
        const n = String(c[parsed.exercise] || '').trim();
        return n && !isWarmup(n);
      });
      if (lead) {
        const existing = String(lead[parsed.notes] || '').trim();
        const reason = 'Session trimmed for camp: what remains is here because it keeps strength, speed or tissue readiness, not because it is easy.';
        if (!existing.includes('trimmed for camp')) lead[parsed.notes] = existing ? `${existing} ${reason}` : reason;
      }
    }
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

// Novelty is expensive near competition: a movement the athlete has not done
// in this block is one whose soreness nobody can predict.
export function collectNoveltyFlags(program, intake = {}, now = Date.now()) {
  if (!competitionProfile(intake, now)) return [];
  const seen = new Set();
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const data = sessionsOf(program, week);
    if (!data) continue;
    const state = stateForWeek(intake, week, now);
    const late = state === STATE.TAPER || state === STATE.COMPETITION_WEEK;
    for (const [, rows] of data.days) {
      for (const r of rows) {
        const key = r.name.toLowerCase();
        if (late && !seen.has(key)) {
          flags.push({
            code: 'V74_NOVEL_EXERCISE_NEAR_EVENT',
            week, exercise: r.name,
            detail: `Week ${week} introduces ${r.name} for the first time in a ${state.replace(/_/g, ' ')} week. A movement the athlete has not done in this block has unpredictable soreness, and there is no time left to find out.`,
          });
        }
        seen.add(key);
      }
    }
  }
  return flags;
}
