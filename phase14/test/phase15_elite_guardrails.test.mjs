import test from 'node:test';
import assert from 'node:assert/strict';
import {
  goalDoseFlags,
  unbenchmarkedVariationLoadFlags,
  strengthSessionAccountingFlags,
  elitePromptRules,
} from '../engine/phase15_elite_guardrails.js';

function parsed(rows) {
  const header=['Day','Exercise','Weight','Sets','Reps','Rest','Target RPE','Notes','Results'];
  const idx={day:0,exercise:1,weight:2,sets:3,reps:4,rest:5,'target rpe':6,notes:7,results:8};
  return {header,idx,rows:rows.map(cells=>({cells}))};
}
const row=(day,ex,weight='RPE-selected load',sets='2',reps='5',notes='')=>[day,ex,weight,sets,reps,'2 min','7',notes,''];

test('named 5K goal requires at least one meaningful direct running exposure',()=>{
  const intake={secondary_goals:['Improve 5 km from 25:00 to 22:30']};
  const crossOnly=parsed([row('Tue','Rower','RPE-selected load','1','25 min')]);
  const direct=parsed([row('Tue','Run','bodyweight','1','20 min')]);
  assert.equal(goalDoseFlags('',intake,crossOnly).some(x=>x.code==='NAMED_GOAL_DIRECT_EXPOSURE_MISSING'),true);
  assert.equal(goalDoseFlags('',intake,direct).length,0);
});

test('named primary strength goal needs direct movement-pattern exposure but guardrail does not invent frequency',()=>{
  const intake={primary_goals:['Weighted chin-up +70 kg for 3 reps']};
  const none=parsed([row('Tue','Chest-Supported Row','RPE-selected load','3','8')]);
  const one=parsed([row('Tue','Chin-up','+50 kg','4','3')]);
  assert.equal(goalDoseFlags('',intake,none).some(x=>x.code==='NAMED_GOAL_DIRECT_EXPOSURE_MISSING'),true);
  assert.equal(goalDoseFlags('',intake,one).length,0);
});

test('unbenchmarked lift variation cannot inherit assertive fixed loading from related benchmark',()=>{
  const intake={performance_markers:['Back squat: 170 kg x 3']};
  const aggressive=parsed([row('Thu','Box Squat','170 kg','2','5')]);
  const conservative=parsed([row('Thu','Box Squat','145 kg','3','3')]);
  assert.equal(unbenchmarkedVariationLoadFlags(intake,aggressive).some(x=>x.code==='UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE'),true);
  assert.equal(unbenchmarkedVariationLoadFlags(intake,conservative).length,0);
});

test('requested strength day cannot silently become cardio/core only',()=>{
  const intake={days_per_week:4,sport:'MMA / BJJ',sport_schedule:[{day:'Mon',intensity:'hard'},{day:'Wed',intensity:'moderate'},{day:'Fri',intensity:'hard'},{day:'Sat',intensity:'moderate'}]};
  const missing=parsed([
    row('Tue','Box Squat','RPE-selected load','3','3'),
    row('Wed','Shuttle Run','bodyweight','1','20 min'),
    row('Thu','Chin-up','+40 kg','4','3'),
    row('Sun','Overhead Press','RPE-selected load','3','5'),
  ]);
  const complete=parsed([
    row('Tue','Box Squat','RPE-selected load','3','3'),
    row('Wed','Reverse Lunge','RPE-selected load','2','8'),
    row('Thu','Chin-up','+40 kg','4','3'),
    row('Sun','Overhead Press','RPE-selected load','3','5'),
  ]);
  assert.equal(strengthSessionAccountingFlags('',intake,missing).some(x=>x.code==='REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED'),true);
  assert.equal(strengthSessionAccountingFlags('',intake,complete).length,0);
});

test('integrity prompt rules explicitly defer coaching dose and progression to authored sources',()=>{
  const rules=elitePromptRules({days_per_week:4}).join('\n');
  assert.match(rules,/higher frequency, volume or progression comes only from the deterministic planner, specialist rules and curated RAZ coaching sources/i);
  assert.match(rules,/exact kilograms require a reliable benchmark/i);
  assert.match(rules,/cannot silently replace/i);
  assert.doesNotMatch(rules,/every primary goal needs multiple/i);
});
