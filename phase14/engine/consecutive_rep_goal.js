// A goal stated as consecutive reps has to be trained as consecutive reps.
//
// The athlete's primary goal is five clean ring muscle-ups and he can currently
// do two. Run #138 programmed 5x1, 6x1, 3x2, 4x1 -- the weekly rep total is
// right and almost none of it is in the form the goal names. Total reps and set
// length are different adaptations, and only one of them is what "five
// consecutive" asks for. The coach charged 0.30 for it twice.
//
// So one weekly exposure trains set length and the other stays quality volume.
// The ladder is his: a top set at current capacity, a second top set the next
// week, one rep beyond capacity in the hardest week, and a consolidation week
// that still holds a set above singles. The rest of the day's reps stay as
// singles, and the day's total never rises -- this redistributes work already
// prescribed rather than adding any.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, ROLE, classifyExercise } from './v38_movement_taxonomy.js';
import { rebuild, newRow } from './tsv_rows.js';

const isWarmup = (s) => /^\s*\[WARMUP\]/i.test(String(s || ''));
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const loose = (name) => new RegExp(
  String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?'), 'i',
);

// A reps cell the athlete reads as a ladder: "2/1/1/1", "2-1-1-1", "3 (1+1+1)".
// The model writes the ladder this way when it writes one itself, and Number()
// on it is NaN. Run #139 scored that day's whole prescription as zero reps,
// decided the OTHER session must be the primary one, and built a second ladder
// there -- so both sessions trained set length when the point of the rule is
// that one does and the other stays quality volume.
export function ladderOf(cell) {
  const text = String(cell || '').trim();
  if (!text) return null;
  const inner = (text.match(/\(([^)]*)\)/) || [])[1] || text;
  const nums = (sep) => {
    const parts = inner.split(sep).map((x) => Number(String(x).trim()));
    return parts.every((n) => Number.isFinite(n) && n > 0) ? parts : null;
  };
  // Slash and plus mean a ladder at two parts. A hyphen usually means a rep
  // RANGE -- "8-10" is eight to ten reps, not a ladder of eight then ten -- so it
  // takes three parts before it reads as one.
  const slashed = /[/+]/.test(inner) ? nums(/[/+]/) : null;
  if (slashed && slashed.length >= 2) return slashed;
  const dashed = /[\u2013\u2014-]/.test(inner) ? nums(/[\u2013\u2014-]/) : null;
  if (dashed && dashed.length >= 3) return dashed;
  return null;
}

