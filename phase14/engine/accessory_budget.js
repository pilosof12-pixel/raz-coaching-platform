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
import { parseProgramModel, directGoalExposures } from './program_model.js';
import { collectPrimaryGoalShareFlags } from './primary_goal_share.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const loose = (name) => new RegExp(
  String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?'), 'i',
);

const LOWER = [CATEGORY.KNEE_DOMINANT, CATEGORY.HIP_DOMINANT, CATEGORY.UNILATERAL_LOWER];

// Two slots a week is variety. A third is the same exercise again.
const DUPLICATE_CAP = 2;

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

// Categories where repetition is the point, not waste. Trunk, tissue and GPP
// work is cheap, and the goal's own modality must never be trimmed by a rule
// about accessories -- the Masters block runs three erg pieces in Week 3, which
// is the progression, not a duplicate.
const CHEAP = [CATEGORY.TRUNK, CATEGORY.GPP, CATEGORY.TISSUE_CAPACITY, CATEGORY.ENDURANCE,
  CATEGORY.WARMUP, CATEGORY.SKILL];

// What each work row in this week is, according to the model: its base movement
// and whether it serves a goal the athlete actually named. source_row is 1-based
// over body rows.
function movementIndex(model, intake, week) {
  const byRow = new Map();
  const servesGoal = new Set();
  const w = (model.weeks || []).find((x) => x.week === week);
  if (!w) return { byRow, servesGoal };
  for (const day of w.days || []) {
    for (const session of day.sessions || []) {
      for (const ex of session.exercises || []) {
        if (ex.modality === 'warm_up' || ex.role === 'warm_up') continue;
        const i = Number(ex.source_row) - 1;
        if (Number.isInteger(i)) byRow.set(i, { base: ex.base_movement, name: ex.display_name });
      }
    }
  }
  for (const goal of model.goals || []) {
    for (const exposure of directGoalExposures(model, goal.family, week)) {
      const ex = exposure.exercise || exposure;
      const i = Number(ex.source_row) - 1;
      if (Number.isInteger(i)) servesGoal.add(i);
    }
  }
  return { byRow, servesGoal };
}

export function repairAccessoryBudget(program, intake = {}) {
  let out = String(program || '');
  const moves = [];
  let model = null;
  try { model = parseProgramModel(out, intake); } catch { model = null; }
  // The weeks where the primary goal is being crowded out. Only there does a
  // near-duplicate accessory cost the athlete anything.
  const starvedWeeks = new Set();
  try { for (const f of collectPrimaryGoalShareFlags(out, intake)) starvedWeeks.add(f.week); } catch { /* no share, no scope */ }
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

    // 3. The same movement three times in a week is not three exposures. It is
    //    one exercise written out three times.
    //
    //    Masters Return gave a returning rower Seated Cable Row on Monday,
    //    Seated Cable Row on Wednesday and Cable Row on Thursday -- three slots
    //    of one movement, while the 2 km erg goal he came for got two. The coach
    //    asked for "fewer exercises and slightly more rowing progression", and
    //    said this is exactly where the accessory budget should operate.
    //
    //    Only near-duplicates are read here, by base movement rather than by
    //    name, because "Cable Row" and "Seated Cable Row" are the same exercise
    //    written twice. A movement the athlete named, and anything serving a
    //    named goal, is never a duplicate to be trimmed.
    //    Scoped to the condition the coach actually stated: "when primary
    //    sport/skill exposure is underdeveloped while generic accessories
    //    consume many weekly slots". Without that scope this rule cut Pendlay
    //    Rows out of a weightlifter peaking for a national qualifier, where
    //    heavy pulling is the goal rather than an accessory around it. That
    //    block raises no goal-share flag; Masters Return raises one every week.
    if (model && starvedWeeks.has(week)) {
      const { byRow, servesGoal } = movementIndex(model, intake, week);
      const byBase = new Map();
      for (const r of rows) {
        if (drop.has(r.i) || servesGoal.has(r.i) || !cuttable(r)) continue;
        if (CHEAP.includes(classifyExercise(r.name).category)) continue;
        const base = byRow.get(r.i)?.base;
        if (!base) continue;
        if (!byBase.has(base)) byBase.set(base, []);
        byBase.get(base).push(r);
      }
      for (const [base, group] of byBase) {
        if (group.length <= DUPLICATE_CAP) continue;
        // Trim from the longest day, so the week loses its most crowded slot.
        const ranked = [...group].sort((a, b) => (dayCount.get(b.day) || 0) - (dayCount.get(a.day) || 0));
        for (const r of ranked.slice(0, group.length - DUPLICATE_CAP)) {
          drop.add(r.i);
          moves.push({ week, day: r.day, dropped: r.name, why: `${base} already has ${DUPLICATE_CAP} weekly slots and serves no named goal` });
        }
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
