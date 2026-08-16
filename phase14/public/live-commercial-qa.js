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
      throw new Error(`${res.status}: ${msg}`);
    }
    return body;
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

  byId('load-status').addEventListener('click', async () => {
    try {
      const token = requireCode();
      set(loadResult, 'Loading current program and commercial status…');
      const [program, status] = await Promise.all([
        jsonFetch(`/api/program/${encodeURIComponent(token)}`),
        jsonFetch(`/api/program-pass-status?token=${encodeURIComponent(token)}`),
      ]);
      set(loadResult,
        `PASS\nProgram loaded: ${Boolean(program)}\nExpiry: ${status.expires_at || status.expiresAt || 'not returned'}\nRemaining adjustments: ${status.adjustments_remaining ?? status.adjustmentsRemaining ?? 'not returned'}\nRaw status: ${JSON.stringify(status, null, 2)}`,
        true);
    } catch (err) {
      set(loadResult, `FAIL — ${err.message}`, false);
    }
  });

  byId('run-adjustment').addEventListener('click', async () => {
    try {
      const token = requireCode();
      const adjustment = String(byId('adjustment').value || '').trim();
      if (!adjustment) throw new Error('Enter an adjustment request.');
      set(adjustResult, 'Submitting substantive adjustment…');
      const accepted = await jsonFetch('/api/adjust', {
        method: 'POST',
        body: JSON.stringify({ token, adjustment, qa_diagnostics: true }),
      });
      const jobId = accepted.job_id || accepted.jobId || accepted.id;
      if (!jobId) throw new Error(`Adjustment was accepted but no Job ID was returned: ${JSON.stringify(accepted)}`);
      set(adjustResult, `Adjustment accepted. Job: ${jobId}\nWaiting for production generation…`);
      const job = await pollJob(jobId, adjustResult);
      set(adjustResult, `PASS\nJob: ${jobId}\nStatus: done\n${job.program ? 'Updated program returned.' : 'Updated program saved.'}`, true);
    } catch (err) {
      set(adjustResult, `FAIL — ${err.message}`, false);
    }
  });

  async function switchLanguage(language) {
    const token = requireCode();
    set(languageResult, `Switching program language to ${language}…`);
    const body = await jsonFetch('/api/language', {
      method: 'POST',
      body: JSON.stringify({ token, language }),
    });
    set(languageResult, `PASS — language switch request completed.\n${JSON.stringify(body, null, 2)}`, true);
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
      set(deleteResult, 'Deleting coaching data…');
      const body = await jsonFetch('/api/delete-data', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      set(deleteResult, `PASS — deletion endpoint completed.\n${JSON.stringify(body, null, 2)}`, true);
    } catch (err) {
      set(deleteResult, `FAIL — ${err.message}`, false);
    }
  });

  set(loadResult, 'Ready. Use a controlled staging personal code.');
})();
