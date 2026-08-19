import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateTactical3KCoachingSpecV1,
  collectYouthCoachingSpecV1ReviewSignals,
} from '../engine/coaching_spec_v1_quality.js';
import {
  normalizeAdvancedHybridSecondaryRunStability,
  normalizeYouthSkillAcquisitionQuality,
  normalizeTactical3KRaceSpecificity,
} from '../engine/coaching_spec_v1_convergence_normalizer.js';
import { validatePhase15FinalProgram } from '../engine/phase15_final_qa.js';
import { Phase15QualityError } from '../engine/phase15_program_qa.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function block(week, rows) {
  return `START_WEEK${week}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}
function fourWeeks(factory, intro = '') {
  return `${intro ? `${intro}\n\n` : ''}${[1,2,3,4].map((week) => block(week, factory(week))).join('\n\n')}`;
}

const tacticalLiveIntake = {
  age: 27,
  experience: 'advanced',
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
  maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic and relatively weight-stable'],
  current_numbers: '3 km: 13:30 | 10 km ruck with 20 kg: 95 min | Back Squat: 140 kg x 5 | Deadlift: 180 kg x 3 | Strict Pull-ups: 14 reps',
  performance_markers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min'],
  injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
  notes: 'Wants combat-ready / special-operations-style fitness without random punishment circuits or unnecessary mass gain.',
};

function tactical400Only() {
  return fourWeeks((week) => [
    `Mon\tBack Squat\t${[120,122.5,125,120][week-1]} kg\t3\t5\t3 min\t7.5\tMaintenance squat.\t`,
    `Tue\tRun\t400 m @ ${['1:42-1:45','1:42-1:45','1:40-1:43','1:38-1:40'][week-1]}\t${[6,7,7,5][week-1]}\t400 m\t2:00\t8\tPrimary 3K quality.\t`,
    `Thu\tBackpack Carry\t20 kg, 9:30/km\t1\t${[8,8.5,9,8][week-1]} km\tN/A\t6\tControlled ruck.\t`,
  ], 'If shin symptoms return, hold the newest run or ruck progression, reduce impact, and repeat the prior tolerated week.');
}

test('live Tactical special-operations-style context no longer bypasses T3K-02', () => {
  assert.throws(
    () => validateTactical3KCoachingSpecV1(tactical400Only(), tacticalLiveIntake),
    (err) => err?.code === 'COACH_SPEC_V1_T3K_400_ONLY_BLOCK',
  );
});

test('Tactical convergence creates 400 -> 600 -> 800 race-specific development and protects the next-day key run', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400Only(), tacticalLiveIntake);
  assert.equal(repaired.repaired, true);
  assert.match(repaired.program, /START_WEEK2_TSV[\s\S]*Tue\tRun\t600 m @ 2:39-2:42\t4\t600 m/);
  assert.match(repaired.program, /START_WEEK3_TSV[\s\S]*Tue\tRun\t800 m @ 3:27-3:34\t4\t800 m/);
  assert.match(repaired.program, /Mon\tBack Squat\t122\.5 kg\t2\t5\t3 min\t7\t/);
  assert.equal(validateTactical3KCoachingSpecV1(repaired.program, tacticalLiveIntake).ok, true);
});

function week1Block(program) {
  return program.match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i)[1];
}

// Reproduces the live v30f Tactical failure shape: a recognized "Run" key
// row with sets >= 2 and a real repetition distance, but no clock/pace
// target anywhere in its dose -- the exact gap that made every live attempt
// exhaust on EVENT_PROGRESSING_SESSION_MISSING even after the other three
// Tactical defects converged.
function tactical400OnlyNoWeek1Pace() {
  return fourWeeks((week) => [
    `Mon\tBack Squat\t${[120,122.5,125,120][week-1]} kg\t3\t5\t3 min\t7.5\tMaintenance squat.\t`,
    `Tue\tRun\tN/A\t${[6,7,7,5][week-1]}\t400 m\t2:00\t8\tRun at RPE 8, controlled effort based on current fitness.\t`,
    `Thu\tBackpack Carry\t20 kg, 9:30/km\t1\t${[8,8.5,9,8][week-1]} km\tN/A\t6\tControlled ruck.\t`,
  ], 'If shin symptoms return, hold the newest run or ruck progression, reduce impact, and repeat the prior tolerated week.');
}

test('Tactical Week 1 with no pace/clock-anchored key session triggers EVENT_PROGRESSING_SESSION_MISSING before repair', () => {
  assert.throws(
    () => validatePhase15FinalProgram(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake),
    (err) => err instanceof Phase15QualityError && err.flags.some((f) => f.code === 'EVENT_PROGRESSING_SESSION_MISSING'),
  );
});

test('Tactical convergence canonicalizes the existing Week 1 key row into a legitimate event-specific session instead of adding one', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake);
  assert.equal(repaired.repaired, true);
  assert.ok(repaired.repairs.some((r) => r.type === 'tactical_3k_week1_event_session_canonicalized'));
  assert.match(repaired.program, /START_WEEK1_TSV[\s\S]*Tue\tRun\t400 m @ \d{1,2}:\d{2}-\d{1,2}:\d{2}\t6\t400 m/);
});

test('[D] after repair the EVENT_PROGRESSING_SESSION_MISSING path is silent, and the program still passes the frozen Tactical spec', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake);
  // This minimal fixture is not a full 3-day program (it omits the pull-up
  // secondary-goal exposure and load benchmarks), so it can still legitimately
  // trip unrelated goal/benchmark flags; assert only that the specific flag
  // this patch targets is gone, not that every unrelated validator is silent.
  let caught = null;
  try { validatePhase15FinalProgram(repaired.program, tacticalLiveIntake); } catch (e) { caught = e; }
  assert.equal(caught === null || !caught.flags?.some((f) => f.code === 'EVENT_PROGRESSING_SESSION_MISSING'), true);
  assert.equal(validateTactical3KCoachingSpecV1(repaired.program, tacticalLiveIntake).ok, true);
});

test('Week 2/3 still develop past 400 m rather than collapsing back to a 400-only block after the Week 1 fix', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake);
  assert.match(repaired.program, /START_WEEK2_TSV[\s\S]*Tue\tRun\t600 m @ [\d:]+-[\d:]+\t4\t600 m/);
  assert.match(repaired.program, /START_WEEK3_TSV[\s\S]*Tue\tRun\t800 m @ [\d:]+-[\d:]+\t4\t800 m/);
});

test('repaired Week 1 pace is anchored to current 13:30 3K capacity, not aspirational sub-12:00 goal pace', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake);
  const m = repaired.program.match(/START_WEEK1_TSV[\s\S]*?Tue\tRun\t400 m @ (\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\t/);
  assert.ok(m, 'expected a canonical 400m clock-paced Week 1 row');
  const lowSec = Number(m[1]) * 60 + Number(m[2]);
  // Current 13:30 3K implies ~108s/400m; sub-12:00 goal pace would be ~96s/400m or faster.
  // A current-capacity-anchored prescription must stay slower than goal pace.
  assert.ok(lowSec > 100, `expected current-capacity pace slower than aspirational goal pace, got ${m[0]}`);
});

test('the key run stays protected from substantial preceding lower-body strength (T3K-05) after Week 1 canonicalization', () => {
  const adjacent = fourWeeks(() => [
    'Mon\tBack Squat\t140 kg\t4\t6\t3 min\t8.5\tHeavy squat day.\t',
    'Tue\tRun\tN/A\t6\t400 m\t2:00\t8\tRun at RPE 8, controlled effort based on current fitness.\t',
  ], 'If shin symptoms return, hold the newest run or ruck progression, reduce impact, and repeat the prior tolerated week.');
  const repaired = normalizeTactical3KRaceSpecificity(adjacent, tacticalLiveIntake);
  assert.doesNotThrow(() => validateTactical3KCoachingSpecV1(repaired.program, tacticalLiveIntake));
});

test('prior shin-splint history keeps its explicit symptom-gated progression language after the Week 1 repair', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake);
  assert.match(repaired.program, /shin symptoms return, hold the newest run or ruck progression/i);
});

test('[E] the Week 1 event-progression repair is idempotent (second pass is byte-identical)', () => {
  const once = normalizeTactical3KRaceSpecificity(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake);
  const twice = normalizeTactical3KRaceSpecificity(once.program, tacticalLiveIntake);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('[F] the Week 1 repair does not add a duplicate key run row', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400OnlyNoWeek1Pace(), tacticalLiveIntake);
  const runRows = week1Block(repaired.program).split('\n').filter((line) => /^Tue\tRun\t/.test(line));
  assert.equal(runRows.length, 1);
});

test('an already-progression-bearing Week 1 row is left untouched by the new repair', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400Only(), tacticalLiveIntake);
  assert.equal(repaired.repairs.some((r) => r.type === 'tactical_3k_week1_event_session_canonicalized'), false);
});

// [A] Week 1 already contains one legitimate progression-bearing running row
// (current-capacity clock target present) plus a second, unrelated RPE-only
// interval row. The real validator semantics are "does Week 1 contain AT
// LEast one progression-bearing row", so this program already passes and the
// new repair must not touch it -- even though a naive "fix every non-bearing
// row" implementation would incorrectly rewrite the second row.
function tacticalWeek1MixedBearingAndNonBearing() {
  return fourWeeks((week) => week === 1
    ? [
      // RPE 7 (not 7.5+) so the pre-existing, unrelated T3K-05 preceding-strength
      // trim does not also fire here -- this fixture isolates the new Week 1
      // event-progression repair specifically.
      'Mon\tBack Squat\t120 kg\t3\t5\t3 min\t7\tMaintenance squat.\t',
      'Tue\tRun\t400 m @ 1:42-1:45\t6\t400 m\t2:00\t8\tPrimary 3K quality, current-capacity paced.\t',
      'Thu\tRun\tN/A\t4\t300 m\t2:00\t7\tEasy strides, RPE only, not the primary quality session.\t',
    ]
    : [
      `Mon\tBack Squat\t${[null,122.5,125,120][week-1]} kg\t3\t5\t3 min\t7\tMaintenance squat.\t`,
      `Tue\tRun\t400 m @ ${['','1:42-1:45','1:40-1:43','1:38-1:40'][week-1]}\t${[null,7,7,5][week-1]}\t400 m\t2:00\t8\tPrimary 3K quality.\t`,
      `Thu\tBackpack Carry\t20 kg, 9:30/km\t1\t${[null,8.5,9,8][week-1]} km\tN/A\t6\tControlled ruck.\t`,
    ], 'If shin symptoms return, hold the newest run or ruck progression, reduce impact, and repeat the prior tolerated week.');
}

test('[A] Week 1 with one bearing row plus one non-bearing row already satisfies the validator, so the new repair does nothing', () => {
  const program = tacticalWeek1MixedBearingAndNonBearing();
  const repaired = normalizeTactical3KRaceSpecificity(program, tacticalLiveIntake);
  assert.equal(repaired.repairs.some((r) => r.type === 'tactical_3k_week1_event_session_canonicalized'), false);
  assert.equal(week1Block(repaired.program), week1Block(program));
});

// [B] The key row itself (not just the block-level intro note) carries
// row-local shin-symptom/readiness language and no clock target. Canonicalizing
// the row must append the event-specific cue, never replace the row's own
// safety/readiness text.
function tacticalWeek1RowLocalShinNote() {
  return fourWeeks((week) => [
    `Mon\tBack Squat\t${[120,122.5,125,120][week-1]} kg\t3\t5\t3 min\t7.5\tMaintenance squat.\t`,
    week === 1
      ? 'Tue\tRun\tN/A\t5\t400 m\t2:30\t8\tIf shin symptoms return, stop the session, reduce impact, and repeat the prior tolerated dose.\t'
      : `Tue\tRun\t400 m @ ${['','1:42-1:45','1:40-1:43','1:38-1:40'][week-1]}\t${[null,7,7,5][week-1]}\t400 m\t2:00\t8\tPrimary 3K quality.\t`,
    `Thu\tBackpack Carry\t20 kg, 9:30/km\t1\t${[8,8.5,9,8][week-1]} km\tN/A\t6\tControlled ruck.\t`,
  ]);
}

test('[B] row-local shin-symptom/readiness language on the key row survives canonicalization', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tacticalWeek1RowLocalShinNote(), tacticalLiveIntake);
  assert.ok(repaired.repairs.some((r) => r.type === 'tactical_3k_week1_event_session_canonicalized'));
  assert.match(
    week1Block(repaired.program),
    /If shin symptoms return, stop the session, reduce impact, and repeat the prior tolerated dose\./i,
  );
  assert.match(week1Block(repaired.program), /Tue\tRun\t400 m @ \d{1,2}:\d{2}-\d{1,2}:\d{2}\t5\t400 m/);
  assert.equal(validateTactical3KCoachingSpecV1(repaired.program, tacticalLiveIntake).ok, true);
});

// [C] The AI used a near-miss but clearly running-related exercise name
// ("Running Intervals") instead of the canonical "Run"/"Zone-2 Run" label.
// It must still be found and canonicalized rather than missed.
function tacticalWeek1RunningIntervalsName() {
  return fourWeeks((week) => [
    `Mon\tBack Squat\t${[120,122.5,125,120][week-1]} kg\t3\t5\t3 min\t7.5\tMaintenance squat.\t`,
    week === 1
      ? 'Tue\tRunning Intervals\tN/A\t5\t400 m\t2:30\t8\tControlled effort based on current fitness.\t'
      : `Tue\tRun\t400 m @ ${['','1:42-1:45','1:40-1:43','1:38-1:40'][week-1]}\t${[null,7,7,5][week-1]}\t400 m\t2:00\t8\tPrimary 3K quality.\t`,
    `Thu\tBackpack Carry\t20 kg, 9:30/km\t1\t${[8,8.5,9,8][week-1]} km\tN/A\t6\tControlled ruck.\t`,
  ]);
}

test('[C] "Running Intervals" is recognized as the intended existing key row (sets >= 2, parseable distance)', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tacticalWeek1RunningIntervalsName(), tacticalLiveIntake);
  assert.ok(repaired.repairs.some((r) => r.type === 'tactical_3k_week1_event_session_canonicalized'));
  assert.match(week1Block(repaired.program), /Tue\tRun\t400 m @ \d{1,2}:\d{2}-\d{1,2}:\d{2}\t5\t400 m/);
});

const youthLiveIntake = {
  age: 13,
  days_per_week: 2,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  current_numbers: 'Pistol squat established; ring muscle-up achieved; about 12 strict pull-ups and 6 good ring dips. Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
  notes: 'Skill quality before fatigue; no grinders or repeated failed attempts.',
};

function youthProgram() {
  return fourWeeks((week) => {
    const attempts = [[4,3],[4,4],[5,4],[4,4]][week-1];
    const explosiveSets = [5,5,6,4][week-1];
    return [
      `Session A\tControlled Handstand Kick-up\tBodyweight\t${attempts[0]}\t${attempts[1]}\t60-75 sec\tN/A\tStop early if entry quality drops.\t`,
      `Session A\tBar Muscle-up Transition Drill\t${week >= 3 ? 'Light' : 'Medium'} band\t5\t1\t75-90 sec\t6\tClean transition singles; no misses.\t`,
      `Session A\tExplosive Hip-to-Bar Pull-up\tBodyweight\t${explosiveSets}\t2\t90-120 sec\t6\tPull fast and high; stop if height drops.\t`,
      'Session A\tWall Handstand Hold\tBodyweight\t3\t20 sec\t60-90 sec\t5\tLine capacity.\t',
    ];
  }, 'Skill attempt counts are ceilings. Stop after repeated deterioration in entry, balance or turnover quality.');
}

test('Youth convergence caps attempts, keeps power volume at the baseline, and integrates assisted full bar muscle-up singles', () => {
  const repaired = normalizeYouthSkillAcquisitionQuality(youthProgram(), youthLiveIntake);
  assert.equal(repaired.repaired, true);
  assert.match(repaired.program, /START_WEEK3_TSV[\s\S]*Controlled Handstand Kick-up\tBodyweight\t4\t3\t/);
  assert.match(repaired.program, /START_WEEK3_TSV[\s\S]*Explosive Hip-to-Bar Pull-up\tBodyweight\t5\t2\t/);
  assert.match(repaired.program, /Banded Muscle-up\tBand assistance selected for a smooth full bar turnover\t2\t1\t90 sec\t6\tIntegrated assisted full-skill/);
  const reviewCodes = new Set(collectYouthCoachingSpecV1ReviewSignals(repaired.program, youthLiveIntake).map((x) => x.code));
  assert.equal(reviewCodes.has('YG-02_ATTEMPT_VOLUME_REVIEW'), false);
  assert.equal(reviewCodes.has('YG-05_FULL_SKILL_INTEGRATION_REVIEW'), false);
});

const advancedLiveIntake = {
  age: 30,
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport_sessions_per_week: 5,
  sport: 'MMA',
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  current_numbers: 'Back Squat: 205 kg 1RM | One-Arm Pull-up: 2 strict reps each arm | Running: 1 session a week, about 20 km total',
};

test('Advanced Hybrid convergence holds secondary long-run distance at the tolerated Week 1 dose', () => {
  const program = fourWeeks((week) => [
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tPrimary squat.\t',
    `Tue\tRun\tConversational easy pace\t1\t${[20,21,22,20][week-1]} km\tN/A\t5-6\tSecondary marathon run.\t`,
  ]);
  const repaired = normalizeAdvancedHybridSecondaryRunStability(program, advancedLiveIntake);
  assert.equal(repaired.repaired, true);
  assert.doesNotMatch(repaired.program, /\t21 km\t|\t22 km\t/);
  assert.equal((repaired.program.match(/\t20 km\t/g) || []).length, 4);
});
