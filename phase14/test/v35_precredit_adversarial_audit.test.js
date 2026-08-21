import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFinalNoteCoherence } from '../engine/final_note_coherence.js';
import { collectAllV34ConsistencyFlags, collectProgressionLanguageFlags } from '../engine/v34_prescription_consistency.js';
import { validateAdvancedHybridManualAcceptanceSemantic } from '../engine/manual_acceptance_quality.js';
import { validateTactical3KCoachingSpecV1 } from '../engine/coaching_spec_v1_quality.js';

const HEADER='Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block=(w,rows)=>`START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;

// Audit expectation: a 9+ release gate should not let a note advertise a numerical
// ceiling above the structured prescription simply because the wording is
// "ceiling of N" instead of "up to N".
test('[AUDIT-1] quantitative ceiling language cannot exceed sets x reps',()=>{
  const p=block(3,[
    'Session A\tControlled Handstand Kick-up\tBodyweight\t4\t3\t60 sec\t6\tQuality ceiling of 15 attempts; up to twelve high-quality entries only if control remains stable.\t'
  ]);
  const repaired=normalizeFinalNoteCoherence(p,{}).program;
  const flags=collectAllV34ConsistencyFlags(repaired,{});
  const escaped=/ceiling of 15 attempts/i.test(repaired) && !flags.some(f=>/MISMATCH|TOTAL/i.test(f.code));
  assert.equal(escaped,false,'A 4 x 3 row still advertises a 15-attempt ceiling without repair or rejection.');
});

// Audit expectation: progression claims in structured text fields count too. The
// live Youth output placed "reduce volume" in Weight/Load while leaving 3 x 1
// unchanged; client-facing contradictions should not escape merely because they
// are outside Notes.
test('[AUDIT-2] progression claims in load/target text must agree with week-over-week dose',()=>{
  const p=[
    block(3,['Session A\tBar Muscle-up Transition Drill\tLight band assistance\t3\t1\t75 sec\t6\tRetain clean turnover.\t']),
    block(4,['Session A\tBar Muscle-up Transition Drill\tLightest band assistance; reduce volume, not the earned assistance standard\t3\t1\t75 sec\t6\tRetain the best Week-3 turnover standard.\t'])
  ].join('\n\n');
  const flags=collectProgressionLanguageFlags(p,{});
  assert.ok(flags.some(f=>f.code==='V34_PROGRESSION_LANGUAGE_MISMATCH'),'An unchanged 3 x 1 prescription says "reduce volume" in the load field and currently escapes the progression checker.');
});

// Audit expectation: whole-week recovery architecture must see generated program
// stress, not only intake weekdays. A long run Saturday + substantive Sunday gym
// work + primary heavy squat Monday is a three-day recovery stack for a five-MMA
// athlete even though the long run is not immediately one day before the squat.
test('[AUDIT-3] high-concurrency primary heavy day is protected from two-day long-run/gym stack',()=>{
  const intake={
    age:30,days_per_week:4,primary_goals:['220kg back squat','4 One arm pullups'],secondary_goals:['100kg overhead press','Marathon'],
    sport:'MMA',sport_sessions_per_week:5,available_gym_days:['Mon','Tue','Fri','Sun'],
    sport_schedule:[{day:'Tue',intensity:'moderate'},{day:'Wed',intensity:'hard'},{day:'Thu',intensity:'moderate'},{day:'Fri',intensity:'hard'},{day:'Sat',intensity:'moderate'}],
    current_numbers:'Back Squat: 205 kg 1RM | Running: 1 session a week, about 20 km total, longest recent run about 20 km'
  };
  const p=block(1,[
    'Mon\tBack Squat\t180 kg\t1\t3\t3-4 min\t8\tPrimary heavy set.\t',
    'Sat\tRun\tEasy conversational pace\t1\t18 km\tN/A\t5-6\tLong easy run.\t',
    'Sun\tOverhead Press\t75 kg\t3\t4\t2-3 min\t7.5\tDirect strict press exposure.\t'
  ]);
  assert.throws(()=>validateAdvancedHybridManualAcceptanceSemantic(p,intake),/ADVANCED_HYBRID|long run|recovery/i,
    'The current manual acceptance gate allows Sat long run -> Sun gym -> Mon primary heavy squat without a recovery-architecture objection.');
});

function tacticalProgram(specs){
  const intro='If shin symptoms return, hold the newest run or ruck progression, reduce impact, and repeat the prior tolerated week.';
  return `${intro}\n\n${[1,2,3,4].map((w)=>block(w,[
    'Mon\tBack Squat\t120 kg\t3\t5\t3 min\t7\tMaintenance squat.\t',
    specs[w-1],
    `Thu\tBackpack Carry\t20 kg, 9:30/km\t1\t${[8,8.5,9,8][w-1]} km\tN/A\t6\tControlled ruck.\t`
  ])).join('\n\n')}`;
}
const tacticalIntake={
  age:27,experience:'advanced',
  primary_goals:['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals:['Improve 10 km ruck with 20 kg from 95 min toward 82 min','Improve strict pull-ups from 14 toward 18-20'],
  maintenance_goals:['Maintain useful squat and deadlift strength while staying athletic and relatively weight-stable'],
  current_numbers:'3 km: 13:30 | 10 km ruck with 20 kg: 95 min | Back Squat: 140 kg x 5 | Deadlift: 180 kg x 3 | Strict Pull-ups: 14 reps',
  performance_markers:['3 km: 13:30','10 km ruck with 20 kg: 95 min'],
  injuries:'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
  notes:'Wants combat-ready / special-operations-style fitness without random punishment circuits or unnecessary mass gain.'
};

test('[AUDIT-4] static 3K quality block is rejected even when narrative is honest',()=>{
  const row='Tue\tRun\t600 m @ 2:35\t4\t600 m\t2:30\t8\tDevelopmental quality.\t';
  let code='pass';
  try{validateTactical3KCoachingSpecV1(tacticalProgram([row,row,row,row]),tacticalIntake);}catch(e){code=e?.code||'unknown';}
  assert.match(code,/EVENT_PROGRESSION_(?:STATIC|INCOHERENT|NOT_RETAINED)/,
    `Static four-week 3K quality returned ${code}; a 9+ gate must require a defensible build/extend/taper trend, not merely honest wording.`);
});
