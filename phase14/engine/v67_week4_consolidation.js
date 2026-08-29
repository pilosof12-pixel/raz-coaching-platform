// engine/v67_week4_consolidation.js
//
// Week 4 consolidates. The rule already knows by how much.
//
// ADVANCED_HYBRID_WEEK4_NOT_CONSOLIDATING requires three things of the last
// week: fewer strength sets than Week 3, no higher top RPE, and a shorter long
// run. It computes its own targets when it refuses -- 85% of the Week 3 set
// count, 90% of the Week 3 long run -- and prints them in the message. What it
// never had was anything to apply them.
//
// It fired in run #87 attempt 3 and is reproducible offline: inflate Week 4 and
// the repair chain leaves the finding untouched. Every quantity involved is
// arithmetic the engine has already done, so this is a repair rather than a
// regeneration.

import { parseWeek } from './v34_workload_accounting.js';
import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';

const CONSOLIDATION_SET_RATIO = 0.85;
const CONSOLIDATION_RUN_RATIO = 0.9;

function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function isRun(name) { return /\brun(?:ning)?\b/i.test(String(name || '')); }
function firstInt(v) { const m = String(v || '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }
function topOf(v) {
  const n = [...String(v || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return n.length ? Math.max(...n) : null;
}
function rpeIndex(parsed) {
  return parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
}

function weekFacts(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rpeCol = rpeIndex(parsed);
  let sets = 0;
  let topRpe = 0;
  let longRun = null;
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    if (isRun(name)) {
      const km = String(cells[parsed.reps] || '').match(/(\d+(?:\.\d+)?)\s*km\b/i);
      if (km && longRun == null) longRun = { index, km: Number(km[1]) };
      return;
    }
    sets += firstInt(cells[parsed.sets]) || 0;
    if (rpeCol >= 0) {
      const r = topOf(cells[rpeCol]);
      if (r != null) topRpe = Math.max(topRpe, r);
    }
  });
  return { parsed, rpeCol, sets, topRpe, longRun };
}

// Scoped to the athletes the rule governs. The first version applied its
// arithmetic to any program with a Week 3 and a Week 4, including a synthetic
// two-week fixture with an empty intake -- where it changed a prescription the
// note repair had just described, so the note said "hold the set count" while
// the sets came down. Two repairs fixing one contradiction in opposite
// directions is worse than either alone.
export function governsWeek4(intake = {}) {
  try {
    return Boolean(isHighConcurrencyHybrid(intake));
  } catch (_) {
    return false;
  }
}

export function needsConsolidation(program, intake = {}) {
  if (!governsWeek4(intake)) return false;
  const w3 = weekFacts(program, 3);
  const w4 = weekFacts(program, 4);
  if (!w3 || !w4) return false;
  const runTooLong = w3.longRun && w4.longRun && w4.longRun.km >= w3.longRun.km;
  return !(w4.sets < w3.sets) || w4.topRpe > w3.topRpe || Boolean(runTooLong);
}

export function repairWeek4Consolidation(program, intake = {}) {
  const source = String(program || '');
  if (!needsConsolidation(source, intake)) return source;

  const w3 = weekFacts(source, 3);
  const w4 = weekFacts(source, 4);
  if (!w3 || !w4) return source;

  const rows = w4.parsed.rows.map((c) => c.slice());
  const { parsed, rpeCol } = w4;

  // Sets: take one at a time off whichever strength row carries the most, so
  // the week thins evenly instead of one movement being gutted.
  const strengthRows = [];
  rows.forEach((cells, i) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (name && !isWarmup(name) && !isRun(name)) strengthRows.push(i);
  });
  const setsOf = (i) => firstInt(rows[i][parsed.sets]) || 0;
  const target = Math.max(1, Math.floor(w3.sets * CONSOLIDATION_SET_RATIO));
  let total = strengthRows.reduce((n, i) => n + setsOf(i), 0);
  let guard = 0;
  while (total > target && guard < 500) {
    guard += 1;
    const biggest = strengthRows.filter((i) => setsOf(i) > 1).sort((a, b) => setsOf(b) - setsOf(a))[0];
    if (biggest == null) break;
    rows[biggest][parsed.sets] = String(setsOf(biggest) - 1);
    total -= 1;
  }

  // Effort: Week 4 may not out-rank Week 3's hardest set.
  if (rpeCol >= 0 && w4.topRpe > w3.topRpe && w3.topRpe > 0) {
    for (const cells of rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const r = topOf(cells[rpeCol]);
      if (r != null && r > w3.topRpe) cells[rpeCol] = String(w3.topRpe);
    }
  }

  // The long run comes down too, to the ratio the rule names.
  if (w3.longRun && w4.longRun && w4.longRun.km >= w3.longRun.km) {
    const runTarget = Math.max(1, Math.floor(w3.longRun.km * CONSOLIDATION_RUN_RATIO));
    const cells = rows[w4.longRun.index];
    cells[parsed.reps] = String(cells[parsed.reps]).replace(/\d+(?:\.\d+)?\s*km/i, `${runTarget} km`);
    if (Number.isInteger(parsed.notes)) {
      const note = String(cells[parsed.notes] || '').trim();
      const reason = `Week 4 consolidates: distance comes down from ${w3.longRun.km} km so the block finishes fresher than it peaked.`;
      if (!note.includes('Week 4 consolidates')) cells[parsed.notes] = note ? `${note} ${reason}` : reason;
    }
  }

  const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
  const out = source.replace(parsed.re, `$1${rebuilt}$3`);
  // Never hand back something that still fails the rule it was meant to clear.
  return needsConsolidation(out, intake) ? source : out;
}
