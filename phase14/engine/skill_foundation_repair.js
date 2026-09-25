// A skill day with nothing underneath it is the one gate that had no answer.
//
// Run #129's calisthenics build spent four model calls on
// V38_SKILL_WITHOUT_FOUNDATION and shipped with eight of them. Week 1 Tuesday
// reads handstand kick-up, freestanding handstand push-up negative, wall
// handstand push-up, pistol squat -- an entire upper-body day of skill practice
// with no foundational pulling or pushing at all.
//
// The brief already says not to, in as many words: "Any session containing
// advanced upper-body skill work must also contain real foundational pulling and
// pushing." The model read that and produced the defect anyway, four times, and
// regenerating never fixed it. That is the definition of a gate with no
// converging repair, and for a muscle-up and planche athlete it is the central
// thing to get right rather than a detail.
//
// So the missing layer is added rather than asked for again. Nothing is invented:
// the movement chosen is one the athlete is already doing elsewhere in the same
// block, at the dose it already carries there, so the session gains the strength
// the rule requires and the program gains no movement it did not already own.
//
// Where the program contains no foundational pull or push anywhere at all, this
// declines. That case is not a scheduling mistake, it is a program that never
// had the layer, and writing one from nothing would be composing training.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, ROLE, classifyExercise, isFoundationalStrength, stressSignature } from './v38_movement_taxonomy.js';
import { auditProgramStructure } from './v38_structural_audit.js';
import { rebuild, newRow } from './tsv_rows.js';

const isWarmup = (s) => /^\s*\[WARMUP\]/i.test(String(s || ''));

// Severity-aware, because clearing the hard finding is what raises the advisory
// one. Answering "this week trains no pulling at all" turns that week into one
// the audit can then ask a placement question about, so the advisory count goes
// up by exactly the finding that was just downgraded. Counting raw codes read
// that as breakage and refused the repair that fixed the thing it was called
// for. A blocking finding may never increase; an advisory one may, but only
// where a blocking finding was actually removed.
function brokeSomething(before, after, intake) {
  const findings = (program) => {
    try { return auditProgramStructure(program, intake); }
    catch { return null; }
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
  if (Object.keys(tb).some((c) => (tb[c] || 0) > (ta[c] || 0))) return true;

  const blocking = (l) => l.filter(blocks).length;
  const advisory = (l) => l.length - blocking(l);
  if (advisory(b) > advisory(a) && blocking(b) >= blocking(a)) return true;
  return false;
}

const hasUpperSkill = (names) => names.some((n) => {
  const { category, role } = classifyExercise(n);
  return role === ROLE.SKILL_PRACTICE && category === CATEGORY.SKILL;
});
const isPull = (n) => isFoundationalStrength(n) && /pull|row|chin/i.test(n);
const isPush = (n) => {
  const { category } = classifyExercise(n);
  return isFoundationalStrength(n) && (category === CATEGORY.HORIZONTAL_PUSH || category === CATEGORY.VERTICAL_PUSH);
};

// The athlete's own movements, with the dose they already carry, so the repair
// borrows rather than writes.
function donorsFor(program, test) {
  const seen = new Map();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const row of parsed.rows) {
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !test(name)) continue;
      if (seen.has(name)) { seen.get(name).count += 1; continue; }
      seen.set(name, {
        count: 1,
        load: Number.isInteger(parsed.load) ? String(row[parsed.load] || '') : '',
        sets: String(row[parsed.sets] || ''),
        reps: String(row[parsed.reps] || ''),
        rest: Number.isInteger(parsed.rest) ? String(row[parsed.rest] || '') : '',
        rpe: (() => {
          const c = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
          return c >= 0 ? String(row[c] || '') : '';
        })(),
      });
    }
  }
  // Every candidate, cheapest first. The first version took only the most
  // frequent, which for this athlete was the Weighted Pull-up: adding that to a
  // skill day raised V38_CONSECUTIVE_CONFLICTING_EXPOSURE against the day beside
  // it, the guard refused, and the repair did nothing at all. A lighter exposure
  // of the same pattern answers the rule without the clash, so the repair tries
  // them in turn rather than giving up on the first refusal.
  //
  // Ordering by frequency made the commonest movement the first thing tried, and
  // the commonest movement is the one the block is built around -- the athlete's
  // maximal lift. Once the adjacency reading was corrected the heaviest donor
  // stopped being refused, so it won: the repair proposed a Weighted Pull-up as
  // the "maintenance" layer on a skill day beside a heavy pull day. This layer is
  // support, so the cheapest exposure that satisfies the rule is the right one,
  // and frequency only breaks ties.
  const cost = ([name, dose]) => {
    const sig = stressSignature(name);
    const loaded = /\d+(?:\.\d+)?\s*kg\b/i.test(String(dose.load || '')) ? 2 : 0;
    return sig.upperPull + sig.upperPush + sig.lower + loaded;
  };
  return [...seen.entries()].sort((a, b) => cost(a) - cost(b) || b[1].count - a[1].count);
}

