import test from 'node:test';
import assert from 'node:assert/strict';

import { collectPrimaryGoalShareFlags, primaryGoalShare } from '../engine/primary_goal_share.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, ex, reps) => [day, ex, 'RPE-selected load', '2', reps, '90s', '7', 'Work.', ''].join('\t');
const ROWER = {
  age: 54,
  primary_goals: ['Return to competitive masters rowing and race a 2 km erg again'],
  days_per_week: 4,
};

// The shape the coach objected to: the sport gets two slots, the general
// strength menu gets eleven.
const menu = (extras) => [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${[
  row('Mon', '[WARMUP] Rowing Ergometer', '8 min'),
  row('Mon', 'Rowing Ergometer', '25 min'),
  row('Fri', 'Rowing Ergometer', '250 m'),
  ...extras,
].join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');

const GENERIC = [
  row('Mon', 'Goblet Squat', '8'), row('Mon', 'Chest-Supported Row', '10'),
  row('Tue', 'Leg Press Machine', '10'), row('Tue', 'Dumbbell Bench Press', '8'),
  row('Tue', 'Seated Cable Row', '10'), row('Wed', 'Barbell Hip Thrust', '8'),
  row('Wed', 'Reverse Lunge', '8'), row('Fri', 'Cable Row', '10'),
  row('Fri', 'Goblet Split Squat', '8'), row('Fri', 'Push-up', '10'),
  row('Fri', 'Dumbbell Shoulder Press', '8'),
];

test('warm-up rows count on neither side of the ratio', () => {
  // The program model strips the [WARMUP] marker from display_name, so filtering
  // warm-ups by name let every ramp row through and polluted both counts. That
  // bug made this metric flag all four avatars, including the one the coach
  // rated 9.0, and it is why two earlier versions of it were deleted.
  const share = primaryGoalShare(menu(GENERIC), ROWER);
  assert.equal(share.weeks[0].goal, 2, 'the two real erg exposures, not the warm-up erg');
  assert.equal(share.weeks[0].generic, 11);
});

test('a primary goal starved by a general strength menu is flagged', () => {
  const flags = collectPrimaryGoalShareFlags(menu(GENERIC), ROWER);
  assert.equal(flags.length, 4);
  assert.equal(flags[0].code, 'V102_PRIMARY_GOAL_SHARE_LOW');
  assert.equal(flags[0].goal_exposures, 2);
});

test('trimming the menu clears it without adding a single session', () => {
  // The coach's instruction was allocation, not volume: "fewer exercises and
  // slightly more rowing progression."
  const trimmed = collectPrimaryGoalShareFlags(menu(GENERIC.slice(0, 5)), ROWER);
  assert.deepEqual(trimmed, []);
});

test('a block whose goal is well served is not flagged', () => {
  const served = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${[
    row('Mon', 'Rowing Ergometer', '25 min'),
    row('Tue', 'Rowing Ergometer', '12 min'),
    row('Fri', 'Rowing Ergometer', '300 m'),
    row('Mon', 'Goblet Squat', '8'),
    row('Tue', 'Leg Press Machine', '10'),
  ].join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');
  assert.deepEqual(collectPrimaryGoalShareFlags(served, ROWER), []);
});

test('a block with no primary goal is not measured at all', () => {
  assert.equal(primaryGoalShare(menu(GENERIC), { age: 30 }), null);
  assert.deepEqual(collectPrimaryGoalShareFlags(menu(GENERIC), { age: 30 }), []);
});

test('a small week is not judged on a ratio', () => {
  // Three accessories around one goal exposure is a short session, not a menu.
  const small = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${[
    row('Mon', 'Rowing Ergometer', '25 min'),
    row('Mon', 'Goblet Squat', '8'),
    row('Mon', 'Cable Row', '10'),
  ].join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');
  assert.deepEqual(collectPrimaryGoalShareFlags(small, ROWER), []);
});
