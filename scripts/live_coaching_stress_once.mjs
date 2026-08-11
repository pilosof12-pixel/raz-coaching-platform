const BASE='https://raz-coaching-platform.onrender.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(path,options={}){const res=await fetch(BASE+path,options);const text=await res.text();let body=null;try{body=text?JSON.parse(text):null}catch{body={raw:text}}return{res,body,text};}
async function poll(id){const started=Date.now();while(Date.now()-started<360000){const x=await req('/api/job/'+id);if(x.body?.status==='done')return x.body;if(x.body?.status==='error')throw new Error(x.body.error||'build failed');await sleep(4000);}throw new Error('build timeout');}
async function verifyQaConfig(){
  let last=null;
  for(let attempt=1;attempt<=6;attempt++){
    const cfg=await req('/api/program-pass-config').catch(err=>({res:{status:0},body:{network_error:String(err)},text:String(err)}));
    last=cfg;
    console.log(`QA config attempt ${attempt}: status=${cfg.res?.status} body=${JSON.stringify(cfg.body)}`);
    if(cfg.res?.status===200 && cfg.body?.enforced===false) return cfg.body;
    if(cfg.res?.status===200 && cfg.body?.enforced===true) throw new Error(`Program Pass enforcement is actually ON in live config: ${JSON.stringify(cfg.body)}`);
    await sleep(5000);
  }
  throw new Error(`Could not verify live Program Pass config after retries. Last status=${last?.res?.status} body=${JSON.stringify(last?.body)}`);
}
async function runCase(name,intake){
  await verifyQaConfig();
  const started=Date.now();
  const build=await req('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake})});
  console.log(`\n===== ${name} BUILD =====`);console.log(build.res.status,JSON.stringify(build.body));
  if(build.res.status!==202||!build.body?.job_id||!build.body?.token) throw new Error(`${name}: build not accepted; status=${build.res.status} body=${JSON.stringify(build.body)}`);
  const token=build.body.token;
  try{
    const done=await poll(build.body.job_id);
    const program=String(done.program||'');
    console.log(`${name} generation_seconds=${((Date.now()-started)/1000).toFixed(1)}`);
    console.log(`\n===== ${name} FULL PROGRAM START =====\n${program}\n===== ${name} FULL PROGRAM END =====`);
    const marker=Number((program.match(/QA_FORMULA_VIOLATION_COUNT:\s*(\d+)/)||[])[1]||0);
    console.log(`${name} formula_marker=${marker}`);
    if(marker>0) throw new Error(`${name}: formula marker ${marker}`);
    if(/\[REVIEW\]|contact support|placeholder/i.test(program)) throw new Error(`${name}: client-facing QA leakage`);
    return program;
  } finally {
    const del=await req('/api/client-data',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>null);
    console.log(`${name} delete_status=${del?.res?.status||'failed'}`);
  }
}
const consent=()=>({health_data:true,policy_version:'2026-08-11',consented_at:new Date().toISOString()});
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
  notes:'Avoid hard conditioning within 24 hours before hard MMA. Keep sessions at or under 60 minutes. No more than two genuinely hard lower-body sessions per week. Four strength sessions are requested, but low-cost resistance/accessory sessions are acceptable when sport load is high; do not silently replace a strength day with cardio-only work.',privacy_consent:consent()
};
await runCase('AVATAR3_WARRIOR',avatar3);
await runCase('ANNOYING_CONCURRENT',annoying);
console.log('\nLIVE_COACHING_STRESS_RESULT=PASS');