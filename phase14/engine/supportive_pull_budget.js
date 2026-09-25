// Support has to read as support.
//
// The week has two primary pulling sessions -- Monday and Friday, weighted
// pull-ups at RPE 8 -- and between them run #138 put Inverted Row 3x10 at RPE 8
// on Tuesday, then a light Pull-up AND another Inverted Row 3x8 at RPE 8 on
// Wednesday. That is meaningful bent-arm pulling on four days out of five, at
// the primary session's own intensity, on an athlete whose stated limiter is
// medial elbow irritation. The coach charged it twice.
//
// Nothing here removes the athlete's pulling. Two things are true of supportive
// work and were not true of this week: a support day carries one exposure of a
// pattern rather than two, and support sits below the primary session it is
// supporting rather than level with it. Where the goal movement already has two
// dedicated sessions, the marginal return on a third and fourth full exposure is
// what pays for the elbow.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, classifyExercise, isFoundationalStrength } from './v38_movement_taxonomy.js';
import { rebuild } from './tsv_rows.js';
import { auditProgramStructure } from './v38_structural_audit.js';

const isWarmup = (s) => /^\s*\[WARMUP\]/i.test(String(s || ''));
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const loose = (name) => new RegExp(
  String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?'), 'i',
);
const isPull = (n) => isFoundationalStrength(n) && /pull|row|chin/i.test(n);
const num = (v) => {
  const m = String(v || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// The movement a goal actually names. "Pull-up" matches the text of a weighted
// pull-up goal too, so the longest match wins or every support row looks primary.
function goalMovements(program, intake) {
  const names = new Set();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const row of parsed.rows) {
      const n = String(row[parsed.exercise] || '').trim();
      if (n && !isWarmup(n)) names.add(n);
    }
  }
  const goals = [...arr(intake.primary_goals), ...arr(intake.secondary_goals)].map(String);
  const out = new Set();
  for (const goal of goals) {
    const hits = [...names].filter((n) => loose(n).test(goal)).sort((a, b) => b.length - a.length);
    if (hits.length) out.add(hits[0].toLowerCase());
  }
  return out;
}

export function repairSupportivePullBudget(program, intake = {}) {
  let out = String(program || '');
  const moves = [];
  const goals = goalMovements(out, intake);
  if (!goals.size) return { program: out, changed: false, moves };

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.day)) continue;
    const rpeCol = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
    const cells = parsed.rows.map((c) => [...c]);

    const pullRows = cells
      .map((c, i) => ({ c, i, name: String(c[parsed.exercise] || '').trim() }))
      .filter((x) => x.name && !isWarmup(x.name) && isPull(x.name));

    const primary = pullRows.filter((x) => goals.has(x.name.toLowerCase()));
    const primaryDays = new Set(primary.map((x) => String(x.c[parsed.day] || '').trim()));
    // Only where the pattern already has its own sessions. One primary day plus
    // support is a normal week, not a budget problem.
    if (primaryDays.size < 2) continue;

    // The primary session's own numbers set the ceiling for everything else.
    const primaryRpe = Math.min(...primary.map((x) => num(x.c[rpeCol])).filter(Number.isFinite));
    const primarySets = Math.min(...primary.map((x) => num(x.c[parsed.sets])).filter(Number.isFinite));
    if (!Number.isFinite(primaryRpe) || !Number.isFinite(primarySets)) continue;
    const rpeCeiling = primaryRpe - 1;
    const setCeiling = Math.max(1, primarySets - 1);

    const support = pullRows.filter((x) => !primaryDays.has(String(x.c[parsed.day] || '').trim()));
    const byDay = new Map();
    for (const x of support) {
      const day = String(x.c[parsed.day] || '').trim();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(x);
    }

    const drop = new Set();
    for (const [day, rows] of byDay) {
      if (rows.length < 2) continue;
      // Keep the exposure closest to the goal's own pattern -- a vertical pull
      // under a vertical-pull goal -- and never leave the day with none.
      const ranked = [...rows].sort((a, b) => {
        const va = classifyExercise(a.name).category === CATEGORY.VERTICAL_PULL ? 1 : 0;
        const vb = classifyExercise(b.name).category === CATEGORY.VERTICAL_PULL ? 1 : 0;
        if (va !== vb) return vb - va;
        return (num(a.c[parsed.sets]) || 0) - (num(b.c[parsed.sets]) || 0);
      });
      for (const x of ranked.slice(1)) {
        drop.add(x.i);
        moves.push({ week, day, dropped: x.name, why: 'second supportive pulling exposure on one day' });
      }
    }

    let changed = drop.size > 0;
    for (const x of support) {
      if (drop.has(x.i)) continue;
      const rpe = num(x.c[rpeCol]);
      const sets = num(x.c[parsed.sets]);
      if (rpeCol >= 0 && Number.isFinite(rpe) && rpe > rpeCeiling) {
        cells[x.i][rpeCol] = String(rpeCeiling);
        moves.push({ week, day: String(x.c[parsed.day] || '').trim(), capped: x.name, rpe: [rpe, rpeCeiling] });
        changed = true;
      }
      if (Number.isFinite(sets) && sets > setCeiling) {
        cells[x.i][parsed.sets] = String(setCeiling);
        moves.push({ week, day: String(x.c[parsed.day] || '').trim(), capped: x.name, sets: [sets, setCeiling] });
        changed = true;
      }
    }

    if (changed) out = rebuild(out, parsed, cells.filter((_, i) => !drop.has(i)));
  }

  // Trimming support must not cost the week something structural -- a session
  // that drops below a real session, or a movement category the week needed.
  if (moves.length && brokeSomething(String(program || ''), out, intake)) {
    return { program: String(program || ''), changed: false, moves: [] };
  }

  return { program: out, changed: moves.length > 0, moves };
}

function brokeSomething(before, after, intake) {
  const findings = (p) => {
    try { return auditProgramStructure(p, intake); } catch { return null; }
  };
  const a = findings(before);
  const b = findings(after);
  if (!a || !b) return true;
  const blocks = (f) => f.severity !== 'advisory';
  const tally = (l) => l.filter(blocks).reduce((m, f) => {
    const c = f.code || f.rule;
    return c ? { ...m, [c]: (m[c] || 0) + 1 } : m;
  }, {});
  const ta = tally(a);
  const tb = tally(b);
  return Object.keys(tb).some((c) => (tb[c] || 0) > (ta[c] || 0));
}
