import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePhase15FinalProgram,
  demoCoverageAdvisories,
} from '../engine/phase15_final_qa.js';
import { Phase15QualityError } from '../engine/phase15_program_qa.js';

const header='Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function fourWeeks(exercise='Cossack Squat') {
  const blocks=[];
  for(let w=1;w<=4;w++) blocks.push([
    `START_WEEK${w}_TSV`,
    header,
    `Sat\t${exercise}\tBW\t3\t8\t90 sec\t7\tControlled quality reps\t`,
    `END_WEEK${w}_TSV`,
  ].join('\n'));
  return blocks.join('\n');
}

test('missing direct demo is advisory and does not reject an otherwise valid coaching program',()=>{
  const program=fourWeeks('Cossack Squat');
  const missing=demoCoverageAdvisories(program);
  assert.ok(missing.includes('Cossack Squat'));
  const result=validatePhase15FinalProgram(program,{});
  assert.equal(result.ok,true);
  assert.ok(result.missing_demo_exercises.includes('Cossack Squat'));
});

test('real coaching/client-readiness failures still fail closed regardless of demo coverage',()=>{
  const program=fourWeeks('[REVIEW] Imaginary Dragon Squat');
  assert.throws(
    ()=>validatePhase15FinalProgram(program,{}),
    err=>err instanceof Phase15QualityError && err.flags.some(f=>f.code==='CLIENT_OUTPUT_NOT_READY')
  );
});
