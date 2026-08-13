import test from 'node:test';
import assert from 'node:assert/strict';
import {
  goalDoseFlags,
  unbenchmarkedVariationLoadFlags,
  strengthSessionAccountingFlags,
  endurancePerformanceIntegrityFlags,
  exactPrimaryMovementFlags,
  currentTargetModalityExposure,
  elitePromptRules,
} from '../engine/phase15_elite_guardrails.js';

function parsed(rows) {
  const header=['Day','Exercise','Weight','Sets','Reps','Rest','Target RPE','Notes','Results'];
  const idx={day:0,exercise:1,weight:2,sets:3,reps:4,rest:5,'target rpe':6,notes:7,results:8};
  return {header,idx,rows:rows.map(cells=>({cells}))};
}
const row=(day,ex,weight='RPE-selected load',sets='2',reps='5',notes='')=>[day,ex,weight,sets,reps,'2 min','7',notes,''];

test('named 5K goal requires at least one direct running exposure',()=>{
  const intake={secondary_goals:['Improve 5 km from 25:00 to 22:30']};
  const crossOnly=parsed([row('Tue','Rower','RPE-selected load','1','25 min')]);
  const direct=parsed([row('Tue','Run','bodyweight','1','20 min')]);
  assert.equal(goalDoseFlags('',intake,crossOnly).some(x=>x.code==='NAMED_GOAL_DIRECT_EXPOSURE_MISSING'),true);
  assert.equal(goalDoseFlags('',intake,direct).length,0);
});

test('current target-modality exposure is recovered from athlete-specific notes or schedule',()=>{
  assert.equal(currentTargetModalityExposure({notes:'Currently runs 3 sessions per week, about 20 km/week.'},'running'),3);
  assert.equal(currentTargetModalityExposure({notes:'Currently rows 3 times per week.'},'rowing'),3);
  assert.equal(currentTargetModalityExposure({notes:'Currently trains 2 swims, 2 rides and 2 runs each week.'},'swimming'),2);
  assert.equal(currentTargetModalityExposure({notes:'Currently trains 2 swims, 2 rides and 2 runs each week.'},'cycling'),2);
  assert.equal(currentTargetModalityExposure({sport:'Running',sport_schedule:[{day:'Tue'},{day:'Thu'},{day:'Sun'}]},'running'),3);
});

test('primary 5K goal cannot silently drop current three-run exposure and needs a progressing event session',()=>{
  const intake={primary_goals:['Improve 5 km from 25:00 to 22:30'],notes:'Currently runs 3 sessions per week, about 20 km/week.'};
  const inadequate=parsed([row('Tue','Zone-2 Run','N/A','1','30 min','Easy conversational running.')]);
  const flags=endurancePerformanceIntegrityFlags('',intake,inadequate);
  assert.equal(flags.some(x=>x.code==='TARGET_MODALITY_EXPOSURE_REDUCED'),true);
  assert.equal(flags.some(x=>x.code==='EVENT_PROGRESSING_SESSION_MISSING'),true);
  const adequate=parsed([
    row('Tue','Zone-2 Run','N/A','1','30 min','Easy conversational running.'),
    row('Thu','Treadmill','N/A','5','4 min','5K-pace interval progression; 2 min easy recovery.'),
    row('Sun','Run','N/A','1','45 min','Easy aerobic run.'),
  ]);
  assert.equal(endurancePerformanceIntegrityFlags('',intake,adequate).length,0);
});

test('secondary 5K goal preserves the athlete stated two weekly runs instead of token exposure',()=>{
  const intake={secondary_goals:['Improve 5 km from 25:00 to 22:30'],notes:'Currently running 2 sessions per week, about 10 km/week.'};
  const onlyOne=parsed([row('Thu','Zone-2 Run','N/A','1','30 min','Easy conversational running.')]);
  assert.equal(endurancePerformanceIntegrityFlags('',intake,onlyOne).some(x=>x.code==='TARGET_MODALITY_EXPOSURE_REDUCED'),true);
});

