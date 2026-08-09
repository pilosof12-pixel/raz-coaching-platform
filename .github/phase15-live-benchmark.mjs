// Phase 15 attack QA for deterministic-skeleton-v3 OpenAI runtime.
import fs from 'node:fs';
const base = process.env.BASE_URL || 'https://raz-coaching-platform.onrender.com';
const intake = {
  language:'en',
  primary_goals:[
    'Box squat to parallel: progress toward 180 kg x 10, with nearer term goal exceeding 210 kg max',
    'One arm pull up: progress from 2 strict reps to 4 strict reps'
  ],
  secondary_goals:[
    'Strict overhead press: progress from current 75 kg x 4 to 5 toward 100 kg',
    'Improve aerobic conditioning and day to day energy without reducing strength or BJJ/MMA performance'
  ],
  maintenance_goals:[
    'Maintain strength transfer to grappling and MMA',
    'Maintain muscle mass with direct cable lateral raises and face pulls',
    'Maintain low fatigue explosive work',
    'Freestanding HSPU is nice to have only and must not take resources from OHP, conditioning, recovery, or mat performance'
  ],
  current_numbers:[
    'Box squat to parallel: 205 kg confirmed; approximately 210 kg current max',
    'Speed box squat: 100 to 105 kg explosive and well tolerated',
    'One arm pull up: 2 strict reps maximum',
    'Weighted chin up: +80 kg external load 1RM',
    'Strict overhead press: 75 kg x 4 to 5; historical 1RM approximately 90 kg',
    'Push press: 80 kg x 3 at RPE 9 to 9.5 while fatigued',
  ].join('\n'),
  days_per_week:4,
  session_duration_minutes:60,
  gym_availability_mode:'flexible',
  available_gym_days:[],
  sport:'BJJ / MMA',
  sport_schedule:[
    {day:'Sun',intensity:'moderate'}, {day:'Mon',intensity:'hard'}, {day:'Tue',intensity:'hard'},
    {day:'Wed',intensity:'moderate'}, {day:'Thu',intensity:'hard'}
  ],
  same_day_gap_hours:6,
  training_location:'commercial_gym',
  equipment:'barbell, plates, rack, bench, dumbbells, cable stack, machines, pull-up bar, dip bars, bike, rower, med balls, sled, bands',
  split_preference:'full_body',
  pain:'Recurrent lower back sensitivity with sciatica tendencies. Deep loaded squatting with lumbar flexion and heavy RDLs can flare it. Box squats to parallel and speed box squats are well tolerated. OAP, weighted pulling, OHP and push press generally tolerated. Hip thrusts are well tolerated. Prefer lower spinal fatigue posterior chain assistance.',
  mobility:{active:false},
  sleep_hours:'6-7',
  recovery_rating:'Average',
  notes:'Advanced concurrent strength and combat athlete. Recovery varies. Prefer low volume full body training. Four strength sessions per week. Prioritize strength return per unit fatigue. OAP should use two unilateral specific exposures, not maximal work every day. Weighted chin work must respect +80 kg 1RM. OHP outranks HSPU. Keep low volume jumps or med ball throws if low fatigue and stop before velocity loss. Two to three Zone 2 sessions desirable. Do not add hard running or hard conditioning unnecessarily.'
};

const report={timestamp:new Date().toISOString(),base,provider_expected:'openai',model_expected:'gpt-5.4',execution_path_expected:'deterministic-skeleton-v3',intake,checks:[],latency_checks:[],ok:false};
const check=(name,ok,detail='')=>report.checks.push({name,ok,detail});
const latency=(name,ok,detail='')=>report.latency_checks.push({name,ok,detail});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function safeJsonFetch(url, options={}, retries=4) {
  let last='';
  for(let i=0;i<retries;i++){
    try {
      const r=await fetch(url,options);
      const text=await r.text(); last=`status=${r.status} body=${text.slice(0,120)}`;
      if(!text.trim().startsWith('{')) { await sleep(1000); continue; }
      return {response:r,json:JSON.parse(text)};
    } catch(e){ last=String(e?.message||e); await sleep(1000); }
  }
  throw new Error(`safeJsonFetch failed: ${last}`);
}

