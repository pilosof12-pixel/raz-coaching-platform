import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import { YOUTH_GYMNASTICS_INTAKE, TACTICAL_3K_INTAKE } from './fixtures/golden_programs.js';

const HEADER='Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block=(week,rows)=>`START_WEEK${week}_TSV\n${HEADER}\n${rows.map(r=>r.join('\t')).join('\n')}\nEND_WEEK${week}_TSV`;

function youthCandidate(){
  const weeks=[];
  for(let w=1;w<=4;w++){
    const kickA=['4','5','6','4'][w-1], kickB=['5','5','6','4'][w-1];
    const ctb=['3','4','4','3'][w-1], ring=['5','6','6','5'][w-1], pull=['6','7','8','6'][w-1];
    weeks.push(block(w,[
      ['Mon','[WARMUP] Scapular Pull-up','BW','2','5','45s','N/A','Short non-fatiguing shoulder/scapular preparation.',''],
      ['Mon','Controlled Handstand Kick-up','BW',kickA,'2 attempts','60s','N/A','Primary independent-balance practice while fresh; progress successful entries, not fatigue.',''],
      ['Mon','Band-Assisted Bar Muscle-up Transition Drill','BW + band','4','2','90s','N/A','Direct bar muscle-up turnover practice; reduce assistance only after clean symmetrical reps.',''],
      ['Mon','Strict Chest-to-Bar Pull-up','BW','4',ctb,'2 min','7','High-pull support for the bar muscle-up with full recovery.',''],
      ['Mon','Strict Ring Dip','BW','3',ring,'2 min','7','Push-strength support with clean ring control.',''],
      ['Mon','Pistol Squat','BW','3','5 / side','90s','7','Established unilateral lower-body strength; no grinders.',''],
      ['Thu','[WARMUP] Wrist Prep','BW','2','30 sec','30s','N/A','Short wrist and shoulder preparation.',''],
      ['Thu','Controlled Handstand Kick-up','BW',kickB,'1-2 attempts','60s','N/A','Second direct handstand exposure; accumulate controlled independent attempts.',''],
      ['Thu','Band-Assisted Bar Muscle-up Transition Drill','BW + band','4','2','90s','N/A','Second direct bar muscle-up exposure; preserve turnover mechanics before reducing assistance.',''],
      ['Thu','Explosive Hip-to-Bar Pull-up','BW','4',w===3?'3':'2','2 min','7','Explosive vertical pulling support with full recovery.',''],
      ['Thu','Strict Pull-up','BW','3',pull,'2 min','7','General pull strength support below fatigue failure.',''],
      ['Thu','Strict Ring Dip','BW','3',ring,'2 min','7','General push strength support.',''],
      ['Thu','Pistol Squat','BW','3','5 / side','90s','7','Lower-body athletic strength with repeatable technique.',''],
    ]));
  }
  return ['Youth gymnastics block. Both primary skills receive direct exposure in both weekly sessions while fresh.','Progress execution quality and assistance only after clean successful reps; no grinders or repeated failed attempts.',...weeks].join('\n\n');
}

