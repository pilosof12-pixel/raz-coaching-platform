import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { accessoryRedundancy, statedGoalFamilies, goalFamilies } from '../engine/coach_rules.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const A = JSON.parse(read('acceptance_intakes.json'));
const C = JSON.parse(read('competition_avatars.json'));
const H = JSON.parse(read('hard_avatars.json'));

// goalFamilies drops goals phrased as a hold, which is right for "must this
// progress" and exactly wrong for "does this serve a stated goal". Reading
// "Maintain the squat and hamstring strength I have" as no goal at all made a
// block full of squats look like pure redundancy.
test('a maintenance goal still counts as a goal the work serves', () => {
  const held = { maintenance_goals: ['Maintain the squat and hamstring strength I have'] };
  assert.deepEqual(goalFamilies(held, ['primary', 'secondary', 'maintenance']), [], 'nothing to progress');
  assert.equal(statedGoalFamilies(held).length, 1, 'but the squat is asked for');
  assert.ok(statedGoalFamilies(held)[0].test('Back Squat'));
});

// Three of his four accessory findings are one shape: a movement function with
// several slots a week that serves nothing the athlete asked for.
test('it reproduces the three accessory findings of that shape', () => {
  const lifter = accessoryRedundancy(read('run101_weightlifter_peak.txt'), C.weightlifter_peak);
  assert.equal(lifter.length, 1);
  assert.deepEqual(lifter[0].functions, ['horizontal_pull'], 'his four rowing exposures');
  assert.match(lifter[0].detail, /Pendlay Row/);
  for (const f of ['inseason_footballer-program.txt', 'run101_inseason_footballer.txt']) {
    const flags = accessoryRedundancy(read(f), H.inseason_footballer);
    assert.equal(flags.length, 1, f);
    assert.deepEqual(flags[0].functions, ['horizontal_pull'], f);
  }
});

// The fourth is a different shape -- one row and one Pallof Press in a late
// fight camp -- which is a marginal-return call, and that half stays his.
test('a marginal-return finding is not forced into the redundancy rule', () => {
  assert.deepEqual(accessoryRedundancy(read('run113_mma_camp_delivered.txt'), C.mma_fight_camp), [],
    'the fight camp goal names no movement, so nothing here is measurable');
});

test('work that serves a stated goal is not redundancy however often it appears', () => {
  // Five squat exposures for a weightlifter whose goals name front and back squat.
  const lifter = accessoryRedundancy(read('run101_weightlifter_peak.txt'), C.weightlifter_peak);
  assert.ok(!lifter[0].functions.includes('knee_dominant_squat'));
  assert.ok(!lifter[0].functions.includes('olympic_lift'));
  // And the tactical block, whose squat and deadlift are named maintenance.
  assert.deepEqual(accessoryRedundancy(read('run81_tactical_3k.txt'), A.tactical_3k), []);
});

// One exercise done twice a week is frequency. Two different exercises filling
// one slot is the duplication he charged for.
test('the same exercise repeated across a week is not two exposures', () => {
  assert.deepEqual(accessoryRedundancy(read('run81_advanced_hybrid.txt'), A.advanced_hybrid), [],
    'a single Cable Row appearing twice is not a redundant pair');
});

// He charged A and C 0.10 each for Chest-Supported Row plus a second row, and
// charged B nothing for the identical pair. The rule follows his standard
// rather than his scoring, and the disagreement is recorded rather than tuned
// away -- as the trap bar and bench press ones were, both of which he then
// settled.
test('it also flags the program he scored without raising it', () => {
  const b = accessoryRedundancy(read('run100_inseason_footballer.txt'), H.inseason_footballer);
  assert.equal(b.length, 1);
  assert.match(b[0].detail, /Chest-Supported Row, Seated Cable Row/);
});

// The live block was reported clean before this rule existed. It is not.
test('the live footballer block carries the same redundant pair', () => {
  const live = accessoryRedundancy(read('run115_inseason_footballer.txt'), H.inseason_footballer);
  assert.equal(live.length, 1);
  assert.deepEqual(live[0].functions, ['horizontal_pull']);
});
