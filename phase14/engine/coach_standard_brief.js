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

import { benchmarks, goalFamilies, goalText, toleratedFor, sprintBenchmark, matchDay } from './coach_rules.js';
import { THRESHOLDS } from './coach_standard.js';
import { buildPrimaryGoalShareBrief, buildGoalSpecificProgressionBrief } from './primary_goal_share.js';
import { buildPrimaryVolumeProgressionBrief } from './primary_volume_progression.js';

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
  // Gated on the goals, not on whether our movement vocabulary recognises them.
  // Requiring a family match made this silent for the footballer, whose stated
  // improvement goal is repeated-sprint ability -- a goal the vocabulary has no
  // entry for, and exactly the gap the coach pointed at.
  if (!improving.length) return '';
  return [
    '* AN IMPROVEMENT GOAL MOVES, OR THE BLOCK SAYS WHY IT DOES NOT.',
    `  These are the goals the athlete asked to improve: ${improving.map((g) => `"${g}"`).join('; ')}.`,
    '  For the work that serves each of them, at least one of load, reps, sets, duration, distance or pace must be larger in a later week than in Week 1. Four identical weeks against a goal the athlete asked to improve reads as copy-paste, whatever the reasoning was.',
    '  Holding a dose flat is often right, and when it is, say so in the row: name it as a maintenance dose held on purpose and give the reason. What is not acceptable is a goal stated as improvement whose prescription never changes and never explains itself.',
    '  Give the athlete a number to lift. "RPE-selected load" against a goal expressed in kilos leaves them unable to tell what to do or whether they progressed; prescribe the load, and use RPE as the cap on it.',
  ].join('\n');
}

