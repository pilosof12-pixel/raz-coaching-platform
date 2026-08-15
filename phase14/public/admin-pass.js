(() => {
  const key = document.getElementById('admin-key');
  const issue = document.getElementById('issue');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const passCode = document.getElementById('pass-code');
  const copy = document.getElementById('copy');

  issue?.addEventListener('click', async () => {
    const secret = key?.value.trim() || '';
    if (result) result.hidden = true;
    if (status) {
      status.className = 'status';
      status.textContent = '';
    }
    if (!secret) {
      if (status) {
        status.className = 'status err';
        status.textContent = 'Paste ADMIN_PROVISION_KEY first.';
      }
      return;
    }
    issue.disabled = true;
    issue.textContent = 'Issuing…';
    try {
      const r = await fetch('/api/admin/program-pass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-provision-key': secret
        },
        body: JSON.stringify({ count: 1 }),
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.codes?.[0]) throw new Error(j.error || `Request failed (${r.status})`);
      if (passCode) passCode.textContent = j.codes[0];
      if (result) result.hidden = false;
      if (status) {
        status.className = 'status ok';
        status.textContent = `Issued successfully. ${j.access_days || 56} days access, ${j.adjustments || 6} adjustments.`;
      }
      if (key) key.value = '';
    } catch (e) {
      if (status) {
        status.className = 'status err';
        status.textContent = e?.message || 'Could not issue Program Pass.';
      }
    } finally {
      issue.disabled = false;
      issue.textContent = 'Issue one test Program Pass';
    }
  });

  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(passCode?.textContent.trim() || '');
      if (status) {
        status.className = 'status ok';
        status.textContent = 'Program Pass copied.';
      }
    } catch {
      if (status) {
        status.className = 'status err';
        status.textContent = 'Copy failed. Press and hold the code to copy it manually.';
      }
    }
  });
})();
