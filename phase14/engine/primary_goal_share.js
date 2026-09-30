// engine/primary_goal_share.js
//
// The coach's third engine-level correction, on the masters block: "When primary
// sport/skill exposure is underdeveloped while generic accessories consume many
// weekly slots, flag the program."
//
// Her primary goal is a 2 km erg. The week gave her two rowing exposures and
// about a dozen gym exposures -- goblet squat, hip thrust, reverse lunge, goblet
// split squat, leg press, two rowing accessories, two pressing patterns, two
// calf patterns and several trunk exercises. No single one is wrong. Together
// they are a general strength menu wrapped around the sport she is trying to
// return to, and the sport gets the smaller share of the week.
//
// This measures the share rather than asserting it: exposures that directly
// serve a named goal, against substantive work that serves none. Trunk, tissue
// and GPP work is excluded on both sides -- a dead bug is not what crowds out a
// rowing session, and counting it would make every sane block look guilty.
//
// Measured here and advisory, not blocking: which accessory to cut and how much
// sport to put in its place is a coaching decision, and a gate with no
// deterministic answer spends four generations and delivers nothing.
//
// I got this wrong twice before it worked, the same way both times. Counting
// "exposures that serve a goal" against "exposures that serve none" flagged all
// four avatars, including the Advanced Hybrid block the coach rated 9.0 and told
// me to freeze -- because the program model strips the [WARMUP] marker from an
// exercise's display name, so filtering warm-ups by name let every ramp and prep
// row through and polluted both sides of the ratio. Warm-ups are excluded by
// modality. With that fixed the four programs the coach scored separate cleanly:
//
//   masters   2 goal exposures / 11 generic = 0.18   <- his clear example
//   youth     4 / 10                        = 0.40
//   hybrid    6 / 7                         = 0.86
//   tactical  10 / 4                        = 2.50
//
// The threshold sits at a quarter, between the block he objected to and the next
// one up. Four programs is a thin calibration and the numbers are recorded here
// so the next person can see the margin rather than trust the constant.

import { parseProgramModel } from './program_model.js';
import { CATEGORY, classifyExercise } from './v38_movement_taxonomy.js';

const CHEAP = new Set([CATEGORY.TRUNK, CATEGORY.TISSUE_CAPACITY, CATEGORY.GPP, CATEGORY.WARMUP]);
const SHARE_FLOOR = 0.25;

export function primaryGoalShare(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!(model.goals || []).some((g) => g.tier === 'primary')) return null;

  const weeks = [];
  for (const week of model.weeks || []) {
    let goal = 0;
    let generic = 0;
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        // By modality: the model strips the [WARMUP] marker from display_name.
        if (String(exercise.modality) === 'warm_up') continue;
        const name = String(exercise.display_name || exercise.name || '').trim();
        if (!name) continue;
        if (exercise.direct_goal_exposure) { goal += 1; continue; }
        if (CHEAP.has(classifyExercise(name).category)) continue;
        generic += 1;
      }
    }
    weeks.push({ week: week.week, goal, generic, share: generic ? goal / generic : Infinity });
  }
  return { weeks };
}

export function collectPrimaryGoalShareFlags(program, intake = {}, suppliedModel = null) {
  const share = primaryGoalShare(program, intake, suppliedModel);
  if (!share) return [];
  return share.weeks
    .filter((w) => w.generic >= 4 && w.share < SHARE_FLOOR)
    .map((w) => ({
      code: 'V102_PRIMARY_GOAL_SHARE_LOW',
      week: w.week,
      goal_exposures: w.goal,
      generic_exposures: w.generic,
      detail: `Week ${w.week} gives the primary goal ${w.goal} direct exposure${w.goal === 1 ? '' : 's'} against ${w.generic} substantive exposures that serve no named goal. No accessory is wrong on its own; together they are a general strength menu wrapped around the thing the athlete actually came for. Spend the accessory budget on the primary goal before adding to it.`,
    }));
}

