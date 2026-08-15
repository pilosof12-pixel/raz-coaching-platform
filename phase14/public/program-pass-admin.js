(() => {
  const keyEl = document.getElementById('admin-key');
  const countEl = document.getElementById('count');
  const issueBtn = document.getElementById('issue');
  const statusEl = document.getElementById('status');
  const codesEl = document.getElementById('codes');
  const STORE = 'raz_program_pass_admin_key';

  try { keyEl.value = sessionStorage.getItem(STORE) || ''; } catch (_) {}

  function status(text, kind='') {
    statusEl.textContent = text;
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function renderCodes(codes, meta={}) {
    codesEl.innerHTML = '';
    codesEl.classList.remove('hidden');
    const note = document.createElement('div');
    note.className = 'status ok';
    note.textContent = `Issued ${codes.length} pass${codes.length === 1 ? '' : 'es'} · ${meta.access_days || 56} days · ${meta.adjustments || 6} adjustments`;
    codesEl.appendChild(note);
    codes.forEach((code, i) => {
      const c = document.createElement('code');
      c.textContent = code;
      codesEl.appendChild(c);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = codes.length === 1 ? 'Copy Program Pass' : `Copy pass ${i + 1}`;
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(code); b.textContent = 'Copied'; }
        catch { b.textContent = 'Press and hold the code to copy'; }
      });
      codesEl.appendChild(b);
    });
  }

  issueBtn.addEventListener('click', async () => {
    const key = keyEl.value.trim();
    const count = Math.max(1, Math.min(3, Number(countEl.value || 1)));
    codesEl.classList.add('hidden');
    codesEl.innerHTML = '';
    if (!key) { status('Enter the provisioning key.', 'err'); return; }
    try { sessionStorage.setItem(STORE, key); } catch (_) {}
    issueBtn.disabled = true;
    issueBtn.textContent = 'Issuing…';
    status('Contacting protected provisioning endpoint…');
    try {
      const r = await fetch('/api/admin/program-pass', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-admin-provision-key':key},
        body:JSON.stringify({count}),
        cache:'no-store'
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const codes = Array.isArray(j.codes) ? j.codes : [];
      if (!codes.length) throw new Error('Server returned no Program Pass code.');
      status('Program Pass issued.', 'ok');
      renderCodes(codes, j);
    } catch (e) {
      status(`Could not issue Program Pass: ${e?.message || String(e)}`, 'err');
    } finally {
      issueBtn.disabled = false;
      issueBtn.textContent = 'Issue test pass';
    }
  });
})();