// The longest single set a row prescribes, whether written as a number or a ladder.
export function topSetOf(cell) {
  const ladder = ladderOf(cell);
  if (ladder) return Math.max(...ladder);
  // The first number, not the last: "8-10" is a range whose guaranteed set
  // length is eight, and reading the top of a range as the set length would let
  // a range satisfy a rule about how long a set actually is.
  const m = String(cell || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

// The reps a row actually prescribes, given its set count.
function repsInRow(setsCell, repsCell) {
  const ladder = ladderOf(repsCell);
  if (ladder) return ladder.reduce((a, b) => a + b, 0);
  const sets = Number(setsCell) || 0;
  const first = String(repsCell || '').match(/\d+(?:\.\d+)?/);
  return sets * (first ? Number(first[0]) : 0);
}

// The set lengths one exposure should carry, top first, by week.
function ladderFor(week, current) {
  if (week === 2) return [current, current];
  if (week === 3) return [current + 1, current];
  return [current];
}

export function consecutiveRepGoals(program, intake = {}) {
  const text = String(program || '');
  const skills = new Set();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(text, week);
    if (!parsed) continue;
    for (const row of parsed.rows) {
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const { category, role } = classifyExercise(name);
      if (role === ROLE.SKILL_PRACTICE && category === CATEGORY.SKILL) skills.add(name);
    }
  }
  if (!skills.size) return [];

  const capacityText = [
    intake.current_numbers, ...arr(intake.performance_markers),
    ...Object.values(intake.clarification_answers || {}),
  ].map((x) => String(x || '')).join('\n');

  const out = [];
  for (const goal of arr(intake.primary_goals).map(String)) {
    const target = Number((goal.match(/(\d+)\s*(?:clean|strict|consecutive|good|quality)?\s*(?:reps?|repetitions?)\b/i) || [])[1]);
    if (!Number.isFinite(target)) continue;
    for (const name of skills) {
      if (!loose(name).test(goal)) continue;
      // What he can hold in one set today, from his own numbers.
      let current = null;
      for (const line of capacityText.split('\n')) {
        if (!loose(name).test(line)) continue;
        const n = Number((line.match(/(\d+)\s*(?:clean|strict|consecutive|good|quality)?\s*(?:reps?|repetitions?)\b/i) || [])[1]);
        if (Number.isFinite(n)) { current = current === null ? n : Math.max(current, n); }
      }
      // Below two reps the goal is to own the movement at all, and a "set
      // length" ladder built on a single rep is just singles under another name.
      if (!Number.isFinite(current) || current < 2 || target <= current) continue;
      out.push({ name, target, current });
    }
  }
  return out;
}

// Rows the exposure should carry: the ladder, then singles, capped at the total
// the day already prescribes.
function plannedRows(total, week, current) {
  const plan = ladderFor(week, current).filter((n) => n <= total);
  let used = 0;
  const kept = [];
  for (const n of plan) {
    if (used + n > total) break;
    kept.push(n); used += n;
  }
  if (!kept.length) return null;
  const singles = total - used;
  const grouped = [];
  for (const n of kept) {
    const last = grouped[grouped.length - 1];
    if (last && last.reps === n) last.sets += 1; else grouped.push({ sets: 1, reps: n });
  }
  if (singles > 0) grouped.push({ sets: singles, reps: 1 });
  return grouped;
}

export function collectConsecutiveRepGoalFlags(program, intake = {}) {
  const goals = consecutiveRepGoals(program, intake);
  if (!goals.length) return [];
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(String(program || ''), week);
    if (!parsed) continue;
    for (const { name, target, current } of goals) {
      const rows = parsed.rows.filter((r) => String(r[parsed.exercise] || '').trim().toLowerCase() === name.toLowerCase());
      if (!rows.length) continue;
      const longest = Math.max(...rows.map((r) => topSetOf(r[parsed.reps])));
      const wanted = ladderFor(week, current)[0];
      if (longest >= Math.min(wanted, 2)) continue;
      // Only where the repair could answer it. A day whose whole prescription is
      // shorter than one set at current capacity has no set length to
      // redistribute, and flagging it would be a gate outliving its own repair --
      // the shape that killed thirteen paid builds.
      const byDay = new Map();
      for (const r of rows) {
        const day = String(r[parsed.day] || '').trim();
        byDay.set(day, (byDay.get(day) || 0) + repsInRow(r[parsed.sets], r[parsed.reps]));
      }
      if (Math.max(...byDay.values()) < current) continue;
      flags.push({
        code: 'PRIMARY_SKILL_CONSECUTIVE_REP_GOAL_UNTRAINED',
        severity: 'hard',
        week,
        exercise: name,
        longest_set: longest,
        message: `Week ${week} trains ${name} only in sets of ${longest}, but the goal is ${target} consecutive reps and he already holds ${current}. Weekly rep total and set length are different adaptations; at least one exposure each week has to train the form the goal names.`,
      });
    }
  }
  return flags;
}

