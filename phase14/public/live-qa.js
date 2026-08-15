(() => {
  const passInput = document.getElementById('qa-pass');
  const runBtn = document.getElementById('qa-run');
  const results = document.getElementById('qa-results');
  const tokenWrap = document.getElementById('qa-token-wrap');
  const tokenEl = document.getElementById('qa-token');
  const copyBtn = document.getElementById('qa-copy');
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

  function baseIntake() {
    return {
      primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
      secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
      maintenance_goals: [],
      goal_priority_model: 'tiered_equal_primary',
      experience: 'intermediate',
      days_per_week: 2,
      gym_availability_mode: 'flexible',
      available_gym_days: [],
      session_length: '60 min',
      equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights or conventional gym equipment.',
      training_location: 'home_gym',
      language: 'en',
      split_preference: 'coach_decide',
      current_numbers: '',
      performance_markers: [],
      injuries: 'None reported',
      pain: { active:false, description:'', severity:'', character:'', next_day_baseline:'', tolerated_movements:'' },
      mobility: { active:false, limitation:'' },
      sport: '',
      sport_schedule: [],
      sleep_hours: '',
      recovery_rating: '',
      notes: 'Athlete is 13 years old. Occasional low-volume plyometrics and sprints with his father. No structured running requirement. No external weights available.',
      privacy_consent: { health_data:true, policy_version:'2026-08-11', consented_at:new Date().toISOString() }
    };
  }

  runBtn.addEventListener('click', async () => {
    results.innerHTML = '';
    tokenWrap.classList.add('hidden');
    tokenEl.textContent = '';
    const pass = passInput.value.trim();
    if (!PASS_RE.test(pass)) {
      row('Program Pass format', false, 'Need exactly 32 hexadecimal characters.');
      return;
    }
    runBtn.disabled = true;
    runBtn.textContent = 'Running QA…';
    try {
      const intake = baseIntake();
      info('Stage 1: deliberately incomplete intake. This request must stop at ping-pong before pass activation.');
      const first = await jsonFetch('/api/build', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ intake, pass_code:pass }), cache:'no-store'
      });
      const ids = Array.isArray(first.j?.clarifications) ? first.j.clarifications.map(q => q.id) : [];
      const expected = ['benchmark_bar_muscle_up','benchmark_handstand'];
      const exact = first.r.status === 422 && first.j?.clarification_required === true &&
        expected.every(x => ids.includes(x)) && ids.length === expected.length;
      row('Ping-pong blocks before generation', first.r.status === 422, `HTTP ${first.r.status}`);
      row('Only the two material youth skill questions are asked', exact, ids.length ? ids.join(', ') : 'no clarification ids');
      if (!exact) {
        row('Pass protected from bad QA run', true, 'Stopped before any second request; do not reuse this page until reviewed.');
        return;
      }

      intake.clarification_answers = {
        benchmark_bar_muscle_up: 'Cannot perform a bar muscle-up yet. Can perform a ring muscle-up. About 12 strict pull-ups and 6 good ring dips.',
        benchmark_handstand: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.'
      };
      info('Stage 2: clarification answers supplied. Starting the one real program generation.');
      const second = await jsonFetch('/api/build', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ intake, pass_code:pass }), cache:'no-store'
      });
      if (!second.r.ok || !second.j?.job_id || !second.j?.token) {
        row('Valid unused pass starts first build', false, second.j?.error || `HTTP ${second.r.status}`);
        return;
      }
      row('Valid unused pass starts first build', true, `HTTP ${second.r.status}`);
      const token = String(second.j.token);
      tokenEl.textContent = token;
      tokenWrap.classList.remove('hidden');
      passInput.value = '';

      const done = await pollJob(second.j.job_id);
      const hasProgram = typeof done?.program === 'string' && done.program.trim().length > 200;
      row('Generation job completes with a program', hasProgram, hasProgram ? `${done.program.length} characters` : 'program missing/too short');
      if (!hasProgram) return;

      const status = await jsonFetch('/api/program-pass-status', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token}), cache:'no-store'
      });
      const statusOK = status.r.ok && status.j?.initial_build_completed === true && Number(status.j?.adjustments_remaining) === 6;
      row('Program Pass status finalizes after successful build', statusOK,
        status.r.ok ? `${status.j.adjustments_remaining}/${status.j.adjustment_limit} adjustments remaining` : `HTTP ${status.r.status}`);

      const ret = await jsonFetch('/api/program/' + encodeURIComponent(token), { cache:'no-store' });
      const returnOK = ret.r.ok && typeof ret.j?.program === 'string' && ret.j.program.trim().length > 200;
      row('Personal return code loads the saved program', returnOK, `HTTP ${ret.r.status}`);

      const again = await jsonFetch('/api/build', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ intake, token }), cache:'no-store'
      });
      const blocked = again.r.status === 403 && /already created|use adjust|training block/i.test(String(again.j?.error || ''));
      row('Completed pass cannot create a second initial block', blocked, again.j?.error || `HTTP ${again.r.status}`);

      const status2 = await jsonFetch('/api/program-pass-status', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token}), cache:'no-store'
      });
      row('Blocked second build does not touch adjustment allowance', status2.r.ok && Number(status2.j?.adjustments_remaining) === 6,
        status2.r.ok ? `${status2.j.adjustments_remaining}/6 remaining` : `HTTP ${status2.r.status}`);

      info('CORE LIVE QA COMPLETE. Copy the personal code and send a screenshot of this results page. Language, adjustments, spreadsheet-after-adjustment and deletion are intentionally left for the next controlled phase.');
    } catch (e) {
      row('Unexpected QA error', false, e?.message || String(e));
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Run adversarial live QA';
    }
  });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(tokenEl.textContent.trim()); copyBtn.textContent = 'Copied'; }
    catch { copyBtn.textContent = 'Press and hold the code to copy'; }
  });
})();
