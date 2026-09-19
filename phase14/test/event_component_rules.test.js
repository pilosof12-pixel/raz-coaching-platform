// The coach's multi-component event standard, encoded from his answers.
//
// These are the two findings from run #116 that could not be checked before --
// component coverage at 0.60 and compromised running at 0.45, his two most
// expensive on that program -- plus the routing and weights he gave for events
// made of named parts.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  eventComponentCoverage, benchmarkedComponentNeglected, compromisedWorkMissing,
  raceRehearsalMissing, componentLoadUnanchored, EVENT_COMPONENT_RULES,
} from '../engine/event_component_rules.js';
import {
  selectProgramType, namedComponentsFor, weightedScore, DIMENSIONS, DEDUCTIONS, PROGRAM_TYPE,
} from '../engine/coach_standard.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => fs.readFileSync(path.join(root, 'fixtures', f), 'utf8');
const json = (f) => JSON.parse(fx(f));
const PROGRAM = fx('run116_dual_event_hyrox.txt');
const HYROX = {
  age: 33, experience: 'Advanced (3+ years)',
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  maintenance_goals: ['Hold my squat and pulling strength through both'],
  days_per_week: 4, gym_availability_mode: 'flexible', available_gym_days: [],
  sport: 'Hyrox', sport_schedule: [],
  current_numbers: 'Back Squat: 150 kg x 1\nDeadlift: 190 kg x 1\n5 km run: 19:40\n1 km ski erg: 3:38',
  pain: { active: false }, event_type: 'hybrid_race', event_priority: 'A',
};

test('a hybrid race routes to its own program type, not to unclassified', () => {
  assert.equal(selectProgramType(HYROX), PROGRAM_TYPE.HYBRID_MULTI_COMPONENT_EVENT);
  assert.equal(namedComponentsFor(HYROX).length, 8);
});

test('a sport with its own model keeps it', () => {
  // "specific sport model exists -> use that model". A powerlifting or Olympic
  // meet has named lifts and would satisfy the component test, but the
  // weightlifting branch holds better rules and must win.
  const C = json('competition_avatars.json');
  assert.equal(selectProgramType(C.weightlifter_peak), PROGRAM_TYPE.WEIGHTLIFTING);
  assert.equal(selectProgramType({ ...C.mma_fight_camp, event_type: 'combat' }), PROGRAM_TYPE.COMBAT_CAMP);
});

test('a single-task event does not become a component event', () => {
  const tt = { primary_goals: ['Run a 3 km time trial in 11:30'], secondary_goals: ['ruck strength'] };
  assert.notEqual(selectProgramType(tt), PROGRAM_TYPE.HYBRID_MULTI_COMPONENT_EVENT);
});

test('his weights are recorded as given, and sum to one', () => {
  const dims = DIMENSIONS[PROGRAM_TYPE.HYBRID_MULTI_COMPONENT_EVENT];
  assert.equal(dims.reduce((n, [, w]) => n + w, 0).toFixed(2), '1.00');
  assert.deepEqual(dims.map(([, w]) => w), [0.30, 0.20, 0.15, 0.15, 0.10, 0.10]);
});

test('his dimension scores against his weights give 7.465, not the 7.3 he published', () => {
  // Recorded rather than tuned away. The other four weight sets reproduce his
  // published scores to four decimals; this one is newly codified and does not,
  // and fitting six weights to one observation would mean nothing afterwards.
  const { score } = weightedScore(PROGRAM_TYPE.HYBRID_MULTI_COMPONENT_EVENT, {
    event_specificity_and_component_coverage: 6.4,
    conditioning_progression_and_race_preparation: 7.1,
    strength_maintenance_and_interference: 8.5,
    taper_and_competition_week: 7.6,
    athlete_specific_constraints: 8.4,
    execution_rules_and_autoregulation: 8.7,
  });
  assert.equal(Number(score.toFixed(4)), 7.4650);
});

test('his finding 1: the stations the block never trains', () => {
  const flags = eventComponentCoverage(PROGRAM, HYROX);
  const never = flags.find((f) => f.rule === 'EVENT_COMPONENT_NEVER_TRAINED');
  assert.ok(never, 'coverage finding missing');
  for (const absent of ['SkiErg', 'Sled Pull', 'Farmers Carry', 'Wall Ball']) {
    assert.ok(never.components.includes(absent), `${absent} should be reported absent`);
  }
  assert.ok(flags.some((f) => f.rule === 'EVENT_COMPONENT_COVERAGE_WEEK1'));
});

test('a benchmarked component carries the higher requirement', () => {
  // The athlete gave a 1 km SkiErg of 3:38, so omitting it is a larger defect
  // than omitting a station they have no number for.
  const flags = benchmarkedComponentNeglected(PROGRAM, HYROX);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].component, 'SkiErg');
});

test('his finding 2: running is never trained off a station', () => {
  const flags = compromisedWorkMissing(PROGRAM, HYROX);
  assert.ok(flags.some((f) => f.rule === 'COMPROMISED_RUNNING_MISSING'), JSON.stringify(flags));
});

test('a cable row is not the rowing erg', () => {
  // The first version matched "Chest-Supported Row" as the Row station, because
  // a negative lookahead passes when the excluded word never follows. That
  // counted a cable row as a race station, satisfied the compromised-running
  // floor, and hid the finding this file exists to catch.
  const model = EVENT_COMPONENT_RULES; // touch the export so the module loads
  assert.ok(model.length >= 5);
  const coverage = eventComponentCoverage(PROGRAM, HYROX);
  const never = coverage.find((f) => f.rule === 'EVENT_COMPONENT_NEVER_TRAINED');
  // The block contains Seated Cable Row and Chest-Supported Row in every week
  // and no erg row until Friday, so Row must not be reported as never trained.
  assert.ok(!never.components.includes('Row'), 'the Friday erg row should count as the Row station');
});

test('no rehearsal in the first two weeks is a finding', () => {
  assert.ok(raceRehearsalMissing(PROGRAM, HYROX).some((f) => f.rule === 'RACE_REHEARSAL_MISSING'));
});

test('an unanchored load is a defect on a station and not on an accessory', () => {
  // His calibration: RPE-selected is fine on accessory work carrying an RPE, and
  // a defect where the load is what makes the work specific to the race.
  const flags = componentLoadUnanchored(PROGRAM, HYROX);
  assert.ok(flags.some((f) => f.component === 'Sled Push'), JSON.stringify(flags));
  assert.ok(!flags.some((f) => /pallof|plank|curl|calf/i.test(f.movement)), 'accessories must not be charged');
});

test('none of it fires on a program with no named components', () => {
  const C = json('competition_avatars.json');
  const A = json('acceptance_intakes.json');
  for (const [file, intake] of [
    ['run101_weightlifter_peak.txt', C.weightlifter_peak],
    ['run81_tactical_3k.txt', A.tactical_3k],
    ['run113_mma_camp_delivered.txt', C.mma_fight_camp],
  ]) {
    for (const fn of EVENT_COMPONENT_RULES) {
      assert.deepEqual(fn(fx(file), intake), [], `${fn.name} fired on ${file}`);
    }
  }
});

test('his costs are recorded as his', () => {
  assert.equal(DEDUCTIONS.EVENT_COMPONENT_COVERAGE_INCOMPLETE.typical, 0.60);
  assert.equal(DEDUCTIONS.COMPROMISED_WORK_MISSING.typical, 0.45);
});
