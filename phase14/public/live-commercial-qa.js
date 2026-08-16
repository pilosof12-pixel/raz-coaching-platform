(() => {
  const byId = (id) => document.getElementById(id);
  const personal = byId('personal');
  const loadResult = byId('load-result');
  const adjustResult = byId('adjust-result');
  const languageResult = byId('language-result');
  const deleteResult = byId('delete-result');

  const set = (el, text, ok = null) => {
    el.textContent = text;
    el.className = `status ${ok === true ? 'ok' : ok === false ? 'bad' : 'muted'}`;
  };

  const code = () => String(personal.value || '').trim();
  const requireCode = () => {
    const value = code();
    if (!/^[a-f0-9]{32}$/i.test(value)) throw new Error('Enter a valid 32-character personal code.');
    return value;
  };

  async function jsonFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) {
      const msg = body?.error || body?.message || body?.raw || `HTTP ${res.status}`;
      const error = new Error(`${res.status}: ${msg}`);
      error.status = res.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  async function passStatus(token) {
    return jsonFetch('/api/program-pass-status', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async function pollJob(jobId, target) {
    for (let i = 0; i < 120; i += 1) {
      const job = await jsonFetch(`/api/job/${encodeURIComponent(jobId)}`);
      if (job.status === 'done') return job;
      if (job.status === 'error') throw new Error(job.error || 'Generation failed.');
      set(target, `Job ${jobId}\nGeneration still running… ${Math.round(i * 2.5)} s`);
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error('Timed out waiting for the generation job.');
  }

  async function runJob(url, body, target) {
    const accepted = await jsonFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const jobId = accepted.job_id;
    if (!jobId) throw new Error(`Request was accepted but no Job ID was returned: ${JSON.stringify(accepted)}`);
    set(target, `Accepted. Job: ${jobId}\nWaiting for production generation…`);
    const job = await pollJob(jobId, target);
    return { accepted, jobId, job };
  }

  byId('load-status').addEventListener('click', async () => {
    try {
      const token = requireCode();
      set(loadResult, 'Loading current program and commercial status…');
      const [program, status] = await Promise.all([
        jsonFetch(`/api/program/${encodeURIComponent(token)}`),
        passStatus(token),
      ]);
      const hasProgram = Boolean(program?.program);
      set(loadResult,
        `PASS\nProgram loaded: ${hasProgram}\nExpiry: ${status.expires_at ? new Date(Number(status.expires_at)).toISOString() : 'not returned'}\nInitial build completed: ${status.initial_build_completed}\nAdjustments: ${status.adjustments_used}/${status.adjustment_limit} used · ${status.adjustments_remaining} remaining`,
        true);
    } catch (err) {
      set(loadResult, `FAIL — ${err.message}`, false);
    }
  });

  byId('run-adjustment').addEventListener('click', async () => {
    try {
      const token = requireCode();
      const request = String(byId('adjustment').value || '').trim();
      if (!request) throw new Error('Enter an adjustment request.');
      set(adjustResult, 'Reading allowance before adjustment…');
      const before = await passStatus(token);
      const { jobId, job } = await runJob('/api/adjust', { token, request }, adjustResult);
      const after = await passStatus(token);
      const delta = Number(after.adjustments_used) - Number(before.adjustments_used);
      const correct = delta === 1;
      set(adjustResult,
        `${correct ? 'PASS' : 'CHECK'}\nJob: ${jobId}\nStatus: ${job.status}\nAllowance before: ${before.adjustments_used}/${before.adjustment_limit}\nAllowance after: ${after.adjustments_used}/${after.adjustment_limit}\nSuccessful-adjustment delta: ${delta}\n${job.program ? 'Updated program returned and saved.' : 'Updated program saved.'}`,
        correct);
    } catch (err) {
      set(adjustResult, `FAIL — ${err.message}`, false);
    }
  });

  async function switchLanguage(language) {
    const token = requireCode();
    set(languageResult, `Reading allowance before language switch to ${language}…`);
    const before = await passStatus(token);
    const { jobId, job } = await runJob('/api/set-language', { token, language }, languageResult);
    const after = await passStatus(token);
    const delta = Number(after.adjustments_used) - Number(before.adjustments_used);
    const correct = delta === 0;
    set(languageResult,
      `${correct ? 'PASS' : 'FAIL'}\nJob: ${jobId}\nStatus: ${job.status}\nLanguage: ${language}\nAdjustment usage before: ${before.adjustments_used}\nAdjustment usage after: ${after.adjustments_used}\nLanguage-switch adjustment delta: ${delta}`,
      correct);
  }

  byId('switch-he').addEventListener('click', async () => {
    try { await switchLanguage('he'); } catch (err) { set(languageResult, `FAIL — ${err.message}`, false); }
  });
  byId('switch-en').addEventListener('click', async () => {
    try { await switchLanguage('en'); } catch (err) { set(languageResult, `FAIL — ${err.message}`, false); }
  });

  byId('delete-data').addEventListener('click', async () => {
    try {
      const token = requireCode();
      if (!window.confirm('Delete this QA client\'s coaching data now? This is intentionally destructive.')) return;
      set(deleteResult, 'Reading commercial entitlement before deletion…');
      const before = await passStatus(token);
      await jsonFetch('/api/client-data', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      });

      let programDeleted = false;
      try {
        await jsonFetch(`/api/program/${encodeURIComponent(token)}`);
      } catch (err) {
        programDeleted = err.status === 404;
      }

      let entitlementPreserved = false;
      let after = null;
      try {
        after = await passStatus(token);
        entitlementPreserved = Boolean(after);
      } catch {}

      const noCreditReset = entitlementPreserved &&
        Boolean(after.initial_build_completed) === Boolean(before.initial_build_completed) &&
        Number(after.adjustments_used) === Number(before.adjustments_used);
      const correct = programDeleted && entitlementPreserved && noCreditReset;
      set(deleteResult,
        `${correct ? 'PASS' : 'CHECK'}\nCoaching program deleted: ${programDeleted}\nCommercial entitlement preserved: ${entitlementPreserved}\nInitial-build completion preserved: ${after?.initial_build_completed}\nAdjustment usage before/after: ${before.adjustments_used}/${after?.adjustments_used}\nNo block/adjustment credit reset: ${noCreditReset}`,
        correct);
    } catch (err) {
      set(deleteResult, `FAIL — ${err.message}`, false);
    }
  });

  set(loadResult, 'Ready. Use a controlled staging personal code.');
})();
