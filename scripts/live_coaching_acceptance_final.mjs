const BASE='https://raz-coaching-platform.onrender.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(path,options={}){const res=await fetch(BASE+path,options);const text=await res.text();let body=null;try{body=text?JSON.parse(text):null}catch{body={raw:text}}return{res,body,text};}
async function poll(id){const started=Date.now();while(Date.now()-started<420000){const x=await req('/api/job/'+id);if(x.body?.status==='done')return x.body;if(x.body?.status==='error')throw new Error(x.body.error||'build failed');await sleep(4000);}throw new Error('build timeout');}
async function verifyQaConfig(){const cfg=await req('/api/program-pass-config');console.log('CONFIG',cfg.res.status,JSON.stringify(cfg.body));if(cfg.res.status!==200||cfg.body?.enforced!==false)throw new Error(`Program Pass enforcement must be OFF for live QA: ${JSON.stringify(cfg.body)}`);}
const consent=()=>({health_data:true,policy_version:'2026-08-11',consented_at:new Date().toISOString()});

function week1Rows(program){
  const m=String(program||'').match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i);if(!m)return[];
  const lines=m[1].split('\n').filter(x=>x.trim());if(lines.length<2)return[];
  const header=lines[0].split('\t').map(x=>x.trim().toLowerCase());
  const idx=Object.fromEntries(header.map((x,i)=>[x,i]));
  return lines.slice(1).map(line=>{const c=line.split('\t');return{day:c[idx.day]||'',exercise:c[idx.exercise]||'',weight:c[idx.weight]||'',sets:c[idx.sets]||'',reps:c[idx.reps]||'',rest:c[idx.rest]||'',rpe:c[idx['target rpe']]||'',notes:c[idx.notes]||'',raw:line};});
}
function meaningful(row,re){if(/^\s*\[WARMUP\]/i.test(row.exercise)||!re.test(`${row.exercise} ${row.notes}`))return false;const dose=`${row.reps} ${row.weight} ${row.notes}`;const mins=[...dose.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/gi)].map(m=>Number(m[1]));return mins.some(x=>x>=15)||/\b\d+(?:\.\d+)?\s*(?:km|m)\b/i.test(dose)||/\b\d+\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:m|km|min|minutes?)\b/i.test(dose);}
function progressionBearing(row){return /(?:\b(?:interval|threshold|critical speed|critical power|race pace|goal pace|target pace|2k pace|3k pace|5k pace|10k pace|marathon pace|split target|stroke rate|cadence|power target|pace target)\b|\b\d+(?::\d+)?\s*\/\s*km\b|\b\d+(?:\.\d+)?\s*(?:km\/h|kph|watts?|w)\b|\bprogress(?:ion|ively)?\b)/i.test(`${row.exercise} ${row.weight} ${row.reps} ${row.notes}`);}
function modalityDays(rows,re){return new Set(rows.filter(r=>meaningful(r,re)).map(r=>r.day)).size;}
function hasProgression(rows,re){return rows.some(r=>meaningful(r,re)&&progressionBearing(r));}
function inspectCommon(program){
  const rows=week1Rows(program);
  const marker=Number((program.match(/QA_FORMULA_VIOLATION_COUNT:\s*(\d+)/)||[])[1]||0);
  const leakage=/\[REVIEW\]|contact support|placeholder|could not be safely generated/i.test(program);
  const sprintConflict=rows.some(r=>/^Sprint$/i.test(r.exercise)&&/(speed|velocity|90\s*[-–]\s*95%)/i.test(r.notes)&&!/^N\/?A$/i.test(String(r.rpe).trim()));
  return{rows,marker,leakage,sprintConflict};
}

