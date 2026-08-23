// engine/v56_primary_day_protection.js
//
// The day before the primary day belongs to the primary day.
//
// Readiness scoring already picks the right primary day: for the Advanced
// Hybrid avatar it ranks Monday 8.5 against Sunday 7.0, Tuesday 4.5 and Friday
// 1.0, because every other gym day follows hard MMA. The program obeyed that
// and put the One-Arm Pull-up and the heavy squat on Monday.
//
// What nothing enforced is the 24 hours in front of it. The engine put a
// secondary Overhead Press 4x4 at RPE 7.5 on Sunday -- self-inflicted fatigue
// immediately before the session the whole block is built around. Readiness
// charges a prior gym day when it scores Monday, but that charge only ever
// informed a brief; no rule acted on it.
//
// So this does not move the primary work. It protects it, by holding the
// pre-primary day's secondary load to a technical dose.

import { parseWeek } from './v34_workload_accounting.js';
import { goalTierFor } from './v52_session_hierarchy.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A heavy exposure the day before the primary day: low reps carried across
// several sets at a real effort. A single technical single, or three sets of
// twelve at RPE 6, is not what steals a primary session.
const HEAVY_REP_CEILING = 6;
const HEAVY_RPE_FLOOR = 7.5;
const HEAVY_SET_FLOOR = 3;

// What the exposure is held to when it has to stay where it is.
const PROTECTED_RPE = '7';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function dayKey(day) {
  const d = String(day || '').trim().toLowerCase().slice(0, 3);
  return WEEKDAYS.includes(d) ? d : null;
}

// The top of a range is the number that decides the cost: "7-7.5" is a set
// the athlete may take to 7.5, not a set capped at 7.
export function topOfRange(raw) {
  const nums = [...String(raw || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : null;
}

// The bottom of a rep range decides whether the exposure is heavy: "1-2 per
// arm" is heavier than "8-12" even though both are ranges.
function bottomOfRange(raw) {
  const nums = [...String(raw || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.min(...nums) : null;
}

function rpeIndex(parsed) {
  return parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
}

export function primaryDayFor(parsed, intake = {}) {
  if (!arr(intake.primary_goals).length) return null;
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) continue;
    if (goalTierFor(name, intake) === 'primary') {
      const day = dayKey(cells[parsed.day]);
      if (day) return day;
    }
  }
  return null;
}

// The scheduled gym day immediately before the primary day, walking backwards
// around a circular week. Sunday precedes Monday.
export function precedingGymDay(days, primary) {
  if (!primary || !days.length) return null;
  const start = WEEKDAYS.indexOf(primary);
  for (let back = 1; back < 7; back += 1) {
    const candidate = WEEKDAYS[(start - back + 7) % 7];
    if (days.includes(candidate)) return candidate;
  }
  return null;
}

function heavyRowsOn(parsed, day, intake) {
  const rpeCol = rpeIndex(parsed);
  const out = [];
  parsed.rows.forEach((cells, index) => {
    if (dayKey(cells[parsed.day]) !== day) return;
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    // A primary exposure on the pre-primary day is a different finding, owned
    // by the hierarchy rules. This one is about secondary work stealing it.
    if (goalTierFor(name, intake) === 'primary') return;
    const reps = bottomOfRange(cells[parsed.reps]);
    const sets = topOfRange(cells[parsed.sets]);
    const rpe = rpeCol >= 0 ? topOfRange(cells[rpeCol]) : null;
    if (reps == null || reps > HEAVY_REP_CEILING) return;
    if (sets == null || sets < HEAVY_SET_FLOOR) return;
    if (rpe == null || rpe < HEAVY_RPE_FLOOR) return;
    out.push({ index, name, reps, sets, rpe });
  });
  return out;
}

export function collectPrePrimaryLoadFlags(program, intake = {}) {
  const gymDays = arr(intake.available_gym_days).map(dayKey).filter(Boolean);
  if (!gymDays.length) return [];
  const flags = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const primary = primaryDayFor(parsed, intake);
    if (!primary) continue;
    const before = precedingGymDay(gymDays, primary);
    if (!before || before === primary) continue;

    for (const row of heavyRowsOn(parsed, before, intake)) {
      flags.push({
        code: 'V56_PRE_PRIMARY_DAY_OVERLOADED',
        week,
        day: before,
        primaryDay: primary,
        exercise: row.name,
        detail: `${row.name} is ${row.sets} x ${row.reps} at RPE ${row.rpe} on ${before}, the day before the ${primary} primary session. Secondary work in the 24 hours before the primary day must be a technical dose.`,
      });
    }
  }
  return flags;
}

export function repairPrePrimaryLoad(program, intake = {}) {
  const gymDays = arr(intake.available_gym_days).map(dayKey).filter(Boolean);
  if (!gymDays.length) return program;
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const primary = primaryDayFor(parsed, intake);
    if (!primary) continue;
    const before = precedingGymDay(gymDays, primary);
    if (!before || before === primary) continue;

    const heavy = heavyRowsOn(parsed, before, intake);
    if (!heavy.length) continue;

    const rpeCol = rpeIndex(parsed);
    if (rpeCol < 0) continue;
    const rows = parsed.rows.map((cells) => cells.slice());

    for (const row of heavy) {
      const cells = rows[row.index];
      cells[rpeCol] = PROTECTED_RPE;
      // Holding the effort without saying why reads as an arbitrary cap, and
      // the athlete is the one who has to believe it.
      if (Number.isInteger(parsed.notes)) {
        const note = String(cells[parsed.notes] || '').trim();
        const reason = `Held at RPE ${PROTECTED_RPE}: this sits the day before the ${primary} primary session, so it is a quality exposure and not a session to chase.`;
        cells[parsed.notes] = note ? `${note} ${reason}` : reason;
      }
    }

    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildPrimaryDayProtectionBrief(intake = {}) {
  const gymDays = arr(intake.available_gym_days).map(dayKey).filter(Boolean);
  if (!gymDays.length || !arr(intake.primary_goals).length) return '';
  return [
    '* PRIMARY DAY PROTECTION: choose the primary-goal day from the concurrent schedule first, then keep the 24 hours in front of it clear.',
    '  The gym day immediately before the primary day carries technical or low-cost work only. Do not place a heavy low-rep secondary exposure there merely because the day is free.',
    '  Reason from the previous 24-48 hours of sport and work stress before assigning primary training. Weekdays have no intrinsic readiness; if the best primary day conflicts with the usual template, change the template.',
  ].join('\n');
}
