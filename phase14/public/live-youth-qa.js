(() => {
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const setStatus = (text, className = 'muted') => {
    const status = $('status');
    if (!status) return;
    status.textContent = text;
    status.className = className;
  };
  const consent = () => ({
    health_data: true,
    policy_version: '2026-08-15',
    consented_at: new Date().toISOString()
  });

  const intake = {
    age: 13,
    language: 'en',
    experience: 'intermediate',
    primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
    secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
    days_per_week: 2,
    session_length: '60 min',
    session_duration_minutes: 60,
    gym_availability_mode: 'flexible',
    available_gym_days: [],
    training_location: 'home_gym',
    equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
    current_numbers: 'Pistol squat established; ring muscle-up achieved; about 12 strict pull-ups and 6 good ring dips. Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
    clarification_answers: {
      benchmark_bar_muscle_up: 'Cannot perform a bar muscle-up yet. Can perform a ring muscle-up. About 12 strict pull-ups and 6 good ring dips.',
      benchmark_handstand: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.'
    },
    injuries: 'None reported',
    pain: { active: false },
    sport: '',
    sport_schedule: [],
    mobility: { active: false },
    sleep_hours: '8-9',
    recovery_rating: 'Good',
    notes: 'Athlete is 13 years old. Two structured sessions per week. Rings, pull-up bar, bands and bench only. No external weights. Skill quality before fatigue; no grinders or repeated failed attempts.',
    privacy_consent: consent()
  };

  async function json(path, options = {}) {
    const response = await fetch(path, options);
    const text = await response.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) {}
    return { response, data, text };
  }

  async function runLiveYouthBuild() {
    const pass = String($('pass')?.value || '').trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(pass)) {
      setStatus('Enter a valid 32-character Program Pass.', 'err');
      return;
    }

    const run = $('run');
    const result = $('result');
    run.disabled = true;
    result.hidden = true;

    try {
      setStatus('Checking Program Pass...');
      const check = await json('/api/program-pass-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pass_code: pass })
      });
      if (!check.response.ok || check.data.valid !== true) {
        throw new Error(check.data.error || 'Program Pass check failed.');
      }

      setStatus('Pass valid. Starting real production build...');
      intake.privacy_consent = consent();
      const build = await json('/api/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intake, pass_code: pass })
      });
      if (build.response.status === 422) {
        throw new Error('Unexpected clarification gate: ' + JSON.stringify(build.data));
      }
      if (build.response.status !== 202 || !build.data.job_id) {
        throw new Error(build.data.error || ('Build rejected, HTTP ' + build.response.status));
      }

      $('token').textContent = build.data.token || '';
      $('job').textContent = build.data.job_id;
      result.hidden = false;

      for (let i = 0; i < 180; i++) {
        setStatus('Live generation running... ' + (i * 2) + 's');
        await sleep(2000);
        const poll = await json('/api/job/' + encodeURIComponent(build.data.job_id));
        if (poll.data.status === 'error') {
          throw new Error(poll.data.error || 'Live generation failed.');
        }
        if (poll.data.status === 'done') {
          $('program').textContent = poll.data.program || '';
          setStatus('LIVE BUILD COMPLETE. Send ChatGPT the personal code shown above.', 'ok');
          return;
        }
      }
      throw new Error('Live generation timed out.');
    } catch (error) {
      setStatus(String(error?.message || error), 'err');
    } finally {
      run.disabled = false;
    }
  }

  const run = $('run');
  if (!run) {
    console.error('RAZ live Youth QA: run button not found');
    return;
  }
  run.addEventListener('click', runLiveYouthBuild);
  setStatus('Ready.');
})();