async function verifyZeroCostClarificationGate(){
  const intake={primary_goals:['Back squat 200 kg'],secondary_goals:[],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'advanced',days_per_week:3,gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:0,session_length:'60 minutes',bodyweight:'84 kg',equipment:'Full commercial gym',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',current_numbers:'Back squat: 170 kg x 3',performance_markers:['Back squat: 170 kg x 3'],injuries:'Recurring low-back irritation',pain:{active:true,description:'Recurring low-back irritation'},mobility:{active:false,limitation:''},sport:'',sport_schedule:[],sleep_hours:'7',recovery_rating:'average',notes:'',privacy_consent:consent()};
  const x=await req('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake})});
  console.log('CLARIFICATION_GATE',x.res.status,JSON.stringify(x.body));
  if(x.res.status!==422||x.body?.clarification_required!==true||!x.body.clarifications?.some(q=>q.id==='lumbar_goal_movement_tolerance'))throw new Error('Latest zero-cost clarification gate is not live.');
}

async function runCase(name,intake,caseCheck){
  const started=Date.now();
  const build=await req('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake})});
  console.log(`\n===== ${name} BUILD =====\n${build.res.status} ${JSON.stringify(build.body)}`);
  if(build.res.status!==202||!build.body?.job_id||!build.body?.token)return{name,ok:false,error:`build not accepted: ${build.res.status} ${JSON.stringify(build.body)}`};
  const token=build.body.token;
  try{
    const done=await poll(build.body.job_id);const program=String(done.program||'');
    console.log(`${name} generation_seconds=${((Date.now()-started)/1000).toFixed(1)}`);
    console.log(`===== ${name} FULL PROGRAM START =====\n${program}\n===== ${name} FULL PROGRAM END =====`);
    const common=inspectCommon(program);const checks=caseCheck(program,common);
    const ok=common.marker===0&&!common.leakage&&!common.sprintConflict&&checks.every(x=>x.ok);
    console.log(`${name} COMMON formula_marker=${common.marker} leakage=${common.leakage} sprint_rpe_conflict=${common.sprintConflict}`);
    for(const c of checks)console.log(`${name} CHECK ${c.ok?'PASS':'FAIL'} ${c.name}: ${c.detail}`);
    return{name,ok,marker:common.marker,leakage:common.leakage,sprintConflict:common.sprintConflict,checks,program};
  }catch(err){console.log(`${name} ERROR=${String(err?.stack||err)}`);return{name,ok:false,error:String(err?.message||err)};}
  finally{const del=await req('/api/client-data',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>null);console.log(`${name} delete_status=${del?.res?.status||'failed'}`);}
}

const avatar3={
  primary_goals:['Build a Warrior / Batman performance profile: muscular, strong, athletic, explosive and capable'],secondary_goals:['Improve weighted pull-up and weighted dip strength and hypertrophy','Build lower-body strength, trunk strength, grip, work capacity and body composition'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate-advanced',days_per_week:3,gym_availability_mode:'limited',available_gym_days:['Mon','Thu','Sat'],same_day_gap_hours:0,session_length:'60 minutes',bodyweight:'100 kg',height:'180 cm',equipment:'Outdoor park only: pull-up bar, parallel bars, rings, weighted belt and plates with maximum external load about 37 kg, and open ground. No barbell, no dumbbells, no machines, no cables, no bike, no rower, no box.',training_location:'outdoor_park',language:'en',split_preference:'coach_decide',current_numbers:'Weighted Dip: +20 kg x 12; Weighted Dip: +35 kg x 2; Weighted Pull-Up: +20 kg x 6; historical squat about 100 kg but no current barbell access.',performance_markers:['Weighted Dip: +20 kg x 12','Weighted Dip: +35 kg x 2','Weighted Pull-Up: +20 kg x 6','Historical squat about 100 kg'],injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'',sport_schedule:[],sleep_hours:'7-8 hours',recovery_rating:'Average',notes:'Monday and Thursday are mandatory progression sessions. Saturday is optional, but OPTIONAL DOES NOT MEAN EASY: it must be productive, stimulating and useful while the core program must still progress if Saturday is skipped. Avoid random burpees, bear crawls, circus AMRAPs or CrossFit-style randomness. Build useful weighted calisthenics, hypertrophy, lower-body strength, trunk, grip, athletic power and work capacity within the listed equipment.',privacy_consent:consent()
};
const annoying={
  primary_goals:['Back squat 200 kg','Weighted chin-up +70 kg for 3 reps'],secondary_goals:['Improve 5 km from 25:00 to 22:30'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'advanced',days_per_week:4,gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'60 minutes',bodyweight:'84 kg',equipment:'Full commercial gym — all standard barbells, dumbbells, racks, machines, cables, cardio machines and bodyweight stations available.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',current_numbers:'Back squat: 170 kg x 3\nWeighted chin-up: +55 kg x 3\nRDL: 190 kg x 5\nOHP: 70 kg x 5\n5 km: 25:00',performance_markers:['Back squat: 170 kg x 3','Weighted chin-up: +55 kg x 3','RDL: 190 kg x 5','OHP: 70 kg x 5','5 km: 25:00'],injuries:'Mild recurring low-back irritation after high-volume deep squatting; controlled box squats and RDLs are currently tolerated.',pain:{active:true,description:'Mild recurring low-back irritation after high-volume deep squatting',severity:'mild',character:'ache/tightness',next_day_baseline:'usually back to baseline',tolerated_movements:'controlled box squats, RDLs, split squats'},mobility:{active:false,limitation:''},sport:'MMA / BJJ',sport_schedule:[{day:'Mon',intensity:'hard',gap_hours:6},{day:'Wed',intensity:'moderate',gap_hours:6},{day:'Fri',intensity:'hard',gap_hours:6},{day:'Sat',intensity:'moderate',gap_hours:6}],sleep_hours:'6.5',recovery_rating:'average / variable',notes:'Currently running 2 sessions per week, about 10 km/week. Avoid hard conditioning within 24 hours before hard MMA. Keep sessions at or under 60 minutes. No more than two genuinely hard lower-body sessions per week. Four strength sessions are requested, but low-cost resistance/accessory sessions are acceptable when sport load is high; do not silently replace a strength day with cardio-only work.',privacy_consent:consent()
};
const runner5k={
  primary_goals:['Improve 5 km running performance from 25:00 to 22:30'],secondary_goals:['Maintain general strength'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate',days_per_week:2,gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'60 minutes',bodyweight:'76 kg',equipment:'Commercial gym plus treadmill and outdoor running routes.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',current_numbers:'5 km: 25:00; Back squat: 110 kg x 5; Romanian deadlift: 120 kg x 6',performance_markers:['5 km: 25:00','Back squat: 110 kg x 5','Romanian deadlift: 120 kg x 6'],injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'Running',sport_schedule:[{day:'Tue',intensity:'easy'},{day:'Thu',intensity:'moderate'},{day:'Sun',intensity:'easy'}],sleep_hours:'7.5',recovery_rating:'good',notes:'Currently runs 3 sessions per week, about 20 km/week, longest recent run 8 km. Running performance is the priority; strength should be maintained with minimal interference.',privacy_consent:consent()
};
const rower2k={
  primary_goals:['Improve 2 km rowing ergometer performance from 7:30 to 7:05'],secondary_goals:['Maintain lower-body and pulling strength'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate-advanced',days_per_week:2,gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'60 minutes',bodyweight:'86 kg',equipment:'Commercial gym with Concept2 rower, barbells, racks, dumbbells and cables.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',current_numbers:'2 km Concept2 row: 7:30; Back squat: 145 kg x 5; RDL: 170 kg x 5; Weighted chin-up: +35 kg x 5',performance_markers:['2 km row: 7:30','Back squat: 145 kg x 5','RDL: 170 kg x 5','Weighted chin-up: +35 kg x 5'],injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'Rowing ergometer',sport_schedule:[{day:'Mon',intensity:'easy'},{day:'Wed',intensity:'hard'},{day:'Sat',intensity:'moderate'}],sleep_hours:'7.5',recovery_rating:'good',notes:'Currently rows 3 times per week. The 2 km ergometer result is the primary performance target. Preserve useful strength without allowing pulling/back fatigue to ruin the key rowing sessions.',privacy_consent:consent()
};

const RUN_RE=/\b(?:Run|Running|Treadmill|Zone-2 Run|Shuttle Run|Sprint)\b/i;
const ROW_RE=/\b(?:Rower|Rowing|Rowing Ergometer|Zone-2 Row|Concept ?2)\b/i;
const cases=[
  ['AVATAR3_WARRIOR',avatar3,(program,c)=>{
    const days=new Set(c.rows.map(r=>r.day));
    const sat=c.rows.filter(r=>r.day==='Sat'&&!/^\s*\[WARMUP\]/i.test(r.exercise));
    const forbidden=/\b(?:barbell|dumbbell|cable|bike|rower|box jump)\b/i.test(c.rows.map(r=>`${r.exercise} ${r.notes}`).join(' '));
    return[
      {name:'mandatory_optional_calendar',ok:['Mon','Thu','Sat'].every(d=>days.has(d)),detail:`days=${[...days].join(',')}`},
      {name:'optional_not_empty',ok:sat.length>=3,detail:`Saturday meaningful rows=${sat.length}`},
      {name:'park_equipment_only',ok:!forbidden,detail:`forbidden_equipment_seen=${forbidden}`},
    ];
  }],
  ['ANNOYING_CONCURRENT',annoying,(program,c)=>{
    const directBack=c.rows.some(r=>/^Back Squat$/i.test(r.exercise));
    const badBoxKg=c.rows.some(r=>/^Box Squat(?: to Parallel)?$/i.test(r.exercise)&&/\d+(?:\.\d+)?\s*kg/i.test(r.weight));
    const runDays=modalityDays(c.rows,RUN_RE);
    return[
      {name:'direct_back_squat_retained',ok:directBack,detail:`direct Back Squat=${directBack}`},
      {name:'unbenchmarked_box_squat_no_fixed_kg',ok:!badBoxKg,detail:`fixed unbenchmarked Box Squat kg=${badBoxKg}`},
      {name:'existing_two_runs_preserved',ok:runDays>=2,detail:`meaningful running days=${runDays}`},
      {name:'5k_progression_session_present',ok:hasProgression(c.rows,RUN_RE),detail:`progression-bearing running=${hasProgression(c.rows,RUN_RE)}`},
    ];
  }],
  ['RUNNER_5K',runner5k,(program,c)=>{
    const runDays=modalityDays(c.rows,RUN_RE);
    return[
      {name:'three_current_runs_preserved',ok:runDays>=3,detail:`meaningful running days=${runDays}`},
      {name:'5k_progression_session_present',ok:hasProgression(c.rows,RUN_RE),detail:`progression-bearing running=${hasProgression(c.rows,RUN_RE)}`},
    ];
  }],
  ['ROWER_2K',rower2k,(program,c)=>{
    const rowDays=modalityDays(c.rows,ROW_RE);
    return[
      {name:'three_current_rows_preserved',ok:rowDays>=3,detail:`meaningful rowing days=${rowDays}`},
      {name:'2k_progression_session_present',ok:hasProgression(c.rows,ROW_RE),detail:`progression-bearing rowing=${hasProgression(c.rows,ROW_RE)}`},
    ];
  }],
];

await verifyQaConfig();await verifyZeroCostClarificationGate();
const results=[];
for(const [name,intake,check] of cases)results.push(await runCase(name,intake,check));
console.log('\n===== FINAL LIVE COACHING ACCEPTANCE SUMMARY =====');
for(const r of results)console.log(JSON.stringify({name:r.name,ok:r.ok,marker:r.marker??null,leakage:r.leakage??null,sprintConflict:r.sprintConflict??null,error:r.error??null,failedChecks:r.checks?.filter(c=>!c.ok).map(c=>c.name)||[]}));
if(results.every(r=>r.ok))console.log('FINAL_LIVE_COACHING_ACCEPTANCE=PASS');else{console.log('FINAL_LIVE_COACHING_ACCEPTANCE=FAIL');process.exitCode=1;}
