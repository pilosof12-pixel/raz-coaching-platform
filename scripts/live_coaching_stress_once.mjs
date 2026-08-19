const BASE='https://raz-coaching-platform.onrender.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(path,options={}){const res=await fetch(BASE+path,options);const text=await res.text();let body=null;try{body=text?JSON.parse(text):null}catch{body={raw:text}}return{res,body,text};}
async function poll(id){const started=Date.now();while(Date.now()-started<420000){const x=await req('/api/job/'+id);if(x.body?.status==='done')return x.body;if(x.body?.status==='error')throw new Error(x.body.error||'build failed');await sleep(4000);}throw new Error('build timeout');}
async function verifyQaConfig(){
  let last=null;
  for(let attempt=1;attempt<=8;attempt++){
    const cfg=await req('/api/program-pass-config').catch(err=>({res:{status:0},body:{network_error:String(err)},text:String(err)}));
    last=cfg;
    console.log(`QA config attempt ${attempt}: status=${cfg.res?.status} body=${JSON.stringify(cfg.body)}`);
    if(cfg.res?.status===200 && cfg.body?.enforced===false) return cfg.body;
    if(cfg.res?.status===200 && cfg.body?.enforced===true) throw new Error(`Program Pass enforcement is actually ON in live config: ${JSON.stringify(cfg.body)}`);
    await sleep(5000);
  }
  throw new Error(`Could not verify live Program Pass config after retries. Last status=${last?.res?.status} body=${JSON.stringify(last?.body)}`);
}
const consent=()=>({health_data:true,policy_version:'2026-08-11',consented_at:new Date().toISOString()});

