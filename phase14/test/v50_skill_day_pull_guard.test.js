// The chain was manufacturing the defect it then failed to repair.
//
// Run #130's calisthenics build shipped four V38_SKILL_WITHOUT_FOUNDATION
// findings. The delivered program had none -- the raw model output carried
// only V38_CONSECUTIVE_CONFLICTING_EXPOSURE, and every foundation violation in
// the shipped file was made by our own repair chain.
//
// v50 thins consecutive pulling by deleting a pull off the lighter of the two
// clashing days. Week 1 Tuesday is a freestanding handstand and advanced tuck
// planche day, and its only foundational pull was a single Inverted Row. v50
// took it, which is exactly the shape the foundation gate refuses. The
// foundation repair could not undo it either: re-adding a pull to Tuesday
// recreates the clash v50 had just removed, so the two repairs traded the
// program back and forth until the build gave up.
//
// Spacing pulls across days is a scheduling preference. Strength under a skill
// is what the skill stands on, so it wins.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';

const INTAKE = {
  age: 28, language: 'en', experience: 'Advanced (3+ years)', bodyweight: '72 kg',
  primary_goals: ['Weighted pull-up with 40 kg for 3', 'Freestanding handstand push-up'],
  secondary_goals: ['Hold a 10 second straddle planche'],
  goal_priority_model: 'tiered_equal_primary', days_per_week: 4, session_duration_minutes: 90,
  gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'calisthenics_park',
  equipment: 'Pull-up bars, dip bars, rings, parallettes, a weight belt, bands.',
  sport: '', sport_schedule: [],
  current_numbers: 'Weighted pull-up: 32 kg x 3\nTuck planche: 15 s',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

// Run #130's week 1 Monday and Tuesday, copied from the delivered program.
//
// The RPE column is load-bearing here and an earlier draft of this fixture got
// it wrong. The audit weights a row at 1.0 only when it is heavy (RPE >= 7.5
// over 2+ sets); everything else counts half. With the Inverted Row written at
// RPE 7 instead of the delivered 8, Tuesday totals 2.0, no clash is raised,
// v50 never runs, and the test passed against a deliberately broken guard.
//
// As delivered: Monday 3.5 (Weighted Pull-up 3 heavy, Ring Muscle-up 0.5),
// Tuesday 4.0 (Inverted Row 2 heavy, Advanced Tuck Planche 1 heavy, two
// handstand entries 0.5). Both clear 3, so the pair clashes -- and dropping the
// Inverted Row alone puts Tuesday at 2.0, which is why v50 reached for it.
const ROWS = [
  'Mon	[WARMUP] Band Pull-Apart Warm-up	Light band	2	15	0:45	N/A	Warm-up.	',
  'Mon	Ring Muscle-up	BW	6	2	2:30	7-8	Primary skill.	',
  'Mon	Weighted Pull-up	28 kg added	4	4	2:30	7.5	Primary. Leave a rep.	',
  'Mon	Dip	RPE-selected load	3	8	2:00	7.5	Pressing volume.	',
  'Mon	Bulgarian Split Squat	BW + RPE-selected belt load	3	8	1:30	7	Lower.	',
  'Mon	Side Plank	BW	2	30s	1:00	6	Trunk.	',
  'Tue	[WARMUP] Band Pull-Apart Warm-up	Light band	2	15	0:45	N/A	Warm-up.	',
  'Tue	Freestanding Handstand Hold	BW	5	20s	1:30	6	Skill.	',
  'Tue	Freestanding Handstand Push-up Negative	BW	3	3	2:00	7	Skill.	',
  'Tue	Elevated Pike Push-up	BW	4	8	2:00	7.5	Pressing.	',
  'Tue	Advanced Tuck Planche	BW	4	12s	1:30	8	Skill.	',
  'Tue	Inverted Row	BW	3	12	1:30	8	Support pulling.	',
  'Tue	Pistol Squat	BW + RPE-selected belt load	3	5	1:30	7	Lower.	',
  'Tue	Band Pallof Press	Light band	2	10	1:00	6	Trunk.	',
  'Thu	Ring Row	BW	4	10	1:30	7	Pulling.	',
  'Thu	Ring Push-up	BW	3	10	1:30	7	Pressing.	',
  'Thu	Bulgarian Split Squat	BW	3	8	1:30	7	Lower.	',
  'Thu	Hollow Body Hold	BW	3	30s	1:00	6	Trunk.	',
];

const PROGRAM = [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${ROWS.join('\n')}\nEND_WEEK${n}_TSV`)
  .join('\n\n');

test('v50 does not strip the last foundational pull off a skill day', () => {
  const { program } = repairDeterministicContradictions(PROGRAM, INTAKE);
  const tuesdayPulls = program
    .split('\n')
    .filter((line) => /^Tue\t/.test(line) && /Inverted Row/.test(line));
  assert.equal(
    tuesdayPulls.length, 4,
    'Tuesday carries handstand and planche work; its only foundational pull must survive in all four weeks',
  );
});

test('v50 declines rather than reporting a thin it could not safely make', () => {
  const { repairs } = repairDeterministicContradictions(PROGRAM, INTAKE);
  const thinned = (repairs || []).filter((r) => r.type === 'v50_consecutive_pull_thinned');
  for (const r of thinned) {
    assert.notEqual(
      String(r.exercise || ''), 'Inverted Row',
      'a repair that reports success while the foundation gate still refuses is worse than one that declines',
    );
  }
});
