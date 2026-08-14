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
