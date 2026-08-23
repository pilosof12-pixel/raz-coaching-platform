import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  collectUnderloadedAccessoryFlags, collectThinSessionFlags,
  demonstratedLoadKg, canAddExternalLoad, buildSessionSubstanceBrief,
} from '../engine/v53_session_substance.js';
import { goalTierFor, repairKeySessionCrowding } from '../engine/v52_session_hierarchy.js';

// A coach reading a live program called one set of bodyweight Decline Push-ups
// "a waste of an exercise" for an athlete pressing 80 kg overhead, and said a
// session of chin-ups, hamstring curls and neck isometrics was too light to be
// worth travelling for. Every structural rule asked whether work was PRESENT;
// none asked whether it was a stimulus.

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const readFixture = (n) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', `${n}-program.txt`), 'utf8');

const HYBRID = {
  current_numbers: ['Back Squat: 205 kg 1RM', 'Overhead Press: 80 kg x 4', 'Weighted Chin-up: +80 kg 1RM'].join('\n'),
  equipment: 'Full commercial gym', training_location: 'commercial_gym',
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
};
const YOUTH = {
  equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
  training_location: 'home_gym', primary_goals: ['Achieve a freestanding handstand'],
};

test('[Z1] one set of unloaded pressing is not a stimulus at this level', () => {
  const p = ['Overview.', block(1, [
    'Tue\tDecline Push-up\tBodyweight\t1\t10\t60 sec\t7\tUpper-body support.\t',
  ])].join('\n\n');
  const flags = collectUnderloadedAccessoryFlags(p, HYBRID);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V53_UNDERLOADED_ACCESSORY');
  assert.equal(flags[0].demonstrated_kg, 205);
});

test('[Z2] an athlete with no weights is never told their bodyweight work is too easy', () => {
  const p = ['Overview.', block(1, [
    'Session A\tRing Push-up\tBodyweight\t1\t10\t60 sec\t7\tSupport.\t',
  ])].join('\n\n');
  assert.equal(canAddExternalLoad(YOUTH), false);
  assert.deepEqual(collectUnderloadedAccessoryFlags(p, YOUTH), []);
});

test('[Z3] two or more sets, or a stated load, is a legitimate exposure', () => {
  const twoSets = ['Overview.', block(1, ['Tue\tDecline Push-up\tBodyweight\t3\t12\t60 sec\t7\tSupport.\t'])].join('\n\n');
  assert.deepEqual(collectUnderloadedAccessoryFlags(twoSets, HYBRID), []);
  // "RPE-selected load" is an instruction to load to an effort, not an absence of load.
  const rpeLoaded = ['Overview.', block(1, ['Tue\tDecline Push-up\tRPE-selected load\t1\t10\t60 sec\t7\tSupport.\t'])].join('\n\n');
  assert.deepEqual(collectUnderloadedAccessoryFlags(rpeLoaded, HYBRID), []);
});

test('[Z4] demonstrated load comes from the athlete, not an assumption', () => {
  assert.equal(demonstratedLoadKg(HYBRID), 205);
  assert.equal(demonstratedLoadKg({}), null);
  assert.deepEqual(collectUnderloadedAccessoryFlags(
    ['Overview.', block(1, ['Tue\tDecline Push-up\tBodyweight\t1\t10\t60 sec\t7\tS.\t'])].join('\n\n'),
    { equipment: 'Full gym', training_location: 'commercial_gym' },
  ), [], 'no demonstrated strength, no judgement');
});

// --- is the session worth the trip? ------------------------------------------

const THIN_FRIDAY = ['Overview.', block(1, [
  'Fri\tChin-up\tRPE-selected load\t2\t4\t2 min\t7.5\tLow-cost bilateral support.\t',
  'Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tLower-body support.\t',
  'Fri\tPallof Press\tRPE-selected load\t1\t10 each side\t60 sec\t6\tTrunk stiffness.\t',
  'Fri\tNeck Isometric\tRPE-selected load\t1\t20 sec\t45 sec\t6\tNeck robustness.\t',
])].join('\n\n');

test('[Z5] a support-only session below the substance floor is raised', () => {
  const flags = collectThinSessionFlags(THIN_FRIDAY, HYBRID);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].day, 'Fri');
  assert.equal(flags[0].substantive, 2);
});

test('[Z6] calling a session low-cost is not a defence against being empty', () => {
  // The exemption used to be granted on the label, which let a day off exactly
  // the criticism made of it.
  assert.ok(/low-cost/i.test(THIN_FRIDAY));
  assert.equal(collectThinSessionFlags(THIN_FRIDAY, HYBRID).length, 1);
});

