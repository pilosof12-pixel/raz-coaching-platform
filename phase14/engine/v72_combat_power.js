// engine/v72_combat_power.js
//
// A fighter's programme must contain power, not just the word "power".
//
// The reviewed fight camp said "explosive up", "fast crisp drives" and "keep
// force and speed online" eighteen times, and prescribed hip thrusts, rows,
// push-ups and pull-ups. Every exercise in the block was a grind or a carry.
// Striking and takedowns are rate-of-force-development problems; a camp that
// only maintains slow strength maintains the wrong quality.
//
// The qualification matters as much as the rule. Depth jumps, drop jumps and
// heavy bounding are high-eccentric exposures that v70 already refuses in
// competition week, and rightly. Throws, low-volume jumps, Olympic derivatives
// and sled accelerations produce the same speed signal with almost no
// eccentric cost, which is what a fighter in camp can actually afford.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise } from './v38_movement_taxonomy.js';
import { STATE, stateForWeek, eventType, competitionProfile } from './v68_competition_state.js';

// High eccentric cost: real plyometrics that leave soreness.
const HIGH_COST_PLYO = /\b(?:depth jump|drop jump|bounding|hurdle hop|shock method|altitude landing)\b/i;

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' '); }

export function isPowerExposure(name) {
  const n = String(name || '');
  if (isWarmup(n) || HIGH_COST_PLYO.test(n)) return false;
  return classifyExercise(n).category === 'power';
}

// A combat block, at any camp phase. Off-season fighters are not governed.
export function governsCombatPower(intake = {}, now = Date.now()) {
  if (eventType(intake) !== 'combat') return false;
  const profile = competitionProfile(intake, now);
  if (!profile) return false;
  return profile.weeks.some((w) => w.state !== STATE.NORMAL);
}

export function collectCombatPowerFlags(program, intake = {}, now = Date.now()) {
  if (!governsCombatPower(intake, now)) return [];
  const flags = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let work = 0;
    let power = 0;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      work += 1;
      if (isPowerExposure(name)) power += 1;
      if (HIGH_COST_PLYO.test(name) && stateForWeek(intake, week, now) === STATE.COMPETITION_WEEK) {
        flags.push({
          code: 'V72_HIGH_COST_PLYOMETRIC_IN_FIGHT_WEEK',
          week, exercise: name,
          detail: `Week ${week} is fight week and ${name} is a high-eccentric plyometric. Speed work here must cost nothing: throws, low-volume jumps and sled accelerations give the same signal without the soreness.`,
        });
      }
    }
    if (work > 0 && power === 0) {
      flags.push({
        code: 'V72_COMBAT_NO_POWER_EXPOSURE',
        week,
        detail: `Week ${week} of a fight camp contains ${work} exercises and not one develops speed or power. Striking and takedowns are rate-of-force-development qualities; describing a hip thrust as explosive is intent, not a prescription. Include a genuine low-cost power exposure -- a throw, a low-volume jump, an Olympic derivative or a sled acceleration.`,
      });
    }
  }
  return flags;
}

// Chosen for cost and for what the athlete actually has. Rotational throws come
// first because rotational power is what strikes and takedowns are made of.
export const POWER_OPTIONS = [
  { name: 'Medicine Ball Rotational Throw', needs: /med(?:icine)? ?ball/i, sets: '3', reps: '3 per side', rest: '90 sec', rpe: '7',
    note: 'Rotational power for striking and takedown drive. Throw hard, reset fully, and stop the set the moment speed drops.' },
  { name: 'Trap Bar Jump', needs: /trap ?bar/i, sets: '3', reps: '3', rest: '2 min', rpe: '7',
    note: 'Light and fast: this is a speed exposure, not a lift. Land softly, reset every rep, and keep the load low enough that the bar moves quickly.' },
  { name: 'Box Jump', needs: null, sets: '3', reps: '3', rest: '2 min', rpe: '6-7',
    note: 'Step down between reps: the jump is the exposure and the landing is not. Low volume, full recovery, stop while every rep is crisp.' },
];

function chooseExposure(intake) {
  const equipment = `${txt(intake.equipment)} ${txt(intake.training_location)}`;
  return POWER_OPTIONS.find((o) => !o.needs || o.needs.test(equipment)) || POWER_OPTIONS[POWER_OPTIONS.length - 1];
}

export function repairCombatPower(program, intake = {}, now = Date.now()) {
  if (!governsCombatPower(intake, now)) return String(program || '');
  let out = String(program || '');
  const option = chooseExposure(intake);

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;

    const rows = parsed.rows.map((c) => c.slice());
    const named = rows.filter((c) => {
      const n = String(c[parsed.exercise] || '').trim();
      return n && !isWarmup(n);
    });
    if (!named.length) continue;
    if (named.some((c) => isPowerExposure(String(c[parsed.exercise] || '')))) continue;

    // The freshest gym day: the one the week opens with.
    const day = String(named[0][parsed.day] || '').trim();
    if (!day) continue;

    const row = parsed.header.map(() => '');
    row[parsed.day] = day;
    row[parsed.exercise] = option.name;
    if (Number.isInteger(parsed.load)) row[parsed.load] = 'Light, speed-first load';
    row[parsed.sets] = option.sets;
    row[parsed.reps] = option.reps;
    if (Number.isInteger(parsed.rest)) row[parsed.rest] = option.rest;
    const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
    if (rpeCol >= 0) row[rpeCol] = option.rpe;
    if (Number.isInteger(parsed.notes)) row[parsed.notes] = option.note;

    // Power leads the session: it is the quality that needs the freshest slot.
    const at = rows.findIndex((c) => String(c[parsed.day] || '').trim() === day
      && String(c[parsed.exercise] || '').trim() && !isWarmup(String(c[parsed.exercise] || '')));
    rows.splice(at < 0 ? rows.length : at, 0, row);

    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildCombatPowerBrief(intake = {}, now = Date.now()) {
  if (!governsCombatPower(intake, now)) return '';
  return [
    '* POWER IS A PRESCRIPTION, NOT AN ADJECTIVE: striking and takedowns are rate-of-force-development qualities, so a camp that only maintains slow strength maintains the wrong thing.',
    '  Every gym week carries at least one ballistic exposure: a medicine-ball throw, a low-volume jump, an explosive push-up, or an Olympic derivative. Writing "explosive" in the note of a hip thrust does not count.',
    '  Short alactic sled or prowler work is valuable and belongs in a camp, but it is concentric-only and does not substitute for the ballistic exposure above. Have both, and do not let the sled stand in for the jump.',
    '  Choose speed work by its eccentric cost. Throws, jumps that are stepped down from, Olympic derivatives and sled work are almost free. Depth jumps, drop jumps and bounding are not, and have no place in the last two weeks.',
    '  Keep it low volume with full rest, and stop the set the moment bar or body speed drops. Quality is the whole point of the exposure.',
  ].join('\n');
}
