// engine/endurance_block_repair.js
//
// Four findings that had checks and no answers, on the two athletes the repair
// chain never touched.
//
// The tactical 3 km runner is the worst program the coach has scored (7.6) and
// the repair chain applied literally nothing to it: every one of its five
// findings was detection-only, so the block shipped with all of them. The
// advanced hybrid was the same story with three.
//
// Each repair here takes its number from the athlete's own intake rather than
// from a judgement about training. The ruck distance the athlete already
// tolerates, the goal pace they stated, the frequency they asked for: these are
// facts the program contradicted, and putting a fact back is not coaching.

import { rows, toleratedDistance, goalFamilyTiers } from './coach_rules.js';
import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';
import { THRESHOLDS } from './coach_standard.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const arr = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).map(String);
const secs = (t) => { const m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const RUCK = /ruck|loaded (?:march|carry walk)|backpack carry|weighted vest walk/i;
const RUN = /\brun\b|\brunning\b|interval|tempo|repeat|treadmill/i;

// --- 1. a ruck shorter than the distance the athlete already covers ----------

export function repairRuckDistance(program, intake = {}) {
  const goal = `${arr(intake.secondary_goals).join(' ')} ${arr(intake.primary_goals).join(' ')}`;
  if (!/ruck/i.test(goal)) return { program: String(program || ''), changed: false, moves: [] };
  const tol = toleratedDistance(intake, /ruck/i);
  if (!tol) return { program: String(program || ''), changed: false, moves: [] };

  let out = String(program || '');
  const moves = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '');
      if (isWarmup(name) || !RUCK.test(name)) return;
      const reps = String(row[parsed.reps] || '');
      const explicitKm = Number((reps.match(/(\d+(?:\.\d+)?)\s*km\b/i) || [])[1]);
      // The ruck is usually written as time at a pace rather than a distance --
      // "60 min" at "9:25-9:35/km" is 6.4 km, and a repair that only understood
      // kilometres left the defect exactly where it found it.
      const mins = Number((reps.match(/(\d+(?:\.\d+)?)\s*min/i) || [])[1]);
      const paceText = `${row[parsed.load] || ''} ${reps}`;
      const pm = paceText.match(/(\d{1,2}):(\d{2})\s*(?:-\s*(\d{1,2}):(\d{2}))?\s*\/\s*km/i);
      const paceMin = pm ? (Number(pm[1]) + Number(pm[2]) / 60) : null;
      const km = Number.isFinite(explicitKm) ? explicitKm
        : (Number.isFinite(mins) && paceMin ? mins / paceMin : NaN);
      if (!Number.isFinite(km) || km >= tol.low) return;
      if (!Number.isFinite(explicitKm) && Number.isFinite(mins) && paceMin) {
        const needMins = Math.ceil(tol.low * paceMin);
        row[parsed.reps] = reps.replace(/(\d+(?:\.\d+)?)\s*min/i, `${needMins} min`);
        if (Number.isInteger(parsed.notes)) {
          row[parsed.notes] = `${String(row[parsed.notes] || '').trim()} ${needMins} minutes at this pace is about ${tol.low} km, which is the distance you already ruck with this load without symptoms.`.trim();
        }
        moves.push({ week, from: Number(km.toFixed(1)), to: tol.low });
        changed = true;
        return;
      }
      // The bottom of the tolerated range, never the top: the athlete's own
      // evidence says this distance is already covered without symptoms, and
      // anything beyond it would be a training decision rather than a fact.
      row[parsed.reps] = reps.replace(/(\d+(?:\.\d+)?)\s*km\b/i, `${tol.low} km`);
      if (Number.isInteger(parsed.notes)) {
        row[parsed.notes] = `${String(row[parsed.notes] || '').trim()} Held at ${tol.low} km, which is the distance you already ruck with this load without symptoms.`.trim();
      }
      moves.push({ week, from: km, to: tol.low });
      changed = true;
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 2. quality running that never approaches the goal pace ------------------

export function repairGoalSpeed(program, intake = {}) {
  const goal = arr(intake.primary_goals).join(' ');
  const g = goal.match(/(\d+(?:\.\d+)?)\s*km/i);
  const times = [...goal.matchAll(/(\d{1,2}:\d{2})/g)].map((m) => secs(m[1])).filter(Boolean);
  if (!g || !times.length) return { program: String(program || ''), changed: false, moves: [] };
  const goalSecPerKm = Math.min(...times) / Number(g[1]);
  if (!Number.isFinite(goalSecPerKm) || goalSecPerKm <= 0) return { program: String(program || ''), changed: false, moves: [] };

  // The standard the coach applies: 95% of goal speed by week 3, 97% by week 4.
  const floorFor = (week) => (week >= 4 ? 0.97 : week === 3 ? 0.95 : null);
  // Rounded DOWN, always. Rounding to the nearest second put a week-3 pace at
// 253 s/km against a 252.6 floor, which satisfies nobody: the repair ran, the
// program changed, and the finding stayed exactly where it was.
const mmss = (s) => { const t = Math.floor(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

  let out = String(program || '');
  const moves = [];
  for (let week = 3; week <= 4; week += 1) {
    const floor = floorFor(week);
    const parsed = parseWeek(out, week);
    if (!floor || !parsed) continue;
    const slowestAllowed = goalSecPerKm / floor;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '');
      if (isWarmup(name) || !RUN.test(name)) return;
      // Only a rep prescribed as a distance is quality work; an easy run by
      // duration is not what this standard is about.
      if (!/\d+\s*(?:m|km)\b/i.test(String(row[parsed.reps] || ''))) return;
      const loadCol = Number.isInteger(parsed.load) ? parsed.load : null;
      if (loadCol === null) return;
      const text = String(row[loadCol] || '');
      const per400 = text.match(/(\d{1,2}:\d{2})\s*(?:-\s*(\d{1,2}:\d{2}))?\s*(\/|per)\s*(\d+)\s*m\b(?!in)/i);
      const perKm = text.match(/(\d{1,2}:\d{2})\s*(?:-\s*(\d{1,2}:\d{2}))?\s*(\/|per)\s*km/i);
      if (per400) {
        const sep = per400[3];
        const metres = Number(per400[4]);
        const fastest = secs(per400[1]);
        const current = fastest / (metres / 1000);
        if (current <= slowestAllowed) return;
        const target = slowestAllowed * (metres / 1000);
        // Keep the program's own phrasing. Rewriting "per 600 m" as "/ 600 m"
        // changes the author's voice for no reason and makes a diff look larger
        // than the change actually is.
        row[loadCol] = text.replace(per400[0], `${mmss(target)} ${sep} ${metres} m`);
        moves.push({ week, from: Math.round(current), to: Math.round(slowestAllowed) });
        changed = true;
      } else if (perKm) {
        const current = secs(perKm[1]);
        if (current <= slowestAllowed) return;
        row[loadCol] = text.replace(perKm[0], `${mmss(slowestAllowed)} ${perKm[3]} km`);
        moves.push({ week, from: current, to: Math.round(slowestAllowed) });
        changed = true;
      }
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 3. a movement serving an improvement goal that never moves --------------

export function repairImprovementGoalFlat(program, intake = {}) {
  const tiered = goalFamilyTiers(intake);
  if (!tiered.length) return { program: String(program || ''), changed: false, moves: [] };
  // Primary goals only. Raising a secondary or accessory dose collides with the
  // rule that holds accessory volume while a primary quality advances -- the
  // first version of this ramp broke that test, which is the engine correctly
  // refusing to let two repairs disagree about the same rows.
  const serves = (name) => tiered.some((g) => g.family.test(name) && g.tier === 'primary');

  // Which named movements are identical in every week they appear.
  const byName = new Map();
  for (const r of rows(program)) {
    if (isWarmup(r.name) || !serves(r.name)) continue;
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const flat = [];
  for (const [name, list] of byName) {
    const weeks = [...new Set(list.map((r) => r.week))];
    if (weeks.length < THRESHOLDS.IDENTICAL_WEEKS_DEFECT_AFTER) continue;
    const sig = (w) => list.filter((r) => r.week === w).map((r) => `${r.sets}|${r.reps}|${r.load}`.toLowerCase()).sort().join('~');
    if (!weeks.every((w) => sig(w) === sig(weeks[0]))) continue;
    flat.push(name);
  }
  if (!flat.length) return { program: String(program || ''), changed: false, moves: [] };

  let out = String(program || '');
  const moves = [];
  // Week 1 is the athlete's established dose and stays. Later weeks climb from
  // it, and week 4 holds week 3 rather than peaking into a week that may be a
  // taper -- the smallest change that makes the block progress at all.
  const STEP_KG = 2.5;
  for (let week = 2; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const step = Math.min(week, 3) - 1;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '').trim();
      if (!flat.includes(name)) return;
      // A week that says it is holding is holding on purpose. Week 4 of a block
      // often reads "Hold the best Week 3 level", which is consolidation rather
      // than a flat prescription -- the defect is the three weeks before it. The
      // first version skipped the whole movement when any week said hold, so it
      // never repaired anything that consolidated at the end, which is most of
      // what a good block does.
      if (/maintain|maintenance|held|hold|unchanged|deliberately|consolidat/i.test(String(row[parsed.notes] || ''))) return;
      const loadCol = Number.isInteger(parsed.load) ? parsed.load : null;
      const text = loadCol === null ? '' : String(row[loadCol] || '');
      const kg = text.match(/([+-]?\s*\d+(?:\.\d+)?)\s*kg/i);
      if (kg) {
        const base = Number(String(kg[1]).replace(/\s+/g, ''));
        const next = base + STEP_KG * step;
        row[loadCol] = text.replace(kg[0], `${text.trim().startsWith('+') || String(kg[1]).includes('+') ? '+' : ''}${next} kg`);
        moves.push({ week, movement: name, from: base, to: next });
        changed = true;
        return;
      }
      // Without a number on the bar there is nothing to move deterministically.
      // Adding reps to an assisted one-arm pull-up prescribed at "minimum
      // assistance for clean reps" would be inventing a training decision, not
      // restoring a fact, so these are left for a human and stay reported.
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

export const ENDURANCE_REPAIRS = [repairRuckDistance, repairGoalSpeed, repairImprovementGoalFlat];
