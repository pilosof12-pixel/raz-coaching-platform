import test from 'node:test';
import assert from 'node:assert/strict';
import {
  endurancePerformanceIntegrityFlags,
  elitePromptRules,
  repairUnbenchmarkedVariationLoads,
} from '../engine/phase15_elite_guardrails.js';
import { validatePhase15FinalProgram } from '../engine/phase15_final_qa.js';
import { Phase15QualityError } from '../engine/phase15_program_qa.js';

function parsed(rows) {
  const idx={day:0,exercise:1,weight:2,sets:3,reps:4,rest:5,'target rpe':6,notes:7,results:8};
  return {idx,rows:rows.map(cells=>({cells}))};
}
const row=(day,ex,weight='N/A',sets='1',reps='25 min',notes='')=>[day,ex,weight,sets,reps,'N/A','N/A',notes,''];
const intake={
  secondary_goals:['Improve 5 km from 25:00 to 22:30'],
  current_numbers:'5 km: 25:00',
  performance_markers:['5 km: 25:00'],
  notes:'Currently running 2 sessions per week, about 10 km/week.'
};

test('continuous faster-than-current race prescription cannot equal or exceed current race duration',()=>{
  const p=parsed([
    row('Tue','Run','4:45-4:50/km','1','20-25 min','Tempo progression, controlled sustained effort.'),
    row('Sun','Run','5:15-5:30/km','1','30 min','Easy conversational pace.'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,p);
  assert.equal(flags.some(f=>f.code==='CONTINUOUS_RUN_EXCEEDS_CURRENT_RACE_BENCHMARK'),true);
});

test('shorter interval work is not rejected by the continuous-race sanity check',()=>{
  const p=parsed([
    row('Tue','Run','4:45/km','4','4 min','Event-specific interval progression with recovery.'),
    row('Sun','Run','5:20/km','1','30 min','Easy conversational pace.'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,p);
  assert.equal(flags.some(f=>f.code==='CONTINUOUS_RUN_EXCEEDS_CURRENT_RACE_BENCHMARK'),false);
});

test('running prompt anchors current race performance and smallest-useful-variable progression',()=>{
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/CURRENT-RACE PERFORMANCE ANCHOR/);
  assert.match(rules,/do not prescribe a continuous non-test run faster than the demonstrated 5K pace/i);
  assert.match(rules,/progress the smallest useful variable/i);
  assert.match(rules,/do not automatically increase both pace and duration together/i);
});

test('unbenchmarked variation load repair changes only the related unbenchmarked lift',()=>{
  const loadIntake={
    current_numbers:'Back squat: 170 kg x 3\nWeighted chin-up: +55 kg x 3\nRDL: 190 kg x 5\nOHP: 70 kg x 5',
    performance_markers:['Back squat: 170 kg x 3','Weighted chin-up: +55 kg x 3','RDL: 190 kg x 5','OHP: 70 kg x 5'],
  };
  const program=[
    'START_WEEK1_TSV',
    'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
    'Tue\tBox Squat to Parallel\t160 kg\t3\t3\t3 min\t8\ttolerated variation\t',
    'Tue\tWeighted Chin-up\t+55 kg\t3\t3\t3 min\t8\texact benchmarked lift\t',
    'Wed\tRDL\t190 kg\t3\t5\t2 min\t8\texact benchmarked lift\t',
    'Tue\tOverhead Press\t70 kg\t3\t5\t2 min\t8\texact benchmarked lift\t',
    'END_WEEK1_TSV',
  ].join('\n');
  const repaired=repairUnbenchmarkedVariationLoads(program,loadIntake);
  assert.match(repaired,/Box Squat to Parallel\tRPE-selected load/);
  assert.match(repaired,/Weighted Chin-up\t\+55 kg/);
  assert.match(repaired,/RDL\t190 kg/);
  assert.match(repaired,/Overhead Press\t70 kg/);
});

const header='Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function week(n, qualityWeight, qualityReps) {
  return [
    `START_WEEK${n}_TSV`,
    header,
    `Tue\tRun\t${qualityWeight}\t1\t${qualityReps}\tN/A\tN/A\tTempo progression, controlled sustained effort.\t`,
    `Sun\tRun\t5:20/km\t1\t30 min\tN/A\tN/A\tEasy conversational pace.\t`,
    `END_WEEK${n}_TSV`,
  ].join('\n');
}

test('final QA applies endurance integrity to Weeks 2-4, not only Week 1',()=>{
  const program=[
    week(1,'5:10/km','20 min'),
    week(2,'4:50/km','25 min'),
    week(3,'5:05/km','20 min'),
    week(4,'5:05/km','20 min'),
  ].join('\n');
  assert.throws(
    ()=>validatePhase15FinalProgram(program,intake),
    err=>err instanceof Phase15QualityError && err.flags.some(f=>f.code==='CONTINUOUS_RUN_EXCEEDS_CURRENT_RACE_BENCHMARK' && /Week 2/.test(f.message))
  );
});
