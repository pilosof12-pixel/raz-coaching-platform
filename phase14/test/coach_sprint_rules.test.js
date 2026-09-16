import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  sprintSpeedExposure, sprintDistanceSpecificity, repeatedSprintExposure,
  eccentricHamstringTiming, promisedMovementAbsent, sprintBenchmark, restSecondsOf,
} from '../engine/coach_rules.js';
import { overallScore, PROGRAM_TYPE } from '../engine/coach_standard.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const FOOTBALLER = JSON.parse(read('hard_avatars.json')).inseason_footballer;
const A = () => read('inseason_footballer-program.txt');
const B = () => read('run100_inseason_footballer.txt');
const Cp = () => read('run101_inseason_footballer.txt');

// The three football programs scored 8.2, 8.7 and 9.0, and the whole spread sat
// in how they handled speed. These rules have to separate them the same way.
test('the in-season weights reproduce all three football scores', () => {
  const cases = [
    [8.2, { match_week_integration: 8.8, strength_and_power_maintenance: 7.2, fatigue_and_tissue_load: 8.7, athlete_specific_availability: 9.0, secondary_quality_support: 6.5, execution_rules: 8.8 }],
    [8.7, { match_week_integration: 9.0, strength_and_power_maintenance: 8.5, fatigue_and_tissue_load: 8.8, athlete_specific_availability: 9.1, secondary_quality_support: 6.8, execution_rules: 9.0 }],
    [9.0, { match_week_integration: 9.2, strength_and_power_maintenance: 9.1, fatigue_and_tissue_load: 8.8, athlete_specific_availability: 9.3, secondary_quality_support: 7.2, execution_rules: 9.2 }],
  ];
  for (const [stated, dims] of cases) {
    assert.equal(overallScore(PROGRAM_TYPE.IN_SEASON_TEAM_SPORT, dims).overall, stated);
  }
});

test('the sprint benchmark is read from the intake', () => {
  assert.deepEqual(sprintBenchmark(FOOTBALLER), { metres: 30, seconds: 4.05 });
});

// A warm-up with two build-ups is not a sprint exposure: nothing about its
// intensity, distance or rep quality is prescribed.
test('a primary sprint goal with no prescribed sprint is found', () => {
  const flags = sprintSpeedExposure(A(), FOOTBALLER);
  assert.equal(flags.length, 1);
  assert.deepEqual(flags[0].weeks, [1, 2, 3, 4]);
  assert.match(flags[0].detail, /30 m in 4\.05 s/);
  // B and C both prescribe accelerations, and both pass.
  assert.deepEqual(sprintSpeedExposure(B(), FOOTBALLER), []);
  assert.deepEqual(sprintSpeedExposure(Cp(), FOOTBALLER), []);
});

// Without plural matching this missed "Fast relaxed accelerations", and accused
// the best of the three programs of having no sprint work at all.
test('accelerations in the plural still read as sprint work', () => {
  assert.deepEqual(sprintSpeedExposure(Cp(), FOOTBALLER), []);
});

// By Week 3 one session should reach the benchmark distance or 75% of it. B
// stays at 20 m against a 30 m benchmark; C reaches 30 m.
test('sprint distance is measured against the athlete benchmark', () => {
  const flags = sprintDistanceSpecificity(B(), FOOTBALLER);
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /longest sprint prescribed by Week 3 is 20 m, short of the 23 m/);
  assert.deepEqual(sprintDistanceSpecificity(Cp(), FOOTBALLER), []);
});

// His machine definition: more than two reps, each 10 s or less, 95% or above,
// under 60 s of deliberately incomplete recovery. All three programs fail it,
// which is why he charged all three.
test('work called repeated-sprint must meet the repeated-sprint definition', () => {
  for (const [p, id] of [[A(), 'A'], [B(), 'B'], [Cp(), 'C']]) {
    const flags = repeatedSprintExposure(p, FOOTBALLER);
    assert.equal(flags.length, 1, id);
    assert.equal(flags[0].rule, 'REPEATED_SPRINT_EXPOSURE_MISSING');
  }
  // An exposure that meets it clears the rule.
  const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const good = [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, HEAD,
    'Thu\tRepeated Sprint\t95%+\t5\t20 m\t25 s\t9\tIncomplete recovery on purpose.\t',
    `END_WEEK${w}_TSV`, ''].join('\n')).join('\n');
  assert.deepEqual(repeatedSprintExposure(good, FOOTBALLER), []);
});

test('rest cells are read in seconds however they are written', () => {
  assert.equal(restSecondsOf('25 s'), 25);
  assert.equal(restSecondsOf('20-30 s'), 30);
  assert.equal(restSecondsOf('2:30'), 150);
  assert.equal(restSecondsOf('3 min'), 180);
  assert.equal(restSecondsOf('N/A'), null);
});

// Tuesday is MD-4 for a Saturday match, which he confirmed is the right home
// for the eccentric dose. All three programs put Nordics there.
test('eccentric hamstring work inside 72 hours of a match is found', () => {
  for (const p of [A(), B(), Cp()]) assert.deepEqual(eccentricHamstringTiming(p, FOOTBALLER), []);
  const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const friday = [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, HEAD,
    'Fri\tNordic Hamstring Curl\tBodyweight\t3\t5\t90 s\t8\tHeavy eccentric.\t',
    `END_WEEK${w}_TSV`, ''].join('\n')).join('\n');
  const flags = eccentricHamstringTiming(friday, FOOTBALLER);
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /24 hours before the SAT match/);
  // No hamstring history, no rule.
  assert.deepEqual(eccentricHamstringTiming(friday, { ...FOOTBALLER, injuries: '', pain: {} }), []);
});

// His criticism of the claims rule: it could only see claims about things the
// block contained. "Week 2 adds one acceleration rep" with no acceleration
// anywhere was invisible because there was nothing to measure.
test('a movement the narrative promises and never prescribes is found', () => {
  const flags = promisedMovementAbsent(A());
  assert.deepEqual(flags.map((f) => f.movement), ['acceleration']);
  assert.match(flags[0].detail, /Week 2 adds one acceleration rep/);
});

// "clean" is an adjective in almost every program here, a Prowler is a sled,
// and a row named "Run" can prescribe accelerations in its note.
test('the promised-movement rule stays quiet on the other five programs', () => {
  for (const f of ['run100_inseason_footballer.txt', 'run101_inseason_footballer.txt',
    'run81_tactical_3k.txt', 'run113_mma_camp_delivered.txt', 'run101_weightlifter_peak.txt',
    'run81_advanced_hybrid.txt', 'weightlifter_peak-program.txt']) {
    assert.deepEqual(promisedMovementAbsent(read(f)), [], f);
  }
});
