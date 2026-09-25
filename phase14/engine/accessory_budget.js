// Work that serves no named goal has to earn its place.
//
// Run #139 gave a calisthenics athlete with two primary upper-body goals and an
// irritable elbow six lower-body exposures across five training days, and a
// Tuesday carrying nine work exercises where every other day carried five or
// six. Nothing in his intake names a lower-body goal, and nothing about a skill
// session improves when it becomes the longest day of the week. The coach
// charged both.
//
// The rule is the one he stated: every accessory must support a named goal,
// address an identified constraint, or supply a movement quality the week is
// missing -- otherwise it comes out before anything else is added.
//
// Two budgets, one principle. A pattern nobody named gets a few exposures a
// week, not one on every training day. And a session built around skill quality
// does not also become the week's longest session, because that is where the
// quality goes.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, ROLE, classifyExercise } from './v38_movement_taxonomy.js';
import { rebuild } from './tsv_rows.js';
import { auditProgramStructure } from './v38_structural_audit.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const loose = (name) => new RegExp(
  String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?'), 'i',
);

const LOWER = [CATEGORY.KNEE_DOMINANT, CATEGORY.HIP_DOMINANT, CATEGORY.UNILATERAL_LOWER];

// A goal names a pattern, not a catalogue entry. "Hold my squat and pulling
// strength" is a lower-body goal, and matching the movement name "Back Squat"
// against that sentence finds nothing -- which stripped squats out of a Hyrox
// racer's block, an athlete whose event is sled pushes and lunges. Patterns are
// matched by the words people actually use for them.
const PATTERN_WORDS = {
  [CATEGORY.KNEE_DOMINANT]: /\bsquat|lunge|leg press|quad|wall ball/i,
  [CATEGORY.UNILATERAL_LOWER]: /\bsquat|lunge|split|pistol|step[- ]?up|single[- ]leg/i,
  [CATEGORY.HIP_DOMINANT]: /deadlift|hinge|hamstring|glute|hip thrust|posterior chain/i,
};

// Everything the athlete said he wants, or said hurts. A movement named in
// either is not an unexplained accessory, whatever pattern it belongs to.
function spokenFor(program, intake) {
  const names = new Set();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const row of parsed.rows) {
      const n = String(row[parsed.exercise] || '').trim();
      if (n && !isWarmup(n)) names.add(n);
    }
  }
  const goalText = [...arr(intake.primary_goals), ...arr(intake.secondary_goals),
    ...arr(intake.maintenance_goals), intake.sport, intake.notes].map(String).join(' | ');
  const constraintText = [intake.injuries, JSON.stringify(intake.pain || {}),
    JSON.stringify(intake.mobility || {})].map((x) => String(x || '')).join(' | ');

  const named = new Set();
  for (const n of names) {
    if (loose(n).test(goalText) || loose(n).test(constraintText)) named.add(n.toLowerCase());
  }
  // A pattern is spoken for if any movement in it is, or if the athlete's own
  // words for the pattern appear anywhere in what he asked for or what hurts.
  const patterns = new Set();
  for (const n of named) {
    const found = [...names].find((x) => x.toLowerCase() === n);
    if (found) patterns.add(classifyExercise(found).category);
  }
  const spoken = `${goalText} | ${constraintText}`;
  for (const [category, words] of Object.entries(PATTERN_WORDS)) {
    if (words.test(spoken)) patterns.add(category);
  }
  return { named, patterns };
}

const carriesUpperSkill = (names) => names.some((n) => {
  const { category, role } = classifyExercise(n);
  return role === ROLE.SKILL_PRACTICE && category === CATEGORY.SKILL;
});

