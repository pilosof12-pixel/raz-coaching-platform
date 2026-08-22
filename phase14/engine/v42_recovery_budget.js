// Recovery-budget logic.
//
// Weekly stress is not gym volume. An athlete with five sport sessions, a long
// run and a ruck has already spent most of the week's recovery before the plan
// writes a single set, and the plan does not get to pretend otherwise. These
// rules read the measured week from v42_weekly_load.js and check three things:
// that a day's own claims match what it actually prescribes, that the heaviest
// gym work is not stacked onto the athlete's hardest sport day, and that the
// week's total is reported honestly.
//
// Only the first is a hard violation. A label that contradicts the prescription
// is an objective error the athlete is actively misled by. Where to place heavy
// work against a sport week is a coaching judgement with defensible answers, so
// it is raised for review rather than rejected.

import { weekLoadProfile, fixedWeeklyCommitmentLoad, sportScheduleByDay, statedRecoveryQuality } from './v42_weekly_load.js';
import { CATEGORY, dayKey } from './v38_movement_taxonomy.js';

// Words that promise the athlete a cheap day or a cheap row.
const LOW_COST_CLAIM = /\b(?:low[- ]cost|low[- ]fatigue|minimal|optional|primer|easy day|recovery day|recovery-contingent|deload|light day|non-?fatiguing|technique[- ]only)\b/i;
// A claim is not a promise when it is explicitly conditional on the athlete.
const CONDITIONAL = /\b(?:if|only if|when|unless|provided|should you|in case|may|can|earned|extra)\b/i;

const PRIMARY_PATTERNS = new Set([CATEGORY.KNEE_DOMINANT, CATEGORY.HIP_DOMINANT, CATEGORY.VERTICAL_PULL, CATEGORY.VERTICAL_PUSH]);

function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

// A day is expensive when it carries real primary work, not when it is merely long.
function primarySetsOn(day) {
  return day.rows.filter((r) => PRIMARY_PATTERNS.has(r.category)).reduce((n, r) => n + r.sets, 0);
}

function sportOnly(day) {
  return Object.values(day.sportLoad || {}).reduce((a, b) => a + b, 0);
}
function gymStressOf(day) { return day.stressUnits - sportOnly(day); }

// The threshold a low-cost claim must stay under, expressed against the week the
// athlete is actually doing rather than an absolute number: a low-cost day for a
// national-level lifter is a hard day for a beginner. A genuinely cheap day sits
// near the bottom of its own week, not halfway up it.
const LOW_COST_FRACTION_OF_PEAK = 0.4;
function lowCostCeiling(days) {
  const gymStress = days.filter((d) => d.workSets > 0).map(gymStressOf);
  if (!gymStress.length) return 0;
  return Math.max(...gymStress) * LOW_COST_FRACTION_OF_PEAK;
}

// A note lives on a row and describes that row. Only a claim that says "day"
// speaks for the whole session -- reading every row-level "low-cost support"
// note as a promise about the day produced false contradictions on rows that
// were being perfectly honest about themselves.
function claimScope(text) {
  // Scan every claim in the text, not just the first. "Recovery-contingent
  // low-cost day" matches twice, and stopping at the first match reported the
  // narrower row scope while the day-scoped promise went unchecked.
  const src = String(text || '');
  const scan = new RegExp(LOW_COST_CLAIM.source, 'gi');
  let best = null;
  for (const m of src.matchAll(scan)) {
    const before = src.slice(Math.max(0, m.index - 60), m.index);
    if (CONDITIONAL.test(before)) continue;
    const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const scope = /\bday\b/i.test(m[0]) || /^\W*day\b/i.test(tail) ? 'day' : 'row';
    if (scope === 'day') return { claim: m[0], scope };
    if (!best) best = { claim: m[0], scope };
  }
  return best;
}

