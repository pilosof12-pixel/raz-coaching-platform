import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { statedMaxes, buildConsolidationBrief, buildStartingLoadBrief } from '../engine/v85_block_fundamentals.js';

const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));

// Modelled on a program a human coach actually wrote: three strength days plus
// two MMA sessions, with every anchor given a starting load in kg and a
// percentage of the athlete's stated max.
const LIFTER = {
  age: 29, days_per_week: 3,
  current_numbers: 'Bench Press: 95 kg 1RM\nWeighted Pull-up: +30 kg x1\nSquat: 100 kg x3',
  performance_markers: ['Bench Press: 95 kg 1RM'],
};

test('the numbers the athlete gave us are read back, once each', () => {
  const maxes = statedMaxes(LIFTER);
  assert.deepEqual(maxes.map((m) => m.lift), ['Bench Press', 'Weighted Pull-up', 'Squat']);
  assert.equal(maxes[0].kg, 95);
  assert.equal(maxes[2].reps, 3, 'a 3-rep max is not a single');
});

test('an athlete who gave us no numbers is not lectured about them', () => {
  assert.equal(buildStartingLoadBrief({}), '');
  assert.equal(buildStartingLoadBrief({ current_numbers: 'I train regularly' }), '');
  assert.equal(buildStartingLoadBrief(CORE.youth_gymnastics), '', 'bodyweight skill work has no kg maxes');
});

test('the load brief refuses the phrase that started this', () => {
  // The weightlifter came back prescribing "RPE-selected load" for every set,
  // which is what the coach's own program never does.
  const brief = buildStartingLoadBrief(LIFTER);
  assert.match(brief, /RPE-selected load" is not/);
  assert.match(brief, /95 kg/);
  assert.match(brief, /%/);
  assert.match(brief, /bodyweight is part of the total/i, 'weighted pull-ups need the caveat');
});

test('week 4 consolidation is taught to everyone who is not youth', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    const brief = buildConsolidationBrief(intake);
    if (id === 'youth_gymnastics') {
      assert.equal(brief, '', 'youth has its own fuller consolidation brief');
    } else {
      assert.match(brief, /WEEK 4 IS A CONSOLIDATION WEEK/, id);
    }
  }
  for (const [id, intake] of Object.entries(COMP)) {
    assert.match(buildConsolidationBrief(intake), /CONSOLIDATION/, id);
  }
});

test('consolidation cuts volume and holds intensity, and says so', () => {
  const brief = buildConsolidationBrief(LIFTER);
  assert.match(brief, /30-40%/);
  assert.match(brief, /Cut volume, not intensity/);
  assert.match(brief, /moderate intensity/);
});
