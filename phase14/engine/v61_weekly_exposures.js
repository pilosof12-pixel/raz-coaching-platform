// engine/v61_weekly_exposures.js
//
// What the week actually contains, counted from the prescription.
//
// The Overview reported "4 structured sessions/week" for an athlete scheduled
// Mon/Tue/Thu/Fri/Sun, and "3 structured sessions/week" for one running
// Sessions A through E. Neither was a coaching error: the figure came from
// intake.days_per_week, so the summary was quoting what the athlete asked for
// while the table showed what the coach prescribed. A client reading both on
// one sheet sees a contradiction, and they are right to.
//
// Counting is deterministic, so this never asks the model what its own week
// contains.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise, dayKey } from './v38_movement_taxonomy.js';

const ENDURANCE = new Set(['endurance', 'loaded_carry']);

// A run and a ruck are both conditioning and are not interchangeable: one is
// the event, the other competes with it for the same tissue. Reporting them as
// a single "endurance" figure hid that a week held three runs and a ruck.
const RUCK = /\bruck|backpack carry|weighted carry|loaded carry|sandbag carry\b/i;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

// A day counts once, by the heaviest thing on it: a strength day that finishes
// with an easy jog is a strength day with an endurance exposure, not two days.
export function weeklyExposures(program, week = 1, intake = {}) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;

  const days = new Map();
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    const day = dayKey(cells[parsed.day]);
    if (!name || !day || isWarmup(name)) continue;
    if (!days.has(day)) days.set(day, { strength: 0, endurance: 0 });
    const bucket = days.get(day);
    if (ENDURANCE.has(classifyExercise(name).category)) bucket.endurance += 1;
    else bucket.strength += 1;
  }

  const sportDays = new Set(
    arr(intake.sport_schedule)
      .map((s) => dayKey(s && s.day))
      .filter(Boolean),
  );

  // Exposure counts, not day counts: a day carrying a run and a ruck is one
  // training day but two conditioning exposures, and a coach needs both figures.
  let running = 0;
  let ruck = 0;
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) continue;
    if (!ENDURANCE.has(classifyExercise(name).category)) continue;
    if (RUCK.test(name)) ruck += 1; else running += 1;
  }

  const list = [...days.keys()];
  return {
    total: list.length,
    runningExposures: running,
    ruckExposures: ruck,
    conditioningExposures: running + ruck,
    // A day with any non-endurance work is a strength/GPP exposure.
    strength: list.filter((d) => days.get(d).strength > 0).length,
    endurance: list.filter((d) => days.get(d).endurance > 0).length,
    // Endurance-only days: what an athlete would call "a run day".
    enduranceOnly: list.filter((d) => days.get(d).endurance > 0 && days.get(d).strength === 0).length,
    sport: sportDays.size,
    days: list,
  };
}

// The sentence the Overview should carry, built from the count rather than
// from what the athlete requested.
export function describeExposures(ex) {
  if (!ex || !ex.total) return '';
  const parts = [];
  if (ex.strength) parts.push(`${ex.strength} strength`);
  if (ex.runningExposures) parts.push(`${ex.runningExposures} running`);
  if (ex.ruckExposures) parts.push(`${ex.ruckExposures} ruck`);
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  const sport = ex.sport ? `, plus ${ex.sport} sport session${ex.sport === 1 ? '' : 's'}` : '';
  return `${ex.total} training day${ex.total === 1 ? '' : 's'}/week${detail}${sport}`;
}

// The qualifier matters as much as the number. "4 strength sessions/week" is
// true of a five-day week; "4 structured sessions/week" is not, because
// "structured" names no category and the reader takes it as the whole week.
const CLAIM = /\b(\d+)\s*((?:\w+\s+){0,2}?)(?:sessions?|days?)\s*(?:\/|per\s+)\s*week\b/gi;

const CATEGORY_WORDS = [
  { re: /\b(?:strength|gpp|lifting|gym|resistance)\b/i, key: 'strength' },
  { re: /\b(?:running|run)\b/i, key: 'runningExposures' },
  { re: /\b(?:ruck|carry)\b/i, key: 'ruckExposures' },
  { re: /\b(?:conditioning)\b/i, key: 'conditioningExposures' },
  { re: /\b(?:endurance|aerobic|cardio)\b/i, key: 'enduranceOnly' },
  { re: /\b(?:sport|mma|sparring|practice)\b/i, key: 'sport' },
];

// Which count a claim is entitled to be measured against.
function permittedCounts(qualifier, ex) {
  const named = CATEGORY_WORDS.filter((c) => c.re.test(qualifier)).map((c) => ex[c.key]);
  // An unqualified figure -- "4 sessions/week", "4 structured sessions/week" --
  // reads as the whole week, so only the total will do.
  return named.length ? named : [ex.total];
}

// A stated frequency that does not match the prescription is a contradiction
// the client can see, so it is a rejection rather than a matter of taste.
export function collectFrequencyClaimFlags(program, intake = {}) {
  const ex = weeklyExposures(program, 1, intake);
  if (!ex) return [];
  const narrative = String(program || '').split(/START_WEEK1_TSV/i)[0];
  const flags = [];
  for (const m of narrative.matchAll(CLAIM)) {
    const claimed = Number(m[1]);
    if (permittedCounts(m[2] || '', ex).includes(claimed)) continue;
    flags.push({
      code: 'V61_FREQUENCY_CLAIM_MISMATCH',
      claimed,
      actual: ex.total,
      detail: `The summary states "${m[0].trim()}" but the week prescribes ${describeExposures(ex)}. State which exposures the figure counts, or use the prescribed number.`,
    });
  }
  return flags;
}

export function repairFrequencyClaim(program, intake = {}) {
  const flags = collectFrequencyClaimFlags(program, intake);
  if (!flags.length) return String(program || '');
  const ex = weeklyExposures(program, 1, intake);
  const source = String(program || '');
  const split = source.split(/START_WEEK1_TSV/i);
  if (split.length < 2) return source;
  const narrative = split[0];
  const rest = source.slice(narrative.length);
  return narrative.replace(CLAIM, (whole, n, qualifier) => (
    permittedCounts(qualifier || '', ex).includes(Number(n)) ? whole : describeExposures(ex)
  )) + rest;
}
