import test from 'node:test';
import assert from 'node:assert/strict';
import { endurancePerformanceIntegrityFlags, elitePromptRules } from '../phase14/engine/phase15_elite_guardrails.js';

function parsed(rows){
  const header=['Day','Exercise','Weight','Sets','Reps','Rest','Target RPE','Notes','Results'];
  const idx={day:0,exercise:1,weight:2,sets:3,reps:4,rest:5,'target rpe':6,notes:7,results:8};
  return {header,idx,rows:rows.map(cells=>({cells}))};
}
const row=(day,ex,reps,notes='')=>[day,ex,'N/A','1',reps,'N/A','N/A',notes,''];
const intake={
  primary_goals:['Improve marathon from 4:05 to 3:40'],
  secondary_goals:['Maintain basic strength and stay durable'],
  sport:'Running',
  sport_schedule:[
    {day:'Tue',modality:'running',intensity:'quality'},
    {day:'Thu',modality:'running',intensity:'easy'},
    {day:'Sat',modality:'running',intensity:'easy'},
    {day:'Sun',modality:'running',intensity:'long'},
  ],
  notes:'Currently runs 4 times per week, about 38 km/week. Longest recent run is 22 km. Preserve four run exposures and progress conservatively.',
};

test('marathon long run with explicit duration is a valid event progression anchor',()=>{
  const p=parsed([
    row('Tue','Run','35 min','Steady aerobic run'),
    row('Thu','Run','30 min','Easy conversational run'),
    row('Sat','Run','30 min','Easy run'),
    row('Sun','Run','95 min','Long run, relaxed aerobic effort'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,p);
  assert.equal(flags.some(x=>x.code==='EVENT_PROGRESSING_SESSION_MISSING'),false);
  assert.equal(flags.some(x=>x.code==='TARGET_MODALITY_EXPOSURE_REDUCED'),false);
});

test('marathon still fails when four runs are only generic token exposure with no long-run or other progression target',()=>{
  const p=parsed([
    row('Tue','Run','25 min','Easy run'),
    row('Thu','Run','25 min','Easy run'),
    row('Sat','Run','25 min','Easy run'),
    row('Sun','Run','25 min','Easy run'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,p);
  assert.equal(flags.some(x=>x.code==='EVENT_PROGRESSING_SESSION_MISSING'),true);
});

test('prompt explicitly recognizes marathon long-run duration or distance without forcing intervals',()=>{
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/For a marathon goal, a clearly identified long run with a prescribed duration or distance/i);
  assert.match(rules,/interval\/tempo\/pace work may also be used only when supported/i);
});
