// A consolidation week cannot carry more work than the week it consolidates.
//
// Run #138's block says week 4 is "a true consolidation week: less non-essential
// volume, same movement standards". It shipped with Dip rising from 2x4 and 2x5
// in week 3 to 3x4 and 3x5 in week 4 -- direct pressing volume up fifty per cent
// in the week that was supposed to bring it down. The coach charged 0.20.
//
// Nothing wrote that increase on purpose. The session time-budget repair strips
// a set from the longest movement until the day fits the athlete's stated
// session length, and it works one day at a time with no view of the block. The
// build weeks are the long ones, so they were trimmed and the already-shorter
// consolidation week was not, and the taper inverted underneath a repair that
// was doing its own job correctly.
//
// So the invariant is stated where it belongs, after every repair that can
// change a set count: for each movement, the final week does not exceed the week
// before it. This only ever removes sets, and only from the last week.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';


const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const num = (v) => { const m = String(v || '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };

function setsByMovement(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const out = new Map();
  parsed.rows.forEach((row, i) => {
    const name = String(row[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    const sets = num(row[parsed.sets]);
    if (!Number.isFinite(sets)) return;
    const key = name.toLowerCase();
    if (!out.has(key)) out.set(key, { name, total: 0, rows: [] });
    const e = out.get(key);
    e.total += sets;
    e.rows.push({ i, sets });
  });
  return { parsed, byMovement: out };
}

export function repairConsolidationWeekVolume(program, intake = {}) {
  let out = String(program || '');
  const moves = [];

  // A final week that is the event week is a taper by another name, governed by
  // the competition rules rather than by this one.
  const eventDate = intake.competition_date || intake.event_date || intake.race_date;
  if (eventDate) {
    const days = (new Date(`${String(eventDate).slice(0, 10)}T00:00:00Z`) - Date.now()) / 86400000;
    const eventWeek = Math.ceil(days / 7);
    if (Number.isFinite(eventWeek) && eventWeek <= 4) return { program: out, changed: false, moves };
  }

  const prior = setsByMovement(out, 3);
  const last = setsByMovement(out, 4);
  if (!prior || !last) return { program: out, changed: false, moves };

  const cells = last.parsed.rows.map((c) => [...c]);
  let changed = false;

  for (const [key, entry] of last.byMovement) {
    const ceiling = prior.byMovement.get(key)?.total;
    if (!Number.isFinite(ceiling) || entry.total <= ceiling) continue;

    // Take sets off the largest row first, the way the trimmer that caused this
    // does, and never below a working set.
    let over = entry.total - ceiling;
    const rows = [...entry.rows].sort((a, b) => b.sets - a.sets);
    const from = entry.total;
    let guard = 0;
    while (over > 0 && guard < 200) {
      guard += 1;
      const target = rows.map((r) => ({ r, sets: num(cells[r.i][last.parsed.sets]) || 0 }))
        .filter((x) => x.sets > 1)
        .sort((a, b) => b.sets - a.sets)[0];
      if (!target) break;
      cells[target.r.i][last.parsed.sets] = String(target.sets - 1);
      over -= 1;
      changed = true;
    }
    if (changed) moves.push({ movement: entry.name, from, to: from - (entry.total - ceiling - over), ceiling });
  }

  if (changed) out = rebuild(out, last.parsed, cells);
  return { program: out, changed, moves };
}
