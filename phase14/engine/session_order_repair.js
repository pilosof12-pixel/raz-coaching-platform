// Reorder whole sessions across the week when adjacency is the only defect.
//
// V38_CONSECUTIVE_CONFLICTING_EXPOSURE is a blocking gate that had no repair
// able to converge. The one thing that touched it, v50, deletes a pull off the
// lighter of the two clashing days, and on run #130's calisthenics build it had
// nothing legal to delete: Monday's side of the clash is a Weighted Pull-up,
// which is a primary goal movement, and Tuesday's only foundational pull sits
// under a handstand and planche session. Deleting it manufactured four
// V38_SKILL_WITHOUT_FOUNDATION findings that the foundation repair could not
// undo, because re-adding a pull recreated the clash. Four model calls and 649s
// later the build shipped the defects.
//
// The clash was never about content. Both sessions are correct; they are simply
// next to each other. Week 1 read Mon pull / Tue skill / Wed legs, and swapping
// the Tuesday and Wednesday sessions clears all four weeks with nothing added,
// nothing removed and nothing de-loaded.
//
// So this repair changes no exercise, set, rep or load. It permutes which
// weekday each session is labelled with, over exactly the days the week already
// uses, and keeps the permutation that raises the fewest clashes.
//
// Two invariants make the result coachable rather than merely legal:
//
//   - The session on the earliest training day stays there. The coach places
//     the primary goal early in the week and charges a block that buries it, so
//     a permutation that wins on adjacency by moving the primary session to
//     Saturday is not a win.
//   - One permutation is applied to every week. Solving each week separately
//     is cheaper and produces a block whose skill day wanders -- Tuesday in
//     week 1, Wednesday in week 2 -- which is a different finding.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';
import { dayStressAggregates, circularClashes, auditProgramStructure } from './v38_structural_audit.js';
import { renameInProse } from './consecutive_day_repair.js';

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Whose calendar is it?
//
// Only an athlete with nothing fixed can have their sessions relabelled. One
// with named gym days or a sport schedule has a week that belongs to a gym
// timetable or a team, and moving a session off Tuesday for them is not a
// scheduling improvement, it is a session they cannot attend. The first version
// of this repair skipped that question and swapped Tuesday and Thursday on the
// Advanced Hybrid athlete, who trains on fixed days -- clearing the adjacency
// clash and raising ADVANCED_HYBRID_CALENDAR_DRIFT in its place.
function calendarIsOurs(intake) {
  if (arr(intake.available_gym_days).length) return false;
  if (arr(intake.sport_schedule).length) return false;
  const mode = String(intake.gym_availability_mode || '').toLowerCase();
  return mode === '' || mode === 'flexible';
}

// Did the new layout raise anything the old one did not?
//
// Adjacency is what this repair aims at, but it is not the only rule that reads
// the day column, so clearing the target while breaking a neighbour has to be
// caught here rather than by the gate four model calls later.
function brokeSomething(before, after, intake) {
  const count = (program) => {
    try {
      return auditProgramStructure(program, intake).map((f) => f.code || f.rule).filter(Boolean);
    } catch { return null; }
  };
  const a = count(before);
  const b = count(after);
  if (!a || !b) return true; // cannot tell, so do not risk it
  const tally = (list) => list.reduce((m, c) => ({ ...m, [c]: (m[c] || 0) + 1 }), {});
  const ta = tally(a);
  const tb = tally(b);
  return Object.keys(tb).some((code) => (tb[code] || 0) > (ta[code] || 0));
}

const keyOf = (label) => {
  const m = String(label || '').trim().toLowerCase().match(/^(mon|tue|wed|thu|fri|sat|sun)/);
  return m ? m[1] : null;
};

function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

// Re-key a week's aggregates under a candidate labelling, so a permutation is
// scored without reparsing the program 120 times.
function relabel(byDay, order, perm) {
  const moved = new Map();
  for (const [day, acc] of byDay) {
    const i = order.indexOf(day);
    moved.set(i < 0 ? day : perm[i], acc);
  }
  return moved;
}

