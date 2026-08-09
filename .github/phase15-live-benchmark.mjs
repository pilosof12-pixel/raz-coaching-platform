// Triggered after confirmed Render deploy: OpenAI Phase 15 attack QA (developer-chunk architecture live)
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
  notes:'Advanced concurrent strength and combat athlete. Recovery varies. Prefer low volume full body training. Prioritize strength return per unit fatigue. OAP should use two unilateral specific exposures, not maximal work every day. Weighted chin work must respect +80 kg 1RM. OHP outranks HSPU. Keep low volume jumps or med ball throws if low fatigue and stop before velocity loss. Two to three Zone 2 sessions desirable. Do not add hard running or hard conditioning unnecessarily.'
};

const report={timestamp:new Date().toISOString(),base,provider_expected:'openai',model_expected:'gpt-5.4',intake,checks:[],ok:false};
const check=(name,ok,detail='')=>report.checks.push({name,ok,detail});
const started=Date.now();
try {
  const h=await fetch(base+'/api/health'); const hb=await h.json();
  report.health_before=hb;
  check('health',h.ok&&hb.ok===true,JSON.stringify(hb));
  check('OpenAI provider active',hb.mode==='openai'&&hb.model==='gpt-5.4',JSON.stringify({mode:hb.mode,model:hb.model}));
  if(!h.ok||hb.ok!==true) throw new Error('health failed');
  if(hb.mode!=='openai'||hb.model!=='gpt-5.4') throw new Error(`OpenAI not active: mode=${hb.mode} model=${hb.model}. Refusing paid benchmark until deploy is ready.`);

  const b=await fetch(base+'/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intake})});
  const bj=await b.json(); check('build accepted',b.status===202&&!!bj.job_id,JSON.stringify(bj));
  if(!bj.job_id) throw new Error('build not accepted');
  report.job_id=bj.job_id; report.token=bj.token;
  let p='';
  for(let i=0;i<300;i++){
    await new Promise(r=>setTimeout(r,2000));
    const jr=await fetch(base+'/api/job/'+encodeURIComponent(bj.job_id)); const j=await jr.json();
    report.last_job={status:j.status,stage:j.stage,attempt:j.attempt,detail:j.detail,error:j.error};
    if(j.status==='done'){p=j.program||'';break;}
    if(j.status==='error') throw new Error(j.error||'engine error');
  }
  report.generation_seconds=Math.round((Date.now()-started)/1000);
  report.program=p; check('program generated',p.length>500,`chars=${p.length}; seconds=${report.generation_seconds}`);
  if(!p) throw new Error('generation timed out');

  const h2=await fetch(base+'/api/health'); const hb2=await h2.json().catch(()=>({}));
  report.health_after=hb2;
  report.ai_usage=hb2.last_ai_usage||null;

  const block=(p.match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i)||[])[1]||'';
  const lines=block.split('\n').filter(Boolean); const rows=lines.slice(1).map(x=>x.split('\t'));

  const squat=rows.filter(r=>/box squat/i.test(r[1]||'')&&!/^\[WARMUP\]/i.test(r[1]||''));
  const squatReps=squat.map(r=>Number(((r[4]||'').match(/\d+/)||[])[0])).filter(Boolean);
  check('squat max plus rep-strength coverage',squatReps.some(n=>n<=5)&&squatReps.some(n=>n>=6),JSON.stringify(squat.map(r=>[r[0],r[1],r[4],r[6]])));

  const oap=rows.filter(r=>/one.?arm (pull|chin).?up/i.test(r[1]||'')&&!/^\[WARMUP\]/i.test(r[1]||''));
  const strict=oap.filter(r=>!/(eccentric|negative|assisted|partial|isometric)/i.test(r[1]||''));
  const assisted=oap.filter(r=>/assisted/i.test(r[1]||''));
  const eccentric=oap.filter(r=>/(eccentric|negative)/i.test(r[1]||''));
  check('OAP advanced stage',new Set([...strict,...assisted].map(r=>r[0])).size>=2&&strict.length>=1&&eccentric.length===0,JSON.stringify(oap.map(r=>[r[0],r[1],r[3],r[4]])));

  const ohp=rows.filter(r=>/overhead press|push press/i.test(r[1]||'')&&!/^\[WARMUP\]/i.test(r[1]||''));
  check('OHP meaningful frequency',new Set(ohp.map(r=>r[0])).size>=2,JSON.stringify(ohp.map(r=>[r[0],r[1],r[3],r[4]])));

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
  check('conditioning interference',hardConditioning.length===0&&zone2.length>=2,JSON.stringify({hard:hardConditioning.map(r=>[r[0],r[1],r[4]]),zone2:zone2.map(r=>[r[0],r[1],r[4]])}));

  const reviewRows=rows.filter(r=>/\[REVIEW\]/i.test(r[1]||''));
  check('no unresolved exercise review markers',reviewRows.length===0,JSON.stringify(reviewRows.map(r=>[r[0],r[1]])));

  report.score={passed:report.checks.filter(x=>x.ok).length,total:report.checks.length};
  report.ok=report.checks.every(x=>x.ok);
} catch(e){report.error=String(e?.stack||e);}
fs.writeFileSync('.github/phase15-live-benchmark-result.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exitCode=1;