export function buildPrimaryGoalShareBrief(intake = {}) {
  const primaries = ['primary_goals'].flatMap((k) => (Array.isArray(intake[k]) ? intake[k] : [intake[k]]))
    .filter(Boolean).map(String);
  if (!primaries.length) return '';
  return [
    '* THE ACCESSORY BUDGET IS SPENT ON THE PRIMARY GOAL FIRST.',
    `  The primary goal${primaries.length > 1 ? 's are' : ' is'} ${primaries.map((g) => `"${g}"`).join(' and ')}. Before adding a general accessory, ask whether another exposure of the goal movement itself, or of the quality it depends on, would serve this athlete better. A block that gives the primary goal two slots a week and generic strength ten is a general strength menu wrapped around the thing they came for, whatever the goals section says.`,
    '  This is not an instruction to add volume. It is an instruction to allocate the volume already there: fewer accessory patterns, and the room spent on the goal. Trunk, tissue-capacity and GPP work is cheap and is not what crowds a week out; duplicated pressing, pulling and lower-body patterns are.',
  ].join('\n');
}

// Coach review, engine correction 2: "Progress the actual performance quality."
// Generic "something changed" logic is not enough -- a wall handstand gaining
// five seconds does not mean the freestanding handstand goal progressed, and a
// ruck getting faster at 8 km does not satisfy a 10 km performance goal.
// Progression has to connect to the target.
//
// These are coaching decisions with no mechanical answer, so they steer
// generation rather than gate it. Each line fires only for the goal it concerns.
const GOAL_SPECIFIC = [
  {
    re: /\b(?:strict )?pull[- ]?ups?\b[^.]{0,60}\b(?:from\s*)?\d+\s*(?:toward|to|->)\s*\d+|\b\d+\s*(?:strict )?pull[- ]?ups?\b/i,
    line: [
      '* A HIGH-REP BODYWEIGHT GOAL IS BUILT ON SUBMAXIMAL SET LENGTH, NOT WEEKLY TESTING.',
      '  Repeatedly prescribing a near-maximal set plus singles is testing the goal, not training it. Give one weekly exposure of three to four sets at meaningful set length -- around half to two thirds of the target number -- with two or three reps still in reserve, and a second lower-fatigue exposure of smaller sets. Accumulate goal-relevant volume; test rarely.',
    ].join('\n'),
  },
  {
    re: /freestanding handstand|handstand balance|unsupported handstand/i,
    line: [
      '* A FREESTANDING HANDSTAND IS A BALANCE GOAL, AND BALANCE IS TRAINED UNSUPPORTED.',
      '  Separate the three things and progress the right one: position capacity is the wall hold, entry skill is the kick-up, and balance skill is unsupported time. All three can be in the block, but a wall hold gaining seconds is not the goal progressing. Progress fresh, short, frequent unsupported attempts with a clear success standard.',
    ].join('\n'),
  },
  {
    re: /\bfirst\b[^.]{0,30}muscle[- ]?up|achieve[^.]{0,30}muscle[- ]?up/i,
    line: [
      '* A FIRST MUSCLE-UP IS AN ASSISTANCE-REDUCTION LADDER WITH GATES, NOT A REPEATED DOSE.',
      '  The same assisted prescription in every week is not a pathway to the skill. State the gate between rungs: when every assisted rep is fast and technically clean, reduce the assistance; once the lightest useful assistance is owned, permit a small number of fresh unassisted attempts before the assisted work, while it is still fresh.',
    ].join('\n'),
  },
  {
    re: /\bruck\b[^.]{0,60}\b(\d+)\s*km|\b(\d+)\s*km[^.]{0,30}\bruck\b/i,
    line: [
      '* AN EVENT-DISTANCE GOAL EVENTUALLY NEEDS EVENT-DISTANCE EXPOSURE.',
      '  Progress one variable at a time, but a block aimed at a stated distance cannot spend all four weeks below it. Build toward at least one exposure at the event distance at a controlled pace by the back half of the block, then reduce volume into the consolidation week.',
    ].join('\n'),
  },
];

export function buildGoalSpecificProgressionBrief(intake = {}) {
  const goals = ['primary_goals', 'secondary_goals']
    .flatMap((k) => (Array.isArray(intake[k]) ? intake[k] : [intake[k]]))
    .filter(Boolean).map(String).join(' | ');
  if (!goals.trim()) return '';
  return GOAL_SPECIFIC.filter((g) => g.re.test(goals)).map((g) => g.line).join('\n');
}