export function collectRecoveryBudgetFlags(program, intake = {}) {
  const flags = [];
  const sport = sportScheduleByDay(intake);
  const fixed = fixedWeeklyCommitmentLoad(intake);

  for (let week = 1; week <= 4; week++) {
    const profile = weekLoadProfile(program, week, intake);
    if (!profile) continue;
    const ceiling = lowCostCeiling(profile.days);

    for (const day of profile.days) {
      if (!day.workSets) continue;
      const gymStress = gymStressOf(day);

      // RB-01: a promise of cheap work must match what is actually prescribed.
      // The test is deliberately objective -- does the labelled thing carry real
      // heavy primary work -- rather than a share of the day's total. Share
      // breaks down on a three-exercise day, where every row is a large slice of
      // a small week and honest support rows were being called contradictions.
      const heavyPrimaryRows = day.rows.filter((r) => PRIMARY_PATTERNS.has(r.category) && r.sets >= 3 && r.intensity >= 0.9);
      // Day-scoped claims are commonly written on the warm-up row, so the day's
      // full text is scanned for those; row-scoped claims stay on their row.
      const dayClaim = claimScope(day.text);
      const subjects = dayClaim && dayClaim.scope === 'day'
        ? [{ scoped: dayClaim, row: null }]
        : [];
      for (const row of day.rows) {
        const scoped = claimScope(`${txt(row.load)} ${txt(row.notes)}`);
        if (scoped) subjects.push({ scoped, row });
      }
      for (const { scoped, row } of subjects) {
        const subject = scoped.scope === 'day' || !row ? heavyPrimaryRows : heavyPrimaryRows.filter((r) => r === row);
        if (!subject.length) continue;
        const worst = subject[0];
        flags.push({
          code: 'V42_LOW_COST_CLAIM_CONTRADICTED',
          week,
          day: day.day,
          scope: scoped.scope,
          exercise: scoped.scope === 'day' || !row ? undefined : row.exercise,
          claim: scoped.claim,
          measured_stress: Math.round(gymStress),
          work_sets: day.workSets,
          message: scoped.scope === 'day'
            ? `${day.day} (Week ${week}) is described as "${scoped.claim}" but prescribes ${worst.sets} sets of primary ${worst.category} work at RPE ${worst.rpe}.`
            : `${row.exercise} on ${day.day} (Week ${week}) is described as "${scoped.claim}" but is ${row.sets} sets of primary ${row.category} work at RPE ${row.rpe}.`,
        });
      }

      // RB-02: the athlete's hardest sport day is the worst place for primary work.
      if (day.sport === 'hard') {
        const primary = primarySetsOn(day);
        const sportName = String(intake.sport || 'sport');
        const acknowledged = new RegExp(`\\b(?:${sportName}|sport|sparring|training session)\\b`, 'i')
          .test(day.rows.map((r) => txt(r.notes)).join(' '));
        if (primary >= 3 && !acknowledged) {
          flags.push({
            code: 'V42_PRIMARY_WORK_ON_HARD_SPORT_DAY',
            week,
            day: day.day,
            primary_sets: primary,
            message: `${day.day} (Week ${week}) carries ${primary} primary-pattern sets on the athlete's hardest sport day. Primary work should get a better readiness window unless this placement is deliberate and stated.`,
          });
        }
      }
    }

    // RB-03: the plan's own conditioning must not land entirely on sport days.
    const conditioningDays = profile.days.filter((d) => d.runningKm + d.ruckKm > 0);
    const onSportDays = conditioningDays.filter((d) => d.sport);
    if (sport.size && conditioningDays.length && onSportDays.length === conditioningDays.length) {
      const km = Math.round((profile.totals.runningKm + profile.totals.ruckKm) * 10) / 10;
      flags.push({
        code: 'V42_CONDITIONING_STACKED_ON_SPORT_DAYS',
        week,
        km,
        days: onSportDays.map((d) => d.day),
        message: `Week ${week} places all ${km} km of conditioning on days that already carry a sport session (${onSportDays.map((d) => d.day).join(', ')}). Spread it or state why stacking is the better trade.`,
      });
    }
  }

  return flags.map((f) => ({ ...f, fixed_sport_sessions: fixed.sessions, recovery_quality: statedRecoveryQuality(intake) }));
}

// Hard violations only. Placement and stacking are coaching judgements.
export const RECOVERY_BUDGET_HARD_CODES = new Set(['V42_LOW_COST_CLAIM_CONTRADICTED']);

export function buildRecoveryBudgetBrief(intake = {}) {
  const sport = sportScheduleByDay(intake);
  if (!sport.size) {
    return [
      'RECOVERY BUDGET: judge each day against everything it already carries, not against gym volume alone.',
      'Any row or day you call low-cost, optional, a primer, easy or technique-only must actually be cheap: it may not carry the week\'s heavy primary work.',
    ].join('\n');
  }
  const Day = (d) => d.charAt(0).toUpperCase() + d.slice(1);
  const hard = [...sport.entries()].filter(([, i]) => i === 'hard').map(([d]) => Day(d));
  const lines = [
    'RECOVERY BUDGET: the athlete already spends most of the week\'s recovery on sport the plan does not control.',
    `Sport week: ${[...sport.entries()].map(([d, i]) => `${Day(d)}=${i}`).join(', ')}.`,
    'Total weekly stress includes those sessions, all running and rucking, and adjacent high-stress exposures. Budget the gym plan inside what is left.',
    'Any row or day you call low-cost, optional, a primer, easy or technique-only must actually be cheap relative to the rest of this week. Do not label a day low-cost and then give it the week\'s heavy primary work.',
  ];
  if (hard.length) {
    lines.push(`Hardest sport day(s): ${hard.join(', ')}. Do not place primary strength or skill work there. If you must, say plainly why that is the better trade.`);
  }
  lines.push('Do not stack every conditioning session onto days that already carry sport. Spread the load or justify the stacking.');
  return lines.join('\n');
}
