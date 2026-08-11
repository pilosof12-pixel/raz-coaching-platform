import test from 'node:test';
import assert from 'node:assert/strict';
import {
  specificModalityRequirement,
  hasSpecificModalityExposure,
  phase15PromptRules,
} from '../engine/phase15_program_qa.js';

function programWith(exercise='Rower') {
  const block = (w) => `START_WEEK${w}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\nTue\t${exercise}\tRPE-selected load\t1\t25 min\tsteady\t5\tSpecific test row.\t\nEND_WEEK${w}_TSV`;
  return [1,2,3,4].map(block).join('\n');
}

test('5K goal requires running-specific exposure, not rower cross-training only', () => {
  const intake = {
    primary_goals:['Back squat 200 kg'],
    secondary_goals:['Improve 5 km from 25:00 to 22:30'],
    sport:'MMA / BJJ',
    sport_schedule:[{day:'Mon', intensity:'hard'}],
  };
  const req = specificModalityRequirement(intake);
  assert.equal(req?.key, 'running');
  assert.equal(req?.externalSatisfied, false);
  assert.equal(hasSpecificModalityExposure(programWith('Rower'), intake), false);
  assert.equal(hasSpecificModalityExposure(programWith('Zone-2 Run'), intake), true);
  assert.match(phase15PromptRules(intake), /MODALITY-SPECIFIC HARD RULE: running/i);
});

test('generic conditioning without a named modality remains engine-selected', () => {
  const intake = {
    primary_goals:['Improve general strength'],
    secondary_goals:['Improve conditioning and aerobic capacity'],
    sport:'',
    sport_schedule:[],
  };
  assert.equal(specificModalityRequirement(intake), null);
  assert.equal(hasSpecificModalityExposure(programWith('Zone-2 Bike'), intake), true);
  assert.doesNotMatch(phase15PromptRules(intake), /MODALITY-SPECIFIC HARD RULE:/i);
});

test('specific modality already practiced in scheduled sport counts as direct exposure', () => {
  const intake = {
    primary_goals:['Improve 2k rowing time'],
    secondary_goals:[],
    sport:'Rowing',
    sport_schedule:[{day:'Tue', intensity:'moderate'}, {day:'Sat', intensity:'hard'}],
  };
  const req = specificModalityRequirement(intake);
  assert.equal(req?.key, 'rowing');
  assert.equal(req?.externalSatisfied, true);
  assert.equal(hasSpecificModalityExposure(programWith('Zone-2 Bike'), intake), true);
});

test('strength-day prompt permits low-cost resistance support but not silent cardio substitution', () => {
  const intake = {
    primary_goals:['Improve strength'],
    secondary_goals:[],
    days_per_week:4,
    sport:'MMA / BJJ',
    sport_schedule:[
      {day:'Mon', intensity:'hard'},
      {day:'Wed', intensity:'hard'},
      {day:'Fri', intensity:'hard'},
      {day:'Sat', intensity:'hard'},
    ],
  };
  const rules = phase15PromptRules(intake);
  assert.match(rules, /not a demand that every day be heavy/i);
  assert.match(rules, /accessory, rehab-oriented resistance/i);
  assert.match(rules, /cardio-only day does not count as a strength day/i);
});
