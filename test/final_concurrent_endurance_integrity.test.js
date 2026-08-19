import test from 'node:test';
import assert from 'node:assert/strict';
import {
  endurancePerformanceIntegrityFlags,
  elitePromptRules,
} from '../phase14/engine/phase15_elite_guardrails.js';

function parsed(rows) {
  const header=['Day','Exercise','Weight','Sets','Reps','Rest','Target RPE','Notes','Results'];
  const idx={day:0,exercise:1,weight:2,sets:3,reps:4,rest:5,'target rpe':6,notes:7,results:8};
  return {header,idx,rows:rows.map(cells=>({cells}))};
}
const row=(day,ex,weight='N/A',sets='1',reps='25 min',notes='')=>[day,ex,weight,sets,reps,'N/A','N/A',notes,''];

const intake={
  primary_goals:['Back squat 200 kg','Weighted chin-up +70 kg for 3 reps'],
  secondary_goals:['Improve 5 km from 25:00 to 22:30'],
  current_numbers:'Back squat: 170 kg x 3\nWeighted chin-up: +55 kg x 3\n5 km: 25:00',
  performance_markers:['5 km: 25:00'],
  sport:'MMA / BJJ',
  sport_schedule:[
    {day:'Mon',intensity:'hard'},
    {day:'Wed',intensity:'moderate'},
    {day:'Fri',intensity:'hard'},
    {day:'Sat',intensity:'moderate'},
  ],
  sleep_hours:'6.5',
  recovery_rating:'average / variable',
  notes:'Currently running 2 sessions per week, about 10 km/week.',
};

test('spaced 5 km benchmark is parsed and blocks a continuous faster-than-current-race prescription',()=>{
  const p=parsed([
    row('Tue','Run','4:45-4:50/km','1','20-25 min','Tempo run, maintain pace, controlled effort.'),
    row('Sun','Run','5:20-5:30/km','1','30 min','Easy conversational pace, low effort.'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,p);
  assert.equal(flags.some(x=>x.code==='CONTINUOUS_RUN_EXCEEDS_CURRENT_RACE_BENCHMARK'),true);
});

test('combat plus direct running rejects generic extra bike/row volume without an authored purpose',()=>{
  const p=parsed([
    row('Tue','Run','N/A','5','3 min','5K-oriented interval progression; recover between reps.'),
    row('Wed','Zone-2 Bike','Easy','1','25 min','Conversational pace, steady effort.'),
    row('Thu','Zone-2 Row','Easy','1','25 min','Conversational pace, steady effort.'),
    row('Sun','Run','N/A','1','30 min','Easy conversational pace, low effort.'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,p);
  assert.equal(flags.some(x=>x.code==='CONCURRENT_ENDURANCE_REDUNDANCY_UNJUSTIFIED'),true);
});

test('purposeful lower-cost cross-training remains allowed and running-specific progression is preserved',()=>{
  const p=parsed([
    row('Tue','Run','N/A','5','3 min','5K-oriented interval progression; recover between reps.'),
    row('Thu','Zone-2 Bike','Easy','1','25 min','Supplemental lower-impact aerobic volume to reduce running impact while preserving the direct run sessions.'),
    row('Sun','Run','N/A','1','30 min','Easy conversational pace, low effort.'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,p);
  assert.equal(flags.some(x=>x.code==='CONCURRENT_ENDURANCE_REDUNDANCY_UNJUSTIFIED'),false);
  assert.equal(flags.some(x=>x.code==='TARGET_MODALITY_EXPOSURE_REDUCED'),false);
  assert.equal(flags.some(x=>x.code==='EVENT_PROGRESSING_SESSION_MISSING'),false);
});

test('generation prompt receives both current-race and concurrent-recovery budget anchors',()=>{
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/LOW-INTENSITY RUNNING ANCHOR/i);
  assert.match(rules,/about 5:00\/km for 5K/i);
  assert.match(rules,/CURRENT-RACE PERFORMANCE ANCHOR/i);
  assert.match(rules,/CONCURRENT ENDURANCE BUDGET/i);
  assert.match(rules,/Do not automatically add generic Zone 2 bike\/row sessions/i);
});
