// engine/v88_goal_pace.js
//
// If the goal is a time, the block has to visit the pace.
//
// The masters rower's goal is a 2 km erg. She gave us 8:58, which is 2:14.5 per
// 500 m, and across four weeks the fastest thing prescribed was 2:32 -- thirteen
// percent slower than the pace she is training to race, with the Wednesday piece
// identical in every week. The block was safe, progressive in duration, and
// never once specific to the thing being measured.
//
// The bar here is deliberately the athlete's CURRENT race pace, not their
// target. Touching the pace you already race at is the minimum a block aimed at
// that event must do; demanding target pace from week one would be a different
// and much more arguable rule.

import { parseWeek } from './v34_workload_accounting.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join('\n'); }
function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }

// "8:58" -> 538, "13:30" -> 810, "95 min" -> 5700
function seconds(raw) {
  const s = String(raw || '').trim();
  const clock = s.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (clock) {
    return clock[3]
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2]);
  }
  const mins = s.match(/(\d+(?:\.\d+)?)\s*min/i);
  return mins ? Number(mins[1]) * 60 : null;
}

// Distance in kilometres, from "2 km", "500m", "400 m", "10 km".
function km(raw) {
  const s = String(raw || '');
  const k = s.match(/(\d+(?:\.\d+)?)\s*k(?:m|ilometers?)?\b/i);
  if (k) return Number(k[1]);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m(?:eters?|etres?)?\b/i);
  return m ? Number(m[1]) / 1000 : null;
}

// A goal stated as a distance and a time: "2 km erg: 8:58", "3 km: 13:30".
export function pacedGoals(intake = {}) {
  const source = txt([intake.performance_markers, intake.current_numbers, intake.primary_goals]);
  const out = [];
  for (const line of source.split('\n')) {
    const distance = km(line);
    if (!distance) continue;
    const t = seconds(line.replace(/\d+(?:\.\d+)?\s*k?m\b/i, ' '));
    if (!t) continue;
    const perKm = t / distance;
    // Guard against nonsense: a marathon at 60 s/km, a 400 m at 20 min.
    if (perKm < 120 || perKm > 900) continue;
    out.push({ line: line.trim(), distanceKm: distance, seconds: t, secPerKm: perKm });
  }
  // The shortest event is the one whose pace is hardest to reach.
  return out.sort((a, b) => a.secPerKm - b.secPerKm);
}

// Paces the programme actually prescribes, as seconds per kilometre.
export function prescribedPaces(program) {
  const found = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    parsed.rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      const scope = [Number.isInteger(parsed.load) ? cells[parsed.load] : '', cells[parsed.reps]]
        .map((x) => String(x || '')).join(' ');
      // "2:32-2:36/500m", "4:10/km", "1:42 per 400 m"
      for (const m of scope.matchAll(/(\d+:\d{2})(?:\s*-\s*(\d+:\d{2}))?\s*(?:\/|per\s*)\s*(\d+(?:\.\d+)?\s*k?m)/gi)) {
        const unit = km(m[3]);
        if (!unit) continue;
        const best = seconds(m[1]);
        if (best) found.push({ week, name, secPerKm: best / unit, text: m[0] });
      }
    });
  }
  return found;
}

const TOLERANCE = 1.03; // within 3% of race pace counts as visiting it

// Brief-only, like the other coaching-judgement rules. "Add work at race pace"
// is a programming decision, not a mechanical edit, so there is no deterministic
// repair and it must not become a blocking code.
export function collectGoalPaceFlags(program, intake = {}) {
  const goals = pacedGoals(intake);
  if (!goals.length) return [];
  const paces = prescribedPaces(program);
  if (!paces.length) return [];

  const goal = goals[0];
  const fastest = paces.reduce((a, b) => (b.secPerKm < a.secPerKm ? b : a));
  if (fastest.secPerKm <= goal.secPerKm * TOLERANCE) return [];

  const pct = Math.round(((fastest.secPerKm - goal.secPerKm) / goal.secPerKm) * 100);
  return [{
    code: 'V88_GOAL_PACE_NEVER_TOUCHED',
    detail: `The goal is a time -- ${goal.line} -- which is a pace the athlete has to be able to hold. Nothing in these four weeks comes near it: the fastest work prescribed is ${fastest.text} on ${fastest.name}, about ${pct}% slower than the pace they already race at. A block aimed at a timed event has to visit that pace, even briefly and even early, or it is training the athlete for a different event.`,
  }];
}

// The same session, at the same pace, in every week of the block.
export function collectStaticPaceFlags(program, intake = {}) {
  if (!pacedGoals(intake).length) return [];
  const paces = prescribedPaces(program);
  const byName = new Map();
  for (const p of paces) {
    if (!byName.has(p.name)) byName.set(p.name, new Map());
    byName.get(p.name).set(p.week, p.secPerKm);
  }
  const flags = [];
  for (const [name, weeks] of byName) {
    if (weeks.size < 4) continue;
    const values = [...weeks.values()];
    if (new Set(values).size > 1) continue;
    flags.push({
      code: 'V88_PACE_NEVER_MOVES',
      exercise: name,
      detail: `${name} is prescribed at exactly the same pace in all four weeks. Holding a pace while duration grows is a legitimate way to build, but then the block should say that is what it is doing. Otherwise a timed goal is being trained with a number that never moves, and there is nothing for the athlete to chase.`,
    });
  }
  return flags;
}

export function buildGoalPaceBrief(intake = {}) {
  const goals = pacedGoals(intake);
  if (!goals.length) return '';
  const goal = goals[0];
  const per500 = Math.round(goal.secPerKm / 2);
  const mm = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return [
    '* A TIMED GOAL IS A PACE, AND THE BLOCK MUST VISIT IT.',
    `  ${goal.line} is ${mm(goal.secPerKm)} per km, which is ${mm(per500)} per 500 m. That number is the point of the block, so it belongs in the prescription rather than only in the goal.`,
    '  Include work at or near that pace every week -- short intervals early, longer ones as tolerance allows. It does not have to be much, and early on it should not be, but the athlete has to meet the pace they are training to hold.',
    '  Write the paces as numbers the athlete can hold themselves to, and move them across the block. A pace that is identical in all four weeks trains duration, not speed, and if that is deliberate the narrative should say so.',
    '  Where an injury or a return constrains the work, constrain the volume at that pace rather than removing the pace: a smaller dose of the right thing beats a larger dose of something adjacent.',
  ].join('\n');
}