test('[Z7] a day carrying goal work has a purpose whatever its dose', () => {
  const technique = ['Overview.', block(1, [
    'Tue\tAssisted One-Arm Pull-up\tMinimum assistance\t2\t1 per arm\t2 min\t6\tTechnique microdose.\t',
    'Tue\tCable Row\tRPE-selected load\t2\t10\t90 sec\t7\tSupport.\t',
    'Tue\tPallof Press\tRPE-selected load\t1\t10\t60 sec\t6\tTrunk.\t',
  ])].join('\n\n');
  assert.deepEqual(collectThinSessionFlags(technique, HYBRID), []);
});

test('[Z8] a specific goal does not claim every related movement as primary', () => {
  // "4 one arm pullups" matched the generic pull-up pattern too, so every
  // chin-up counted as primary work and excused sessions with no goal work.
  assert.equal(goalTierFor('Assisted One-Arm Pull-up', HYBRID), 'primary');
  assert.equal(goalTierFor('Chin-up', HYBRID), 'support');
  assert.equal(goalTierFor('Overhead Press', HYBRID), 'secondary');
});

test('[Z9] relocating the second squat exposure also answers the thin session', () => {
  // The two repairs agree: the squat that had to leave Sunday is exactly what
  // Friday was missing.
  const crowded = ['Overview.', block(1, [
    'Sun\tOverhead Press\t72.5 kg\t4\t4\t2 min\t7.5\tSecondary press.\t',
    'Sun\tBack Squat\t145 kg\t2\t4\t3 min\t6\tLower-cost squat exposure.\t',
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tPrimary.\t',
    'Mon\tBack Squat\t172.5 kg\t3\t3\t3 min\t8\tPrimary, heavy.\t',
    'Fri\tChin-up\tRPE-selected load\t2\t4\t2 min\t7.5\tSupport.\t',
    'Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tSupport.\t',
  ])].join('\n\n');
  assert.equal(collectThinSessionFlags(crowded, HYBRID).length, 1, 'Friday starts thin');
  const moved = repairKeySessionCrowding(crowded, HYBRID).program;
  assert.deepEqual(collectThinSessionFlags(moved, HYBRID), [], 'and is no longer thin once the squat arrives');
});

test('[Z10] no coach-reviewed program is called thin or underloaded', () => {
  const cases = [['advanced_hybrid', HYBRID], ['youth_gymnastics', YOUTH],
    ['tactical_3k', { current_numbers: 'Back Squat: 140 kg x 5', equipment: 'Full gym', training_location: 'commercial_gym', primary_goals: ['Improve 3 km from 13:30 to sub-12:00'], secondary_goals: ['Improve 10 km ruck with 20 kg'] }]];
  for (const [id, intake] of cases) {
    assert.deepEqual(collectUnderloadedAccessoryFlags(readFixture(id), intake), [], `${id} underloaded`);
    assert.deepEqual(collectThinSessionFlags(readFixture(id), intake), [], `${id} thin`);
  }
});

test('[Z11] the brief states the athlete\'s own number', () => {
  assert.match(buildSessionSubstanceBrief(HYBRID), /demonstrated 205 kg/);
  assert.match(buildSessionSubstanceBrief(HYBRID), /three pieces of substantive work/);
  assert.doesNotMatch(buildSessionSubstanceBrief(YOUTH), /STIMULUS FLOOR/);
});

// --- matching the accessory to the athlete ------------------------------------

import { collectAccessoryLevelFlags, demonstratedPressKg } from '../engine/v53_session_substance.js';

// A coach's framing: once you know an athlete's limits and abilities, matching
// the accessory to the demand is straightforward. Someone pressing 90 kg
// overhead should be doing wall handstand push-ups, or pike push-ups at least.
// The engine had no notion that a bodyweight movement has rungs.

test('[Z12] a bodyweight press below the athlete\'s level names the variant that fits', () => {
  const p = ['Overview.', block(1, [
    'Tue\tDecline Push-up\tBodyweight\t3\t12\t60 sec\t7\tUpper-body support.\t',
  ])].join('\n\n');
  const flags = collectAccessoryLevelFlags(p, HYBRID);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V53_ACCESSORY_BELOW_DEMONSTRATED_LEVEL');
  assert.equal(flags[0].press_kg, 80);
  assert.match(flags[0].message, /Wall Handstand Push-up/);
});

test('[Z13] a variant at or above the athlete\'s level passes', () => {
  for (const name of ['Wall Handstand Push-up', 'Handstand Push-up']) {
    const p = ['Overview.', block(1, [`Tue\t${name}\tBodyweight\t3\t5\t90 sec\t8\tPressing.\t`])].join('\n\n');
    assert.deepEqual(collectAccessoryLevelFlags(p, HYBRID), [], name);
  }
});

test('[Z14] loading the movement lifts any rung to a real demand', () => {
  const p = ['Overview.', block(1, ['Tue\tDecline Push-up\t+20 kg vest\t3\t12\t60 sec\t7\tLoaded.\t'])].join('\n\n');
  assert.deepEqual(collectAccessoryLevelFlags(p, HYBRID), []);
});