function tacticalRows(w){
  if(w===1) return [
    ['Mon','Back Squat','RPE-selected load','3','5','3 min','7','Strength maintenance; clean reps with reserve.',''],
    ['Mon','Pull-up','Bodyweight','2','7','2 min','6-7','Low-fatigue second strict pull-up exposure with clear reserve.',''],
    ['Mon','Run','5:30-6:00 / km','1','25 min','N/A','3-4','Easy conversational run; keep impact comfortable.',''],
    ['Tue','Run','1:42-1:45 / 400 m','6','400 m','2 min','7-8','3K-specific intervals anchored to current repeatable 400 m performance; add easy warm-up/cool-down running.',''],
    ['Wed','Weighted Pull-up','+25 kg','3','5','3 min','7-8','Primary pulling-strength work below the demonstrated +30 kg x 5 benchmark.',''],
    ['Wed','Pull-up','Bodyweight','2','8','2 min','7','Direct strict pull-up capacity work; stop before rep speed deteriorates.',''],
    ['Fri','Deadlift','RPE-selected load','2','3','3 min','7','Low-cost posterior-chain strength maintenance.',''],
    ['Fri','Run','5:20-5:50 / km','1','40 min','N/A','4-5','Long aerobic run at controlled effort; no extra hard conditioning.',''],
    ['Sun','Backpack Carry','20 kg','1','70 min','N/A','5','Direct ruck / loaded march at 9:25-9:35 / km; keep load stable and monitor shin response.',''],
  ];
  if(w===2) return [
    ['Mon','Back Squat','RPE-selected load','3','5','3 min','7','Maintain the strength dose; add load only if Week 1 reps were fast and clean.',''],
    ['Mon','Pull-up','Bodyweight','2','8','2 min','6-7','Add one rep only if elbows and grip feel normal.',''],
    ['Mon','Run','5:30-6:00 / km','1','28 min','N/A','3-4','Small aerobic-volume increase; keep conversational pace.',''],
    ['Tue','Run','1:40-1:43 / 400 m','7','400 m','2 min','7-8','Slightly progress repeatable 3K-specific work; final rep stays in the same pace band.',''],
    ['Wed','Weighted Pull-up','+27.5 kg','3','4','3 min','7-8','Slight load progression with lower reps; no grinders.',''],
    ['Wed','Pull-up','Bodyweight','2','9','2 min','7','Direct rep-capacity work with clean full ROM.',''],
    ['Fri','Deadlift','RPE-selected load','2','3','3 min','7','Keep the maintenance dose stable.',''],
    ['Fri','Run','5:20-5:50 / km','1','42 min','N/A','4-5','Small long-run increase only; keep impact comfortable.',''],
    ['Sun','Backpack Carry','20 kg','1','70 min','N/A','5','Keep ruck duration and load unchanged while running volume rises; 9:25-9:35 / km.',''],
  ];
  if(w===3) return [
    ['Mon','Back Squat','RPE-selected load','3','4','3 min','7-7.5','Slightly lower reps to preserve strength while run specificity peaks.',''],
    ['Mon','Pull-up','Bodyweight','2','8','2 min','6-7','Easy support exposure that does not compete with Wednesday.',''],
    ['Mon','Run','5:25-5:55 / km','1','30 min','N/A','3-4','Peak easy-run duration; do not push pace.',''],
    ['Tue','Run','2:32-2:36 / 600 m','5','600 m','2.5-3 min','8','Longer 3K-specific reps; all five must remain repeatable.',''],
    ['Wed','Weighted Pull-up','+30 kg','3','3','3 min','8','Touch the demonstrated +30 kg load with lower volume.',''],
    ['Wed','Pull-up','Bodyweight','2','10','2 min','7-8','Highest strict pull-up volume week; stop 1-2 reps before technical failure.',''],
    ['Fri','Deadlift','RPE-selected load','2','3','3 min','7','Stable strength-maintenance dose.',''],
    ['Fri','Run','5:20-5:50 / km','1','45 min','N/A','4-5','Peak long aerobic duration; no pace chase.',''],
    ['Sun','Backpack Carry','20 kg','1','70 min','N/A','5','Keep ruck stress stable while total running is highest; 9:25-9:35 / km.',''],
  ];
  return [
    ['Mon','Back Squat','RPE-selected load','2','3','3 min','6-7','Consolidation week; reduce volume and finish fresh.',''],
    ['Mon','Pull-up','Bodyweight','2','6','2 min','6','Easy support exposure only.',''],
    ['Mon','Run','5:35-6:05 / km','1','25 min','N/A','3','Reduced aerobic volume to absorb the block.',''],
    ['Tue','Run','1:38-1:40 / 400 m','6','400 m','2.5-3 min','8','Sharpen toward goal pace with lower total stress; every rep remains smooth and repeatable.',''],
    ['Wed','Weighted Pull-up','+25 kg','2','5','3 min','6-7','Unload pulling volume while retaining strength exposure.',''],
    ['Wed','Pull-up','Bodyweight','2','8','2 min','6-7','Crisp rep-capacity work with clear reserve.',''],
    ['Fri','Deadlift','RPE-selected load','2','3','3 min','6-7','Reduced maintenance intensity and clear reserve.',''],
    ['Fri','Run','5:30-6:00 / km','1','35 min','N/A','3-4','Reduced long-run volume for consolidation.',''],
    ['Sun','Backpack Carry','20 kg','1','70 min','N/A','5-6','First modest pace progression while running volume unloads; aim 9:10-9:25 / km only if shins remain normal.',''],
  ];
}

function tacticalCandidate(){
  return ['Tactical 3K block. The 3K remains primary; ruck and pull-up goals receive direct exposure while barbell strength stays supportive.','Running volume progresses conservatively because previous shin irritation followed abrupt increases; Week 4 consolidates volume.',...[1,2,3,4].map(w=>block(w,tacticalRows(w)))].join('\n\n');
}

test('manual 9+ Youth candidate passes the production validation chain',()=>{
  const out=validateProductionProgram(youthCandidate(),YOUTH_GYMNASTICS_INTAKE);
  assert.equal(out.ok,true);
});

test('manual 9+ Tactical 3K candidate passes the production validation chain',()=>{
  const out=validateProductionProgram(tacticalCandidate(),TACTICAL_3K_INTAKE);
  assert.equal(out.ok,true);
});
