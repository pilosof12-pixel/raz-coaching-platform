// engine/coach_standard_brief.js
//
// The three defects the coach's standard finds in almost everything we deliver,
// told to the model before it writes rather than found afterwards.
//
// Graded offline against his standard, 22 delivered programs produced 62
// findings, and three behaviours accounted for 39 of them:
//
//   15  an improvement goal held identical for the whole block
//   14  a benchmarked movement that serves a goal and is never trained
//   10  more consecutive training days than flexible availability needs
//
// None of the three has an honest deterministic repair. Progressing a lift,
// choosing which benchmark earns a slot, and moving a session to another day
// are all coaching decisions, and v87 records what happens when a blocking code
// has no converging repair: four attempts and a dead build. So these are
// briefs, and the graders in coach_rules.js measure whether they worked.
//
// What makes them worth their tokens is that they are specific. A brief saying
// "train the athlete's benchmarks" changes nothing; one saying "Trap Bar
// Deadlift is benchmarked at 190 kg x 3 and explicitly pain free, and must
// appear" names the row that was missing from the program he marked down.

import { benchmarks, goalFamilies, goalText, toleratedFor } from './coach_rules.js';
import { THRESHOLDS } from './coach_standard.js';

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const GENERIC_STRENGTH_GOAL = /maintain[^.]*\b(strength|power)\b/i;
const NOT_A_LIFT = /\b(\d+\s*km|reps|min|sessions?)\b/i;
const TOKENS = /\b(snatch|clean|jerk|squat|deadlift|press|bench|pull|row|dip|push|run|ruck|carry)\b/gi;
const tokensOf = (s) => [...new Set(String(s).toLowerCase().match(TOKENS) || [])];

function advanced(intake) {
  return /advanced|elite/.test(String(intake.experience || '').toLowerCase())
    || Number(intake.training_years) >= 3;
}

// The movements this athlete has a number for, that serve a goal, that they can
// do without symptoms. These are the rows the block is not allowed to leave out.
export function requiredMovements(intake = {}) {
  if (!advanced(intake)) return [];
  const goals = goalText(intake);
  const named = tokensOf(goals);
  const generic = GENERIC_STRENGTH_GOAL.test(goals)
    && !named.some((t) => /squat|deadlift|press|bench|snatch|clean|jerk|pull|row|dip/.test(t));
  const painful = String(intake.pain?.description || '').toLowerCase();
  const tolerated = String(intake.pain?.tolerated_movements || '').toLowerCase();
  const painActive = intake.pain?.active === true;

  const out = [];
  for (const b of benchmarks(intake)) {
    const toks = tokensOf(b.name);
    if (!toks.length || NOT_A_LIFT.test(b.name)) continue;
    const servesNamed = toks.some((t) => new RegExp(`\\b${t}`, 'i').test(goals));
    if (!servesNamed && !generic) continue;
    // Read clause by clause: the field records what the athlete cannot do as
    // well as what they can, and a substring search cannot tell them apart.
    if (painActive && toks.some((t) => painful.includes(t)) && !toleratedFor(b.name, tolerated)) continue;
    out.push(b);
  }
  return out;
}

