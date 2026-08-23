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