async function verifyZeroCostClarificationGate(){
  const intake={
    primary_goals:['Back squat 200 kg'],secondary_goals:[],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'advanced',days_per_week:3,
    gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:0,session_length:'60 minutes',bodyweight:'84 kg',
    equipment:'Full commercial gym',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',
    current_numbers:'Back squat: 170 kg x 3',performance_markers:['Back squat: 170 kg x 3'],
    injuries:'Recurring low-back irritation',pain:{active:true,description:'Recurring low-back irritation'},mobility:{active:false,limitation:''},sport:'',sport_schedule:[],sleep_hours:'7',recovery_rating:'average',notes:'',privacy_consent:consent()
  };
  const x=await req('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake})});
  console.log(`CLARIFICATION_GATE status=${x.res.status} body=${JSON.stringify(x.body)}`);
  if(x.res.status!==422||x.body?.clarification_required!==true||!Array.isArray(x.body?.clarifications)||!x.body.clarifications.some(q=>q.id==='lumbar_goal_movement_tolerance')){
    throw new Error(`Latest deterministic clarification gate is not live: status=${x.res.status} body=${JSON.stringify(x.body)}`);
  }
}

async function runCase(name,intake){
  await verifyQaConfig();
  const started=Date.now();
  const build=await req('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake})});
  console.log(`\n===== ${name} BUILD =====`);console.log(build.res.status,JSON.stringify(build.body));
  if(build.res.status!==202||!build.body?.job_id||!build.body?.token) return {name,ok:false,error:`build not accepted; status=${build.res.status} body=${JSON.stringify(build.body)}`};
  const token=build.body.token;
  try{
    const done=await poll(build.body.job_id);
    const program=String(done.program||'');
    console.log(`${name} generation_seconds=${((Date.now()-started)/1000).toFixed(1)}`);
    console.log(`\n===== ${name} FULL PROGRAM START =====\n${program}\n===== ${name} FULL PROGRAM END =====`);
    const marker=Number((program.match(/QA_FORMULA_VIOLATION_COUNT:\s*(\d+)/)||[])[1]||0);
    const leakage=/\[REVIEW\]|contact support|placeholder/i.test(program);
    const sprintConflict=/Sprint[^\n]*\t(?:[1-9](?:\.\d+)?)\t[^\n]*(?:90\s*[-–]\s*95%|speed|velocity)/i.test(program);
    console.log(`${name} formula_marker=${marker} leakage=${leakage} sprint_rpe_conflict=${sprintConflict}`);
    return {name,ok:marker===0&&!leakage&&!sprintConflict,marker,leakage,sprintConflict,program};
  } catch(err) {
    console.log(`${name} ERROR=${String(err?.stack||err)}`);
    return {name,ok:false,error:String(err?.message||err)};
  } finally {
    const del=await req('/api/client-data',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>null);
    console.log(`${name} delete_status=${del?.res?.status||'failed'}`);
  }
}

const avatar3={
  primary_goals:['Build a Warrior / Batman performance profile: muscular, strong, athletic, explosive and capable'],
  secondary_goals:['Improve weighted pull-up and weighted dip strength and hypertrophy','Build lower-body strength, trunk strength, grip, work capacity and body composition'],
  maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate-advanced',days_per_week:3,
  gym_availability_mode:'limited',available_gym_days:['Mon','Thu','Sat'],same_day_gap_hours:0,session_length:'60 minutes',bodyweight:'100 kg',height:'180 cm',
  equipment:'Outdoor park only: pull-up bar, parallel bars, rings, weighted belt and plates with maximum external load about 37 kg, and open ground. No barbell, no dumbbells, no machines, no cables, no bike, no rower, no box.',training_location:'outdoor_park',language:'en',split_preference:'coach_decide',
  current_numbers:'Weighted Dip: +20 kg x 12; Weighted Dip: +35 kg x 2; Weighted Pull-Up: +20 kg x 6; historical squat about 100 kg but no current barbell access.',
  performance_markers:['Weighted Dip: +20 kg x 12','Weighted Dip: +35 kg x 2','Weighted Pull-Up: +20 kg x 6','Historical squat about 100 kg'],
  injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'',sport_schedule:[],
  sleep_hours:'7-8 hours',recovery_rating:'Average',
  notes:'Monday and Thursday are mandatory progression sessions. Saturday is optional, but OPTIONAL DOES NOT MEAN EASY: it must be productive, stimulating and useful while the core program must still progress if Saturday is skipped. Avoid random burpees, bear crawls, circus AMRAPs or CrossFit-style randomness. Build useful weighted calisthenics, hypertrophy, lower-body strength, trunk, grip, athletic power and work capacity within the listed equipment.',
  privacy_consent:consent()
};

const annoying={
  primary_goals:['Back squat 200 kg','Weighted chin-up +70 kg for 3 reps'],secondary_goals:['Improve 5 km from 25:00 to 22:30'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'advanced',days_per_week:4,
  gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'60 minutes',bodyweight:'84 kg',
  equipment:'Full commercial gym — all standard barbells, dumbbells, racks, machines, cables, cardio machines and bodyweight stations available.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',
  current_numbers:'Back squat: 170 kg x 3\nWeighted chin-up: +55 kg x 3\nRDL: 190 kg x 5\nOHP: 70 kg x 5\n5 km: 25:00',
  performance_markers:['Back squat: 170 kg x 3','Weighted chin-up: +55 kg x 3','RDL: 190 kg x 5','OHP: 70 kg x 5','5 km: 25:00'],
  injuries:'Mild recurring low-back irritation after high-volume deep squatting; controlled box squats and RDLs are currently tolerated.',pain:{active:true,description:'Mild recurring low-back irritation after high-volume deep squatting',severity:'mild',character:'ache/tightness',next_day_baseline:'usually back to baseline',tolerated_movements:'controlled box squats, RDLs, split squats'},mobility:{active:false,limitation:''},sport:'MMA / BJJ',
  sport_schedule:[{day:'Mon',intensity:'hard',gap_hours:6},{day:'Wed',intensity:'moderate',gap_hours:6},{day:'Fri',intensity:'hard',gap_hours:6},{day:'Sat',intensity:'moderate',gap_hours:6}],sleep_hours:'6.5',recovery_rating:'average / variable',
  notes:'Currently running 2 sessions per week, about 10 km/week. Avoid hard conditioning within 24 hours before hard MMA. Keep sessions at or under 60 minutes. No more than two genuinely hard lower-body sessions per week. Four strength sessions are requested, but low-cost resistance/accessory sessions are acceptable when sport load is high; do not silently replace a strength day with cardio-only work.',privacy_consent:consent()
};

const runner5k={
  primary_goals:['Improve 5 km running performance from 25:00 to 22:30'],secondary_goals:['Maintain general strength'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate',days_per_week:4,
  gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'60 minutes',bodyweight:'76 kg',
  equipment:'Commercial gym plus treadmill and outdoor running routes.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',
  current_numbers:'5 km: 25:00; Back squat: 110 kg x 5; Romanian deadlift: 120 kg x 6',performance_markers:['5 km: 25:00','Back squat: 110 kg x 5','Romanian deadlift: 120 kg x 6'],
  injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'Running',sport_schedule:[{day:'Tue',intensity:'easy'},{day:'Thu',intensity:'moderate'},{day:'Sun',intensity:'easy'}],
  sleep_hours:'7.5',recovery_rating:'good',notes:'Currently runs 3 sessions per week, about 20 km/week, longest recent run 8 km. Running performance is the priority; strength should be maintained with minimal interference.',privacy_consent:consent()
};

const rower2k={
  primary_goals:['Improve 2 km rowing ergometer performance from 7:30 to 7:05'],secondary_goals:['Maintain lower-body and pulling strength'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate-advanced',days_per_week:5,
  gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'60 minutes',bodyweight:'86 kg',
  equipment:'Commercial gym with Concept2 rower, barbells, racks, dumbbells and cables.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',
  current_numbers:'2 km Concept2 row: 7:30; Back squat: 145 kg x 5; RDL: 170 kg x 5; Weighted chin-up: +35 kg x 5',performance_markers:['2 km row: 7:30','Back squat: 145 kg x 5','RDL: 170 kg x 5','Weighted chin-up: +35 kg x 5'],
  injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'Rowing ergometer',sport_schedule:[{day:'Mon',intensity:'easy'},{day:'Wed',intensity:'hard'},{day:'Sat',intensity:'moderate'}],
  sleep_hours:'7.5',recovery_rating:'good',notes:'Currently rows 3 times per week. The 2 km ergometer result is the primary performance target. Preserve useful strength without allowing pulling/back fatigue to ruin the key rowing sessions.',privacy_consent:consent()
};

const triathlon={
  primary_goals:['Improve Olympic-distance triathlon performance across 1.5 km swim, 40 km bike and 10 km run'],secondary_goals:['Maintain basic whole-body strength'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate',days_per_week:6,
  gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'75 minutes',bodyweight:'72 kg',
  equipment:'Pool access, road bike with power meter, indoor bike trainer, outdoor running routes and a commercial gym.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',
  current_numbers:'1.5 km swim: 32:00; 40 km bike: 1:20:00; 10 km run: 52:00; Back squat: 90 kg x 5',performance_markers:['1.5 km swim: 32:00','40 km bike: 1:20:00','10 km run: 52:00','Back squat: 90 kg x 5'],
  injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'Triathlon',sport_schedule:[],
  sleep_hours:'8',recovery_rating:'good',notes:'Currently trains 2 swims, 2 rides and 2 runs each week. Bike has direct power data. Program must keep separate modality-specific intensity anchors and avoid pretending one pace or heart-rate zone transfers exactly across swim, bike and run.',privacy_consent:consent()
};

await verifyQaConfig();
await verifyZeroCostClarificationGate();
const results=[];
for (const [name,intake] of [
  ['AVATAR3_WARRIOR',avatar3],
  ['ANNOYING_CONCURRENT',annoying],
  ['RUNNER_5K',runner5k],
  ['ROWER_2K',rower2k],
  ['TRIATHLON_OLYMPIC',triathlon],
]) {
  try { results.push(await runCase(name,intake)); }
  catch (err) { console.log(`${name} FATAL=${String(err?.stack||err)}`); results.push({name,ok:false,error:String(err?.message||err)}); }
}
console.log('\n===== LIVE COACHING STRESS SUMMARY =====');
for(const r of results) console.log(JSON.stringify({name:r.name,ok:r.ok,marker:r.marker??null,leakage:r.leakage??null,sprintConflict:r.sprintConflict??null,error:r.error??null}));
if(results.every(r=>r.ok)) console.log('LIVE_COACHING_STRESS_RESULT=PASS');
else { console.log('LIVE_COACHING_STRESS_RESULT=FAIL'); process.exitCode=1; }