// The progression brief above is scoped to the goals the athlete asked to
// improve, and the work underneath those goals falls outside it. That is where
// the defect actually lived: the masters block progressed her erg correctly and
// froze five supporting exposures for three weeks under unchanging notes.
// The deterministic repair catches this, but a repair writes a repair's prose.
// Saying it here gets it written by the coach instead.
export function buildSupportingStandardBrief(intake = {}) {
  // Gated on the athlete having stated a goal at all, so an empty intake still
  // produces an empty brief rather than four rules about nothing.
  const goals = ['primary', 'secondary', 'maintenance']
    .flatMap((t) => arr(intake[`${t}_goals`]).map(String))
    .filter((g) => g.trim());
  if (!goals.length) return '';
  return [
    '* SUPPORTING WORK EITHER MOVES OR STATES ITS STANDARD.',
    '  Every loaded exposure that is not trunk, tissue-capacity or GPP work must either change across Weeks 1-3 -- load, reps, sets, tempo or range -- or say in that row, week by week, what the athlete is beating while the numbers hold: depth and bracing, control of the lowering, a lockout that does not slow, symmetry, or the same load at a lower RPE. Holding a dose is often right. Three identical weeks under three identical notes is copy-paste, and reads as one.',
    '  Write the standard in the movement\'s own terms. A squat is judged on depth and bracing, a hinge on a controlled lockout, a press on a lockout that holds its speed, a carry on posture and grip over the full distance. The same sentence on five different exercises is the same defect wearing a different coat.',
    '* A SELF-SELECTED LOAD SAYS HOW TO SELECT IT.',
    '  Where the athlete has no benchmark for a variation, do not invent a kilogram figure -- but "RPE-selected load" on its own is a blank, not a prescription. State how many clean reps should remain in reserve on the last set, and tell them to record the load they used so the next week starts from a real number. A carry is judged by whether posture and grip hold for the full distance, not by reps in reserve, and a bodyweight movement is not asking for a weight at all.',
    '* A WEEK-SCOPED CLAIM MUST BE TRUE.',
    '  Do not write "only this week" about a dose that a later week prescribes again. The athlete plans around that sentence, and a note that contradicts its own table teaches them not to trust either.',
    '* FOR A YOUTH ATHLETE, NEVER WRITE FAILURE LANGUAGE AT ALL.',
    '  No set taken to failure, no AMRAP, no forced reps, no grinding, in any note, on any movement, in any week -- including as an aside inside a sentence that is otherwise about technique. This is a hard refusal that costs a full regeneration every time it fires, and it fired twice in a row on the last live youth build. Say what the standard is instead: prescribed attempts are a ceiling rather than a quota, and the set ends when quality, symmetry or balance breaks down. Forbidding failure work is not the same as prescribing it, so "no grinders" and "stop well short of failure" are correct and welcome.',
    '* A NAMED GOAL PROGRESSES ON ITS OWN SET, NOT ON A LIGHTER NEIGHBOUR.',
    '  When a goal is expressed in kilograms, the heaviest exposure of that movement is the one that has to move across the build weeks. A block named a 100 kg overhead press goal, held the working set at 65 kg in Weeks 1, 2 and 3, and moved a lighter second press instead; on paper the press family changed, and in the gym the goal did not. If the pressing budget is already spent, spend it better rather than adding to it: make the strict lift the main exposure and let the assistance variation be optional, or run a top set with a low-volume back-off. Do not leave a named kilogram goal flat for three weeks and call a lighter accessory its progression.',
    '* THE CONSOLIDATION WEEK IS NOT WHERE THE PROGRESSION GOES.',
    '  If a movement is deliberately held through the build weeks, do not put its only load or effort increase in Week 4. A delivered block carried its secondary press at one load and one RPE for three weeks and then wrote a heavier, harder version into the deload, so the single place the press advanced all block was the week meant to back off. Progress it in the build weeks, or hold it all block and say so. Either is defensible; the deload is neither.',
    '* A BENCHMARK THE ATHLETE FLAGGED IS ADDRESSED, EVEN IF IT IS ABSENT.',
    '  If the intake names a lift as not attempted, untested, avoided or feared, either program it or say in the guidance that it is deliberately not here, what covers the same pattern instead, and what has to be true before it comes back. Leaving it out can be right; leaving it unmentioned means they cannot tell whether it was a decision or an oversight.',
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

// Speed is its own quality, and three football programs scored 8.2, 8.7 and 9.0
// almost entirely on how they handled it: one prescribed no sprint at all, one
// never passed 20 m against a 30 m benchmark, and all three called a shuttle
// with a minute of rest "repeated sprint" work.
export function buildSpeedBrief(intake = {}) {
  const goals = goalText(intake);
  const wantsSpeed = /\bsprint\b|\bspeed\b/i.test(`${arr(intake.primary_goals).join(' ')}`);
  const wantsRsa = /repeat(?:ed)?[- ]sprint|repeat(?:ed)? effort|late[- ]match sprint/i.test(goals);
  if (!wantsSpeed && !wantsRsa) return '';
  const lines = ['* SPEED IS PRESCRIBED, NOT IMPLIED.'];
  if (wantsSpeed) {
    const b = sprintBenchmark(intake);
    lines.push('  Holding sprint speed is a stated goal, so every week needs a real sprint row: a distance, a number of repetitions, an intended effort and a stop rule. Build-ups inside a warm-up do not count, because nothing about their quality is prescribed.');
    if (b) lines.push(`  The benchmark is ${b.metres} m in ${b.seconds} s. By Week 3 one session should reach at least ${Math.round(b.metres * 0.75)} m at 95% or more, so the athlete is exposed to the later part of the distance the goal is measured over. Full recovery between repetitions.`);
  }
  if (wantsRsa) {
    lines.push('  Repeated-sprint ability is a different quality from speed, and has a definition: more than two repetitions, each 10 seconds or less, at 95% effort or above, with under 60 seconds of deliberately incomplete recovery. A shuttle at 90% with a minute of rest is quality change-of-direction work, not repeatability work -- it may be worth doing, but do not label it as the repeated-sprint exposure.');
    lines.push('  Progress one variable by Week 3: one more repetition, 10% more distance, 10% less recovery, or better output at the same work-to-rest. Week 4 may consolidate.');
  }
  const md = matchDay(intake);
  if (md && /hamstring|biceps femoris/i.test(`${intake.injuries || ''} ${JSON.stringify(intake.pain || {})}`)) {
    lines.push(`  This athlete has recent hamstring history and a ${md.toUpperCase()} match. Put the main eccentric hamstring dose at least 72 hours before the match; inside 48 hours use lower-soreness hamstring work instead.`);
  }
  return lines.join('\n');
}

export function buildCoachStandardBrief(intake = {}) {
  return [
    buildBenchmarkExposureBrief(intake),
    buildProgressionBrief(intake),
    buildSupportingStandardBrief(intake),
    buildPrimaryGoalShareBrief(intake),
    buildGoalSpecificProgressionBrief(intake),
    buildPrimaryVolumeProgressionBrief(intake),
    buildSpeedBrief(intake),
    buildSchedulingBrief(intake),
  ].filter(Boolean).join('\n');
}
