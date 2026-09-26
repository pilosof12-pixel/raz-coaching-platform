// Run #143 put Weighted Dip on Monday 3x5, Wednesday 3x6 and Saturday 3x4 --
// nine weekly work sets of a movement none of this athlete's goals name, in a
// week already carrying wall handstand push-ups, freestanding negatives, two
// planche exposures and the muscle-ups the dip supports. Both reviewers charged
// the cumulative upper-body load; one scored elbow/shoulder management 7.5, the
// other called the dip volume "approaching diminishing returns".
//
// The correction is a volume trim, not an exposure cap. Three dip exposures are
// not wrong -- the coach said plainly he did not want a rule forbidding the third
// -- so only the exposure that is not anchored by a goal movement gives up a set.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectSupportivePressVolumeFlags, repairSupportivePressVolume,
} from '../engine/supportive_press_volume.js';
import { normalizeFinalNoteCoherence } from '../engine/final_note_coherence.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));
const DELIVERED = fs.readFileSync(path.join(here, '..', 'run143-advanced-calisthenics-for-coach.txt'), 'utf8');

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const week = (n, rows) => [`START_WEEK${n}_TSV`, HEAD, ...rows, `END_WEEK${n}_TSV`].join('\n');
const dip = (day, sets) => `${day}\tWeighted Dip\t20 kg\t${sets}\t6\t150s\t7\tSupport press.\t`;
const goal = (day) => `${day}\tMuscle-up\tBW\t4\t2,1,1,1\t180s\t8\tStrict on rings.\t`;
const build = (rows) => [1, 2, 3, 4].map((n) => week(n, rows)).join('\n\n');
const dipSets = (program) => program.split('\n')
  .filter((l) => /\tWeighted Dip\t/.test(l))
  .map((l) => `${l.split('\t')[0]}:${l.split('\t')[3]}`);

test('the unanchored exposure is the one that gives up a set', () => {
  const flags = collectSupportivePressVolumeFlags(DELIVERED, INTAKE);
  assert.equal(flags.length, 3, 'weeks 1-3 carry nine dip sets; week 4 already consolidates');
  for (const f of flags) {
    assert.equal(f.exercise, 'Weighted Dip');
    assert.match(f.message, /wed exposure is not anchored/);
  }

  const { program, repairs } = repairSupportivePressVolume(DELIVERED, INTAKE);
  assert.equal(repairs.length, 3);
  // Monday and Saturday carry the muscle-up the dip supports, so they stay whole.
  assert.deepEqual(dipSets(program).slice(0, 3), ['Mon:3', 'Wed:2', 'Sat:3']);
});

test('the consolidation week is left alone', () => {
  const { program } = repairSupportivePressVolume(DELIVERED, INTAKE);
  assert.deepEqual(dipSets(program).slice(9), ['Mon:2', 'Wed:2', 'Sat:2'],
    'week 4 was already at two sets and has nothing to give');
});

test('a movement the goals name is not trimmed', () => {
  // The volume is the point of the block, not a cost.
  const program = build([goal('Mon'), dip('Mon', 3), dip('Wed', 3), dip('Sat', 3)]);
  const asGoal = { ...INTAKE, primary_goals: ['Weighted Dip with 40 kg for 5'] };
  assert.deepEqual(collectSupportivePressVolumeFlags(program, asGoal), []);
});

test('two exposures, or three light ones, are left alone', () => {
  const twoDays = build([goal('Mon'), dip('Mon', 3), dip('Wed', 3)]);
  assert.deepEqual(collectSupportivePressVolumeFlags(twoDays, INTAKE), [],
    'two exposures is not the case the coach raised');

  // Three exposures but only six sets: already light, nothing to trim.
  const light = build([goal('Mon'), dip('Mon', 2), dip('Wed', 2), dip('Sat', 2)]);
  assert.deepEqual(collectSupportivePressVolumeFlags(light, INTAKE), []);
});

test('the trim settles', () => {
  const once = repairSupportivePressVolume(DELIVERED, INTAKE).program;
  const twice = repairSupportivePressVolume(once, INTAKE);
  assert.equal(twice.program, once, 'a repair that keeps trimming never converges');
  assert.equal(twice.repairs.length, 0);
});

// The trim creates a note defect, so the two have to work together.
test('a note naming a set the trim removed is renumbered, not deleted', () => {
  const note = 'Recovery-contingent support press; if you feel flat, remove set 3 first.';
  const row = (sets) => `Wed\tWeighted Dip\t20 kg\t${sets}\t6\t150s\t7\t${note}\t`;

  const trimmed = normalizeFinalNoteCoherence(build([goal('Mon'), row(2)]), INTAKE);
  assert.match(trimmed.program, /remove set 2 first/,
    'the instruction is "shed the last set", which is still right on a shorter row');
  assert.doesNotMatch(trimmed.program, /remove set 3 first/);

  const untouched = normalizeFinalNoteCoherence(build([goal('Mon'), row(3)]), INTAKE);
  assert.match(untouched.program, /remove set 3 first/, 'set 3 exists on a three-set row');
});

test('with no set left to shed, the clause goes', () => {
  const note = 'Support press; if you feel flat, remove set 3 first.';
  const single = `Wed\tWeighted Dip\t20 kg\t1\t6\t150s\t7\t${note}\t`;
  const out = normalizeFinalNoteCoherence(build([goal('Mon'), single]), INTAKE).program;
  assert.doesNotMatch(out, /remove set/, 'a one-set row cannot shed a set');
  assert.match(out, /Support press/, 'and the rest of the note survives');
});

test('the delivered program comes out of the bundle coherent', () => {
  const settled = collectRepairableValidationFailures(DELIVERED, INTAKE);
  assert.equal(settled.ok, true);
  const wed = settled.program.split('\n').filter((l) => /^Wed\tWeighted Dip/.test(l));
  assert.ok(wed.length >= 3);
  for (const line of wed.slice(0, 3)) {
    const cells = line.split('\t');
    assert.equal(cells[3], '2', 'the Wednesday dip is trimmed');
    assert.doesNotMatch(cells[7], /set 3/, 'and its note does not name a set it no longer has');
  }
});
