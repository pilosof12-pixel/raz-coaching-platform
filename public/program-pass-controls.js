// Customer-facing Program Pass status display.
(function () {
  const TOKEN_RE = /^[a-f0-9]{32}$/i;
  const tokenEl = document.getElementById("token-display");
  const statusEl = document.getElementById("pass-status");
  const adjustBtn = document.getElementById("adjust-btn");
  if (!tokenEl || !statusEl) return;

  let lastToken = "";

  function formatDate(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function refresh() {
    const token = String(tokenEl.textContent || "").trim();
    if (!TOKEN_RE.test(token) || token === lastToken) return;
    lastToken = token;
    try {
      const resp = await fetch(`/api/pass/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (resp.status === 404) {
        statusEl.classList.add("hidden");
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.pass) return;
      const p = data.pass;
      statusEl.classList.remove("hidden");

      if (p.active) {
        const expires = formatDate(p.expires_at);
        statusEl.innerHTML =
          `<strong>Program Pass active</strong>` +
          `<span>${p.adjustments_remaining} of ${p.adjustments_total} adjustments remaining</span>` +
          `<span>Access until ${expires}</span>`;
        if (adjustBtn) {
          adjustBtn.disabled = p.adjustments_remaining <= 0;
          adjustBtn.textContent = p.adjustments_remaining > 0
            ? `Update my program · ${p.adjustments_remaining} left`
            : "Adjustment allowance used";
        }
      } else {
        statusEl.innerHTML =
          `<strong>Program Pass ${String(p.status || "inactive")}</strong>` +
          `<span>This saved block is outside its active access window. A new training block requires a new Program Pass.</span>`;
        if (adjustBtn) adjustBtn.disabled = true;
      }
    } catch (_e) {
      // Status is informative only. Never interrupt the core program UI.
    }
  }

  const observer = new MutationObserver(refresh);
  observer.observe(tokenEl, { childList: true, characterData: true, subtree: true });
  refresh();
})();
