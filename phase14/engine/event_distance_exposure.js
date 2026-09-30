// A distance goal eventually has to meet its own distance.
//
// Tactical 3K names a 10 km ruck with 20 kg, from 95 min toward 82 min. The
// delivered block gave:
//
//   W1 8 km @ 9:25-9:35/km   W2 8 km @ 9:15-9:25   W3 8 km @ 9:05-9:15   W4 8 km
//
// The pace progresses, which is real work, but the athlete never once covers the
// distance he is being prepared for. The coach:
//
//   "There is pace progression, which is good, but distance never returns to
//    the actual 10 km event distance. Claude should progress one variable at a
//    time, but by Week 3 I want meaningful event-distance exposure... Or retain
//    8 km early and make Week 3 the specific 10 km exposure."
//
// That second option is what this does, because it costs the fewest weeks of
// adaptation and leaves Week 4's reduced volume intact.
//
// Deliberately scoped to loaded carries. "Event-distance exposure" is sane for a
// 10 km ruck sitting on top of 8 km of weekly practice; it is nonsense for a
// marathon, where nobody runs the distance in training. The ratio guard below is
// what keeps this rule away from goals the block is not already close to -- a
// marathon goal against a 20 km long run is more than double, and never flags.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';

export const EVENT_DISTANCE_NEVER_MET = 'V109_EVENT_DISTANCE_NEVER_MET';

const RUCK_MOVEMENT = /\bruck|backpack carry|loaded march|weighted march\b/i;
// "10 km ruck with 20 kg", and the other order too.
const RUCK_GOAL = [
  /(\d+(?:\.\d+)?)\s*km[^.\n]{0,24}\bruck/i,
  /\bruck[^.\n]{0,24}?(\d+(?:\.\d+)?)\s*km/i,
];
// Within reach of the block, or out of it. A 10 km goal over 8 km of practice is
// a step; the same rule against a 6.3 km week would be a 59% jump.
const REACHABLE = 1.5;
const BUILD_WEEKS = [1, 2, 3];

function goalDistanceKm(intake = {}) {
  const text = [intake.primary_goals, intake.secondary_goals, intake.sport, intake.notes]
    .flat().filter(Boolean).map(String).join(' | ');
  for (const re of RUCK_GOAL) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

const kmOf = (raw) => {
  const m = String(raw || '').match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
};

function ruckRows(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rows = [];
  parsed.rows.forEach((cells, i) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!RUCK_MOVEMENT.test(name) || /^\[WARMUP\]/i.test(name)) return;
    const km = kmOf(cells[parsed.reps]);
    if (km) rows.push({ i, cells, name, km });
  });
  return { parsed, rows };
}

export function collectEventDistanceFlags(program, intake = {}) {
  const goalKm = goalDistanceKm(intake);
  if (!goalKm) return [];
  const text = String(program || '');

  const weeks = BUILD_WEEKS.map((w) => ruckRows(text, w)).filter((x) => x && x.rows.length);
  if (!weeks.length) return [];
  const longest = Math.max(...weeks.flatMap((w) => w.rows.map((r) => r.km)));
  if (longest >= goalKm) return [];
  // Out of reach this block: exposing it would be a bigger jump than the goal is
  // worth, and that is a conversation about block length, not a repair.
  if (goalKm > longest * REACHABLE) return [];

  return [{
    code: EVENT_DISTANCE_NEVER_MET,
    goal_km: goalKm,
    longest_km: longest,
    detail: `The goal names ${goalKm} km but no build week asks for more than ${longest} km. `
      + 'Pace progression is real work, but the athlete is never exposed to the distance being prepared for.',
  }];
}

export function normalizeEventDistanceExposure(program, intake = {}) {
  const original = String(program || '');
  if (!collectEventDistanceFlags(original, intake).length) {
    return { program: original, repaired: false, repairs: [] };
  }
  const goalKm = goalDistanceKm(intake);

  const week3 = ruckRows(original, 3);
  if (!week3 || !week3.rows.length) return { program: original, repaired: false, repairs: [] };
  const target = week3.rows.reduce((a, b) => (b.km > a.km ? b : a), week3.rows[0]);

  // One variable at a time: the distance goes up, so the pace comes back to what
  // Week 2 already asked for rather than moving as well.
  const { parsed } = week3;
  const week2 = ruckRows(original, 2);
  const priorLoad = week2 && week2.rows.length && parsed.load != null
    ? String(week2.rows.reduce((a, b) => (b.km > a.km ? b : a), week2.rows[0]).cells[parsed.load] || '').trim()
    : null;

  const rows = parsed.rows.map((cells, i) => {
    if (i !== target.i) return cells;
    const copy = cells.slice();
    copy[parsed.reps] = String(cells[parsed.reps]).replace(/(\d+(?:\.\d+)?)\s*km/i, `${goalKm} km`);
    if (priorLoad) copy[parsed.load] = priorLoad;
    if (parsed.notes != null) {
      copy[parsed.notes] = `Event-distance exposure: the full ${goalKm} km carried at the pace Week 2 already held, so the distance is the only thing that changed this week. `
        + 'Treat the pace as a ceiling rather than a target, and walk the last kilometre in rather than chasing the clock.';
    }
    return copy;
  });

  const out = rebuild(original, parsed, rows);
  if (out === original) return { program: original, repaired: false, repairs: [] };
  return {
    program: out,
    repaired: true,
    repairs: [{ week: 3, exercise: target.name, from: `${target.km} km`, to: `${goalKm} km`, pace_held_from_week: priorLoad ? 2 : null }],
  };
}

export function buildEventDistanceBrief(intake = {}) {
  const goalKm = goalDistanceKm(intake);
  if (!goalKm) return '';
  return [
    '* A LOADED-CARRY DISTANCE GOAL MUST MEET ITS OWN DISTANCE.',
    `  The goal names ${goalKm} km. Getting faster over a shorter carry is real work, but a block that never asks for the event distance leaves the athlete untested at the thing being prepared for.`,
    '  Build to one exposure at the full distance by Week 3, and progress one variable at a time: when the distance goes up, hold the pace where the previous week already had it. Week 4 then carries reduced volume.',
  ].join('\n');
}
