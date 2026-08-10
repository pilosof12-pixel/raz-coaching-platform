// Privacy and Program Pass controls layered on top of the existing client controller.
// Keeps consent, commercial access and deletion concerns isolated from coaching logic.
(function () {
  const TOKEN_RE = /^[a-f0-9]{32}$/i;
  const PASS_RE = /^[a-f0-9]{32}$/i;
  const POLICY_VERSION = "2026-08-10";

  const consent = document.getElementById("health-consent");
  const buildBtn = document.getElementById("build-btn");
  const buildStatus = document.getElementById("build-status");
  let passEnforced = false;
  let passInput = null;
  let passStatusBox = null;

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.className = "status" + (kind ? " " + kind : "");
    el.textContent = msg || "";
  }

  function installPassField(config) {
    if (!config || !config.enforced || !buildBtn || document.getElementById("program-pass-code")) return;
    passEnforced = true;

    const wrap = document.createElement("div");
    wrap.className = "field program-pass-field";
    wrap.style.marginBottom = "14px";

    const label = document.createElement("label");
    label.setAttribute("for", "program-pass-code");
    label.innerHTML = "Program Pass code <span style=\"opacity:.7\">(from your purchase)</span>";

    passInput = document.createElement("input");
    passInput.id = "program-pass-code";
    passInput.type = "text";
    passInput.inputMode = "text";
    passInput.autocomplete = "off";
    passInput.spellcheck = false;
    passInput.maxLength = 32;
    passInput.placeholder = "Paste your 32-character Program Pass code";

    const help = document.createElement("div");
    help.className = "row-help";
    help.style.marginTop = "6px";
    help.textContent = `One Program Pass creates one 4-week block, stays active for ${config.access_days || 56} days, and includes up to ${config.adjustments || 6} substantive program adjustments.`;

    wrap.appendChild(label);
    wrap.appendChild(passInput);
    wrap.appendChild(help);
    buildBtn.parentNode.insertBefore(wrap, buildBtn);
  }

  function ensurePassStatusBox() {
    if (passStatusBox) return passStatusBox;
    const saveNote = document.getElementById("save-note");
    if (!saveNote) return null;
    const box = document.createElement("div");
    box.id = "program-pass-status-box";
    box.className = "save-note";
    box.style.marginTop = "0";
    box.style.marginBottom = "18px";
    box.style.display = "none";
    saveNote.insertAdjacentElement("afterend", box);
    passStatusBox = box;
    return box;
  }

  async function refreshPassStatus(token) {
    if (!passEnforced || !TOKEN_RE.test(token)) return;
    const box = ensurePassStatusBox();
    if (!box) return;
    try {
      const resp = await fetch("/api/program-pass-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return;
      const expiry = data.expires_at ? new Date(Number(data.expires_at)) : null;
      const dateText = expiry && !Number.isNaN(expiry.getTime())
        ? expiry.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : "unknown";
      const remaining = Number(data.adjustments_remaining || 0);
      const limit = Number(data.adjustment_limit || 0);
      box.textContent = `Program Pass active until ${dateText}. ${remaining} of ${limit} substantive adjustments remaining. Language switching does not use an adjustment.`;
      box.style.display = "block";
    } catch (_e) {
      // Status display is informational only; never block coaching actions.
    }
  }

  fetch("/api/program-pass-config", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((config) => {
      installPassField(config);
      if (config && config.enforced) {
        const token = String(document.getElementById("token-display")?.textContent || "").trim();
        if (TOKEN_RE.test(token)) refreshPassStatus(token);
      }
    })
    .catch(() => {});

  if (buildBtn) {
    buildBtn.addEventListener("click", function (event) {
      if (consent && !consent.checked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(buildStatus, "Please confirm the privacy consent before generating your program.", "err");
        consent.focus();
        return;
      }
      const loadedToken = String(document.getElementById("token-display")?.textContent || "").trim();
      if (passEnforced && !TOKEN_RE.test(loadedToken)) {
        const code = String(passInput?.value || "").trim();
        if (!PASS_RE.test(code)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setStatus(buildStatus, "Paste the Program Pass code from your purchase before building your program.", "err");
          passInput?.focus();
        }
      }
    }, true);
  }

  const nativeFetch = window.fetch.bind(window);
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
          if (passEnforced && !payload.token) {
            const code = String(passInput?.value || "").trim();
            if (PASS_RE.test(code)) payload.pass_code = code;
          }
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch (_e) {
      // Server independently validates consent and Program Pass access.
    }
    return nativeFetch(input, init);
  };

  // The legacy controller updates token-display whenever a program is built or loaded.
  // Observing that single element keeps Program Pass status in sync without coupling
  // this launch layer to app.js internals.
  const tokenDisplay = document.getElementById("token-display");
  if (tokenDisplay) {
    const observer = new MutationObserver(() => {
      const token = String(tokenDisplay.textContent || "").trim();
      if (TOKEN_RE.test(token)) window.setTimeout(() => refreshPassStatus(token), 250);
    });
    observer.observe(tokenDisplay, { childList: true, characterData: true, subtree: true });
  }

  const adjustBtn = document.getElementById("adjust-btn");
  if (adjustBtn) {
    adjustBtn.addEventListener("click", () => {
      const token = String(document.getElementById("token-display")?.textContent || "").trim();
      if (TOKEN_RE.test(token)) window.setTimeout(() => refreshPassStatus(token), 2500);
    });
  }

  const deleteBtn = document.getElementById("delete-data-btn");
  const deleteStatus = document.getElementById("delete-data-status");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async function () {
      const token = String(document.getElementById("token-display")?.textContent || "").trim();
      if (!TOKEN_RE.test(token)) {
        setStatus(deleteStatus, "No valid personal code is loaded.", "err");
        return;
      }
      const ok = window.confirm(
        "Permanently delete your saved intake, program and coaching history? This cannot be undone. Your purchase/Program Pass entitlement record is kept separately and deletion does not create another program credit."
      );
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
        document.getElementById("return-token").value = "";
        window.setTimeout(() => window.location.reload(), 700);
      } catch (e) {
        setStatus(deleteStatus, e.message || "Could not delete the saved data.", "err");
        deleteBtn.disabled = false;
      }
    });
  }
})();
