(() => {
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const set = (t,c='muted') => { $('status').textContent=t; $('status').className=c; };
  const consent = () => ({health_data:true,policy_version:'2026-08-15',consented_at:new Date().toISOString()});
  const intake = {
    age:27,
    language:'en',
    experience:'advanced',
    primary_goals:['Improve 3 km from 13:30 to sub-12:00'],
    secondary_goals:['Improve 10 km ruck with 20 kg from 95 min toward 82 min','Improve strict pull-ups from 14 toward 18-20'],
    maintenance_goals:['Maintain useful squat and deadlift strength while staying athletic and relatively weight-stable'],
    goal_priority_model:'tiered',
    days_per_week:3,
    session_duration_minutes:60,
    gym_availability_mode:'flexible',
    available_gym_days:[],
    training_location:'commercial_gym',
    equipment:'Full gym, track/road access, hills, pull-up bar, 20 kg ruck/backpack, 30 kg sandbag and sled.',
    current_numbers:['3 km: 13:30','10 km ruck with 20 kg: 95 min','Back Squat: 140 kg x 5','Deadlift: 180 kg x 3','Overhead Press: 65 kg x 5','Weighted Pull-up: +30 kg x 5','Strict Pull-ups: 14 reps','Push-ups: 55 clean reps in 2 min'].join('\n'),
    performance_markers:['3 km: 13:30','10 km ruck with 20 kg: 95 min'],
    injuries:'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
    pain:{active:false,description:'',severity:'',character:'',next_day_baseline:'normal',tolerated_movements:'Current 18-20 km/week running and one 8-10 km ruck with 20 kg are tolerated without symptoms.'},
    sport:'',sport_schedule:[],
    mobility:{active:false,limitation:''},
    sleep_hours:'7-8',recovery_rating:'Good',
    notes:['Currently runs 3 sessions per week, about 18-20 km/week: one interval session, one easy run and one longer aerobic run.','Currently does 1 ruck per week, usually 8-10 km with 20 kg.','Recent 400 m repeats are around 1:42-1:45 with adequate recovery for repeatability.','Previous shin-splint irritation happened when running volume increased abruptly; currently asymptomatic at present running and ruck volume.','Can train across five calendar days and is comfortable combining compatible easy running or rucking with a strength day when sensible.','Wants combat-ready / special-operations-style fitness without random punishment circuits or unnecessary mass gain.'].join(' '),
    qa_diagnostics:true,
    privacy_consent:consent()
  };

  async function json(path, options={}) {
    const r = await fetch(path, options);
    const text = await r.text();
    let j={}; try{j=JSON.parse(text)}catch{}
    return {r,j,text};
  }

  set('Ready. QA diagnostics enabled for this acceptance retry.');
  $('run').addEventListener('click', async () => {
    const pass = String($('pass').value||'').trim().toLowerCase();
    if(!/^[a-f0-9]{32}$/.test(pass)){set('Enter a valid 32-character Program Pass.','err');return;}
    $('run').disabled=true; $('result').hidden=true;
    try{
      set('Checking Program Pass...');
      const check = await json('/api/program-pass-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pass_code:pass})});
      if(!check.r.ok || check.j.valid!==true) throw new Error(check.j.error||'Program Pass check failed.');
      set('Pass valid. Starting real production build with QA diagnostics...');
      intake.privacy_consent = consent();
      const build = await json('/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intake,pass_code:pass})});
      if(build.r.status===422) throw new Error('Unexpected clarification gate: '+JSON.stringify(build.j));
      if(build.r.status!==202 || !build.j.job_id) throw new Error(build.j.error||('Build rejected, HTTP '+build.r.status));
      $('token').textContent=build.j.token||''; $('job').textContent=build.j.job_id; $('result').hidden=false;
      for(let i=0;i<180;i++){
        set('Live generation running... '+(i*2)+'s');
        await sleep(2000);
        const poll = await json('/api/job/'+encodeURIComponent(build.j.job_id));
        if(poll.j.status==='error') throw new Error(poll.j.error||'Live generation failed.');
        if(poll.j.status==='done'){
          $('program').textContent=poll.j.program||'';
          set('LIVE BUILD COMPLETE. Send ChatGPT the personal code and Job ID shown above.','ok');
          return;
        }
      }
      throw new Error('Live generation timed out.');
    }catch(e){set(String(e&&e.message||e),'err')}
    finally{$('run').disabled=false}
  });
})();