test('[Z15] an athlete who has not demonstrated a press is not judged', () => {
  assert.equal(demonstratedPressKg(HYBRID), 80);
  assert.equal(demonstratedPressKg({}), null);
  const p = ['Overview.', block(1, ['Tue\tPush-up\tBodyweight\t3\t12\t60 sec\t7\tSupport.\t'])].join('\n\n');
  assert.deepEqual(collectAccessoryLevelFlags(p, YOUTH), []);
});

test('[Z16] a weighted chin-up at a real dose carries a session', () => {
  // A coach's correction: 4x4 weighted is legitimate primary work for a pulling
  // goal, even though the goal names the one-arm version.
  const weighted = ['Overview.', block(1, [
    'Fri\tWeighted Chin-up\tRPE-selected load\t4\t4\t3 min\t8\tLoaded bilateral pulling.\t',
    'Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tSupport.\t',
    'Fri\tNeck Isometric\tRPE-selected load\t1\t20 sec\t45 sec\t6\tNeck.\t',
  ])].join('\n\n');
  assert.deepEqual(collectThinSessionFlags(weighted, HYBRID), []);
});

test('[Z17] two light sets of bodyweight chin-ups do not', () => {
  const light = ['Overview.', block(1, [
    'Fri\tChin-up\tRPE-selected load\t2\t4\t2 min\t7.5\tSupport.\t',
    'Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tSupport.\t',
    'Fri\tNeck Isometric\tRPE-selected load\t1\t20 sec\t45 sec\t6\tNeck.\t',
  ])].join('\n\n');
  assert.equal(collectThinSessionFlags(light, HYBRID).length, 1);
});

// --- what the athlete has told you they will not do ---------------------------

import { collectAdherenceFlags } from '../engine/v53_session_substance.js';
import { intakeClarificationResult, requiredClarifications } from '../intake_clarification.js';

// A coach's last point: do not keep prescribing an accessory the athlete has
// already demonstrated he will not perform. The engine cannot infer it, so it is
// asked as an optional intake question and honoured here.

test('[Z18] a movement the athlete declined is not programmed', () => {
  const declined = { ...HYBRID, clarification_answers: { adherence_exclusions: 'I never do machine hamstring curls, and I skip neck isometrics' } };
  const p = ['Overview.', block(1, [
    'Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tSupport.\t',
    'Fri\tNeck Isometric\tRPE-selected load\t1\t20 sec\t45 sec\t6\tNeck.\t',
    'Fri\tCable Row\tRPE-selected load\t3\t10\t90 sec\t7\tSupport.\t',
  ])].join('\n\n');
  const flags = collectAdherenceFlags(p, declined);
  assert.deepEqual([...new Set(flags.map((f) => f.exercise))].sort(), ['Machine Hamstring Curl', 'Neck Isometric']);
  assert.equal(flags[0].code, 'V53_PRESCRIBES_DECLINED_MOVEMENT');
});

test('[Z19] the movement is extracted from the sentence the athlete wrapped it in', () => {
  // Leaving the verb in produced "will not do do machine hamstring curls" in the
  // brief, and a phrase that matched nothing.
  const declined = { ...HYBRID, clarification_answers: { adherence_exclusions: 'I never do machine hamstring curls' } };
  const p = ['Overview.', block(1, ['Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tS.\t'])].join('\n\n');
  assert.equal(collectAdherenceFlags(p, declined)[0].declined, 'machine hamstring curl');
});

test('[Z20] an athlete who declined nothing is never second-guessed', () => {
  const p = ['Overview.', block(1, ['Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tS.\t'])].join('\n\n');
  assert.deepEqual(collectAdherenceFlags(p, HYBRID), []);
});

test('[Z21] the question is optional: it never blocks a build', () => {
  // A complete intake is asked nothing at all, so adherence costs no round trip.
  const complete = intakeClarificationResult({
    primary_goals: ['220kg back squat'], current_numbers: 'Back Squat: 205 kg 1RM',
    days_per_week: 4, experience: 'advanced',
  });
  assert.equal(complete.questions.length, 0);
  assert.equal(complete.ready, true);

  // An intake already being clarified is offered it alongside what is required.
  const partial = intakeClarificationResult({ primary_goals: ['4 One arm pullups'], secondary_goals: ['Improve 5 km from 25:00 to 22:30'] });
  const optional = partial.questions.find((q) => q.id === 'adherence_exclusions');
  assert.ok(optional, 'offered while the athlete is already answering');
  assert.equal(optional.required, false);
  assert.ok(requiredClarifications(partial.questions).every((q) => q.id !== 'adherence_exclusions'),
    'and never counted among the answers that gate the build');
});