export function repairAccessoryBudget(program, intake = {}) {
  let out = String(program || '');
  const moves = [];
  const { named, patterns } = spokenFor(out, intake);

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.day)) continue;

    const rows = parsed.rows.map((c, i) => ({
      i, day: String(c[parsed.day] || '').trim(), name: String(c[parsed.exercise] || '').trim(),
    })).filter((r) => r.day && r.name && !isWarmup(r.name));
    if (!rows.length) continue;

    const dayCount = new Map();
    for (const r of rows) dayCount.set(r.day, (dayCount.get(r.day) || 0) + 1);
    const days = dayCount.size;
    if (days < 3) continue;

    const cuttable = (r) => !named.has(r.name.toLowerCase());
    const drop = new Set();

    // 1. A pattern nobody named gets a few exposures a week, not one a day.
    //    One per two training days, never fewer than two, never more than three.
    const cap = Math.min(3, Math.max(2, Math.round(days / 2)));
    const lowerRows = rows.filter((r) => LOWER.includes(classifyExercise(r.name).category));
    // An athlete with a race in the block has no unexplained lower body: the
    // event is built out of it. The Hyrox racer lost squats to this rule before
    // the guard existed, which is the clearest possible case of a budget being
    // applied where nothing was over budget.
    const racing = Boolean(intake.competition_date || intake.event_date || intake.race_date
      || /hyrox|marathon|triathlon|race|ruck|obstacle/i.test(`${intake.sport || ''} ${arr(intake.primary_goals).join(' ')}`));
    const lowerIsNamed = racing || LOWER.some((c) => patterns.has(c));
    if (!lowerIsNamed && lowerRows.length > cap) {
      // Keep one of each distinct movement first, so the week keeps its variety,
      // and drop from the longest day so the trim lands where it costs least.
      const keep = new Set();
      const ranked = [...lowerRows].sort((a, b) => (dayCount.get(a.day) || 0) - (dayCount.get(b.day) || 0));
      for (const r of ranked) {
        const key = r.name.toLowerCase();
        if (keep.size < cap && ![...keep].some((k) => k === key)) keep.add(key);
      }
      const kept = new Set();
      for (const r of ranked) {
        const key = r.name.toLowerCase();
        if (keep.has(key) && !kept.has(key) && kept.size < cap) { kept.add(key); continue; }
        if (!cuttable(r)) continue;
        drop.add(r.i);
        moves.push({ week, day: r.day, dropped: r.name, why: 'lower-body exposure beyond the weekly budget for a pattern no goal names' });
      }
    }

    // 2. A skill session is not also the week's longest session.
    const lengths = [...dayCount.entries()];
    for (const [day, count] of lengths) {
      const names = rows.filter((r) => r.day === day).map((r) => r.name);
      if (!carriesUpperSkill(names)) continue;
      const others = lengths.filter(([d]) => d !== day).map(([, n]) => n).sort((a, b) => a - b);
      if (!others.length) continue;
      const median = others[Math.floor(others.length / 2)];
      const ceiling = Math.max(6, median);
      let over = count - [...drop].filter((i) => rows.find((r) => r.i === i)?.day === day).length - ceiling;
      if (over <= 0) continue;
      // Accessories first, and among them the ones furthest from the day's point.
      const candidates = rows
        .filter((r) => r.day === day && !drop.has(r.i) && cuttable(r))
        .filter((r) => classifyExercise(r.name).role !== ROLE.SKILL_PRACTICE);
      for (const r of candidates) {
        if (over <= 0) break;
        drop.add(r.i);
        over -= 1;
        moves.push({ week, day, dropped: r.name, why: 'skill session longer than the week around it' });
      }
    }

    if (drop.size) out = rebuild(out, parsed, parsed.rows.filter((_, i) => !drop.has(i)));
  }

  if (moves.length && brokeSomething(String(program || ''), out, intake)) {
    return { program: String(program || ''), changed: false, moves: [] };
  }
  return { program: out, changed: moves.length > 0, moves };
}

function brokeSomething(before, after, intake) {
  const findings = (p) => { try { return auditProgramStructure(p, intake); } catch { return null; } };
  const a = findings(before); const b = findings(after);
  if (!a || !b) return true;
  const blocks = (f) => f.severity !== 'advisory';
  const tally = (l) => l.filter(blocks).reduce((m, f) => {
    const c = f.code || f.rule;
    return c ? { ...m, [c]: (m[c] || 0) + 1 } : m;
  }, {});
  const ta = tally(a); const tb = tally(b);
  return Object.keys(tb).some((c) => (tb[c] || 0) > (ta[c] || 0));
}
