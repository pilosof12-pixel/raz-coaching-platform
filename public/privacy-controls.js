// Privacy, Program Pass and commercial-copy controls layered on top of app.js.
(function () {
  const TOKEN_RE = /^[a-f0-9]{32}$/i;
  const POLICY_VERSION = "2026-08-10";
  const PRICE_AUD = 30;
  const ACCESS_WEEKS = 8;
  const INCLUDED_ADJUSTMENTS = 6;

  const nativeFetch = window.fetch.bind(window);
  const consent = document.getElementById("health-consent");
  const buildBtn = document.getElementById("build-btn");
  const buildStatus = document.getElementById("build-status");
  const adjustBtn = document.getElementById("adjust-btn");

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.className = "status" + (kind ? " " + kind : "");
    el.textContent = msg || "";
  }

  // -------------------------------------------------------------------------
  // Commercial copy: one paid training block, not lifetime access.
  // -------------------------------------------------------------------------
  document.title = "RAZ AI Coaching — Personalized Training Programming";
  const brandTitle = document.querySelector("header.brand h1");
  const brandSub = document.querySelector("header.brand .sub");
  const heroTitle = document.querySelector(".hero h2");
  const heroText = document.querySelector(".hero p");
  if (brandTitle) brandTitle.textContent = "RAZ AI Coaching";
  if (brandSub) brandSub.textContent = "Programming, not random workouts.";
  if (heroTitle) heroTitle.textContent = "Programming that understands the rest of your training.";
  if (heroText) {
    heroText.textContent = "Your goals, numbers, sport schedule, equipment and limitations are turned into one coherent 4-week block using real coaching logic, not a generic AI workout prompt.";
  }

  const style = document.createElement("style");
  style.textContent = `
    .pass-offer{border-color:rgba(24,211,197,.55);background:linear-gradient(135deg,rgba(24,211,197,.09),rgba(255,255,255,.015))}
    .pass-price{font-size:28px;font-weight:900;letter-spacing:-.03em;color:#fff;margin:4px 0 8px}
    .pass-price span{font-size:13px;color:var(--muted);font-weight:600;letter-spacing:0}
    .pass-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin:14px 0}
    .pass-item{font-size:13px;color:#dce9e7}
    .pass-item strong{color:var(--teal)}
    .pass-fine{font-size:12px;color:var(--muted);margin:10px 0 0}
    .pass-status{display:flex;gap:8px 18px;flex-wrap:wrap;margin:12px 0 18px;padding:11px 13px;border:1px solid var(--teal-dim);border-radius:10px;background:rgba(24,211,197,.07);font-size:12.5px;color:#dff3ef}
    .pass-status strong{color:var(--teal)}
    @media(max-width:560px){.pass-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const hero = document.querySelector(".hero");
  if (hero && !document.getElementById("program-pass-offer")) {
    const offer = document.createElement("section");
    offer.className = "card pass-offer";
    offer.id = "program-pass-offer";
    offer.innerHTML = `
      <h3>A$${PRICE_AUD} Program Pass</h3>
      <div class="pass-price">One personalized 4-week program <span>one-time purchase</span></div>
      <div class="pass-grid">
        <div class="pass-item"><strong>1</strong> new 4-week training block</div>
        <div class="pass-item"><strong>${ACCESS_WEEKS} weeks</strong> access</div>
        <div class="pass-item"><strong>${INCLUDED_ADJUSTMENTS}</strong> successful AI adjustments</div>
        <div class="pass-item"><strong>Included</strong> premium spreadsheet export</div>
      </div>
      <p style="margin:0;color:#dce9e7;font-size:13px">Use adjustments when real life changes, such as pain, schedule, equipment or performance. A genuinely new training block requires a new Program Pass.</p>
      <p class="pass-fine">No subscription. No automatic renewal. Failed technical generations do not count as another program purchase.</p>
    `;
    hero.insertAdjacentElement("afterend", offer);
  }

  const intakeHeading = document.querySelector("#intake-card h3");
  if (intakeHeading) intakeHeading.textContent = "Build your 4-week block";
  const buildLabel = document.getElementById("build-label");
  if (buildLabel) buildLabel.textContent = "Build my 4-week program";
  const programSub = document.getElementById("prog-sub");
  if (programSub) programSub.textContent = "Your personalized 4-week block. Export it, run it, and use an included adjustment when something meaningful changes.";

  // -------------------------------------------------------------------------
  // Secure checkout handoff.
  // Payment success should redirect to /#pass=<personal-code>. URL fragments are
  // not sent to the web server. Remove it from history immediately after reading.
  // -------------------------------------------------------------------------
  const hash = String(window.location.hash || "");
  const hashMatch = hash.match(/(?:^#|[&#])pass=([a-f0-9]{32})(?:&|$)/i);
  const checkoutPass = hashMatch && TOKEN_RE.test(hashMatch[1]) ? hashMatch[1] : "";
  if (checkoutPass && window.history?.replaceState) {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    const offer = document.getElementById("program-pass-offer");
    if (offer) {
      const paid = document.createElement("div");
      paid.className = "status ok";
      paid.style.marginTop = "12px";
      paid.textContent = "Program Pass ready. Complete your intake below to build your program.";
      offer.appendChild(paid);
    }
  }

  // Capture phase runs before app.js's existing build click handler.
  if (buildBtn) {
    buildBtn.addEventListener("click", function (event) {
      if (consent && !consent.checked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(buildStatus, "Please confirm the privacy consent before generating your program.", "err");
        consent.focus();
      }
    }, true);
  }

  // Attach privacy consent and, after verified checkout, the Program Pass token to
  // the build request. The server independently validates both.
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = String((init && init.method) || "GET").toUpperCase();
      if (method === "POST" && /\/api\/build(?:\?|$)/.test(url) && init && init.body) {
        const payload = JSON.parse(init.body);
        if (payload && payload.intake && typeof payload.intake === "object") {
          payload.intake.privacy_consent = {
            health_data: Boolean(consent && consent.checked),
            policy_version: POLICY_VERSION,
            consented_at: new Date().toISOString(),
          };
          if (!payload.token && checkoutPass) payload.token = checkoutPass;
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch (_e) {
      // Never break an unrelated fetch. Server-side validation remains authoritative.
    }
    return nativeFetch(input, init);
  };

  // -------------------------------------------------------------------------
  // Pass status in the saved-program card.
  // -------------------------------------------------------------------------
  const tokenEl = document.getElementById("token-display");
  const saveNote = document.getElementById("save-note");
  let passStatus = document.getElementById("pass-status");
  if (!passStatus && saveNote) {
    passStatus = document.createElement("div");
    passStatus.id = "pass-status";
    passStatus.className = "pass-status hidden";
    saveNote.insertAdjacentElement("afterend", passStatus);
  }

  let lastPassToken = "";
  function formatDate(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function refreshPassStatus() {
    const token = String(tokenEl?.textContent || "").trim();
    if (!TOKEN_RE.test(token) || token === lastPassToken || !passStatus) return;
    lastPassToken = token;
    try {
      const resp = await nativeFetch(`/api/pass/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (resp.status === 404) {
        passStatus.classList.add("hidden");
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.pass) return;
      const p = data.pass;
      passStatus.classList.remove("hidden");
      if (p.active) {
        passStatus.innerHTML = `<strong>Program Pass active</strong><span>${p.adjustments_remaining} of ${p.adjustments_total} adjustments remaining</span><span>Access until ${formatDate(p.expires_at)}</span>`;
        if (adjustBtn) {
          adjustBtn.disabled = p.adjustments_remaining <= 0;
          adjustBtn.textContent = p.adjustments_remaining > 0
            ? `Update my program · ${p.adjustments_remaining} left`
            : "Adjustment allowance used";
        }
      } else {
        passStatus.innerHTML = `<strong>Program Pass ${String(p.status || "inactive")}</strong><span>A new training block requires a new A$${PRICE_AUD} Program Pass.</span>`;
        if (adjustBtn) adjustBtn.disabled = true;
      }
    } catch (_e) {
      // Informational UI only.
    }
  }

  if (tokenEl) {
    new MutationObserver(refreshPassStatus).observe(tokenEl, { childList: true, characterData: true, subtree: true });
    refreshPassStatus();
  }

  // -------------------------------------------------------------------------
  // Customer deletion.
  // -------------------------------------------------------------------------
  const deleteBtn = document.getElementById("delete-data-btn");
  const deleteStatus = document.getElementById("delete-data-status");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async function () {
      const token = String(document.getElementById("token-display")?.textContent || "").trim();
      if (!TOKEN_RE.test(token)) {
        setStatus(deleteStatus, "No valid personal code is loaded.", "err");
        return;
      }
      const ok = window.confirm("Permanently delete this saved intake, program and related coaching data? This cannot be undone.");
      if (!ok) return;

      deleteBtn.disabled = true;
      setStatus(deleteStatus, "Deleting…", "");
      try {
        const resp = await nativeFetch("/api/client-data", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || "Could not delete the saved data.");
        setStatus(deleteStatus, "Your stored coaching data has been deleted.", "ok");
        document.getElementById("token-display").textContent = "";
        document.getElementById("program-card")?.classList.add("hidden");
        const returnToken = document.getElementById("return-token");
        if (returnToken) returnToken.value = "";
        window.setTimeout(() => window.location.reload(), 700);
      } catch (e) {
        setStatus(deleteStatus, e.message || "Could not delete the saved data.", "err");
        deleteBtn.disabled = false;
      }
    });
  }
})();
