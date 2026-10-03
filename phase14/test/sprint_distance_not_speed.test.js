// "Sprint" also names a race distance. A sprint triathlon is 750 m, 20 km and
// 5 km; the triathlete was charged SPRINT_SPEED_EXPOSURE_MISSING for not doing
// flying 30s. Both sprint rules asked with the same regex and share one check now.

import test from 'node:test';
import assert from 'node:assert/strict';

import { primaryGoalIsSpeed, sprintSpeedExposure, sprintDistanceSpecificity } from '../engine/coach_rules.js';

test('a race-distance category is not a speed goal', () => {
  for (const g of ['Go sub-1:15 at the sprint triathlon in 8 weeks', 'Finish a sprint-distance duathlon', 'Sprint tri in June']) {
    assert.equal(primaryGoalIsSpeed({ primary_goals: [g] }), false, g);
  }
});

test('an actual speed goal still is', () => {
  for (const g of ['Improve my 30 m sprint from 4.3 s', 'Hold sprint speed through the season', 'Top speed for the wing']) {
    assert.equal(primaryGoalIsSpeed({ primary_goals: [g] }), true, g);
  }
});

test('neither sprint rule charges a triathlete for the race name', () => {
  const prog = 'START_WEEK1_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\nMon\tRun\t5:00/km\t1\t40 min\t\t4\tEasy.\t\nEND_WEEK1_TSV';
  const tri = { primary_goals: ['Go sub-1:15 at the sprint triathlon in 8 weeks'] };
  assert.deepEqual(sprintSpeedExposure(prog, tri), []);
  assert.deepEqual(sprintDistanceSpecificity(prog, tri), []);
});
