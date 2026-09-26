// The third exposure of a pressing movement nobody asked for.
//
// Run #143 put Weighted Dip on Monday 3x5, Wednesday 3x6 and Saturday 3x4 --
// nine weekly work sets of a movement that is not one of this athlete's goals,
// in a week that already carries wall handstand push-ups, freestanding negatives,
// two planche exposures and the muscle-ups the dip is there to support. Both
// reviewers charged the cumulative upper-body load, one scoring elbow/shoulder
// management 7.5 and the other calling the dip volume "approaching diminishing
// returns".
//
// The correction is deliberately small, and it is a volume trim rather than an
// exposure cap. Three dip exposures are not wrong: the movement genuinely
// supports the muscle-up lockout, and the coach said plainly he did not want a
// rule forbidding the third one. What is hard to justify is a full three-set
// dose on the one day that is not anchored by the goal the dip is supporting --
// the deliberately low-cost bridge day. That exposure gives up a set.
//
// Distinct from supportive_pull_budget, which caps support pulling at one weekly
// exposure. That shape applied here would delete two of the three dip exposures
// and take the muscle-up's pressing support with it.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';
import { auditProgramStructure } from './v38_structural_audit.js';
import { goalMovements } from './supportive_pull_budget.js';

const isWarmup = (s) => /^\s*\[WARMUP\]/i.test(String(s || ''));
const num = (v) => {
  const m = String(v || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// Bent-arm pressing that costs the elbow and shoulder a working set. A handstand
// hold is not here: it is a hold, not a press. A planche is not here either --
// it is straight-arm, and the whole point of separating the two is that they load
// the joint differently.
const BENT_ARM_PRESS = /\b(?:dip|push[- ]?up|press[- ]?up|bench press|overhead press|push press)\b/i;
const isBentArmPress = (n) => BENT_ARM_PRESS.test(String(n || '')) && !/\bpallof\b/i.test(String(n || ''));

// Three exposures is where the marginal return starts to go, and nine sets is
// three full doses. Below either, nothing is trimmed.
const MIN_EXPOSURES = 3;
const MIN_WEEKLY_SETS = 9;
const FLOOR_SETS = 2;

function pressExposures(parsed, goals) {
  const byMovement = new Map();
  parsed.rows.forEach((cells, row) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name) || !isBentArmPress(name)) return;
    // A movement the athlete's own goals name is not support, and its volume is
    // the point of the block rather than a cost to be trimmed.
    if (goals.has(name.toLowerCase())) return;
    const sets = num(cells[parsed.sets]);
    if (!Number.isFinite(sets) || sets <= FLOOR_SETS) return;
    const day = String(cells[parsed.day] || '').trim().toLowerCase();
    const key = name.toLowerCase();
    if (!byMovement.has(key)) byMovement.set(key, []);
    byMovement.get(key).push({ row, day, sets, name });
  });
  return byMovement;
}

// Which days carry a movement one of the goals names. The dip is supporting those
// days, so those are the exposures worth keeping whole.
function anchoredDays(parsed, goals) {
  const days = new Set();
  parsed.rows.forEach((cells) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    if (goals.has(name.toLowerCase())) days.add(String(cells[parsed.day] || '').trim().toLowerCase());
  });
  return days;
}

export function collectSupportivePressVolumeFlags(program, intake = {}) {
  const flags = [];
  const goals = goalMovements(program, intake);
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const anchored = anchoredDays(parsed, goals);
    for (const [, exposures] of pressExposures(parsed, goals)) {
      const days = new Set(exposures.map((e) => e.day));
      const total = exposures.reduce((sum, e) => sum + e.sets, 0);
      if (days.size < MIN_EXPOSURES || total < MIN_WEEKLY_SETS) continue;
      const loose = exposures.filter((e) => !anchored.has(e.day));
      if (!loose.length) continue;
      const pick = loose.sort((a, b) => b.sets - a.sets || a.row - b.row)[0];
      flags.push({
        code: 'SUPPORTIVE_PRESS_VOLUME_EXCESS', week, row: pick.row, exercise: pick.name,
        message: `${pick.name} (Week ${week}) carries ${total} work sets across ${days.size} days as support for a goal it does not name. `
          + `Its ${pick.day} exposure is not anchored by a goal movement and should give up a set.`,
      });
    }
  }
  return flags;
}

export function repairSupportivePressVolume(program, intake = {}) {
  let out = String(program || '');
  const repairs = [];
  const goals = goalMovements(out, intake);
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const anchored = anchoredDays(parsed, goals);
    for (const [, exposures] of pressExposures(parsed, goals)) {
      const days = new Set(exposures.map((e) => e.day));
      const total = exposures.reduce((sum, e) => sum + e.sets, 0);
      if (days.size < MIN_EXPOSURES || total < MIN_WEEKLY_SETS) continue;
      const loose = exposures.filter((e) => !anchored.has(e.day));
      if (!loose.length) continue;
      const pick = loose.sort((a, b) => b.sets - a.sets || a.row - b.row)[0];
      const wanted = Math.max(FLOOR_SETS, pick.sets - 1);
      if (wanted === pick.sets) continue;

      const before = out;
      const rows = parsed.rows.map((cells) => cells.slice());
      rows[pick.row][parsed.sets] = setsCell(rows[pick.row][parsed.sets], wanted);
      const candidate = rebuild(out, parsed, rows);
      // One trim must not cost the week a rule it was already keeping.
      if (brokeSomething(before, candidate, intake)) continue;
      out = candidate;
      repairs.push({ type: 'supportive_press_volume_trimmed', week, exercise: pick.name, from: pick.sets, to: wanted });
    }
  }
  return { program: out, repairs };
}

// Keep whatever the cell said around the number -- "3" stays "2", and a cell
// written "3 per side" keeps its qualifier.
function setsCell(raw, wanted) {
  const text = String(raw || '');
  return text.match(/\d+(?:\.\d+)?/) ? text.replace(/\d+(?:\.\d+)?/, String(wanted)) : String(wanted);
}

// The audit the week already passed must still pass. Trimming a set is cheap, but
// it can drop a day below a session-quality or pattern floor, and a repair that
// breaks a rule to satisfy a softer one is how a build stops converging.
function brokeSomething(before, after, intake) {
  const count = (p) => {
    try { return auditProgramStructure(p, intake).length; } catch (e) { return Number.POSITIVE_INFINITY; }
  };
  return count(after) > count(before);
}
