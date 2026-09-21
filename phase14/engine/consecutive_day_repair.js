// engine/consecutive_day_repair.js
//
// Five training days in a row for an athlete who can train any day of the week.
//
// The coach charges this as avoidable clustering, and avoidable is the word
// that matters: the weightlifter has no sport schedule, no fixed gym days and
// no stated constraint of any kind, and the block still put Monday to Friday
// back to back and left the weekend empty. It is ten occurrences across the
// corpus and the brief never moved it, because there is nothing to explain --
// the model simply defaults to a working week.
//
// The repair moves days, never content. Sessions keep their order and every
// row keeps its exercises, loads and notes; only the weekday label changes.
// That is what makes it safe to run on a finished program: a week cannot get
// harder or easier by being spread out.
//
// Two things it must get right, and both cost a program if missed:
//
//   The prose names weekdays. "Heavy clean and jerk Monday, heavy snatch
//   Wednesday, and both heavy again Friday" is in the block summary, and
//   relabelling the table without it leaves the text describing a week that no
//   longer exists -- the coach's own TEXT_CONTRADICTS_TABLE deduction.
//
//   Competition week is left alone. Its days are counted from the event, not
//   from the calendar, and spreading them out moves the taper.

import { parseWeek } from './v34_workload_accounting.js';
import { consecutiveTrainingDays, consecutiveLowerLegDays, lowerLegLoadingDay, rows as allRows, longestRunDays, movementFunction } from './coach_rules.js';
import { competitionWeek } from './v90_competition_week.js';
import { THRESHOLDS } from './coach_standard.js';
import { rebuild } from './tsv_rows.js';

const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FULL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const keyOf = (label) => {
  const m = String(label || '').trim().toLowerCase().match(/^(mon|tue|wed|thu|fri|sat|sun)/);
  return m ? m[1] : null;
};

const combinations = (n, k) => {
  const out = [];
  const walk = (start, picked) => {
    if (picked.length === k) { out.push([...picked]); return; }
    for (let i = start; i < n; i += 1) { picked.push(i); walk(i + 1, picked); picked.pop(); }
  };
  walk(0, []);
  return out;
};

// Cyclic, so Saturday and Sunday are neighbours and so are Sunday and Monday.
const adjacent = (a, b) => { const d = Math.abs(a - b); return d === 1 || d === 6; };

// The spread that moves the fewest sessions. Ties break toward the earlier
// week, so the same input always produces the same calendar.
//
// Two days that train the same pattern and are currently apart must stay apart.
// Without that the tactical block -- Mon, Wed, Thu, Fri, Sat -- was spread by
// pulling Wednesday back to Tuesday, which put its two pulling sessions on
// consecutive days; the pull-stacking repair downstream then resolved the
// collision the only way it knows, by deleting the strict pull-up rows, and the
// block lost the 4x6 -> 4x7 -> 4x8 progression its own summary promises.
// Moving Saturday to Sunday instead costs the same and collides with nothing.
//
// It is deliberately about shared patterns rather than all geometry. Protecting
// every gap left the same block with no legal spread at all, which trades the
// coach's finding for nothing.
// `subset` is a second, stricter run limit applied to some of the days rather
// than all of them: an athlete with impact history may train four days in a row
// but must not LOAD THE LOWER LEG on more than two, and those are different
// questions about the same week. Passing the subset in keeps one solver rather
// than two that would drift.
export function spreadDays(current, limit = THRESHOLDS.MAX_CONSECUTIVE_LIFTING_DAYS, shared = () => false, subset = null) {
  const have = current.map((d) => ORDER.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!have.length) return null;
  const subsetIdx = subset ? have.map((i, n) => (subset.has(ORDER[i]) ? n : -1)).filter((n) => n >= 0) : [];
  const subsetRun = (combo) => longestRunDays(new Set(subsetIdx.map((n) => ORDER[combo[n]]))).length;
  const alreadyFine = longestRunDays(new Set(have.map((i) => ORDER[i]))).length <= limit
    && (!subset || subsetRun(have) <= (subset.limit ?? THRESHOLDS.MAX_CONSECUTIVE_LOWER_LEG_LOADING_DAYS));
  if (alreadyFine) return null;

  let best = null;
  for (const combo of combinations(7, have.length)) {
    if (longestRunDays(new Set(combo.map((i) => ORDER[i]))).length > limit) continue;
    if (subset && subsetRun(combo) > (subset.limit ?? THRESHOLDS.MAX_CONSECUTIVE_LOWER_LEG_LOADING_DAYS)) continue;
    let separationKept = true;
    for (let a = 0; a < have.length && separationKept; a += 1) {
      for (let b = a + 1; b < have.length; b += 1) {
        if (!adjacent(have[a], have[b]) && adjacent(combo[a], combo[b])
          && shared(ORDER[have[a]], ORDER[have[b]])) { separationKept = false; break; }
      }
    }
    if (!separationKept) continue;
    const cost = combo.reduce((sum, idx, i) => sum + Math.abs(idx - have[i]), 0);
    const moved = combo.reduce((n, idx, i) => n + (idx === have[i] ? 0 : 1), 0);
    const key = [cost, moved, ...combo];
    if (!best || key < best.key) best = { key, combo, cost, moved };
    else if (best && key.join() < best.key.join()) best = { key, combo, cost, moved };
  }
  if (!best) return null;
  const map = new Map();
  have.forEach((idx, i) => map.set(ORDER[idx], ORDER[best.combo[i]]));
  return map;
}

