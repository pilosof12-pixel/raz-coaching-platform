// Front-end controller: questionnaire -> /api/build -> program -> adjust -> spreadsheet.
(function () {
  document.getElementById("yr").textContent = new Date().getFullYear();

  const $ = (id) => document.getElementById(id);
  const LS_TOKEN = "coaching_token";

  let currentToken = localStorage.getItem(LS_TOKEN) || "";
  let currentProgram = "";

  function setStatus(el, msg, kind) {
    el.className = "status" + (kind ? " " + kind : "");
    el.textContent = msg || "";
  }

  function collectIntake() {
    return {
      primary_goal: $("goal_primary").value.trim(),
      secondary_goal: $("goal_secondary").value.trim(),
      experience: $("experience").value,
      days_per_week: $("days").value,
      session_length: $("session_length").value,
      bodyweight: $("bodyweight").value.trim(),
      equipment: $("equipment").value.trim(),
      current_numbers: $("current_numbers").value.trim(),
      injuries: $("injuries").value.trim(),
      sport_load: $("sport").value.trim(),
      notes: $("notes").value.trim(),
    };
  }

  function validateIntake(i) {
    if (!i.primary_goal) return "Please name your primary goal.";
    if (!i.experience) return "Please choose your experience level.";
    if (!i.days_per_week) return "Please choose your training days per week.";
    if (!i.equipment) return "Please tell us what equipment you have.";
    return null;
  }

  function showProgram(program, token) {
    currentProgram = program;
    currentToken = token;
    if (token) localStorage.setItem(LS_TOKEN, token);
    $("program-text").textContent = program;
    $("token-display").textContent = token;
    $("program-card").classList.remove("hidden");
    // Toggle spreadsheet button if no TSV/table detected
    const hasData = window.hasSpreadsheetData && window.hasSpreadsheetData(program);
    $("sheet-btn").style.display = hasData ? "" : "none";
    $("program-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  // BUILD
  $("build-btn").addEventListener("click", async () => {
    const intake = collectIntake();
    const err = validateIntake(intake);
    const btn = $("build-btn");
    if (err) { setStatus($("build-status"), err, "err"); return; }
    btn.disabled = true;
    $("build-label").innerHTML = '<span class="spinner"></span> Building your program…';
    setStatus($("build-status"), "This takes about 15–30 seconds. Hang tight.", "");
    try {
      const data = await postJSON("/api/build", { intake, token: currentToken || undefined });
      showProgram(data.program, data.token);
      setStatus($("build-status"), "Done. Your program is below.", "ok");
    } catch (e) {
      setStatus($("build-status"), e.message, "err");
    } finally {
      btn.disabled = false;
      $("build-label").textContent = "Build my program";
    }
  });

  // ADJUST
  $("adjust-btn").addEventListener("click", async () => {
    const request = $("adjust-input").value.trim();
    const btn = $("adjust-btn");
    if (!request) { setStatus($("adjust-status"), "Tell the engine what changed.", "err"); return; }
    if (!currentToken) { setStatus($("adjust-status"), "Build a program first.", "err"); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Updating…';
    setStatus($("adjust-status"), "Adjusting only what changed…", "");
    try {
      const data = await postJSON("/api/adjust", { token: currentToken, request });
      showProgram(data.program, data.token);
      $("adjust-input").value = "";
      setStatus($("adjust-status"), "Updated. See the changes at the top of your program.", "ok");
    } catch (e) {
      setStatus($("adjust-status"), e.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Update my program";
    }
  });

  // LOAD RETURNING
  $("load-btn").addEventListener("click", async () => {
    const token = $("return-token").value.trim();
    if (!token) { setStatus($("return-status"), "Paste your personal code.", "err"); return; }
    setStatus($("return-status"), "Loading…", "");
    try {
      const res = await fetch("/api/program/" + encodeURIComponent(token));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't find that code.");
      showProgram(data.program, data.token);
      setStatus($("return-status"), "Loaded your saved program.", "ok");
    } catch (e) {
      setStatus($("return-status"), e.message, "err");
    }
  });

  // CREATE SPREADSHEET
  $("sheet-btn").addEventListener("click", async () => {
    setStatus($("sheet-status"), "", "");
    try {
      const n = await window.buildStrengthSpreadsheet(currentProgram);
      setStatus($("sheet-status"), `Spreadsheet created with ${n} exercise rows. Check your downloads.`, "ok");
    } catch (e) {
      setStatus($("sheet-status"), e.message, "err");
    }
  });

  // COPY PROGRAM
  $("copy-btn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(currentProgram); setStatus($("sheet-status"), "Program copied.", "ok"); }
    catch (_) { setStatus($("sheet-status"), "Copy failed — select the text manually.", "err"); }
  });

  // COPY TOKEN
  $("copy-token").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(currentToken); } catch (_) {}
  });

  // Auto-load if we already have a token saved locally
  if (currentToken) {
    fetch("/api/program/" + encodeURIComponent(currentToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.program) { $("return-token").value = currentToken; } })
      .catch(() => {});
  }
})();
