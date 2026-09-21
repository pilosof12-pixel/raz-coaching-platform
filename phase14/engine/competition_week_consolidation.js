// Competition week may lose a day. It may not gain one closer to the event.
//
// The coach charged a HYROX block 0.20 for four straight competition-week days
// and said the same useful exposures fit into three. The engine could not act
// on that, because its own taper rule held competition-week frequency at 70% of
// baseline -- four days for a five-day athlete -- and four sessions inside a
// Day -7 to Day -4 window are necessarily consecutive. There was no legal
// layout, so the week was left alone and the finding stood on every build.
//
// He resolved it by scoping the frequency floor to the taper week and leaving
// competition week free, and by naming the order of sacrifice:
//
//   race-specific intensity and feel, then necessary strength and skill signal,
//   then volume, then low-value exposures, and frequency last.
//
// So this consolidates rather than spreads. Spreading would move a session
// toward Day 0, and the day a session sits on relative to the event is the one
// thing competition week is about -- his own shape ends at Day -4 and puts
// nothing after it. The lowest-value interior day is dissolved into the day
// before it: every prescription survives, the week loses a calendar slot, and
// the run of four breaks without anything moving closer to the race.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';
import { competitionWeek } from './v90_competition_week.js';
import { auditProgramStructure } from './v38_structural_audit.js';
import { isPowerExposure } from './v72_combat_power.js';
import { collectCompetitionWeekFlags } from './v90_competition_week.js';
import { selectProgramType, PROGRAM_TYPE } from './coach_standard.js';

const THRESHOLD = 3;
const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

// Day -7 sorts before Day -4: the countdown runs down to the event.
function countdownOrder(labels) {
  const n = (l) => {
    const m = String(l).match(/day\s*-\s*(\d+)/i);
    return m ? -Number(m[1]) : null;
  };
  const keyed = [...new Set(labels)].map((l) => ({ label: l, at: n(l) })).filter((x) => x.at != null);
  return keyed.sort((a, b) => a.at - b.at).map((x) => x.label);
}

// What the day is worth, in the order he ranked it. A day carrying race
// components or power work is not the one to dissolve.
function valueOf(rows) {
  const names = rows.map((r) => r.name).filter((n) => n && !isWarmup(n));
  let score = 0;
  for (const name of names) {
    if (isPowerExposure(name)) score += 3;
    score += 1;
  }
  return score;
}

export function repairCompetitionWeekConsolidation(program, intake = {}, now = Date.now()) {
  const text = String(program || '');
  if (String(intake.gym_availability_mode || '').toLowerCase() !== 'flexible') {
    return { program: text, changed: false, moves: [] };
  }
  // Only the structure this was derived from.
  //
  // The coach settled it for "the specific multi-component race structure
  // established by these reviews" and warned in the same breath against turning
  // it into a universal rule, because three sessions being right for one HYROX
  // athlete is not a fact about competition weeks. Applied to a weightlifting
  // meet week it took that avatar's stress convergence from fourteen defects to
  // two: a meet week's sessions are the competition lifts, and merging two of
  // them is not a consolidation, it is a different meet.
  if (selectProgramType(intake) !== PROGRAM_TYPE.HYBRID_MULTI_COMPONENT_EVENT) {
    return { program: text, changed: false, moves: [] };
  }
  const week = competitionWeek(intake, now);
  if (!week) return { program: text, changed: false, moves: [] };
  const parsed = parseWeek(text, week);
  if (!parsed) return { program: text, changed: false, moves: [] };

  const byLabel = new Map();
  parsed.rows.forEach((cells, index) => {
    const label = String(cells[parsed.day] || '').trim();
    const name = String(cells[parsed.exercise] || '').trim();
    if (!label || !name) return;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push({ index, name });
  });

  const order = countdownOrder([...byLabel.keys()]);
  if (order.length <= THRESHOLD) return { program: text, changed: false, moves: [] };

  // Interior days only. The opening day carries the week's remaining load and
  // the last is the primer that sits closest to the event; dissolving either
  // changes what the week is for rather than how it is spread.
  const interior = order.slice(1, -1);
  if (!interior.length) return { program: text, changed: false, moves: [] };

  const ranked = interior
    .map((label) => ({ label, value: valueOf(byLabel.get(label) || []) }))
    .sort((a, b) => a.value - b.value || order.indexOf(a.label) - order.indexOf(b.label));

  // Judge the merge against the rules that actually govern this week, not only
  // the structural audit.
  //
  // A first version checked auditProgramStructure alone, merged a day into the
  // one before it on the meet-week program, and made that day too big for the
  // competition-week freshness budget -- V90_SESSION_GROWS_INTO_DAY_ZERO, which
  // that audit does not raise. Clearing a scheduling finding by overloading the
  // day before the event is the opposite of what the consolidation is for.
  const codesOf = (p) => {
    try {
      return [
        ...auditProgramStructure(p, intake).map((f) => f.code || f.rule),
        ...collectCompetitionWeekFlags(p, intake, now).map((f) => f.code),
      ].filter(Boolean);
    } catch { return null; }
  };
  const before = codesOf(text);
  if (!before) return { program: text, changed: false, moves: [] };
  const tally = (list) => list.reduce((m, c) => ({ ...m, [c]: (m[c] || 0) + 1 }), {});

  for (const candidate of ranked) {
    const at = order.indexOf(candidate.label);
    const into = order[at - 1];
    if (!into) continue;
    // Two doses of one movement in a day is not two exposures, it is the same
    // stimulus twice -- and it makes the receiving session bigger without
    // making it worth more. The meet-week program merged an Explosive Push-up
    // onto a day that already had one and grew Day -5 to six rows.
    const receiving = new Set((byLabel.get(into) || [])
      .map((r) => r.name.toLowerCase()).filter((n) => n && !isWarmup(n)));
    const incoming = (byLabel.get(candidate.label) || [])
      .map((r) => r.name.toLowerCase()).filter((n) => n && !isWarmup(n));
    if (incoming.some((n) => receiving.has(n))) continue;

    const cells = parsed.rows.map((c) => [...c]);
    for (const row of byLabel.get(candidate.label) || []) cells[row.index][parsed.day] = into;
    const next = rebuild(text, parsed, cells);
    if (next === text) continue;

    // The week just got denser, so check it did not buy the calendar at the
    // cost of the session.
    const after = codesOf(next);
    if (!after) continue;
    const ta = tally(before);
    const tb = tally(after);
    if (Object.keys(tb).some((code) => (tb[code] || 0) > (ta[code] || 0))) continue;

    return {
      program: next,
      changed: true,
      moves: [{ week, from: candidate.label, into, rows: (byLabel.get(candidate.label) || []).length }],
    };
  }
  return { program: text, changed: false, moves: [] };
}