export function repairConsecutiveRepGoal(program, intake = {}) {
  const goals = consecutiveRepGoals(program, intake);
  let out = String(program || '');
  const moves = [];
  if (!goals.length) return { program: out, changed: false, moves };

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.day)) continue;
    let cells = parsed.rows.map((c) => [...c]);
    let touched = false;

    for (const { name, target, current } of goals) {
      const index = cells
        .map((c, i) => ({ c, i }))
        .filter((x) => String(x.c[parsed.exercise] || '').trim().toLowerCase() === name.toLowerCase());
      if (!index.length) continue;

      // The session that already carries the most of this movement is the one
      // that trains the goal's form; the other stays quality volume.
      const byDay = new Map();
      for (const { c, i } of index) {
        const day = String(c[parsed.day] || '').trim();
        if (!byDay.has(day)) byDay.set(day, { day, rows: [], total: 0 });
        const e = byDay.get(day);
        e.rows.push(i);
        e.total += repsInRow(c[parsed.sets], c[parsed.reps]);
      }
      // Already answered. If any session this week carries a set at or above the
      // length the ladder is for, the requirement is met and a second ladder on
      // the other day is volume nobody asked for.
      const wanted = ladderFor(week, current)[0];
      // Against the full target, not the gate's conservative floor: the gate only
      // asks for a set above singles, but week 3 is meant to reach one rep beyond
      // capacity, and a week already at 2 still has that to do.
      const already = index.some(({ c }) => topSetOf(c[parsed.reps]) >= wanted);
      if (already) continue;

      const primary = [...byDay.values()].sort((a, b) => b.total - a.total)[0];
      if (!primary || primary.total < current) continue;

      const planned = plannedRows(primary.total, week, current);
      if (!planned) continue;

      const existing = primary.rows.map((i) => ({
        sets: Number(cells[i][parsed.sets]) || 0, reps: Number(cells[i][parsed.reps]) || 0,
      }));
      const same = existing.length === planned.length
        && existing.every((e, k) => e.sets === planned[k].sets && e.reps === planned[k].reps);
      if (same) continue;

      const template = cells[primary.rows[0]];
      // The RPE column has no fixed name, so it is found the way newRow finds it.
      // Reading a `parsed.rpe` that does not exist silently wrote an empty Target
      // RPE onto every rebuilt row.
      const rpeCol = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
      const templateRpe = rpeCol >= 0 ? String(template[rpeCol] || '') : '';
      const built = planned.map((p, k) => newRow(parsed, {
        day: String(template[parsed.day] || '').trim(),
        name,
        load: Number.isInteger(parsed.load) ? String(template[parsed.load] || '') : '',
        sets: String(p.sets),
        reps: String(p.reps),
        rest: Number.isInteger(parsed.rest) ? String(template[parsed.rest] || '') : '',
        rpe: templateRpe,
        // The note has to describe the rung it is actually on. In the hardest
        // week the second rung is a double behind a triple, and calling that
        // "the same length" is wrong in the athlete's hands -- the coach caught
        // it on the first build that carried the ladder.
        note: (() => {
          if (p.reps > 1 && k === 0) {
            return `Top set: the longest clean set of the week, and the one that moves the ${target}-rep goal. Stop the set the moment a rep turns soft -- a short clean set counts and a forced one does not.`;
          }
          if (p.reps > 1 && p.reps === planned[0].reps) {
            return `Second set at the same length, taken only if the top set was clean throughout.`;
          }
          if (p.reps > 1) {
            return `Back-off set of ${p.reps} behind the top set of ${planned[0].reps}. Take it only if the top set held its standard; stop here if it did not.`;
          }
          return `Back-off singles at the same standard. Quality volume behind the top set; stop if turnover slows.`;
        })(),
      }));

      const at = primary.rows[0];
      const keep = new Set(primary.rows);
      cells = [
        ...cells.slice(0, at).filter((_, i) => !keep.has(i)),
        ...built,
        ...cells.slice(at + 1).filter((_, i) => !keep.has(at + 1 + i)),
      ];
      moves.push({ week, exercise: name, day: primary.day, from: existing, to: planned });
      touched = true;
    }
    if (touched) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}
