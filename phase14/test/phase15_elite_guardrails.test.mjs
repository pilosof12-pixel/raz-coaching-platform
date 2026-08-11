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

test('material secondary 5K target needs more than one token direct exposure',()=>{
  const intake={secondary_goals:['Improve 5 km from 25:00 to 22:30']};
  const one=parsed([row('Tue','Run','bodyweight','1','20 min')]);
  const two=parsed([row('Tue','Run','bodyweight','1','20 min'),row('Sat','Treadmill Run','bodyweight','1','6 x 400 m')]);
  assert.equal(goalDoseFlags('',intake,one).some(x=>x.code==='GOAL_DOSE_UNDERFLOOR'),true);
  assert.equal(goalDoseFlags('',intake,two).length,0);
});

test('primary strength goal receives multiple direct exposures',()=>{
  const intake={primary_goals:['Weighted chin-up +70 kg for 3 reps']};
  const one=parsed([row('Tue','Chin-up','+50 kg','4','3')]);
  const two=parsed([row('Tue','Chin-up','+50 kg','4','3'),row('Sun','Chin-up','+42.5 kg','3','4')]);
  assert.equal(goalDoseFlags('',intake,one).some(x=>x.code==='GOAL_DOSE_UNDERFLOOR'),true);
  assert.equal(goalDoseFlags('',intake,two).length,0);
});

test('unbenchmarked lift variation cannot inherit assertive fixed loading from related benchmark',()=>{
  const intake={performance_markers:['Back squat: 170 kg x 3']};
  const aggressive=parsed([row('Thu','Box Squat','170 kg','2','5')]);
  const conservative=parsed([row('Thu','Box Squat','145 kg','3','3')]);
  assert.equal(unbenchmarkedVariationLoadFlags(intake,aggressive).some(x=>x.code==='UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE'),true);
  assert.equal(unbenchmarkedVariationLoadFlags(intake,conservative).length,0);
});

test('high concurrent sport may justify one fewer strength day only when tradeoff is explicit',()=>{
  const intake={days_per_week:4,sport:'MMA / BJJ',sport_schedule:[{day:'Mon',intensity:'hard'},{day:'Wed',intensity:'moderate'},{day:'Fri',intensity:'hard'},{day:'Sat',intensity:'moderate'}]};
  const p=parsed([
    row('Tue','Box Squat','RPE-selected load','3','3'),
    row('Wed','Shuttle Run','bodyweight','1','20 min'),
    row('Thu','Chin-up','+40 kg','4','3'),
    row('Sun','Overhead Press','RPE-selected load','3','5'),
  ]);
  assert.equal(strengthSessionAccountingFlags('No explanation.',intake,p).some(x=>x.code==='REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED'),true);
  assert.equal(strengthSessionAccountingFlags('Because concurrent MMA/BJJ sport load is high, this block deliberately reduces to three strength sessions for recovery.',intake,p).length,0);
});

test('elite prompt rules are avatar-agnostic principles, not 5K-specific patches',()=>{
  const rules=elitePromptRules({days_per_week:4});
  assert.match(rules.join('\n'),/every primary goal needs multiple meaningful direct exposures/i);
  assert.match(rules.join('\n'),/different variation/i);
  assert.match(rules.join('\n'),/must be stated explicitly/i);
  assert.doesNotMatch(rules.join('\n'),/5k/i);
});