test('low-intensity running cannot be prescribed faster than demonstrated current 5K pace',()=>{
  const intake={
    secondary_goals:['Improve 5 km from 25:00 to 22:30'],
    current_numbers:'5 km: 25:00',
    performance_markers:['5 km: 25:00'],
    notes:'Currently running 2 sessions per week, about 10 km/week.'
  };
  const impossible=parsed([
    row('Wed','Run','N/A','1','25 min','Easy conversational pace, Zone 2.'),
    row('Thu','Run','4:50/km','1','25 min','Target pace 4:50/km, Zone 2 effort; progressive aerobic run.'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,impossible);
  assert.equal(flags.some(x=>x.code==='LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE'),true);

  const plausible=parsed([
    row('Wed','Run','N/A','1','25 min','Easy conversational pace, Zone 2.'),
    row('Thu','Run','5:40/km','1','25 min','Progressive low-intensity run; keep breathing controlled.'),
  ]);
  assert.equal(endurancePerformanceIntegrityFlags('',intake,plausible).some(x=>x.code==='LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE'),false);
});

test('low-intensity prompt uses current field performance as a ceiling check without inventing a universal zone formula',()=>{
  const rules=elitePromptRules({
    secondary_goals:['Improve 5 km from 25:00 to 22:30'],
    current_numbers:'5 km: 25:00',
    notes:'Currently running 2 sessions per week.'
  }).join('\n');
  assert.match(rules,/LOW-INTENSITY RUNNING ANCHOR/i);
  assert.match(rules,/about 5:00\/km for 5K/i);
  assert.match(rules,/never use that race pace or a faster pace as low intensity/i);
  assert.match(rules,/rather than fabricating a precise breakpoint/i);
});

test('rower warm-ups do not satisfy a 2K rowing performance goal',()=>{
  const intake={primary_goals:['Improve 2 km rowing ergometer from 7:30 to 7:05'],notes:'Currently rows 3 times per week.'};
  const warmupOnly=parsed([
    row('Tue','[WARMUP] Rower','Bodyweight','1','5 min','Easy pace'),
    row('Thu','[WARMUP] Rower','Bodyweight','1','5 min','Easy pace'),
    row('Sat','[WARMUP] Rower','Bodyweight','1','5 min','Easy pace'),
  ]);
  const flags=endurancePerformanceIntegrityFlags('',intake,warmupOnly);
  assert.equal(flags.some(x=>x.code==='TARGET_MODALITY_EXPOSURE_REDUCED'),true);
  assert.equal(flags.some(x=>x.code==='EVENT_PROGRESSING_SESSION_MISSING'),true);
});

test('rowing 500m split is recognized as a progression-bearing event target',()=>{
  const intake={primary_goals:['Improve 2 km rowing ergometer from 7:30 to 7:05'],notes:'Currently rows 3 times per week.'};
  const p=parsed([
    row('Mon','Rowing Ergometer','N/A','1','45 min','Easy aerobic row.'),
    row('Wed','Rowing Ergometer','N/A','5','500m','Hold 1:46-1:47/500m; 2:30 recovery.'),
    row('Sat','Rowing Ergometer','N/A','1','30 min','Moderate sustainable row.'),
  ]);
  assert.equal(endurancePerformanceIntegrityFlags('',intake,p).length,0);
});

test('multisport goal preserves set-duration intervals as meaningful modality exposure',()=>{
  const intake={primary_goals:['Improve Olympic-distance triathlon across swim, bike and 10 km run'],notes:'Currently trains 2 swims, 2 rides and 2 runs each week.'};
  const p=parsed([
    row('Mon','Swim','N/A','1','45 min','Threshold-pace progression.'),
    row('Thu','Swim','N/A','8','100m','Olympic-distance pace intervals.'),
    row('Tue','Bike','N/A','3','10 min','Power-target tempo interval progression.'),
    row('Fri','Bike','N/A','1','60 min','Easy aerobic ride.'),
    row('Wed','Run','N/A','4','8 min','10K-pace interval progression.'),
    row('Sun','Zone-2 Run','N/A','1','45 min','Easy aerobic run.'),
  ]);
  assert.equal(endurancePerformanceIntegrityFlags('',intake,p).length,0);
});

test('named primary strength goal needs direct movement-pattern exposure but guardrail does not invent frequency',()=>{
  const intake={primary_goals:['Weighted chin-up +70 kg for 3 reps']};
  const none=parsed([row('Tue','Chest-Supported Row','RPE-selected load','3','8')]);
  const one=parsed([row('Tue','Weighted Chin-up','+50 kg','4','3')]);
  assert.equal(goalDoseFlags('',intake,none).some(x=>x.code==='NAMED_GOAL_DIRECT_EXPOSURE_MISSING'),true);
  assert.equal(goalDoseFlags('',intake,one).length,0);
});

test('Back Squat goal may use tolerated box squat when the intake identifies deep/high-volume aggravation',()=>{
  const intake={primary_goals:['Back squat 200 kg'],injuries:'Low-back irritation after high-volume deep squatting; controlled box squats are tolerated.'};
  const boxOnly=parsed([row('Tue','Box Squat to Parallel','RPE-selected load','3','3','Use the tolerated parallel depth and stop if back symptoms rise.')]);
  assert.equal(exactPrimaryMovementFlags('',intake,boxOnly).length,0);
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/PAIN-SENSITIVE SPECIFICITY/i);
});

test('vague low-back irritation does not automatically waive exact Back Squat specificity',()=>{
  const intake={primary_goals:['Back squat 200 kg'],injuries:'Recurring low-back irritation; exact aggravating feature and tolerated squat variations are unknown.'};
  const boxOnly=parsed([row('Tue','Box Squat to Parallel','RPE-selected load','3','3')]);
  assert.equal(exactPrimaryMovementFlags('',intake,boxOnly).some(x=>x.code==='PRIMARY_EXACT_MOVEMENT_MISSING'),true);
});

test('explicit prohibition allows a primary lift variation to be omitted rather than forced through pain',()=>{
  const intake={primary_goals:['Back squat 200 kg'],injuries:'Back Squat is currently not tolerated and should be avoided; Box Squat to Parallel is tolerated.'};
  const boxOnly=parsed([row('Tue','Box Squat to Parallel','RPE-selected load','3','3')]);
  assert.equal(exactPrimaryMovementFlags('',intake,boxOnly).length,0);
});

test('unbenchmarked lift variation cannot use exact kilograms inherited from related benchmark',()=>{
  const intake={performance_markers:['Back squat: 170 kg x 3']};
  const liveRegression=parsed([row('Tue','Box Squat to Parallel','160 kg','3','3-5')]);
  const anyFixed=parsed([row('Thu','Box Squat','145 kg','3','3')]);
  const autoreg=parsed([row('Thu','Box Squat','RPE-selected load','3','3')]);
  assert.equal(unbenchmarkedVariationLoadFlags(intake,liveRegression).some(x=>x.code==='UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE'),true);
  assert.equal(unbenchmarkedVariationLoadFlags(intake,anyFixed).some(x=>x.code==='UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE'),true);
  assert.equal(unbenchmarkedVariationLoadFlags(intake,autoreg).length,0);
});

test('requested strength day cannot silently become cardio/core only',()=>{
  const intake={days_per_week:4,sport:'MMA / BJJ',sport_schedule:[{day:'Mon',intensity:'hard'},{day:'Wed',intensity:'moderate'},{day:'Fri',intensity:'hard'},{day:'Sat',intensity:'moderate'}]};
  const missing=parsed([
    row('Tue','Box Squat','RPE-selected load','3','3'),
    row('Wed','Shuttle Run','bodyweight','1','20 min'),
    row('Thu','Chin-up','+40 kg','4','3'),
    row('Sun','Overhead Press','RPE-selected load','3','5'),
  ]);
  const complete=parsed([
    row('Tue','Box Squat','RPE-selected load','3','3'),
    row('Wed','Reverse Lunge','RPE-selected load','2','8'),
    row('Thu','Chin-up','+40 kg','4','3'),
    row('Sun','Overhead Press','RPE-selected load','3','5'),
  ]);
  assert.equal(strengthSessionAccountingFlags('',intake,missing).some(x=>x.code==='REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED'),true);
  assert.equal(strengthSessionAccountingFlags('',intake,complete).length,0);
});

test('integrity prompt rules defer workout design to sources while preserving client-specific dose',()=>{
  const rules=elitePromptRules({days_per_week:4,primary_goals:['Back squat 200 kg'],secondary_goals:['Improve 5 km from 25:00 to 22:30'],notes:'Currently running 2 sessions per week, about 10 km/week.'}).join('\n');
  assert.match(rules,/higher frequency, volume or progression comes only from the deterministic planner, specialist rules and curated RAZ coaching sources/i);
  assert.match(rules,/exact kilograms require a reliable benchmark/i);
  assert.match(rules,/cannot silently replace/i);
  assert.match(rules,/about 2 current running exposure/i);
  assert.match(rules,/progression-bearing running session/i);
  assert.match(rules,/direct Back Squat exposure/i);
  assert.doesNotMatch(rules,/every primary goal needs multiple/i);
});
