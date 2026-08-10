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
    help.className = "small";
    help.style.marginTop = "6px";
    help.textContent = `One Program Pass creates one 4-week block, stays active for ${config.access_days || 56} days, and includes up to ${config.adjustments || 6} program adjustments.`;

    wrap.appendChild(label);
    wrap.appendChild(passInput);
    wrap.appendChild(help);
    buildBtn.parentNode.insertBefore(wrap, buildBtn);
  }

  // Fetch public commercial configuration. When enforcement is OFF, testing and
  // existing avatars continue to work exactly as before and no pass field is shown.
  fetch("/api/program-pass-config", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((config) => installPassField(config))
    .catch(() => {});

  // Capture phase means this runs before the existing app.js click handler.
  if (buildBtn) {
    buildBtn.addEventListener("click", function (event) {
      if (consent && !consent.checked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(
          buildStatus,
          "Please confirm the privacy consent before generating your program.",
          "err"
        );
        consent.focus();
        return;
      }
      // Only the FIRST build needs the purchase code. Rebuilds after a failed
      // generation use the already-linked personal code and do not need it again.
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

  // Attach consent and, for a first build, the Program Pass code to the payload.
  // The server independently validates both.
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
      // The server independently validates consent and Program Pass access.
      // Never break an unrelated fetch.
    }
    return nativeFetch(input, init);
  };

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
        "Permanently delete this saved intake, program and related coaching data? This cannot be undone."
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
