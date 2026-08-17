import test from 'node:test';
import assert from 'node:assert/strict';
import { repairYouthPrimarySkillOrder, repairHybridMarathonEventAnchor } from '../engine/deterministic_coaching_repairs.js';
import { validateYouthManualAcceptanceSemantic } from '../engine/manual_acceptance_quality.js';
import { endurancePerformanceIntegrityFlags } from '../engine/phase15_elite_guardrails.js';

const H='Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function fourWeeks(rows){return [1,2,3,4].map(w=>`START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');}

test('Youth repair moves existing primary skill rows before support without changing dose',()=>{
  const intake={age:13,primary_goals:['Achieve first bar muscle-up','Achieve a freestanding handstand'],gym_availability_mode:'flexible',available_gym_days:[]};
  const rows=[
    'Session A\t[WARMUP]\tBW\t1\t5 min\tN/A\tN/A\tPrep.\t',
    'Session A\tRing Dip\tBW\t2\t3\t90 sec\t7\tSupport.\t',
    'Session A\tControlled Handstand Kick-up\tBW\t4\t2 attempts\t60 sec\t7\tBalance.\t',
    'Session A\tBar Muscle-up Transition\tBand assisted\t4\t2\t90 sec\t7\tSkill.\t',
  ];
  const broken=fourWeeks(rows);
  assert.throws(()=>validateYouthManualAcceptanceSemantic(broken,intake),e=>e?.code==='YOUTH_PRIMARY_SKILL_NOT_FRESH');
  const repaired=repairYouthPrimarySkillOrder(broken,intake);
  assert.doesNotThrow(()=>validateYouthManualAcceptanceSemantic(repaired,intake));
  const block=repaired.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0];
  assert.ok(block.indexOf('Controlled Handstand Kick-up') < block.indexOf('Ring Dip'));
  assert.match(repaired,/Controlled Handstand Kick-up\tBW\t4\t2 attempts/);
  assert.equal(repairYouthPrimarySkillOrder(repaired,intake),repaired);
});

test('Marathon repair annotates one existing measurable run without changing dose or frequency',()=>{
  const intake={primary_goals:['220kg back squat'],secondary_goals:['Marathon'],notes:'Current running 1 session per week.',current_numbers:'Running: 1 session a week, about 20 km total'};
  const rows=['Wed\tRun\tEasy conversational pace\t1\t20 km\tN/A\t5\tEasy aerobic work.\t'];
  const broken=fourWeeks(rows);
  const parse=(program)=>{const m=program.match(/START_WEEK1_TSV\n([\s\S]*?)\nEND_WEEK1_TSV/);const ls=m[1].split('\n');const header=ls[0].split('\t').map(x=>x.trim().toLowerCase());const idx=Object.fromEntries(header.map((x,i)=>[x,i]));return {idx,rows:ls.slice(1).map(line=>({cells:line.split('\t')}))};};
  assert.ok(endurancePerformanceIntegrityFlags(broken,intake,parse(broken)).some(f=>f.code==='EVENT_PROGRESSING_SESSION_MISSING'));
  const repaired=repairHybridMarathonEventAnchor(broken,intake);
  assert.ok(!endurancePerformanceIntegrityFlags(repaired,intake,parse(repaired)).some(f=>f.code==='EVENT_PROGRESSING_SESSION_MISSING'));
  assert.equal((repaired.match(/\tRun\t/g)||[]).length,4);
  assert.match(repaired,/\t20 km\tN\/A\t5\tEasy aerobic work\. Long aerobic run; marathon progression anchor\./);
  assert.equal(repairHybridMarathonEventAnchor(repaired,intake),repaired);
});
