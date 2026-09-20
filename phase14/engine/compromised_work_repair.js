// Put the run after the station it is supposed to be run off.
//
// The coach charges 0.45 for a race block that trains running and stations but
// never together: "running in isolation is not the race demand -- the athlete
// has to resume running after a station." Every Hyrox program we have delivered
// carries this finding, and it has survived the whole repair chain because it
// looked like a finding that needs a session written, which is composing
// training rather than repairing it.
//
// It is not. Run #122's Monday reads Run, Prowler Push, Farmer Carry: the run
// and the stations are both there, on the same day, in the wrong order. Moving
// the existing run row to sit after the last station on that day creates the
// compromised pair without adding one set of work, changing one load, or
// inventing one session. Where a day has no run, or no station, this does
// nothing -- that case really would be composition and is left alone.

import { parseWeek } from './v34_workload_accounting.js';
import { namedComponentsFor } from './coach_standard.js';
import { rebuild } from './tsv_rows.js';

const IS_RUN = /\brun\b|\brunning\b|treadmill/i;
const isWarmup = (s) => /^\s*\[WARMUP\]/i.test(String(s || ''));

// Weeks 1-3 carry a floor; week 4 has none. Matches compromisedWorkMissing.
const FLOORS = [[1, 1], [2, 2], [3, 1]];

function stationMatchers(intake) {
  return namedComponentsFor(intake)
    .filter((c) => !/^(run|swim|bike)$/i.test(c))
    .map((c) => new RegExp(String(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i'));
}

export function repairCompromisedRunning(program, intake = {}) {
  const matchers = stationMatchers(intake);
  if (!matchers.length) return { program: String(program || ''), changed: false, moves: [] };
  const isStation = (n) => matchers.some((re) => re.test(String(n || '')));

  let out = String(program || '');
  const moves = [];

  for (const [week, floor] of FLOORS) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.day)) continue;

    let cells = parsed.rows.map((c) => [...c]);
    const nameOf = (r) => String(r[parsed.exercise] || '').trim();
    const dayOf = (r) => String(r[parsed.day] || '').trim();

    // How many station-then-run pairs already exist this week.
    const countPairs = (rowsArr) => {
      let n = 0;
      let day = '';
      let prevStation = false;
      for (const r of rowsArr) {
        const nm = nameOf(r);
        if (isWarmup(nm)) continue;
        const d = dayOf(r);
        if (d && d !== day) { day = d; prevStation = false; }
        if (prevStation && IS_RUN.test(nm) && !isStation(nm)) n += 1;
        prevStation = isStation(nm);
      }
      return n;
    };

    let guard = 0;
    while (countPairs(cells) < floor && guard < 8) {
      guard += 1;

      // Pick a day that already has a run and a station, where the run is not
      // already sitting behind one.
      const days = [...new Set(cells.map(dayOf).filter(Boolean))];
      let moved = false;
      for (const day of days) {
        const idx = cells.map((r, i) => ({ r, i })).filter((x) => dayOf(x.r) === day && !isWarmup(nameOf(x.r)));
        const runAt = idx.find((x) => IS_RUN.test(nameOf(x.r)) && !isStation(nameOf(x.r)));
        const lastStation = [...idx].reverse().find((x) => isStation(nameOf(x.r)));
        if (!runAt || !lastStation) continue;
        if (runAt.i === lastStation.i + 1) continue;       // already a pair
        if (runAt.i > lastStation.i) continue;             // run is after everything; nothing to gain

        const row = [...cells[runAt.i]];
        if (Number.isInteger(parsed.notes)) {
          const note = String(row[parsed.notes] || '').trim();
          const off = `Run this straight off ${nameOf(cells[lastStation.i])}: resuming running on tired legs is the race demand.`;
          row[parsed.notes] = note ? `${note.replace(/\s*$/, '')} ${off}` : off;
        }
        const without = cells.filter((_, i) => i !== runAt.i);
        const insertAt = without.findIndex((r) => r === cells[lastStation.i]) + 1;
        cells = [...without.slice(0, insertAt), row, ...without.slice(insertAt)];
        moves.push({ week, day, after: nameOf(cells[insertAt - 1]) });
        moved = true;
        break;
      }
      if (!moved) break;
    }

    if (moves.some((m) => m.week === week)) out = rebuild(out, parsed, cells);
  }

  return { program: out, changed: moves.length > 0, moves };
}
