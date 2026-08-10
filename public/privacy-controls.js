// Privacy controls layered on top of the existing client controller.
// Keeps consent and deletion concerns isolated from coaching logic.
(function () {
  const TOKEN_RE = /^[a-f0-9]{32}$/i;
  const POLICY_VERSION = "2026-08-10";

  const consent = document.getElementById("health-consent");
  const buildBtn = document.getElementById("build-btn");
  const buildStatus = document.getElementById("build-status");

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.className = "status" + (kind ? " " + kind : "");
    el.textContent = msg || "";
  }

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
      }
    }, true);
  }

  // Attach a small consent record to the intake sent to the server. This gives the
  // operator evidence of what was agreed to and which policy version was shown.
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
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch (_e) {
      // The server independently validates consent. Never break an unrelated fetch.
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
