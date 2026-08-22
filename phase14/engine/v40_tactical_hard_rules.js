// The three Coaching Specification v1.0 Tactical HARD rules that had no
// enforcement: T3K-01, T3K-03 and T3K-08.
//
//   T3K-01  a race-primary block must increasingly expose race demand
//   T3K-03  quality volume must be enough to create race-specific repeatability
//           (CONTEXT-DEPENDENT in the specification, so advisory here)
//   T3K-08  when recovery is insufficient, primary work is preserved and
//           lower-priority stress is cut first
//
// T3K-08 is the interesting one to make deterministic. "Recovery is
// insufficient" is not observable from the program text, but the CONSEQUENCE of
// mishandling it is: if the primary quality session shrinks in a week while
// lower-priority work holds or grows, the sacrifice hierarchy was inverted
// regardless of why. That inversion is what this checks.

import { CATEGORY, classifyExercise } from './v38_movement_taxonomy.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }

function parseWeek(program, week) {
  const re = new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i');
  const m = String(program || '').match(re);
  if (!m) return null;
  const lines = m[1].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![idx.day, idx.exercise, idx.sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((l) => l.split('\t')).filter((c) => c.length === header.length);
  return { rows, day: idx.day, exercise: idx.exercise, load: col('weight', 'load / target'), sets: idx.sets, reps, notes: col('notes', 'coaching note') };
}

// Is this athlete's primary goal a running race with a stated distance and time?
export function raceProfile(intake = {}) {
  const primary = goals(intake, 'primary');
  const dist = primary.match(/\b(\d+(?:\.\d+)?)\s*k(?:m)?\b/i);
  if (!dist) return null;
  const times = [...primary.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
  if (!times.length) return null;
  const km = Number(dist[1]);
  if (!(km > 0)) return null;
  const goalSec = Math.min(...times);
  const currentSec = Math.max(...times);
  return { km, goalSec, currentSec, goalPace: goalSec / km, currentPace: currentSec / km };
}

// Every prescribed key repetition, with its normalised velocity.
function qualityReps(program) {
  const out = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let metres = 0;
    let fastest = null;
    let longest = 0;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || classifyExercise(name).category !== CATEGORY.ENDURANCE) continue;
      const sets = firstNum(cells[parsed.sets]) || 0;
      const d = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
      if (d == null || sets < 2) continue;
      const dist = Number(d);
      metres += dist * sets;
      longest = Math.max(longest, dist);
      const clock = (String(cells[parsed.load] || '').match(/(\d{1,2}):(\d{2})/) || null);
      if (clock) {
        const sec = Number(clock[1]) * 60 + Number(clock[2]);
        const pace = sec / (dist / 1000);
        if (fastest == null || pace < fastest) fastest = pace;
      }
    }
    if (metres > 0) out.push({ week, metres, longest, fastestPace: fastest });
  }
  return out;
}

// --- T3K-01 ------------------------------------------------------------------

export function auditRaceDemandExposure(program, intake = {}) {
  const race = raceProfile(intake);
  if (!race) return [];
  const reps = qualityReps(program);
  if (reps.length < 3) return [];

  const paced = reps.filter((r) => Number.isFinite(r.fastestPace));
  if (paced.length < 2) return [];

  // Race demand means the block moves toward goal velocity, not that it starts
  // there. A block whose quality never gets closer to race pace than it began,
  // and never extends repetition length, is not exposing race demand.
  const first = paced[0];
  const last = paced[paced.length - 1];
  const paceCloser = last.fastestPace < first.fastestPace * 0.995;
  const repsLonger = reps.some((r) => r.longest > reps[0].longest * 1.05);
  const volumeGrew = reps.some((r) => r.metres > reps[0].metres * 1.08);

  if (!paceCloser && !repsLonger && !volumeGrew) {
    return [{
      code: 'COACH_SPEC_V1_T3K01_NO_RACE_DEMAND_PROGRESSION',
      severity: 'hard',
      rule: 'T3K-01',
      goal_pace_s_per_km: Math.round(race.goalPace),
      block: reps.map((r) => ({ week: r.week, metres: r.metres, longest_m: r.longest, pace_s_per_km: r.fastestPace ? Math.round(r.fastestPace) : null })),
      message: `The primary goal is a ${race.km} km race, but across the block the key session never moves toward race demand: repetition length, quality volume and per-repetition velocity all stay flat. Specificity must increase as the athlete approaches performance expression - extend the repetitions, add quality volume, or bring the pace closer to the ${Math.round(race.goalPace)} s/km goal demand.`,
    }];
  }
  return [];
}

// --- T3K-03 (CONTEXT-DEPENDENT -> advisory) ----------------------------------

const QUALITY_VOLUME_FLOOR_M = 2000;
const QUALITY_VOLUME_CEILING_M = 4000;

