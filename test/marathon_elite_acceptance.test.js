import test from 'node:test';
import assert from 'node:assert/strict';
import { marathonStackedProgressionFlags, marathonStrengthMaintenanceFlags } from '../phase14/engine/phase15_final_qa.js';
import { elitePromptRules } from '../phase14/engine/phase15_elite_guardrails.js';

const intake={
  primary_goals:['Improve marathon from 4:05 to 3:40'],
  secondary_goals:['Maintain basic strength and stay durable'],
  current_numbers:'Marathon: 4:05; recent half marathon: 1:50; Back squat: 85 kg x 5',
  sport:'Running',
  notes:'Currently runs 4 times per week, about 38 km/week. Longest recent run is 22 km.',
};

function program(weeks){return weeks.map((rows,i)=>`START_WEEK${i+1}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\n${rows.join('\n')}\nEND_WEEK${i+1}_TSV`).join('\n');}
const warm='Mon\t[WARMUP] Dynamic Warm-up\tBW\t1\t5 min\tN/A\tN/A\tprep\t';
const easy='Thu\tRun\tN/A\t1\t45 min\tN/A\tRPE 4-5\tEasy Zone 2 conversational\t';

test('marathon QA catches longer+faster quality work plus a longer long run',()=>{
  const p=program([
    [warm,'Tue\tRun\t5:30/km\t1\t25 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t23 km\tN/A\tRPE 5\tLong run conversational\t'],
    [warm,'Tue\tRun\t5:25/km\t1\t30 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t25 km\tN/A\tRPE 5\tLong run conversational\t'],
    [warm,'Tue\tRun\t5:25/km\t1\t30 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t25 km\tN/A\tRPE 5\tLong run conversational\t'],
    [warm,'Tue\tRun\t5:25/km\t1\t30 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t25 km\tN/A\tRPE 5\tLong run conversational\t'],
  ]);
  const codes=marathonStackedProgressionFlags(p,intake).map(x=>x.code);
  assert.ok(codes.includes('MARATHON_QUALITY_DOUBLE_PROGRESSION'));
  assert.ok(codes.includes('MARATHON_STACKED_VOLUME_PROGRESSION'));
});

test('marathon QA allows one selected running progression lever',()=>{
  const p=program([
    [warm,'Tue\tRun\t5:30/km\t1\t25 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t23 km\tN/A\tRPE 5\tLong run conversational\t'],
    [warm,'Tue\tRun\t5:30/km\t1\t25 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t25 km\tN/A\tRPE 5\tLong run conversational\t'],
    [warm,'Tue\tRun\t5:30/km\t1\t25 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t25 km\tN/A\tRPE 5\tLong run conversational\t'],
    [warm,'Tue\tRun\t5:30/km\t1\t25 min\tN/A\tN/A\tTempo effort\t',easy,'Sun\tRun\t6:00/km\t1\t27 km\tN/A\tRPE 5\tLong run conversational\t'],
  ]);
  assert.deepEqual(marathonStackedProgressionFlags(p,intake),[]);
});

test('marathon strength-maintenance QA catches block-wide rep plus RPE escalation',()=>{
  const p=program([
    [warm,'Mon\tBack Squat\t85 kg\t3\t3-5\t2:00\tRPE 7-8\tcontrolled\t','Mon\tReverse Lunge\tRPE-selected\t3\t8-12/side\t1:30\tRPE 7-8\tcontrolled\t','Wed\tBarbell Hip Thrust\tRPE-selected\t3\t10-15\t1:30\tRPE 7-8\tcontrolled\t'],
    [warm,'Mon\tBack Squat\t85 kg\t3\t3-5\t2:00\tRPE 7-8\tcontrolled\t','Mon\tReverse Lunge\tRPE-selected\t3\t10-15/side\t1:30\tRPE 7-8\tcontrolled\t','Wed\tBarbell Hip Thrust\tRPE-selected\t3\t12-18\t1:30\tRPE 7-8\tcontrolled\t'],
    [warm,'Mon\tBack Squat\t85 kg\t3\t3-5\t2:00\tRPE 7-8\tcontrolled\t','Mon\tReverse Lunge\tRPE-selected\t3\t12-18/side\t1:30\tRPE 8-9\tcontrolled\t','Wed\tBarbell Hip Thrust\tRPE-selected\t3\t15-20\t1:30\tRPE 8-9\tcontrolled\t'],
    [warm,'Mon\tBack Squat\t85 kg\t3\t3-5\t2:00\tRPE 7-8\tcontrolled\t','Mon\tReverse Lunge\tRPE-selected\t3\t15-20/side\t1:30\tRPE 8-9\tcontrolled\t','Wed\tBarbell Hip Thrust\tRPE-selected\t3\t18-25\t1:30\tRPE 8-9\tcontrolled\t'],
  ]);
  assert.equal(marathonStrengthMaintenanceFlags(p,intake)[0]?.code,'MARATHON_STRENGTH_MAINTENANCE_OVERLOAD');
});

test('marathon strength-maintenance QA allows stable supportive strength',()=>{
  const rows=[warm,'Mon\tBack Squat\t85 kg\t3\t3-5\t2:00\tRPE 7-8\tcontrolled\t','Mon\tReverse Lunge\tRPE-selected\t2\t6-10/side\t1:30\tRPE 7\tcontrolled\t','Wed\tBarbell Hip Thrust\tRPE-selected\t2\t6-10\t1:30\tRPE 7\tcontrolled\t'];
  assert.deepEqual(marathonStrengthMaintenanceFlags(program([rows,rows,rows,rows]),intake),[]);
});

test('marathon prompt states single-variable quality progression and supportive strength',()=>{
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/MARATHON SINGLE-LEVER HARD CONTRACT/i);
  assert.match(rules,/change pace\/intensity OR accumulated work, never both in the same transition/i);
  assert.match(rules,/COPY the prior-week quality and routine-easy prescriptions unchanged/i);
  assert.match(rules,/MARATHON STRENGTH-MAINTENANCE SUPPORT RULE/i);
  assert.match(rules,/do not turn several assistance lifts into a progressive hypertrophy block/i);
});
