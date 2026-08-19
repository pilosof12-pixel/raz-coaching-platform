const BASE='https://raz-coaching-platform.onrender.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(path,options={}){const res=await fetch(BASE+path,options);const text=await res.text();let body=null;try{body=text?JSON.parse(text):null}catch{body={raw:text}}return{res,body,text};}
async function poll(id){const started=Date.now();while(Date.now()-started<420000){const x=await req('/api/job/'+id);if(x.body?.status==='done')return x.body;if(x.body?.status==='error')throw new Error(x.body.error||'build failed');await sleep(4000);}throw new Error('build timeout');}
const consent=()=>({health_data:true,policy_version:'2026-08-11',consented_at:new Date().toISOString()});
function rows(program){const m=String(program||'').match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i);if(!m)return[];const lines=m[1].split('\n').filter(x=>x.trim());const h=lines[0].split('\t').map(x=>x.trim().toLowerCase());const i=Object.fromEntries(h.map((x,n)=>[x,n]));return lines.slice(1).map(line=>{const c=line.split('\t');return{day:c[i.day]||'',exercise:c[i.exercise]||'',weight:c[i.weight]||'',reps:c[i.reps]||'',rpe:c[i['target rpe']]||'',notes:c[i.notes]||''};});}
function meaningful(r,re){if(/^\s*\[WARMUP\]/i.test(r.exercise)||!re.test(`${r.exercise} ${r.notes}`))return false;const d=`${r.reps} ${r.weight} ${r.notes}`;const mins=[...d.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/gi)].map(m=>Number(m[1]));return mins.some(x=>x>=15)||/\b\d+(?:\.\d+)?\s*(?:km|m)\b/i.test(d)||/\b\d+\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:m|km|min|minutes?)\b/i.test(d);}
function days(rs,re){return new Set(rs.filter(r=>meaningful(r,re)).map(r=>r.day)).size;}
function progressing(rs,re){return rs.some(r=>meaningful(r,re)&&/(interval|threshold|critical|race pace|goal pace|target pace|split|stroke rate|cadence|power target|pace target|watts?|progress)/i.test(`${r.exercise} ${r.weight} ${r.reps} ${r.notes}`));}

const cfg=await req('/api/program-pass-config');console.log('CONFIG',cfg.res.status,JSON.stringify(cfg.body));if(cfg.res.status!==200||cfg.body?.enforced!==false)throw new Error('Program Pass enforcement must be off for this live QA probe.');
const intake={
  primary_goals:['Improve Olympic-distance triathlon performance across 1.5 km swim, 40 km bike and 10 km run'],secondary_goals:['Maintain basic whole-body strength'],maintenance_goals:[],goal_priority_model:'tiered_equal_primary',experience:'intermediate',days_per_week:2,
  gym_availability_mode:'flexible',available_gym_days:[],same_day_gap_hours:6,session_length:'75 minutes',bodyweight:'72 kg',
  equipment:'Pool access, road bike with power meter, indoor bike trainer, outdoor running routes and a commercial gym.',training_location:'commercial_gym',language:'en',split_preference:'coach_decide',
  current_numbers:'1.5 km swim: 32:00; 40 km bike: 1:20:00; 10 km run: 52:00; Back squat: 90 kg x 5',performance_markers:['1.5 km swim: 32:00','40 km bike: 1:20:00','10 km run: 52:00','Back squat: 90 kg x 5'],
  injuries:'No current injury reported.',pain:{active:false,description:''},mobility:{active:false,limitation:''},sport:'Triathlon',
  sport_schedule:[
    {day:'Mon',modality:'swimming',intensity:'easy'},
    {day:'Tue',modality:'cycling',intensity:'moderate'},
    {day:'Wed',modality:'running',intensity:'moderate'},
    {day:'Thu',modality:'swimming',intensity:'moderate'},
    {day:'Fri',modality:'cycling',intensity:'easy'},
    {day:'Sun',modality:'running',intensity:'easy'},
  ],
  sleep_hours:'8',recovery_rating:'good',notes:'Currently trains 2 swims, 2 rides and 2 runs each week. Bike has direct power data. Program must keep separate modality-specific intensity anchors and avoid pretending one pace or heart-rate zone transfers exactly across swim, bike and run. Two gym strength sessions are available for maintenance.',privacy_consent:consent()
};
const build=await req('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake})});console.log('BUILD',build.res.status,JSON.stringify(build.body));if(build.res.status!==202||!build.body?.job_id||!build.body?.token)throw new Error(`build not accepted: ${build.res.status} ${JSON.stringify(build.body)}`);
const token=build.body.token;
try{
  const done=await poll(build.body.job_id);const program=String(done.program||'');console.log(`===== TRIATHLON_OLYMPIC FULL PROGRAM START =====\n${program}\n===== TRIATHLON_OLYMPIC FULL PROGRAM END =====`);
  const rs=rows(program),marker=Number((program.match(/QA_FORMULA_VIOLATION_COUNT:\s*(\d+)/)||[])[1]||0),leakage=/\[REVIEW\]|contact support|placeholder|could not be safely generated/i.test(program);
  const swim=/\b(?:Swim|Swimming|Pool)\b/i,bike=/\b(?:Bike|Cycling|Cycle|Zone-2 Bike)\b/i,run=/\b(?:Run|Running|Treadmill|Zone-2 Run)\b/i;
  const checks={swim_days:days(rs,swim),bike_days:days(rs,bike),run_days:days(rs,run),swim_progress:progressing(rs,swim),bike_progress:progressing(rs,bike),run_progress:progressing(rs,run)};
  console.log('TRIATHLON_CHECKS',JSON.stringify(checks));console.log(`TRIATHLON_OLYMPIC formula_marker=${marker} leakage=${leakage}`);
  if(marker!==0||leakage||checks.swim_days<2||checks.bike_days<2||checks.run_days<2||!checks.swim_progress||!checks.bike_progress||!checks.run_progress)process.exitCode=1;
}finally{const del=await req('/api/client-data',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>null);console.log(`TRIATHLON_OLYMPIC delete_status=${del?.res?.status||'failed'}`);}
