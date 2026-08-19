(() => {
  const intake = document.getElementById("intake-card");
  if (!intake) return;

  // Reserve the same field launch-controls uses at Build time so it does not
  // inject a second visible Program Pass input on the final intake step.
  let passField = document.getElementById("launch-pass-code");
  if (!passField) {
    passField = document.createElement("input");
    passField.type = "hidden";
    passField.id = "launch-pass-code";
    document.body.appendChild(passField);
  }

  // app.js loads before this gate and may already have restored an older
  // personal token into memory. A newly verified Program Pass must represent a
  // genuinely new initial block, not accidentally reuse that older entitlement.
  // Keep the saved intake draft for convenience, but make the fresh pass win on
  // the next build request by removing any stale token from the request body.
  const rawFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();
    const freshPass = String(passField.value || "").trim().toLowerCase();
    if (url.includes("/api/build") && method === "POST" && /^[a-f0-9]{32}$/i.test(freshPass) && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        body.pass_code = freshPass;
        delete body.token;
        init = { ...init, body: JSON.stringify(body) };
      } catch (_) {}
    }
    return rawFetch(input, init);
  };

  intake.classList.add("hidden");

  const gate = document.createElement("section");
  gate.id = "program-pass-gate";
  gate.className = "card";
  gate.innerHTML = `
    <h3>Enter your Program Pass</h3>
    <p class="hint">Use the 32-character code from your purchase to unlock the coaching intake. The code is checked now and is not consumed until a program is successfully created.</p>
    <label for="program-pass-entry">Program Pass code</label>
    <input id="program-pass-entry" type="text" maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste your Program Pass code">
    <div class="btn-row"><button id="program-pass-continue" class="btn" type="button">Continue to intake</button></div>
    <div id="program-pass-gate-status" class="status"></div>
    <p class="row-help">Already built your program? Use your personal code in the Return to your program section instead.</p>
  `;
  intake.parentElement.insertBefore(gate, intake);

  const entry = document.getElementById("program-pass-entry");
  const button = document.getElementById("program-pass-continue");
  const status = document.getElementById("program-pass-gate-status");

  function setStatus(message, kind = "") {
    status.className = "status" + (kind ? " " + kind : "");
    status.textContent = message || "";
  }

  function unlock(code) {
    passField.value = code;
    // Do not erase coaching_intake_draft_v1: a fresh pass may intentionally
    // reuse or edit the athlete's previous intake. Only remove the persisted
    // identity of the old block; the fetch guard above also handles the token
    // that app.js may already have restored into its in-memory closure.
    try { window.localStorage.removeItem("coaching_token"); } catch (_) {}
    gate.classList.add("hidden");
    intake.classList.remove("hidden");
    intake.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function checkPass() {
    const code = String(entry.value || "").trim().toLowerCase();
    passField.value = "";
    button.disabled = true;
    setStatus("Checking Program Pass…");
    try {
      const r = await fetch("/api/program-pass-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass_code: code })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.valid !== true) {
        setStatus(j.error || "That Program Pass could not be verified.", "err");
        return;
      }
      unlock(code);
    } catch (_e) {
      setStatus("Could not verify the Program Pass. Please try again.", "err");
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", checkPass);
  entry.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkPass();
    }
  });

  fetch("/api/program-pass-config")
    .then((r) => r.json())
    .then((cfg) => {
      if (!cfg?.enforced) {
        gate.remove();
        intake.classList.remove("hidden");
      }
    })
    .catch(() => {
      setStatus("Could not verify service access. Please refresh and try again.", "err");
    });
})();