try {
  let hb=null, hStatus=0;
  const deployWaitStarted=Date.now();
  for(let i=0;i<120;i++){
    try {
      const {response,json}=await safeJsonFetch(base+'/api/health',{},2); hStatus=response.status; hb=json;
      if(response.ok && hb?.ok===true && hb?.mode==='openai' && hb?.model==='gpt-5.4' && hb?.openai_execution_path==='deterministic-skeleton-v3') break;
    } catch(_e) {}
    await sleep(2000);
  }
  report.deploy_wait_seconds=Math.round((Date.now()-deployWaitStarted)/1000);
  report.health_before=hb;
  check('health',hStatus===200&&hb?.ok===true,JSON.stringify(hb));
  check('OpenAI provider active',hb?.mode==='openai'&&hb?.model==='gpt-5.4',JSON.stringify({mode:hb?.mode,model:hb?.model}));
  check('deterministic skeleton v3 live',hb?.openai_execution_path==='deterministic-skeleton-v3',JSON.stringify({path:hb?.openai_execution_path}));
  if(hb?.openai_execution_path!=='deterministic-skeleton-v3') throw new Error(`New runtime not live after wait. path=${hb?.openai_execution_path}`);

  const started=Date.now();
  const {response:b,json:bj}=await safeJsonFetch(base+'/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intake})});
  check('build accepted',b.status===202&&!!bj.job_id,JSON.stringify(bj));
  if(!bj.job_id) throw new Error('build not accepted');
  report.job_id=bj.job_id; report.token=bj.token;

  let p='';
  for(let i=0;i<180;i++){
    await sleep(2000);
    let j;
    try { ({json:j}=await safeJsonFetch(base+'/api/job/'+encodeURIComponent(bj.job_id),{},3)); }
    catch(_e) { continue; }
    report.last_job={status:j.status,stage:j.stage,attempt:j.attempt,detail:j.detail,error:j.error};
    if(j.status==='done'){p=j.program||'';break;}
    if(j.status==='error') throw new Error(j.error||'engine error');
  }
  report.generation_seconds=Math.round((Date.now()-started)/1000);
  check('program generated',p.length>500,`chars=${p.length}; seconds=${report.generation_seconds}`);
  latency('total build under 180s',report.generation_seconds<=180,`seconds=${report.generation_seconds}`);
  if(!p) throw new Error('generation exceeded benchmark window');

  const {json:hb2}=await safeJsonFetch(base+'/api/health',{},3);
  report.health_after=hb2;
  report.ai_usage=hb2.last_ai_usage||null;
  report.build_timing=hb2.last_build_timing||null;
  check('single paid pass telemetry',Number(report.last_job?.attempt||0)<=1,JSON.stringify(report.last_job));
  check('compact prompt actually sent',Number(report.ai_usage?.sent_user_prompt_chars||999999)<30000,JSON.stringify(report.ai_usage));
  latency('OpenAI call under 60s',Number(report.ai_usage?.elapsed_ms||999999)<=60000,JSON.stringify(report.ai_usage));

  const markerCount=(name)=>((p.match(new RegExp(name,'g')))||[]).length;
  const structureOk=[1,2,3,4].every(w=>markerCount(`START_WEEK${w}_TSV`)===1&&markerCount(`END_WEEK${w}_TSV`)===1);
  check('one block per week',structureOk,JSON.stringify([1,2,3,4].map(w=>({w,start:markerCount(`START_WEEK${w}_TSV`),end:markerCount(`END_WEEK${w}_TSV`)}))));

  const block=(p.match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i)||[])[1]||'';
  const lines=block.split('\n').filter(Boolean);
  const rows=lines.slice(1).map(x=>x.split('\t'));
  const days=[...new Set(rows.map(r=>r[0]).filter(Boolean))];
  check('four Week 1 gym days',days.length===4,JSON.stringify(days));

  const workingRows=rows.filter(r=>!/^\[WARMUP\]/i.test(r[1]||'')&&!/zone.?2/i.test(r[1]||''));
  const strengthDays=new Set(workingRows.map(r=>r[0]));
  check('all four gym days contain strength work',days.every(d=>strengthDays.has(d)),JSON.stringify({days,strengthDays:[...strengthDays]}));

  const squat=rows.filter(r=>/box squat/i.test(r[1]||'')&&!/^\[WARMUP\]/i.test(r[1]||''));
  const squatReps=squat.map(r=>Number(((r[4]||'').match(/\d+/)||[])[0])).filter(Boolean);
  check('squat max plus rep-strength coverage',squatReps.some(n=>n<=5)&&squatReps.some(n=>n>=6),JSON.stringify(squat.map(r=>[r[0],r[1],r[2],r[4],r[6]])));
  const squatLoads=squat.map(r=>({reps:Number(((r[4]||'').match(/\d+/)||[])[0]),kg:Number(((r[2]||'').match(/\d+(?:\.\d+)?/)||[])[0])}));
  const repLoadOk=squatLoads.some(x=>x.reps>=6&&x.kg>=150&&x.kg<=170);
  const heavyLoadOk=squatLoads.some(x=>x.reps<=5&&x.kg>=170&&x.kg<=195);
  check('box squat loads calibrated to current 210 kg max',repLoadOk&&heavyLoadOk,JSON.stringify(squatLoads));

  const oap=rows.filter(r=>/one.?arm (pull|chin).?up/i.test(r[1]||'')&&!/^\[WARMUP\]/i.test(r[1]||''));
  const strict=oap.filter(r=>!/(eccentric|negative|assisted|partial|isometric)/i.test(r[1]||''));
  const assisted=oap.filter(r=>/assisted/i.test(r[1]||''));
  const eccentric=oap.filter(r=>/(eccentric|negative)/i.test(r[1]||''));
  check('OAP advanced stage',new Set([...strict,...assisted].map(r=>r[0])).size>=2&&strict.length>=1&&eccentric.length===0,JSON.stringify(oap.map(r=>[r[0],r[1],r[3],r[4]])));

  const ohp=rows.filter(r=>/overhead press|push press/i.test(r[1]||'')&&!/^\[WARMUP\]/i.test(r[1]||''));
  check('OHP meaningful frequency',new Set(ohp.map(r=>r[0])).size>=2,JSON.stringify(ohp.map(r=>[r[0],r[1],r[2],r[3],r[4]])));

  const painRisk=rows.filter(r=>/(back extension|romanian deadlift|good morning)/i.test(r[1]||''));
  check('pain tolerance acknowledged',painRisk.every(r=>/(toler|pain.?free|symptom|if comfortable|stop if|proven)/i.test(r[7]||'')),JSON.stringify(painRisk.map(r=>[r[0],r[1],r[7]])));

  const byDay={}; for(const r of rows)(byDay[r[0]]??=[]).push(r);
  let powerOrder=true, orderDetail=[];
  for(const [day,rs] of Object.entries(byDay)){
    const pi=rs.findIndex(r=>/(med.?ball|medicine ball|box jump|broad jump|throw|slam|plyo)/i.test(r[1]||''));
    const hi=rs.findIndex(r=>/(box squat|back squat|front squat|deadlift|bench press|overhead press|weighted chin|weighted pull)/i.test(r[1]||'')&&!/^\[WARMUP\]/i.test(r[1]||''));
    if(pi>=0&&hi>=0&&pi>hi){powerOrder=false;orderDetail.push({day,power:rs[pi][1],heavy:rs[hi][1]});}
  }
  check('power before heavy strength',powerOrder,JSON.stringify(orderDetail));

  const hardConditioning=rows.filter(r=>/(interval|threshold|vo2|amrap|sprint)/i.test(`${r[1]||''} ${r[7]||''}`)&&!/^\[WARMUP\]/i.test(r[1]||''));
  const zone2=rows.filter(r=>/zone.?2/i.test(`${r[1]||''} ${r[7]||''}`));
  const z2Minutes=zone2.map(r=>Number(((r[4]||'').match(/\d+/)||[])[0])).filter(Boolean);
  check('conditioning interference',hardConditioning.length===0&&zone2.length>=2,JSON.stringify({hard:hardConditioning.map(r=>[r[0],r[1],r[4]]),zone2:zone2.map(r=>[r[0],r[1],r[4]])}));
  check('Zone 2 doses are meaningful',z2Minutes.filter(x=>x>=20).length>=2,JSON.stringify(z2Minutes));

  const lateral=rows.filter(r=>/cable lateral raise/i.test(r[1]||''));
  const face=rows.filter(r=>/face pull/i.test(r[1]||''));
  check('maintenance accessories retained',lateral.length>=1&&face.length>=1,JSON.stringify({lateral:lateral.map(r=>r[0]),face:face.map(r=>r[0])}));

  const reviewRows=rows.filter(r=>/\[REVIEW\]|support|placeholder/i.test(`${r[1]||''} ${r[7]||''}`));
  check('no unresolved review/support markers',reviewRows.length===0,JSON.stringify(reviewRows.map(r=>[r[0],r[1]])));

  report.score={passed:report.checks.filter(x=>x.ok).length,total:report.checks.length};
  report.quality_percent=Math.round(100*report.score.passed/report.score.total);
  report.latency_score={passed:report.latency_checks.filter(x=>x.ok).length,total:report.latency_checks.length};
  report.ok=report.checks.every(x=>x.ok);
} catch(e){
  report.error=String(e?.stack||e);
  report.score={passed:report.checks.filter(x=>x.ok).length,total:report.checks.length};
  report.quality_percent=report.score.total?Math.round(100*report.score.passed/report.score.total):0;
  report.latency_score={passed:report.latency_checks.filter(x=>x.ok).length,total:report.latency_checks.length};
}
fs.writeFileSync('.github/phase15-live-benchmark-result.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exitCode=1;
