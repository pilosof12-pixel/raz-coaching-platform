// A week has to read in the order it is trained.
//
// The adjacency and spread repairs move a session by relabelling which weekday
// it carries, which is the whole point -- nothing is added, removed or
// de-loaded. But they relabel in place, so a week whose sessions were written
// Mon/Tue/Wed/Thu/Fri comes out of the chain as Mon/Wed/Tue/Fri/Sat: correct
// training, printed out of order.
//
// That is not cosmetic. Weekly sequence is how a coach reads recovery spacing,
// and a reviewer should not have to reorder the microcycle in their head before
// judging whether two hard days sit too close together. Run #138 shipped that
// way and the coach charged it.
//
// Rows keep their order within a day; only the day blocks move.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';

const WEEKDAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const rank = (label) => {
  const key = String(label || '').trim().slice(0, 3).toLowerCase();
  const i = WEEKDAY.indexOf(key);
  return i < 0 ? null : i;
};

export function canonicaliseDayOrder(program, intake = {}) {
  void intake;
  let out = String(program || '');
  const moves = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.day)) continue;

    // Blocks in the order they appear, each holding its rows unchanged.
    const blocks = [];
    const at = new Map();
    for (const row of parsed.rows) {
      const label = String(row[parsed.day] || '').trim();
      if (!at.has(label)) { at.set(label, blocks.length); blocks.push({ label, rows: [] }); }
      blocks[at.get(label)].rows.push(row);
    }

    // A program that does not label by weekday -- "Session A", "Day 1" -- has an
    // order of its own and is left exactly as written.
    if (!blocks.length || blocks.some((b) => rank(b.label) === null)) continue;

    const before = blocks.map((b) => b.label);
    const sorted = [...blocks].sort((a, b) => rank(a.label) - rank(b.label));
    const after = sorted.map((b) => b.label);
    if (before.join('|') === after.join('|')) continue;

    out = rebuild(out, parsed, sorted.flatMap((b) => b.rows));
    moves.push({ week, from: before, to: after });
  }

  return { program: out, changed: moves.length > 0, moves };
}