export function repairSessionAdjacency(program, intake = {}) {
  const text = String(program || '');
  if (!calendarIsOurs(intake)) return { program: text, changed: false, moves: [] };
  const weeks = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(text, week);
    if (!parsed) continue;
    weeks.push({ week, parsed, byDay: dayStressAggregates(parsed) });
  }
  if (!weeks.length) return { program: text, changed: false, moves: [] };

  const before = weeks.flatMap((w) => circularClashes(w.byDay, w.week));
  if (!before.length) return { program: text, changed: false, moves: [] };

  // Every week has to use the same days, or one permutation cannot describe the
  // block. A week that already differs is a different problem and this repair
  // has no opinion about it.
  const order = [...weeks[0].byDay.keys()];
  const signature = (days) => [...days].sort().join(',');
  if (weeks.some((w) => signature(w.byDay.keys()) !== signature(order))) {
    return { program: text, changed: false, moves: [] };
  }
  // Seven days is 5040 layouts scored against cached aggregates, which is
  // cheap; beyond that the week is not a week.
  if (order.length > 7) return { program: text, changed: false, moves: [] };

  const anchor = order[0];
  let best = null;
  for (const perm of permutations([...order])) {
    if (perm[0] !== anchor) continue;
    const clashes = weeks.reduce(
      (n, w) => n + circularClashes(relabel(w.byDay, order, perm), w.week).length,
      0,
    );
    const moved = perm.reduce((n, day, i) => n + (day === order[i] ? 0 : 1), 0);
    // Fewest clashes, then fewest sessions disturbed, then the earliest layout
    // alphabetically so the same program always produces the same week.
    const key = [clashes, moved, perm.join(',')];
    if (!best) { best = { key, perm, clashes }; continue; }
    for (let i = 0; i < key.length; i += 1) {
      if (key[i] === best.key[i]) continue;
      if (key[i] < best.key[i]) best = { key, perm, clashes };
      break;
    }
  }
  if (!best || best.clashes >= before.length) return { program: text, changed: false, moves: [] };

  const map = new Map(order.map((day, i) => [day, best.perm[i]]));
  if ([...map.entries()].every(([from, to]) => from === to)) {
    return { program: text, changed: false, moves: [] };
  }

  let out = text;
  for (const week of weeks.map((w) => w.week)) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => {
      const row = c.map((cell, i) => (i === parsed.day ? cell : renameInProse(String(cell ?? ''), map)));
      const k = keyOf(row[parsed.day]);
      if (k && map.has(k)) {
        const to = map.get(k);
        row[parsed.day] = /^[a-z]/.test(String(c[parsed.day]).trim()) ? to : to[0].toUpperCase() + to.slice(1);
      }
      return row;
    });
    out = rebuild(out, parsed, cells);
  }

  // The block summary above week 1 names days too, and a table that disagrees
  // with the text above it is its own finding.
  const head = out.slice(0, out.search(/START_WEEK1_TSV/i));
  if (head) out = renameInProse(head, map) + out.slice(head.length);

  // Sessions only changed their label, so nothing about the week's content can
  // have moved -- but say so in the terms the gate uses, and decline if the
  // layout it chose is not actually better.
  const after = [1, 2, 3, 4]
    .map((week) => parseWeek(out, week))
    .filter(Boolean)
    .flatMap((parsed, i) => circularClashes(dayStressAggregates(parsed), i + 1));
  if (after.length >= before.length) return { program: text, changed: false, moves: [] };
  if (brokeSomething(text, out, intake)) return { program: text, changed: false, moves: [] };

  return {
    program: out,
    changed: true,
    moves: [{ from: order, to: best.perm, clashes_before: before.length, clashes_after: after.length }],
  };
}
