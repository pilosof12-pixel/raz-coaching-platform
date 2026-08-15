(() => {
  const passInput = document.getElementById('qa-pass');
  const runBtn = document.getElementById('qa-run');
  const results = document.getElementById('qa-results');
  const tokenWrap = document.getElementById('qa-token-wrap');
  const tokenEl = document.getElementById('qa-token');
  const copyBtn = document.getElementById('qa-copy');
  const programWrap = document.getElementById('qa-program-wrap');
  const programEl = document.getElementById('qa-program');
  const PASS_RE = /^[a-f0-9]{32}$/i;

  function row(label, ok, detail = '') {
    const d = document.createElement('div');
    d.className = 'row ' + (ok ? 'pass' : 'fail');
    d.textContent = (ok ? 'PASS — ' : 'FAIL — ') + label + (detail ? `: ${detail}` : '');
    results.appendChild(d);
  }
  function info(text) {
    const d = document.createElement('div');
    d.className = 'row';
    d.textContent = text;
    results.appendChild(d);
  }
  async function jsonFetch(url, init = {}) {
    const r = await fetch(url, init);
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }
  async function pollJob(jobId) {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const { r, j } = await jsonFetch('/api/job/' + encodeURIComponent(jobId), { cache:'no-store' });
      if (!r.ok) continue;
      if (j.status === 'done') return j;
      if (j.status === 'error') throw new Error(j.error || 'Generation job failed.');
      if (i % 5 === 0) info(`Generation still running… ${Math.round((i + 1) * 2)} s`);
    }
    throw new Error('Generation timed out after four minutes.');
  }

  function tacticalIntake() {
    return {
      primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
      secondary_goals: [
        'Improve 10 km ruck with 20 kg from 95 min toward 82 min',
        'Improve strict pull-ups from 14 toward 18-20'
      ],
      maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic and relatively weight-stable'],
      goal_priority_model: 'tiered',
      experience: 'advanced',
      days_per_week: 3,
      gym_availability_mode: 'flexible',
      available_gym_days: [],
      session_length: '60-75 min',
      equipment: 'Full gym, track and road access, hills, pull-up bar, 20 kg ruck/backpack, 30 kg sandbag and sled.',
      training_location: 'full_gym',
      language: 'en',
      split_preference: 'coach_decide',
      current_numbers: [
        '3 km: 13:30',
        '10 km ruck with 20 kg: 95 min',
        'Back Squat: 140 kg x 5',
        'Deadlift: 180 kg x 3',
        'Overhead Press: 65 kg x 5',
        'Weighted Pull-up: +30 kg x 5',
        'Strict Pull-ups: 14 reps',
        'Push-ups: 55 clean reps in 2 min'
      ].join('\n'),
      performance_markers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min'],
      injuries: 'Previous shin-splint irritation when running volume increased abruptly; currently asymptomatic at the present running and ruck volume.',
      pain: { active:false, description:'', severity:'', character:'', next_day_baseline:'normal', tolerated_movements:'Current 18-20 km/week running and one 8-10 km ruck with 20 kg are tolerated without symptoms.' },
      mobility: { active:false, limitation:'' },
      sport: '',
      sport_schedule: [],
      sleep_hours: '7-8',
      recovery_rating: 'good',
      notes: [
        'Currently runs 3 sessions per week, about 18-20 km/week: one interval session, one easy run and one longer aerobic run.',
        'Recent 400 m repeats are around 1:42-1:45 with enough recovery for repeatability.',
        'Currently does 1 ruck per week, usually 8-10 km with 20 kg.',
        'Can train across five calendar days and is comfortable combining compatible easy running or rucking with a strength day when sensible.',
        'Wants combat-ready / special-operations-style fitness without random punishment circuits, unnecessary mass gain or conditioning that makes the 3 km worse.'
      ].join(' '),
      privacy_consent: { health_data:true, policy_version:'2026-08-11', consented_at:new Date().toISOString() }
    };
  }

  function programChecks(program) {
    const text = String(program || '');
    const lines = text.split(/\r?\n/);
    const directRuck = /\b(?:Backpack Carry|Ruck(?:ing| March)?|Loaded March|Pack March)\b/i.test(text);
    const pullUp = /\b(?:Weighted\s+)?Pull[- ]?up\b/i.test(text);
    const burpee = /\bBurpee EMOM\b/i.test(text);
    const tacticalTheatre = /\b(?:operator finisher|punishment circuit|daily max(?:imal)? test)\b/i.test(text);
    const suspiciousEasy = lines.filter(l => /\b(?:easy|zone\s*[- ]?2|conversational)\b/i.test(l) && /\b(?:[0-3]:[0-5]\d|4:0\d|4:1\d|4:2\d)\s*\/\s*km\b/i.test(l));
    return { directRuck, pullUp, burpee, tacticalTheatre, suspiciousEasy };
  }

  runBtn.addEventListener('click', async () => {
    results.innerHTML = '';
    tokenWrap.classList.add('hidden');
    programWrap.classList.add('hidden');
    tokenEl.textContent = '';
    programEl.textContent = '';
    const pass = passInput.value.trim();
    if (!PASS_RE.test(pass)) {
      row('Program Pass format', false, 'Need exactly 32 hexadecimal characters.');
      return;
    }
    runBtn.disabled = true;
    runBtn.textContent = 'Running Tactical QA…';
    try {
      const intake = tacticalIntake();
      info('Submitting the fully specified Tactical 3K intake. If clarification is requested, generation will stop here so the pass is not intentionally consumed.');
      const build = await jsonFetch('/api/build', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ intake, pass_code:pass }), cache:'no-store'
      });

      if (build.r.status === 422 && build.j?.clarification_required) {
        const qs = Array.isArray(build.j.clarifications) ? build.j.clarifications : [];
        row('Fully specified intake avoids unnecessary ping-pong', false, qs.length ? qs.map(q => `${q.id}: ${q.question || ''}`).join(' | ') : 'clarification requested');
        row('Pass protected while clarification is unresolved', true, 'No second build request was sent.');
        return;
      }
      if (!build.r.ok || !build.j?.job_id || !build.j?.token) {
        row('Valid unused pass starts Tactical 3K build', false, build.j?.error || `HTTP ${build.r.status}`);
        return;
      }

      row('Valid unused pass starts Tactical 3K build', true, `HTTP ${build.r.status}`);
      const token = String(build.j.token);
      tokenEl.textContent = token;
      tokenWrap.classList.remove('hidden');
      passInput.value = '';

      const done = await pollJob(build.j.job_id);
      const program = typeof done?.program === 'string' ? done.program : '';
      const hasProgram = program.trim().length > 200;
      row('Generation job completes with a program', hasProgram, hasProgram ? `${program.length} characters` : 'program missing/too short');
      if (!hasProgram) return;

      const checks = programChecks(program);
      row('Direct ruck / loaded-march work survives generation', checks.directRuck);
      row('Direct Pull-up specificity survives generation', checks.pullUp);
      row('No Burpee EMOM fatigue filler', !checks.burpee);
      row('No military-themed punishment finisher language', !checks.tacticalTheatre);
      row('Easy/Zone-2 rows are not obviously at current 3K pace or faster', checks.suspiciousEasy.length === 0,
        checks.suspiciousEasy.length ? checks.suspiciousEasy.slice(0,3).join(' || ') : 'no suspicious low-intensity pace line detected');

      const status = await jsonFetch('/api/program-pass-status', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token}), cache:'no-store'
      });
      const statusOK = status.r.ok && status.j?.initial_build_completed === true && Number(status.j?.adjustments_remaining) === 6;
      row('Program Pass finalizes only after successful build', statusOK,
        status.r.ok ? `${status.j.adjustments_remaining}/${status.j.adjustment_limit} adjustments remaining` : `HTTP ${status.r.status}`);

      const ret = await jsonFetch('/api/program/' + encodeURIComponent(token), { cache:'no-store' });
      row('Personal return code loads the saved Tactical program', ret.r.ok && typeof ret.j?.program === 'string' && ret.j.program.trim().length > 200, `HTTP ${ret.r.status}`);

      programEl.textContent = program.slice(0, 12000);
      programWrap.classList.remove('hidden');
      info('AUTOMATED LIVE CHECKS COMPLETE. The program still needs manual coaching review for weekly structure, exact 3K progression, ruck progression, three strength sessions, total fatigue, and workbook quality before this avatar is accepted.');
    } catch (e) {
      row('Unexpected Tactical QA error', false, e?.message || String(e));
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Run Tactical 3K live QA';
    }
  });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(tokenEl.textContent.trim()); copyBtn.textContent = 'Copied'; }
    catch { copyBtn.textContent = 'Press and hold the code to copy'; }
  });
})();