export function auditQualityVolume(program, intake = {}) {
  const race = raceProfile(intake);
  if (!race) return [];
  const reps = qualityReps(program);
  if (!reps.length) return [];
  const findings = [];
  for (const r of reps) {
    // The final week is a taper by design: reduced quality volume there is the
    // intended shape, not a shortfall.
    if (r.week === 4) continue;
    if (r.metres < QUALITY_VOLUME_FLOOR_M) {
      findings.push({
        code: 'COACH_SPEC_V1_T3K03_QUALITY_VOLUME_LOW',
        severity: 'advisory',
        rule: 'T3K-03',
        week: r.week,
        quality_m: r.metres,
        message: `Week ${r.week} prescribes about ${r.metres} m of key quality work. Roughly ${QUALITY_VOLUME_FLOOR_M}-${QUALITY_VOLUME_CEILING_M} m is a useful trained-athlete framework for a ${race.km} km block, so this may be too little to build race-specific repeatability. This is a contextual default, not a universal minimum - a deliberately reduced or early-phase week is legitimate.`,
      });
    }
  }
  return findings;
}

// --- T3K-08 ------------------------------------------------------------------

// Lower-priority stress: accessories and secondary strength volume, excluding
// the primary endurance work and the loaded carry that serves its own goal.
function lowerPriorityLoad(parsed) {
  let sets = 0;
  const items = [];
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) continue;
    const { category } = classifyExercise(name);
    if (category === CATEGORY.ENDURANCE || category === CATEGORY.LOADED_CARRY) continue;
    const s = firstNum(cells[parsed.sets]);
    if (!Number.isFinite(s)) continue;
    sets += s;
    items.push(name);
  }
  return { sets, items };
}

export function auditSacrificeHierarchy(program, intake = {}) {
  const race = raceProfile(intake);
  if (!race) return [];
  const reps = qualityReps(program);
  if (reps.length < 2) return [];

  const findings = [];
  for (let i = 1; i < reps.length; i++) {
    const prevWeek = reps[i - 1].week;
    const week = reps[i].week;
    // The final week of a block is a legitimate taper: quality volume is
    // expected to fall there by design.
    if (week === 4) continue;

    const qualityFell = reps[i].metres < reps[i - 1].metres * 0.92;
    if (!qualityFell) continue;

    const now = parseWeek(program, week);
    const before = parseWeek(program, prevWeek);
    if (!now || !before) continue;
    const a = lowerPriorityLoad(before);
    const b = lowerPriorityLoad(now);
    if (b.sets >= a.sets) {
      findings.push({
        code: 'COACH_SPEC_V1_T3K08_SACRIFICE_HIERARCHY_INVERTED',
        severity: 'hard',
        rule: 'T3K-08',
        week,
        quality_m_before: reps[i - 1].metres,
        quality_m_after: reps[i].metres,
        lower_priority_sets_before: a.sets,
        lower_priority_sets_after: b.sets,
        message: `Week ${week} cuts the primary ${race.km} km quality session from ${reps[i - 1].metres} m to ${reps[i].metres} m while lower-priority strength and accessory volume holds or rises (${a.sets} to ${b.sets} sets). When recovery is insufficient, remove nonessential accessories, extra hypertrophy, secondary strength volume, secondary ruck progression and surplus easy aerobic work before reducing the key session. Safety overrides this order, but nothing here indicates a safety reason.`,
      });
    }
  }
  return findings;
}

export function auditTacticalHardRules(program, intake = {}) {
  return [
    ...auditRaceDemandExposure(program, intake),
    ...auditQualityVolume(program, intake),
    ...auditSacrificeHierarchy(program, intake),
  ];
}

// Generation-side guidance so the model is told the rules before it writes,
// rather than only judged against them afterwards.
export function buildTacticalHardRuleBrief(intake = {}) {
  const race = raceProfile(intake);
  if (!race) return '';
  return [
    '=== RACE-PRIMARY HARD RULES ===',
    `T3K-01: the primary goal is a ${race.km} km race. Across the block the key session must move toward race demand - longer race-relevant repetitions, more quality volume, or velocity closer to the roughly ${Math.round(race.goalPace)} s/km goal demand. A block whose quality session never changes in any of those dimensions does not expose race demand.`,
    `T3K-03: a primary interval session for a trained athlete usually carries roughly ${QUALITY_VOLUME_FLOOR_M}-${QUALITY_VOLUME_CEILING_M} m of meaningful quality running. Treat that as a default framework, not a rule: an early or deliberately reduced week may sit below it, and should say so.`,
    'T3K-08: if recovery forces something to be cut, cut in this order - nonessential accessories, then extra hypertrophy, then secondary strength volume, then secondary ruck progression, then surplus easy aerobic volume, and only then the key race-specific session. Never reduce the key session while accessory or secondary strength volume holds or rises. Safety overrides this order.',
  ].join('\n');
}
