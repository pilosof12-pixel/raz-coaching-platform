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

// What actually loads bent-arm pulling. A muscle-up is not foundational strength
// and its name carries no "pull", so isPull misses it -- but it is the most
// demanding bent-arm pull in the week, and for an elbow it counts. A front lever
// is pulling too and is deliberately not here: it is straight-arm, and the whole
// point of separating the two is that they load the joint differently.
const loadsBentArmPull = (n) => isPull(n) || /muscle[- ]?up/i.test(String(n || ''));

// An elbow, forearm or biceps signal anywhere in the athlete's own account. The
// provocation pattern decides what comes out first when it flares; this decides
// how often the tissue is asked to work at all, and frequency matters to an
// irritated structure whichever movement irritated it.
function hasElbowSignal(intake) {
  const text = [intake.injuries, JSON.stringify(intake.pain || {})]
    .map((x) => String(x || '')).join(' | ');
  return /\belbow\b|\bforearm\b|\bbiceps\b|epicondyl|brachioradialis/i.test(text);
}
const num = (v) => {
  const m = String(v || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// The movement a goal actually names. "Pull-up" matches the text of a weighted
// pull-up goal too, so the longest match wins or every support row looks primary.
export function goalMovements(program, intake) {
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
    let changedStraightArm = false;

    // Support pulling shares a day that already pulls; it does not add one.
    //
    // Run #142 put the primary work on Monday, Wednesday and Saturday and then a
    // support row on Tuesday and Friday as well, so bent-arm pulling touched
    // every training day. The coach charged it: for an athlete with a recurring
    // medial-elbow signal, four support exposures on top of the primary work are
    // not buying enough to be worth the frequency. A standalone support-pull day
    // is the one that goes -- the exposure on a day that already pulls costs the
    // tissue nothing extra.
    if (hasElbowSignal(intake)) {
      // Scanned from the week's own rows rather than from pullRows, because the
      // movement that matters most here -- the muscle-up -- is excluded from
      // pullRows by construction.
      const anchored = new Set();
      cells.forEach((c) => {
        const name = String(c[parsed.exercise] || '').trim();
        if (!name || isWarmup(name) || !loadsBentArmPull(name)) return;
        if (!goals.has(name.toLowerCase()) && !/muscle[- ]?up/i.test(name)) return;
        anchored.add(String(c[parsed.day] || '').trim());
      });
      const primaryOrSkill = anchored;
      // One weekly exposure, not one per day -- and preferably on a day that
      // already pulls, where it costs the tissue nothing extra. Dropping every
      // support row would leave the week with pulling on the primary days alone
      // and no horizontal balance at all, which is further than the frequency
      // problem warrants.
      const ranked = [...support].sort((a, b) => {
        const aAnchored = primaryOrSkill.has(String(a.c[parsed.day] || '').trim()) ? 0 : 1;
        const bAnchored = primaryOrSkill.has(String(b.c[parsed.day] || '').trim()) ? 0 : 1;
        if (aAnchored !== bAnchored) return aAnchored - bAnchored;
        return (num(a.c[parsed.sets]) || 0) - (num(b.c[parsed.sets]) || 0);
      });
      // Tested on its own. A frequency trim that would leave a session below a
      // real session is not worth having, but it must not take the per-day and
      // intensity rules down with it -- the first version reverted the whole week
      // when this one move was refused, and three tests caught that.
      const candidateDrops = ranked.slice(1).map((x) => x.i);
      if (candidateDrops.length) {
        const trial = rebuild(out, parsed, parsed.rows.filter((_, i) => !candidateDrops.includes(i)));
        if (!brokeSomething(out, trial, intake)) {
          for (const x of ranked.slice(1)) {
            drop.add(x.i);
            moves.push({
              week,
              day: String(x.c[parsed.day] || '').trim(),
              dropped: x.name,
              why: 'bent-arm support pulling beyond one weekly exposure, with an elbow signal in the intake',
            });
          }
        }
      }
    }

    // Straight-arm work does not pile onto the heaviest bent-arm day.
    //
    // Run #142 put Advanced Tuck Planche at four sets of six seconds at RPE 8 on
    // the same day as the heaviest Weighted Pull-up, for an athlete whose stated
    // limiter is the elbow and whose own program says the recovery budget belongs
    // to bent-arm pulling. Straight-arm holds and heavy pulling are not
    // independent categories at that joint. Where the movement also appears
    // elsewhere in the week, the heavy-pull day keeps a maintenance touch and the
    // exposure lives where the skill work already is.
    if (hasElbowSignal(intake)) {
      const STRAIGHT_ARM = /planche|lever|human flag|iron cross/i;
      const cost = (c) => (num(c[parsed.sets]) || 0) * (num(c[rpeCol]) || 0);
      const heaviest = cells
        .filter((c) => {
          const n = String(c[parsed.exercise] || '').trim();
          return n && !isWarmup(n) && isPull(n) && goals.has(n.toLowerCase());
        })
        .sort((a, b) => cost(b) - cost(a))[0];
      const heavyDay = heaviest ? String(heaviest[parsed.day] || '').trim() : null;

      if (heavyDay) {
        const elsewhere = new Set();
        cells.forEach((c) => {
          const n = String(c[parsed.exercise] || '').trim();
          if (!n || isWarmup(n) || !STRAIGHT_ARM.test(n)) return;
          if (String(c[parsed.day] || '').trim() !== heavyDay) elsewhere.add(n.toLowerCase());
        });

        const MAINTENANCE_SETS = 2;
        const MAINTENANCE_RPE = 7;
        for (const c of cells) {
          const n = String(c[parsed.exercise] || '').trim();
          if (!n || isWarmup(n) || !STRAIGHT_ARM.test(n)) continue;
          if (String(c[parsed.day] || '').trim() !== heavyDay) continue;
          // Only where the week carries this work somewhere else. If the heavy
          // day is its only exposure, trimming it would remove the exposure
          // rather than relocate the cost.
          if (!elsewhere.has(n.toLowerCase())) continue;
          const sets = num(c[parsed.sets]);
          const rpe = rpeCol >= 0 ? num(c[rpeCol]) : null;
          if (Number.isFinite(sets) && sets > MAINTENANCE_SETS) {
            c[parsed.sets] = String(MAINTENANCE_SETS);
            moves.push({ week, day: heavyDay, capped: n, sets: [sets, MAINTENANCE_SETS] });
            changedStraightArm = true;
          }
          if (rpeCol >= 0 && Number.isFinite(rpe) && rpe > MAINTENANCE_RPE) {
            c[rpeCol] = String(MAINTENANCE_RPE);
            moves.push({ week, day: heavyDay, capped: n, rpe: [rpe, MAINTENANCE_RPE] });
            changedStraightArm = true;
          }
        }
      }
    }

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

    let changed = drop.size > 0 || changedStraightArm;
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
