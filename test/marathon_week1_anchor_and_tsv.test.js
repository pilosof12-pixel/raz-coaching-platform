import test from 'node:test';
import assert from 'node:assert/strict';
import { allWeekTsvShapeFlags, weekOneRunningVolumeFlags } from '../phase14/engine/phase15_final_qa.js';
import { elitePromptRules } from '../phase14/engine/phase15_elite_guardrails.js';

const intake={
  primary_goals:['Improve marathon from 4:05 to 3:40'],
  secondary_goals:['Maintain basic strength and stay durable'],
  current_numbers:'Marathon: 4:05; recent half marathon: 1:50; Back squat: 85 kg x 5',
  sport:'Running',
  notes:'Currently runs 4 times per week, about 38 km/week. Longest recent run is 22 km.',
};

function block(week, rows){
  return `START_WEEK${week}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}
function program(weeks){ return weeks.map((rows,i)=>block(i+1,rows)).join('\n'); }
const strength='Mon\tBack Squat\t80 kg\t3\t6\t2-3 min\t7.5\tControlled maintenance\t';
const easy5='Thu\tRun\tN/A\t1\t5 km\tN/A\t5\tEasy Zone 2 pace\t';
const easy5b='Sat\tRun\tN/A\t1\t5 km\tN/A\t5\tEasy Zone 2 pace\t';
const quality6='Tue\tRun\t5:20-5:30/km\t1\t6 km\tN/A\t7\tQuality run with controlled segment\t';
const long22='Sun\tRun\tN/A\t1\t22 km\tN/A\t5-6\tLong run at easy Zone 2 pace\t';
const valid38=[strength,quality6,easy5,easy5b,long22];

test('all-week TSV shape rejects a malformed ten-cell data row',()=>{
  const malformed=[...valid38];
  malformed[0]='Mon\tBack Squat\t80 kg\t3\t1\t6\t2-3 min\t7.5\tControlled maintenance\t';
  const p=program([valid38,valid38,malformed,valid38]);
  const codes=allWeekTsvShapeFlags(p).map(x=>x.code);
  assert.ok(codes.includes('TSV_ROW_COLUMN_COUNT_MISMATCH'));
});

test('all-week TSV shape accepts exact nine-cell rows in all four blocks',()=>{
  assert.deepEqual(allWeekTsvShapeFlags(program([valid38,valid38,valid38,valid38])),[]);
});

test('Week 1 marathon volume rejects 50 km against supplied 38 km current baseline',()=>{
  const fifty=[
    strength,
    'Tue\tRun\t5:20-5:30/km\t1\t10 km\tN/A\t7\tQuality run\t',
    'Thu\tRun\tN/A\t1\t8 km\tN/A\t5\tEasy Zone 2 pace\t',
    'Sat\tRun\tN/A\t1\t8 km\tN/A\t5\tEasy Zone 2 pace\t',
    'Sun\tRun\tN/A\t1\t24 km\tN/A\t5-6\tLong run at easy Zone 2 pace\t',
  ];
  const codes=weekOneRunningVolumeFlags(program([fifty,fifty,fifty,fifty]),intake).map(x=>x.code);
  assert.ok(codes.includes('MARATHON_WEEK1_VOLUME_ABOVE_CURRENT'));
});

test('Week 1 marathon volume accepts four direct runs totaling supplied 38 km baseline',()=>{
  assert.deepEqual(weekOneRunningVolumeFlags(program([valid38,valid38,valid38,valid38]),intake),[]);
});

test('marathon prompt exposes current-volume Week 1 ceiling and frequency preservation',()=>{
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/Week 1 total direct running distance MUST NOT exceed/i);
  assert.match(rules,/starting workload anchor/i);
  assert.match(rules,/Preserve the stated run frequency while redistributing the Week 1 distances/i);
});