export function buildBenchmarkExposureBrief(intake = {}) {
  const required = requiredMovements(intake);
  if (!required.length) return '';
  const pct = Math.round(THRESHOLDS.MAINTENANCE_MIN_LOAD_FRACTION_OF_BENCHMARK * 100);
  const lines = required.map((b) => {
    const floor = b.kg ? ` At least ${Math.round(b.kg * THRESHOLDS.MAINTENANCE_MIN_LOAD_FRACTION_OF_BENCHMARK / 2.5) * 2.5} kg on the bar when the exact movement is used.` : '';
    return `    - ${b.name} (${b.value}).${floor}`;
  });
  return [
    '* TRAIN THE MOVEMENTS THIS ATHLETE HAS NUMBERS FOR.',
    '  Each of these is benchmarked in the intake, serves a stated goal, and is not limited by any symptom the athlete reported. Each must appear in every week of the block, either as itself or as the closest tolerated variation of the same pattern:',
    ...lines,
    `  A maintenance dose is small and direct: one exposure a week, at least ${THRESHOLDS.MAINTENANCE_MIN_WORK_SETS} work sets or ${THRESHOLDS.MAINTENANCE_MIN_TOTAL_REPS} total work reps, RPE ${THRESHOLDS.MAINTENANCE_RPE_RANGE[0]} to ${THRESHOLDS.MAINTENANCE_RPE_RANGE[1]}, and at least ${pct}% of the benchmark load. Two crisp doubles are enough. This is not a reason to add volume.`,
    '  Where a symptom rules out the obvious lift, go down this order and stop at the first one that works: the same lift with a setup change the athlete tolerates; another movement they have a number for that trains the same quality and is symptom-free; an unbenchmarked movement from the same family; a lower-cost general exercise. Do not skip to generic assistance while a benchmarked, tolerated option is sitting in the intake.',
  ].join('\n');
}

export function buildProgressionBrief(intake = {}) {
  const improving = ['primary', 'secondary']
    .flatMap((t) => arr(intake[`${t}_goals`]).map(String))
    .filter((g) => !/\b(?:keep|maintain|hold|preserve|retain|maintenance)\b/i.test(g));
  if (!improving.length || !goalFamilies(intake).length) return '';
  return [
    '* AN IMPROVEMENT GOAL MOVES, OR THE BLOCK SAYS WHY IT DOES NOT.',
    `  These are the goals the athlete asked to improve: ${improving.map((g) => `"${g}"`).join('; ')}.`,
    '  For the work that serves each of them, at least one of load, reps, sets, duration, distance or pace must be larger in a later week than in Week 1. Four identical weeks against a goal the athlete asked to improve reads as copy-paste, whatever the reasoning was.',
    '  Holding a dose flat is often right, and when it is, say so in the row: name it as a maintenance dose held on purpose and give the reason. What is not acceptable is a goal stated as improvement whose prescription never changes and never explains itself.',
    '  Give the athlete a number to lift. "RPE-selected load" against a goal expressed in kilos leaves them unable to tell what to do or whether they progressed; prescribe the load, and use RPE as the cap on it.',
  ].join('\n');
}

export function buildSchedulingBrief(intake = {}) {
  if (String(intake.gym_availability_mode || '').toLowerCase() !== 'flexible') return '';
  const history = `${intake.injuries || ''} ${JSON.stringify(intake.pain || {})}`;
  const impact = /\bshin\b|\bstress fracture\b|\bstress reaction\b|\btibial\b|\bimpact\b/i.test(history);
  const lines = [
    '* SPREAD THE WEEK, BECAUSE THIS ATHLETE CAN.',
    `  Availability is flexible, so the calendar is a choice. Do not schedule more than ${THRESHOLDS.MAX_CONSECUTIVE_LIFTING_DAYS} consecutive training days unless the intake gives a reason. Five sessions across six or seven days is better than five in a row, and costs nothing.`,
    '  The week wraps: Saturday, Sunday and Monday are three consecutive days, not two.',
  ];
  if (impact) {
    lines.push(`  This athlete has a history of impact-related lower-leg trouble. A day loads the lower leg if it carries a run of ${THRESHOLDS.LOWER_LEG_LOADING_RUN_MINUTES} minutes or more, running intervals, a ruck of ${THRESHOLDS.LOWER_LEG_LOADING_RUCK_MINUTES} minutes or more, or a lower-body lift with a work set at RPE ${THRESHOLDS.LOWER_LEG_LOADING_MIN_RPE} or higher. No more than ${THRESHOLDS.MAX_CONSECUTIVE_LOWER_LEG_LOADING_DAYS} of those may run back to back.`);
  }
  return lines.join('\n');
}

export function buildCoachStandardBrief(intake = {}) {
  return [
    buildBenchmarkExposureBrief(intake),
    buildProgressionBrief(intake),
    buildSchedulingBrief(intake),
  ].filter(Boolean).join('\n');
}