export function repairSkillFoundation(program, intake = {}) {
  let out = String(program || '');
  const moves = [];

  const pullDonors = donorsFor(out, isPull);
  const pushDonors = donorsFor(out, isPush);
  if (!pullDonors.length && !pushDonors.length) return { program: out, changed: false, moves: [] };

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.day)) continue;

    const byDay = new Map();
    parsed.rows.forEach((row, index) => {
      const day = String(row[parsed.day] || '').trim();
      const name = String(row[parsed.exercise] || '').trim();
      if (!day || !name) return;
      if (!byDay.has(day)) byDay.set(day, { names: [], last: index });
      byDay.get(day).last = index;
      if (!isWarmup(name)) byDay.get(day).names.push(name);
    });

    let cells = parsed.rows.map((c) => [...c]);
    let touched = false;

    // What the WEEK is missing, not what each day is missing. Asking every skill
    // session to carry its own foundational pull put a token one-set row on a
    // planche and front-lever day that sat between two days already full of
    // pulling -- junk volume on an athlete being managed for elbow symptoms,
    // added for no reason but to satisfy a gate. The microcycle carries the
    // strength; this repair exists for the week that has none of it at all.
    const weekNames = [...byDay.values()].flatMap((x) => x.names);
    const weekNeedsPull = !weekNames.some(isPull);
    const weekNeedsPush = !weekNames.some(isPush);
    if (!weekNeedsPull && !weekNeedsPush) continue;

    for (const [day, info] of byDay) {
      if (!hasUpperSkill(info.names)) continue;
      const needPull = weekNeedsPull && !info.names.some(isPull);
      const needPush = weekNeedsPush && !info.names.some(isPush);
      if (!needPull && !needPush) continue;
      if ((needPull && !pullDonors.length) || (needPush && !pushDonors.length)) continue;

      // Both layers go in together or neither does: the rule wants pulling AND
      // pushing, so adding one and leaving the other still fails the gate and
      // spends volume for nothing.
      const pullOptions = needPull ? pullDonors : [null];
      const pushOptions = needPush ? pushDonors : [null];
      let applied = null;

      for (const pull of pullOptions) {
        for (const push of pushOptions) {
          let trial = cells.map((c) => [...c]);
          const added = [];
          for (const [donor, kind] of [[pull, 'pulling'], [push, 'pushing']]) {
            if (!donor) continue;
            const [name, dose] = donor;
            // A maintenance dose, not the development dose the movement carries
            // where it is the point of the session. This layer exists to put
            // strength under a skill day, and the coach charged 0.20 on run #129
            // for cumulative elbow load from exactly this kind of support volume
            // on a calisthenics athlete. Half the sets, never below one.
            const sets = Math.max(1, Math.floor((Number(dose.sets) || 1) / 2));
            const row = newRow(parsed, {
              day,
              name,
              load: dose.load,
              sets: String(sets),
              reps: dose.reps,
              rest: dose.rest,
              rpe: dose.rpe,
              note: `Foundational ${kind} under the skill work on this day: the skill drill trains the pattern, this trains the strength it needs. Held at a maintenance dose so it supports the skill rather than competing with it.`,
            });
            const at = trial.map((c, i) => ({ c, i })).filter((x) => String(x.c[parsed.day] || '').trim() === day).pop();
            const insertAt = at ? at.i + 1 : trial.length;
            trial = [...trial.slice(0, insertAt), row, ...trial.slice(insertAt)];
            added.push({ week, day, added: name, kind });
          }
          const candidate = rebuild(out, parsed, trial);
          if (brokeSomething(out, candidate, intake)) continue;
          applied = { trial, added, candidate };
          break;
        }
        if (applied) break;
      }

      if (!applied) continue;
      cells = applied.trial;
      out = applied.candidate;
      moves.push(...applied.added);
      touched = true;
    }

    // Each day was already accepted or rejected on its own above, against the
    // program as it stood at that moment, so there is nothing left to commit.
    void touched;
  }

  return { program: out, changed: moves.length > 0, moves };
}
