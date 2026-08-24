import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectEnduranceVolumeFlags, repairEnduranceVolume, endurancePrimary, buildEnduranceVolumeBrief,
} from '../engine/v57_endurance_volume_governor.js';
import { collectSemanticFlags, repairSemanticProse, cleanSentence } from '../engine/v58_semantic_cleanup.js';

const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg', 'strict pull-ups 14 toward 18-20'],
};
const STRENGTH_ATHLETE = { primary_goals: ['220kg back squat', '4 One arm pullups'] };

function week(rows) {
  return ['START_WEEK1_TSV',
    'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
    ...rows, 'END_WEEK1_TSV'].join('\n');
}

// The exact shape the coach reported: an 8 km ruck on Thursday, then Friday
// loading the same tissue at RPE 8 alongside a 40-minute run.
const RUCK_THEN_ACCESSORIES = week([
  'Thu\tBackpack Carry\t20 kg\t1\t8 km\tN/A\t6\tRuck.\t',
  'Fri\tBulgarian Split Squat\tRPE-selected dumbbells\t3\t8/side\t1:45\t8\tAccessory.\t',
  'Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10-12\t1:30\t8\tHamstrings.\t',
  'Fri\tRun\t5:45-6:15/km easy\t1\t40 min\tN/A\t4-5\tEasy.\t',
  'Mon\tBack Squat\t120 kg\t2\t3\t3:00\t6.5\tMaintenance strength.\t',
]);

test('an endurance primary goal is recognised from the goal text', () => {
  assert.equal(endurancePrimary(TACTICAL), true);
  assert.equal(endurancePrimary(STRENGTH_ATHLETE), false);
  assert.equal(endurancePrimary({}), false);
});

test('lower-body accessories beside key endurance work are flagged', () => {
  const flags = collectEnduranceVolumeFlags(RUCK_THEN_ACCESSORIES, TACTICAL);
  const names = flags.map((f) => f.exercise).sort();
  assert.deepEqual(names, ['Bulgarian Split Squat', 'Machine Hamstring Curl']);
  assert.ok(flags.every((f) => f.code === 'V57_ACCESSORY_STEALS_ENDURANCE_RECOVERY'));
});

// The hierarchy is primary event work > maintenance strength > tissue work >
// accessories. A conservative squat is how an endurance athlete stays strong.
test('maintenance strength is never governed', () => {
  const flags = collectEnduranceVolumeFlags(RUCK_THEN_ACCESSORIES, TACTICAL);
  assert.equal(flags.some((f) => /Back Squat/.test(f.exercise)), false);
  const fixed = repairEnduranceVolume(RUCK_THEN_ACCESSORIES, TACTICAL);
  const squat = fixed.split('\n').find((l) => l.startsWith('Mon\tBack Squat')).split('\t');
  assert.equal(squat[3], '2');
  assert.equal(squat[6], '6.5');
});

test('the repair holds the dose and converges in one pass', () => {
  const fixed = repairEnduranceVolume(RUCK_THEN_ACCESSORIES, TACTICAL);
  assert.equal(collectEnduranceVolumeFlags(fixed, TACTICAL).length, 0);
  const bss = fixed.split('\n').find((l) => l.startsWith('Fri\tBulgarian')).split('\t');
  assert.equal(bss[3], '2', 'sets held to the minimum useful dose');
  assert.equal(bss[6], '7', 'effort held');
  assert.equal(bss[4], '8/side', 'reps unchanged');
  assert.match(bss[7], /minimum useful dose/);
});

test('the governor is idempotent and leaves a strength athlete alone', () => {
  const once = repairEnduranceVolume(RUCK_THEN_ACCESSORIES, TACTICAL);
  assert.equal(repairEnduranceVolume(once, TACTICAL), once);
  assert.equal(repairEnduranceVolume(RUCK_THEN_ACCESSORIES, STRENGTH_ATHLETE), RUCK_THEN_ACCESSORIES);
  assert.equal(collectEnduranceVolumeFlags(RUCK_THEN_ACCESSORIES, STRENGTH_ATHLETE).length, 0);
});

test('accessories far from endurance work are left alone', () => {
  const isolated = week([
    'Mon\tRun\teasy\t1\t25 min\tN/A\t4\tEasy.\t',
    'Thu\tBulgarian Split Squat\tdumbbells\t3\t8/side\t1:45\t8\tAccessory.\t',
  ]);
  // Thu is adjacent to nothing endurance here (Mon run is three days away).
  assert.equal(collectEnduranceVolumeFlags(isolated, TACTICAL).length, 0);
});

test('the brief states the recovery hierarchy', () => {
  assert.match(buildEnduranceVolumeBrief(TACTICAL), /primary event work/);
  assert.equal(buildEnduranceVolumeBrief(STRENGTH_ATHLETE), '');
});

// --- v58 -------------------------------------------------------------------

// repairRowNote substitutes "sets of N" where a singular noun stood, which is
// correct arithmetic and broken English. It reached an athlete four times.
test('the live malformed note is repaired into a sentence', () => {
  const out = cleanSentence('sets of 4 quality bilateral support set only');
  assert.equal(out, 'Quality bilateral support — one set of 4 only');
  assert.equal(/sets of 4 quality/.test(out), false);
});

test('a dangling "sets of N" gains its noun', () => {
  assert.match(cleanSentence('Use sets of 5 clean work here'), /sets of 5 reps, clean work here/);
  // Already grammatical text must survive untouched.
  assert.equal(cleanSentence('Use sets of 5 reps at RPE 7'), 'Use sets of 5 reps at RPE 7');
});

test('duplicated words and punctuation are collapsed', () => {
  assert.equal(cleanSentence('Hold Hold the position'), 'Hold the position');
  assert.equal(cleanSentence('Keep it clean .. now'), 'Keep it clean. now');
});

test('malformed notes are flagged and the pass converges', () => {
  const bad = week(['Fri\tChin-up\tRPE-selected\t1\t4\t2-3 min\t7\tsets of 4 quality bilateral support set only\t']);
  assert.equal(collectSemanticFlags(bad).length, 1);
  const fixed = repairSemanticProse(bad);
  assert.equal(collectSemanticFlags(fixed).length, 0);
  assert.equal(repairSemanticProse(fixed), fixed, 'idempotent');
});

test('clean prose is left byte-identical', () => {
  const good = week(['Mon\tBack Squat\t120 kg\t2\t3\t3:00\t6.5\tCompact heavy exposure. Stop if bar speed slips.\t']);
  assert.equal(collectSemanticFlags(good).length, 0);
  assert.equal(repairSemanticProse(good), good);
});
