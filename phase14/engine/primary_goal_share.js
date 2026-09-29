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
// Stated in the brief and NOT measured here, deliberately. Which accessory to
// cut and how much sport to put in its place is a coaching decision, and a gate
// with no deterministic answer spends four generations and delivers nothing.
//
// I also wrote the measurement and threw it away. Counting exposures that serve
// a named goal against those that serve none flagged the Advanced Hybrid block
// -- the one the coach rated 9.0 and told me to freeze -- and the Youth block,
// because goal-serving work through a secondary goal was not being credited. A
// metric that contradicts the review it came from is worse than no metric, and
// shipping it to look thorough would have been the mistake.

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
