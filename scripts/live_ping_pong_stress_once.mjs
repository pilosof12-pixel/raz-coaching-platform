const BASE='https://raz-coaching-platform.onrender.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(path,options={}){const res=await fetch(BASE+path,options);const text=await res.text();let body=null;try{body=text?JSON.parse(text):null}catch{body={raw:text}}return{res,body,text};}
const consent=()=>({health_data:true,policy_version:'2026-08-11',consented_at:new Date().toISOString()});
function base(overrides={}){return {primary_goals:['Build whole-body strength'],secondary_goals:[],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'advanced',days_per_week:3,gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'60 minutes',bodyweight:'82 kg',equipment:'Full commercial gym',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',current_numbers:'Back squat 140 kg x 5; Bench press 100 kg x 5',performance_markers:['Back squat 140 kg x 5','Bench press 100 kg x 5'],injuries:'No current injury.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'',sport_schedule:[],sleep_hours:'7.5',recovery_rating:'good',notes:'',privacy_consent:consent(),...overrides};}
async function build(intake){return req('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake})});}
function ids(x){return Array.isArray(x.body?.clarifications)?x.body.clarifications.map(q=>q.id):[];}
function assert(cond,msg){if(!cond)throw new Error(msg);}
async function expectClarification(name,intake,expected,{exact=false,max=4}={}){
  const x=await build(intake);const qids=ids(x);const noJob=!x.body?.job_id&&!x.body?.token;
  console.log(`${name} status=${x.res.status} ids=${JSON.stringify(qids)} no_job_token=${noJob}`);
  assert(x.res.status===422,`${name}: expected 422, got ${x.res.status} ${x.text}`);
  assert(x.body?.clarification_required===true,`${name}: missing clarification_required=true`);
  assert(noJob,`${name}: clarification leaked a job/token`);
  assert(qids.length<=max,`${name}: exceeded question cap: ${qids.length}`);
  for(const id of expected)assert(qids.includes(id),`${name}: missing ${id}; got ${qids.join(',')}`);
  if(exact)assert(qids.length===expected.length&&expected.every((id,i)=>qids[i]===id),`${name}: expected exact ${JSON.stringify(expected)} got ${JSON.stringify(qids)}`);
  return x;
}
async function poll(id){const started=Date.now();while(Date.now()-started<420000){const x=await req('/api/job/'+id);if(x.body?.status==='done'||x.body?.status==='error')return x;await sleep(4000);}throw new Error('build timeout');}

const cfg=await req('/api/program-pass-config');
console.log('CONFIG',cfg.res.status,JSON.stringify(cfg.body));
assert(cfg.res.status===200,'config unavailable');
assert(cfg.body?.enforced===false,'Program Pass enforcement must remain OFF for this live QA');

await expectClarification('RUNNING_MISSING_BASELINE_EXPOSURE',base({
  primary_goals:['Run 5K in 22:30'],
  current_numbers:'Back squat 140 kg x 5',
  performance_markers:['Back squat 140 kg x 5'],
}),['benchmark_running_event','running_current_exposure']);

await expectClarification('LOW_BACK_GOAL_TOLERANCE',base({
  primary_goals:['Back squat 200 kg'],
  current_numbers:'Back squat 170 kg x 3',
  performance_markers:['Back squat 170 kg x 3'],
  injuries:'Recurring low-back irritation',
  pain:{active:true,description:'Recurring low-back irritation'},
}),['lumbar_goal_movement_tolerance'],{exact:true});

await expectClarification('LIMITED_EQUIPMENT_LOAD_CEILING',base({
  primary_goals:['Weighted chin-up +70 kg for 3 reps'],
  current_numbers:'Weighted chin-up +55 kg x 3',
  performance_markers:['Weighted chin-up +55 kg x 3'],
  equipment:'Outdoor park with pull-up bar, rings, weighted belt and plates',
  training_location:'outdoor_park',
}),['equipment_load_ceiling'],{exact:true});

await expectClarification('COMBAT_SCHEDULE_MISSING',base({
  primary_goals:['Build whole-body strength'],
  sport:'BJJ and MMA',
  sport_schedule:[],
}),['sport_week_structure'],{exact:true});

await expectClarification('ADVANCED_SKILL_BASELINE_MISSING',base({
  primary_goals:['Hold a full planche for 5 seconds'],
  current_numbers:'Back squat 140 kg x 5',
  performance_markers:['Back squat 140 kg x 5'],
}),['benchmark_planche'],{exact:true});

const overloaded=base({
  primary_goals:['Back squat 200 kg','Weighted chin-up +70 kg for 3 reps','Run 5K in 22:30'],
  current_numbers:'Back squat 170 kg x 3; Weighted chin-up +55 kg x 3',
  performance_markers:['Back squat 170 kg x 3','Weighted chin-up +55 kg x 3'],
  equipment:'Outdoor park with pull-up bar, parallel bars, rings, weighted belt and plates',
  training_location:'outdoor_park',
  injuries:'Recurring low-back irritation',
  pain:{active:true,description:'Recurring low-back irritation'},
  sport:'BJJ and MMA',
  sport_schedule:[],
  notes:'',
});
const round1=await expectClarification('OVERLOADED_ROUND1',overloaded,[
  'benchmark_running_event','running_current_exposure','sport_week_structure','lumbar_goal_movement_tolerance'
],{exact:true,max:4});
assert(ids(round1).length===4,'OVERLOADED_ROUND1: did not enforce four-question cap');

const round1Answered={...overloaded,clarification_answers:{
  benchmark_running_event:'Recent 5K is 25:30.',
  running_current_exposure:'Currently 2 runs per week, about 12 km/week. Longest recent run is 7 km.',
  sport_week_structure:'Mon hard BJJ, Wed moderate BJJ, Fri hard MMA.',
  lumbar_goal_movement_tolerance:'Deep or high-volume back squatting aggravates symptoms. Parallel box squat, RDL and split squat are currently comfortable.',
}};
await expectClarification('OVERLOADED_ROUND2',round1Answered,['equipment_load_ceiling'],{exact:true,max:4});

const ready={...round1Answered,clarification_answers:{...round1Answered.clarification_answers,
  equipment_load_ceiling:'Weighted belt with up to 30 kg of plates available.'
}};
const accepted=await build(ready);
console.log('ANSWERED_RESUBMISSION',accepted.res.status,JSON.stringify(accepted.body));
assert(accepted.res.status===202,`answered resubmission did not enter normal build path: ${accepted.res.status} ${accepted.text}`);
assert(accepted.body?.job_id&&accepted.body?.token,'answered resubmission missing job/token');
console.log('RATE_LIMIT_PROOF clarification_requests_before_build=7 final_build_accepted=true');

const done=await poll(accepted.body.job_id);
console.log('FINAL_JOB',done.res.status,JSON.stringify({status:done.body?.status,error:done.body?.error||null,has_program:Boolean(done.body?.program)}));
assert(done.body?.status==='done','final answered build did not complete successfully');
const del=await req('/api/client-data',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:accepted.body.token})});
console.log('DELETE',del.res.status,JSON.stringify(del.body));
assert(del.res.status===200,'cleanup delete failed');

console.log('PING_PONG_STRESS=PASS');