// Rewrite weekday words in prose in one pass, so a Thu->Fri, Fri->Sat mapping
// does not carry Thursday all the way to Saturday.
//
// This has to reach the note cells as well as the summary. A row moved to
// Friday was still telling the athlete that "Thursday still sharpens the
// lifts", which is the table and the text describing different weeks.
export function renameInProse(text, map) {
  const alternatives = [...map.keys()].flatMap((k) => [FULL[k], k[0].toUpperCase() + k.slice(1)]);
  const re = new RegExp(`\\b(${alternatives.join('|')})\\b`, 'g');
  return text.replace(re, (word) => {
    const to = map.get(keyOf(word));
    if (!to) return word;
    return /^[A-Z][a-z]{2}$/.test(word) ? to[0].toUpperCase() + to.slice(1) : FULL[to];
  });
}

export function repairConsecutiveTrainingDays(program, intake = {}, now = Date.now()) {
  // Two findings, one calendar. Training days stacked beyond three, and -- for
  // an athlete with impact history -- the lower leg loaded on more than two in
  // a row. A week can satisfy the first and fail the second, so both are solved
  // in the same pass rather than by two repairs taking turns undoing each other.
  const legFlags = consecutiveLowerLegDays(program, intake);
  const weeks = [...new Set([
    ...consecutiveTrainingDays(program, intake).map((f) => f.week),
    ...legFlags.map((f) => f.week),
  ])].sort((a, b) => a - b);
  if (!weeks.length) return { program: String(program || ''), changed: false, moves: [] };
  const flagged = weeks.map((week) => ({ week }));

  const compWeek = competitionWeek(intake, now);
  let out = String(program || '');
  const moves = [];
  // The summary above week 1 describes the block, not a week, so it is
  // rewritten once. Rewriting it per week chained the renames: week 1 turned
  // Thursday into Friday and week 2 turned that same Friday into Saturday, so
  // a support day ended up two days from where its session actually sat.
  let headRenamed = false;

  for (const flag of flagged) {
    const week = flag.week;
    if (week === compWeek) continue;
    const parsed = parseWeek(out, week);
    if (!parsed) continue;

    const present = [];
    for (const cells of parsed.rows) {
      const k = keyOf(cells[parsed.day]);
      if (k && !present.includes(k)) present.push(k);
    }
    const ordered = ORDER.filter((d) => present.includes(d));

    // What each day trains, so the solver knows which gaps carry meaning.
    const functionsByDay = new Map();
    for (const cells of parsed.rows) {
      const k = keyOf(cells[parsed.day]);
      const name = String(cells[parsed.exercise] || '').trim();
      if (!k || !name || /^\s*\[WARMUP\]/i.test(name)) continue;
      const fn = movementFunction(name);
      if (!fn) continue;
      if (!functionsByDay.has(k)) functionsByDay.set(k, new Set());
      functionsByDay.get(k).add(fn);
    }
    const shared = (a, b) => {
      const x = functionsByDay.get(a); const y = functionsByDay.get(b);
      if (!x || !y) return false;
      for (const fn of x) if (y.has(fn)) return true;
      return false;
    };

    // Which of this week's days load the lower leg, so the solver can hold them
    // to their own tighter limit.
    const legDays = new Set(allRows(out)
      .filter((r) => r.week === week && r.day && lowerLegLoadingDay(r))
      .map((r) => r.day));
    const subset = legFlags.some((f) => f.week === week) ? legDays : null;
    if (subset) subset.limit = THRESHOLDS.MAX_CONSECUTIVE_LOWER_LEG_LOADING_DAYS;

    const map = spreadDays(ordered, THRESHOLDS.MAX_CONSECUTIVE_LIFTING_DAYS, shared, subset);
    if (!map) continue;

    const cells = parsed.rows.map((c) => {
      const row = c.map((cell, i) => (i === parsed.day ? cell : renameInProse(String(cell ?? ''), map)));
      const k = keyOf(row[parsed.day]);
      if (k && map.has(k)) {
        const to = map.get(k);
        row[parsed.day] = /^[a-z]/.test(String(c[parsed.day]).trim()) ? to : to[0].toUpperCase() + to.slice(1);
      }
      return row;
    });

    // The prose for this week, and the block summary above week 1, both name
    // days. Rewrite the whole document outside the other weeks' tables.
    const before = out;
    out = rebuild(out, parsed, cells);
    const renamed = [...map.entries()].filter(([from, to]) => from !== to);
    if (renamed.length && !headRenamed) {
      const head = out.slice(0, out.search(/START_WEEK1_TSV/i));
      if (head) {
        out = renameInProse(head, map) + out.slice(head.length);
        headRenamed = true;
      }
    }
    if (out !== before) moves.push({ week, from: ordered, to: ordered.map((d) => map.get(d)) });
  }

  return { program: out, changed: moves.length > 0, moves };
}
