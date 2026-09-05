import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { cutSize, makingWeight, collectWeightCutFlags } from '../engine/v75_weight_cut.js';
import { collectFightWeekClockFlags } from '../engine/v77_fight_week_clock.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const iso = (w) => new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10);
const LIFTER = { ...COMP.weightlifter_meet_week, competition_date: iso(4), event_type: 'strength_meet', event_priority: 'A' };
const FIGHTER = {
  ...COMP.mma_fight_camp, competition_date: iso(4), weigh_in_date: iso(4 - 1 / 7),
  event_type: 'combat', event_priority: 'A',
};

test('two lift numbers in a sentence are not a weight cut', () => {
  // "Snatch: 112 kg best in training, 108 kg at last meet" was read as a 4 kg
  // cut, which capped effort across a whole peak block and killed the build.
  assert.match(String(LIFTER.current_numbers), /112 kg.*108 kg/s);
  assert.equal(makingWeight(LIFTER), false);
  assert.equal(cutSize(LIFTER), null);
});

test('a real cut is still read', () => {
  assert.equal(makingWeight(FIGHTER), true);
  assert.equal(cutSize(FIGHTER), 4);
  assert.equal(cutSize({ notes: 'Needs to cut 3 kg before the weigh-in' }), 3);
  assert.equal(cutSize({ bodyweight: '89 kg', weight_class_status: 'making weight', notes: 'Competing in the 85 kg class' }), 4);
});

test('an athlete with no weight class is never told about a cut', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(makingWeight(intake), false, id);
    assert.equal(cutSize(intake), null, id);
    assert.equal(collectWeightCutFlags('', intake).length, 0, id);
  }
});

test('the event clock speaks the sport the athlete actually does', () => {
  const bare = 'A block.\n\nSTART_WEEK4_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\n'
    + 'Mon\tSnatch\t100 kg\t3\t1\t3 min\t7\tcrisp\t\nEND_WEEK4_TSV';
  const lifter = collectFightWeekClockFlags(bare, LIFTER);
  assert.equal(lifter.length, 1);
  assert.match(lifter[0].detail, /Competition week runs Day -7 to Day 0/);
  assert.doesNotMatch(lifter[0].detail, /Fight week/, 'a barbell lifter is not fighting anyone');

  const fighter = collectFightWeekClockFlags(bare, FIGHTER);
  assert.equal(fighter.length, 1);
  assert.match(fighter[0].detail, /Fight week runs Day -7 to Day 0/);
});
