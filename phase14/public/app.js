// Front-end controller: questionnaire -> /api/build -> program -> adjust -> spreadsheet.
(function () {
  document.getElementById("yr").textContent = new Date().getFullYear();

  const $ = (id) => document.getElementById(id);
  const LS_TOKEN = "coaching_token";
  const LS_INTAKE_DRAFT = "coaching_intake_draft_v1";

  // Prefer localStorage so a failed build, refresh, or browser restart does not
  // force the athlete to refill the questionnaire. Fall back to memory in
  // restricted preview contexts where web storage is blocked.
  const memStore = {};
  const store = {
    get(k){
      try { return window.localStorage.getItem(k) || memStore[k] || ""; }
      catch (_) { return memStore[k] || ""; }
    },
    set(k,v){
      memStore[k] = String(v ?? "");
      try { window.localStorage.setItem(k, memStore[k]); } catch (_) {}
    },
    remove(k){
      delete memStore[k];
      try { window.localStorage.removeItem(k); } catch (_) {}
    },
  };

  let currentToken = store.get(LS_TOKEN) || "";
  let currentProgram = "";
  let currentIntake = null;
  let currentLanguage = "en"; // reflects the language of the CURRENT program on screen

  function setStatus(el, msg, kind) {
    el.className = "status" + (kind ? " " + kind : "");
    el.textContent = msg || "";
  }

  // ---- Language toggle (intake form + program card) ----
  // The intake toggle mirrors its state into the hidden <select id="language">
  // so collectIntake() keeps working unchanged.
  function bindLangGroup(buttonIds, onChange) {
    const buttons = buttonIds.map((id) => $(id)).filter(Boolean);
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const lang = btn.getAttribute("data-lang");
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        if (typeof onChange === "function") onChange(lang);
      });
    });
    return {
      set(lang) {
        buttons.forEach((b) => b.classList.toggle("active", b.getAttribute("data-lang") === lang));
      },
      disable(disabled) {
        buttons.forEach((b) => { b.disabled = !!disabled; });
      },
    };
  }

  const intakeLangCtl = bindLangGroup(["lang-en", "lang-he"], (lang) => {
    const sel = $("language");
    if (sel) sel.value = lang;
  });
  // Initialise the hidden select from the default-active button.
  (function initIntakeLang(){
    const active = document.querySelector(".lang-toggle .lang-btn.active");
    const sel = $("language");
    if (active && sel) sel.value = active.getAttribute("data-lang") || "en";
  })();

  // Program-card toggle: switches the ACTIVE program's language via API.
  const programLangCtl = bindLangGroup(["prog-lang-en", "prog-lang-he"], async (lang) => {
    if (!currentToken) {
      setStatus($("prog-lang-status"), "Build a program first.", "err");
      programLangCtl.set(currentLanguage);
      return;
    }
    if (lang === currentLanguage) return;
    programLangCtl.disable(true);
    setStatus($("prog-lang-status"), lang === "he" ? "מתרגם לעברית…" : "Switching to English…", "");
    try {
      const data = await runJob(
        "/api/set-language",
        { token: currentToken, language: lang },
        (secs) => setStatus($("prog-lang-status"), (lang === "he" ? "מתרגם… " : "Translating… ") + "(" + secs + "s)", "")
      );
      if (data && data.program) {
        currentLanguage = lang;
        showProgram(data.program, data.token || currentToken);
        setStatus($("prog-lang-status"), lang === "he" ? "התוכנית עודכנה לעברית." : "Program updated to English.", "ok");
      } else {
        // Server may return {status:'nochange'} — just sync UI.
        currentLanguage = lang;
        setStatus($("prog-lang-status"), "", "");
      }
    } catch (e) {
      programLangCtl.set(currentLanguage);
      setStatus($("prog-lang-status"), e.message || "Language switch failed.", "err");
    } finally {
      programLangCtl.disable(false);
    }
  });

  // Detect the language of the currently displayed program so the toggle
  // reflects reality after build/adjust/load. Cheap heuristic: any Hebrew
  // codepoint in the client-facing prose implies he.
  function detectProgramLanguage(program) {
    if (!program) return "en";
    return /[\u0590-\u05FF]/.test(program) ? "he" : "en";
  }

  // ---- Sport-day scheduler (chips) ----
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // sportState[day] = null | "light" | "moderate" | "hard"
  const sportState = {};
  function buildSportDays() {
    const wrap = $("sport-days");
    if (!wrap) return;
    DAYS.forEach((day) => {
      sportState[day] = null;
      const row = document.createElement("div");
      row.className = "sport-day";
      const dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.className = "daybtn";
      dayBtn.textContent = day;
      const inten = document.createElement("div");
      inten.className = "intensity hidden";
      ["Light", "Moderate", "Hard"].forEach((lvl) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ibtn";
        b.textContent = lvl;
        b.addEventListener("click", () => {
          const val = lvl.toLowerCase();
          sportState[day] = val;
          inten.querySelectorAll(".ibtn").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
        });
        inten.appendChild(b);
      });
      dayBtn.addEventListener("click", () => {
        const turningOn = !dayBtn.classList.contains("on");
        dayBtn.classList.toggle("on", turningOn);
        inten.classList.toggle("hidden", !turningOn);
        if (turningOn) {
          // default to moderate when a day is first selected
          sportState[day] = "moderate";
          inten.querySelectorAll(".ibtn").forEach((x) => x.classList.remove("on"));
          inten.querySelectorAll(".ibtn")[1].classList.add("on");
        } else {
          sportState[day] = null;
          inten.querySelectorAll(".ibtn").forEach((x) => x.classList.remove("on"));
        }
      });
      row.appendChild(dayBtn);
      row.appendChild(inten);
      wrap.appendChild(row);
    });
  }
  buildSportDays();

  // ---- Strength-day availability ----
  const gymAvailability = {};
  function buildGymAvailabilityDays() {
    const wrap = $("gym-available-days");
    if (!wrap) return;
    DAYS.forEach((day) => {
      gymAvailability[day] = false;
      const row = document.createElement("div");
      row.className = "sport-day";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "daybtn";
      btn.textContent = day;
      btn.addEventListener("click", () => {
        gymAvailability[day] = !gymAvailability[day];
        btn.classList.toggle("on", gymAvailability[day]);
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    });
  }
  buildGymAvailabilityDays();

  // ---- Interactive intake wizard ----
  const wizardSteps = Array.from(document.querySelectorAll(".wizard-step"));
  let wizardStep = 0;

  function syncGoalHierarchy() {
    const primary = ["goal_primary_1", "goal_primary_2"].map((id) => ($(id) && $(id).value.trim()) || "").filter(Boolean);
    const secondary = ["goal_secondary_1", "goal_secondary_2"].map((id) => ($(id) && $(id).value.trim()) || "").filter(Boolean);
    const maintenance = (($("goal_maintenance") && $("goal_maintenance").value.trim()) || "");
    $("goal_primary").value = primary.join("\n");
    $("goal_secondary").value = secondary.join("\n");
    $("goal_maintenance_hidden").value = maintenance;
  }

  ["goal_primary_1", "goal_primary_2", "goal_secondary_1", "goal_secondary_2", "goal_maintenance"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", syncGoalHierarchy);
  });

  function revealExtraGoal(buttonId, wrapId) {
    const btn = $(buttonId);
    const wrap = $(wrapId);
    if (!btn || !wrap) return;
    btn.addEventListener("click", () => {
      wrap.classList.remove("hidden");
      btn.classList.add("hidden");
      const input = wrap.querySelector("input");
      if (input) input.focus();
    });
  }
  revealExtraGoal("add-primary-goal", "goal-primary-2-wrap");

  // Event type and weight class only matter once there is an event, so they
  // stay out of the way until a date or a priority says there is one.
  (function competitionDetails() {
    const panel = $("competition-details");
    const date = $("competition_date");
    const priority = $("event_priority");
    if (!panel || !date || !priority) return;
    const sync = () => {
      const competing = Boolean(date.value) || Boolean(priority.value);
      panel.classList.toggle("hidden", !competing);
    };
    date.addEventListener("change", sync);
    priority.addEventListener("change", sync);
    sync();
  })();
  revealExtraGoal("add-secondary-goal", "goal-secondary-2-wrap");

  function bindChoice(groupId, hiddenId, panelId) {
    const group = $(groupId);
    const hidden = $(hiddenId);
    const panel = panelId ? $(panelId) : null;
    if (!group || !hidden) return;
    group.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".choice-btn").forEach((b) => b.classList.toggle("active", b === btn));
        hidden.value = btn.dataset.value || "";
        if (panel) panel.classList.toggle("hidden", hidden.value !== "yes");
      });
    });
  }
  bindChoice("sport-choice", "has_sport", "sport-details");
  bindChoice("pain-choice", "has_pain", "pain-details");
  bindChoice("mobility-choice", "has_mobility_limit", "mobility-details");
  bindChoice("gym-availability-choice", "gym_availability_mode", "gym-availability-details");

  let performanceRowCount = 0;
  function addPerformanceRow(name = "", result = "") {
    const host = $("performance-rows");
    if (!host || performanceRowCount >= 8) return;
    performanceRowCount += 1;
    const row = document.createElement("div");
    row.className = "performance-row";
    row.innerHTML = '<input type="text" class="perf-name" placeholder="Movement / test" value="' + esc(name) + '">' +
      '<input type="text" class="perf-result" placeholder="Current result, e.g. 170 kg × 4" value="' + esc(result) + '">' +
      '<button type="button" aria-label="Remove performance marker">×</button>';
    row.querySelector("button").addEventListener("click", () => { row.remove(); });
    host.appendChild(row);
  }
  addPerformanceRow();
  if ($("add-performance")) $("add-performance").addEventListener("click", () => addPerformanceRow());

  function performanceLines() {
    const rows = Array.from(document.querySelectorAll("#performance-rows .performance-row"));
    return rows.map((row) => {
      const name = row.querySelector(".perf-name")?.value.trim() || "";
      const result = row.querySelector(".perf-result")?.value.trim() || "";
      return name && result ? `${name}: ${result}` : (name || result);
    }).filter(Boolean);
  }

  function syncLegacyFields() {
    const perf = performanceLines();
    $("current_numbers").value = perf.join("\n");
    if ($("has_pain").value !== "yes") {
      $("injuries").value = "None reported";
      return;
    }
    const bits = [];
    const desc = $("pain_description").value.trim();
    if (desc) bits.push(desc);
    if ($("pain_severity").value) bits.push(`pain ${$("pain_severity").value}`);
    if ($("pain_character").value) bits.push(`character ${$("pain_character").value}`);
    if ($("pain_next_day").value) bits.push(`next-day baseline: ${$("pain_next_day").value}`);
    const tolerated = $("tolerated_movements").value.trim();
    if (tolerated) bits.push(`currently tolerated: ${tolerated}`);
    $("injuries").value = bits.join("; ");
  }

  function stepError(index) {
    syncGoalHierarchy();
    syncLegacyFields();
    if (index === 0 && !$("goal_primary_1").value.trim()) return "Add at least one primary goal before continuing.";
    if (index === 1 && !$("experience").value) return "Choose your experience level.";
    if (index === 1 && $("has_pain").value === "yes" && !$("pain_description").value.trim()) return "Briefly describe the current pain or injury so the program can route around it.";
    if (index === 1 && $("has_mobility_limit").value === "yes" && !$("mobility_limit").value.trim()) return "Briefly describe the range or position that is limiting a real goal.";
    if (index === 2 && !$("days").value) return "Choose how many strength sessions you can train each week.";
    if (index === 2 && $("gym_availability_mode").value === "limited") {
      const available = DAYS.filter((d) => gymAvailability[d]);
      if (!available.length) return "Select the days you are actually available to lift.";
      if (available.length < Number($("days").value || 0)) return "Your available lifting days are fewer than the number of strength sessions you selected.";
    }
    if (index === 2 && $("has_sport").value === "yes" && !$("sport").value.trim()) return "Name the sport or conditioning you do outside the gym.";
    if (index === 3 && $("equipment_type").value === "specify" && !$("equipment").value.trim()) return "List the equipment you actually have available.";
    return null;
  }

  function refreshSummary() {
    const host = $("intake-summary");
    if (!host) return;
    syncGoalHierarchy();
    syncLegacyFields();
    const schedule = sportSchedule();
    const primary = lines("goal_primary").join(" + ") || "Not set";
    const secondary = lines("goal_secondary").join(" + ") || "None";
    const items = [
      ["Primary", primary],
      ["Secondary", secondary],
      ["Maintenance", $("goal_maintenance_hidden").value || "None"],
      ["Strength sessions", $("days").value ? $("days").value + " / week" : "Not set"],
      ["Lift availability", $("gym_availability_mode").value === "limited" ? (DAYS.filter((d) => gymAvailability[d]).join(", ") || "Not selected") : "Flexible"],
      ["Sport load", $("has_sport").value === "yes" ? ($("sport").value.trim() + (schedule.length ? " · " + schedule.length + " days" : "")) : "None"],
      ["Recovery", [$("sleep_hours").value, $("recovery_rating").value].filter(Boolean).join(" · ") || "Not specified"],
      ["Mobility constraint", $("has_mobility_limit").value === "yes" ? ($("mobility_limit").value.trim() || "Specified") : "None"],
    ];
    host.innerHTML = items.map(([k,v]) => '<div class="summary-item"><small>' + esc(k) + '</small><strong>' + esc(v) + '</strong></div>').join("");
  }

  function showWizardStep(index) {
    wizardStep = Math.max(0, Math.min(index, wizardSteps.length - 1));
    wizardSteps.forEach((step, i) => step.classList.toggle("active", i === wizardStep));
    const active = wizardSteps[wizardStep];
    $("step-title").textContent = active.getAttribute("data-title") || "Program intake";
    $("step-hint").textContent = active.getAttribute("data-hint") || "";
    $("step-count").textContent = (wizardStep + 1) + " / " + wizardSteps.length;
    $("progress-fill").style.width = (((wizardStep + 1) / wizardSteps.length) * 100) + "%";
    $("wizard-back").classList.toggle("hidden", wizardStep === 0);
    $("wizard-next").classList.toggle("hidden", wizardStep === wizardSteps.length - 1);
    $("build-btn").classList.toggle("hidden", wizardStep !== wizardSteps.length - 1);
    if (wizardStep === wizardSteps.length - 1) refreshSummary();
    setStatus($("build-status"), "", "");
    $("intake-card").scrollIntoView({behavior:"smooth", block:"start"});
  }

  function saveIntakeDraft() {
    try {
      const fields = {};
      document.querySelectorAll("#intake-card input[id], #intake-card textarea[id], #intake-card select[id]").forEach((el) => {
        if (el.type === "checkbox" || el.type === "radio") fields[el.id] = !!el.checked;
        else fields[el.id] = el.value;
      });
      const performance = Array.from(document.querySelectorAll("#performance-rows .performance-row")).map((row) => ({
        name: row.querySelector(".perf-name")?.value || "",
        result: row.querySelector(".perf-result")?.value || "",
      }));
      store.set(LS_INTAKE_DRAFT, JSON.stringify({ fields, sportState, gymAvailability, performance, wizardStep }));
    } catch (_) {}
  }

  function restoreIntakeDraft() {
    const raw = store.get(LS_INTAKE_DRAFT);
    if (!raw) return false;
    try {
      const draft = JSON.parse(raw);
      Object.entries(draft.fields || {}).forEach(([id, value]) => {
        const el = $(id);
        if (!el) return;
        if (el.type === "checkbox" || el.type === "radio") el.checked = !!value;
        else el.value = value ?? "";
      });

      // Rebuild performance markers exactly as the athlete entered them.
      if (Array.isArray(draft.performance) && draft.performance.length) {
        const host = $("performance-rows");
        if (host) {
          host.innerHTML = "";
          performanceRowCount = 0;
          draft.performance.forEach((row) => addPerformanceRow(row.name || "", row.result || ""));
        }
      }

      Object.entries(draft.sportState || {}).forEach(([day, intensity]) => {
        if (!(day in sportState)) return;
        sportState[day] = intensity || null;
      });
      document.querySelectorAll("#sport-days .sport-day").forEach((row, idx) => {
        const day = DAYS[idx];
        const dayBtn = row.querySelector(".daybtn");
        const inten = row.querySelector(".intensity");
        const value = sportState[day];
        dayBtn?.classList.toggle("on", !!value);
        inten?.classList.toggle("hidden", !value);
        inten?.querySelectorAll(".ibtn").forEach((btn) => btn.classList.toggle("on", btn.textContent.toLowerCase() === value));
      });

      Object.entries(draft.gymAvailability || {}).forEach(([day, available]) => {
        if (day in gymAvailability) gymAvailability[day] = !!available;
      });
      document.querySelectorAll("#gym-available-days .sport-day").forEach((row, idx) => {
        row.querySelector(".daybtn")?.classList.toggle("on", !!gymAvailability[DAYS[idx]]);
      });

      // Restore visual state of choice groups and their conditional panels.
      [["sport-choice","has_sport","sport-details"],["pain-choice","has_pain","pain-details"],["mobility-choice","has_mobility_limit","mobility-details"],["gym-availability-choice","gym_availability_mode","gym-availability-details"]].forEach(([groupId, hiddenId, panelId]) => {
        const group = $(groupId), hidden = $(hiddenId), panel = $(panelId);
        if (!group || !hidden) return;
        group.querySelectorAll(".choice-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.value === hidden.value));
        if (panel) {
          const visibleValue = hiddenId === "gym_availability_mode" ? "limited" : "yes";
          panel.classList.toggle("hidden", hidden.value !== visibleValue);
        }
      });

      if ($("equipment_type")) $("equipment_specify_wrap")?.classList.toggle("hidden", $("equipment_type").value !== "specify");
      syncGoalHierarchy();
      syncLegacyFields();
      intakeLangCtl.set(($('language') && $('language').value) || 'en');
      wizardStep = Number.isInteger(draft.wizardStep) ? draft.wizardStep : 0;
      return true;
    } catch (_) {
      return false;
    }
  }

  // Capture changes across native fields and custom chip/button controls.
  // The timeout lets the target control's own click handler update its state first.
  $("intake-card")?.addEventListener("input", saveIntakeDraft);
  $("intake-card")?.addEventListener("change", saveIntakeDraft);
  $("intake-card")?.addEventListener("click", () => setTimeout(saveIntakeDraft, 0));

  $("wizard-next").addEventListener("click", () => {
    const err = stepError(wizardStep);
    if (err) { setStatus($("build-status"), err, "err"); return; }
    showWizardStep(wizardStep + 1);
  });
  $("wizard-back").addEventListener("click", () => showWizardStep(wizardStep - 1));
  restoreIntakeDraft();
  showWizardStep(wizardStep);

  function sportSchedule() {
    // Returns e.g. [{day:"Mon", intensity:"hard"}, ...] for any selected days.
    return DAYS.filter((d) => sportState[d]).map((d) => ({ day: d, intensity: sportState[d] }));
  }

  // ---- Equipment type toggle ----
  const eqType = $("equipment_type");
  if (eqType) {
    eqType.addEventListener("change", () => {
      $("equipment_specify_wrap").classList.toggle("hidden", eqType.value !== "specify");
    });
  }

  // Split lines from a textarea into a clean array (one item per line).
  function lines(id) {
    return $(id).value.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  function collectIntake() {
    syncGoalHierarchy();
    syncLegacyFields();
    const eqMode = $("equipment_type").value;
    const equipment = eqMode === "full_gym"
      ? "Full commercial gym — all standard barbells, dumbbells, racks, machines, cables and bodyweight stations available."
      : $("equipment").value.trim();
    const hasSport = $("has_sport").value === "yes";
    const sport_name = hasSport ? $("sport").value.trim() : "";
    const sameDayGap = hasSport && $("same_day_gap") ? Number($("same_day_gap").value || 0) || null : null;
    const schedule = hasSport ? sportSchedule().map((x) => ({ ...x, gap_hours: sameDayGap })) : [];
    const availableGymDays = $("gym_availability_mode").value === "limited" ? DAYS.filter((d) => gymAvailability[d]) : [];
    return {
      primary_goals: lines("goal_primary"),
      secondary_goals: lines("goal_secondary"),
      maintenance_goals: $("goal_maintenance_hidden").value ? [$("goal_maintenance_hidden").value] : [],
      goal_priority_model: "tiered_equal_primary",
      experience: $("experience").value,
      days_per_week: $("days").value,
      competition_date: $("competition_date") ? $("competition_date").value : "",
      event_priority: $("event_priority") ? $("event_priority").value : "",
      event_type: $("event_type") ? $("event_type").value : "",
      weight_class_status: $("weight_class_status") ? $("weight_class_status").value : "",
      weigh_in_date: $("weigh_in_date") ? $("weigh_in_date").value : "",
      weight_vs_class: $("weight_vs_class") ? $("weight_vs_class").value : "",
      gym_availability_mode: $("gym_availability_mode").value,
      available_gym_days: availableGymDays,
      same_day_gap_hours: sameDayGap,
      session_length: $("session_length").value,
      bodyweight: $("bodyweight").value.trim(),
      equipment: equipment,
      training_location: ($("training_location") && $("training_location").value) || "commercial_gym",
      language: ($("language") && $("language").value) || "en",
      split_preference: $("split_pref").value,
      current_numbers: $("current_numbers").value.trim(),
      performance_markers: performanceLines(),
      injuries: $("injuries").value.trim(),
      pain: {
        active: $("has_pain").value === "yes",
        description: $("pain_description").value.trim(),
        severity: $("pain_severity").value,
        character: $("pain_character").value,
        next_day_baseline: $("pain_next_day").value,
        tolerated_movements: $("tolerated_movements").value.trim(),
      },
      mobility: {
        active: $("has_mobility_limit").value === "yes",
        limitation: $("mobility_limit").value.trim(),
      },
      sport: sport_name,
      sport_schedule: schedule,
      sleep_hours: $("sleep_hours").value,
      recovery_rating: $("recovery_rating").value,
      notes: $("notes").value.trim(),
    };
  }

  function validateIntake(i) {
    if (!i.primary_goals || !i.primary_goals.length) return "Please list at least one primary goal.";
    if (!i.experience) return "Please choose your experience level.";
    if (!i.days_per_week) return "Please choose your training days per week.";
    if (!i.equipment) return "Please tell us what equipment you have.";
    if (!i.training_location) return "Please tell us where you'll train.";
    return null;
  }

  // Day labels we recognise so the table can mark day boundaries / bold the day cell.
  const DAY_RX = /^(mon|tue|wed|thu|fri|sat|sun|day\s*\d)/i;

  // Escape HTML so model text can never inject markup.
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Lightweight, safe Markdown -> HTML for the coaching narrative.
  // Handles ## / ### headings, **bold**, *italic*, bullet + numbered lists,
  // and paragraphs. Everything is escaped first, so it is XSS-safe.
  function mdToHtml(md) {
    const lines = String(md).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let listType = null; // 'ul' | 'ol' | null
    let para = [];
    function inline(t) {
      return esc(t)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
    }
    function flushPara() {
      if (para.length) {
        out.push("<p>" + inline(para.join(" ")) + "</p>");
        para = [];
      }
    }
    function closeList() {
      if (listType) {
        out.push("</" + listType + ">");
        listType = null;
      }
    }
    for (let raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) {
        flushPara();
        closeList();
        continue;
      }
      let m;
      if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/))) {
        flushPara();
        closeList();
        const lvl = Math.min(m[1].length + 2, 6); // ## -> h4, ### -> h5
        out.push("<h" + lvl + ' class="prog-h">' + inline(m[2].trim()) + "</h" + lvl + ">");
      } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
        flushPara();
        if (listType !== "ul") {
          closeList();
          out.push("<ul>");
          listType = "ul";
        }
        out.push("<li>" + inline(m[1].trim()) + "</li>");
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (listType !== "ol") {
          closeList();
          out.push("<ol>");
          listType = "ol";
        }
        out.push("<li>" + inline(m[1].trim()) + "</li>");
      } else {
        closeList();
        para.push(line.trim());
      }
    }
    flushPara();
    closeList();
    return out.join("\n");
  }

  // Client-side safety net: remove any Markdown pipe table (and a preceding
  // "### Week 1 ..." heading) from text we are about to render as the narrative.
  // The server already strips this, but cached/older programs and adjustment
  // responses may still contain one. Mirrors server.js stripBodyProgramTable.
  function stripPipeTables(s) {
    if (!s || s.indexOf("|") === -1) return s;
    const lines = s.split("\n");
    const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
    const isSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
    const isHeading = (l) =>
      /^\s*#{1,6}\s*.*(week\s*1|training schedule|base microcycle|weekly schedule|microcycle).*$/i.test(l);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
        let k = i + 2;
        while (k < lines.length && isRow(lines[k])) k++;
        while (out.length && out[out.length - 1].trim() === "") out.pop();
        if (out.length && isHeading(out[out.length - 1])) out.pop();
        while (out.length && (out[out.length - 1].trim() === "" || /^\s*-{3,}\s*$/.test(out[out.length - 1]))) out.pop();
        while (k < lines.length && (lines[k].trim() === "" || /^\s*-{3,}\s*$/.test(lines[k]))) k++;
        i = k - 1;
        continue;
      }
      out.push(lines[i]);
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function renderProgram(program) {
    const host = $("program-render");
    if (!host) return false;
    const getTable = window.getProgramTable;
    const splitNarr = window.splitProgramNarrative;
    const rows = getTable ? getTable(program) : null;
    if (!rows || rows.length < 2) {
      // No parseable Week 1 table (e.g. an adjustment / follow-up response).
      // Still render the text as clean Markdown (headings, bold, lists) instead
      // of dumping raw "###"/"**"/"| ... |" into a <pre>. We strip any leftover
      // markdown pipe table here too, since the body should never show one.
      const cleaned = stripPipeTables(String(program));
      host.innerHTML = '<div class="prog-narrative">' + mdToHtml(cleaned) + "</div>";
      return true; // we rendered it cleanly; do not fall back to raw <pre>
    }
    const parts = splitNarr ? splitNarr(program) : { before: "", after: "" };
    const frag = document.createDocumentFragment();

    if (parts.before) {
      const p = document.createElement("div");
      p.className = "prog-narrative";
      p.innerHTML = mdToHtml(parts.before);
      frag.appendChild(p);
    }

    const h = document.createElement("h4");
    h.className = "prog-week";
    h.textContent = "Week 1";
    frag.appendChild(h);

    const wrap = document.createElement("div");
    wrap.className = "prog-table-wrap";
    const table = document.createElement("table");
    table.className = "prog-table";
    const headers = rows[0];
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    headers.forEach((hd) => {
      const th = document.createElement("th");
      th.textContent = hd;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let lastDay = null;
    const lc = headers.map((x) => String(x).toLowerCase());
    const dayIdx = lc.findIndex((x) => x === "day");
    const exIdx = lc.findIndex((x) => x === "exercise");
    const rpeIdx = lc.findIndex((x) => x.includes("rpe"));
    const notesIdx = lc.findIndex((x) => x.includes("note"));
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const tr = document.createElement("tr");
      const dayVal = dayIdx >= 0 ? (cells[dayIdx] || "").trim() : "";
      if (dayVal && dayVal !== lastDay && DAY_RX.test(dayVal)) {
        tr.className = "day-start";
        lastDay = dayVal;
      }
      cells.forEach((c, i) => {
        const td = document.createElement("td");
        td.textContent = c;
        if (i === dayIdx) td.className = "col-day";
        else if (i === exIdx) td.className = "col-ex";
        else if (i === rpeIdx) td.className = "col-rpe";
        else if (i === notesIdx) td.className = "col-notes";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    frag.appendChild(wrap);

    if (parts.after) {
      const p = document.createElement("div");
      p.className = "prog-narrative after";
      p.innerHTML = mdToHtml(parts.after);
      frag.appendChild(p);
    }

    host.innerHTML = "";
    host.appendChild(frag);
    return true;
  }

  function showProgram(program, token) {
    currentProgram = program;
    currentToken = token;
    if (token) store.set(LS_TOKEN, token);
    // Always keep the raw text in the (hidden) <pre> for Copy/parse safety.
    $("program-text").textContent = program;
    $("token-display").textContent = token;
    $("program-card").classList.remove("hidden");
    // Render the clean narrative + styled table. If parsing fails, fall back
    // to showing the raw <pre> block (now in a clean sans-serif).
    const rendered = renderProgram(program);
    $("program-text").classList.toggle("hidden", rendered);
    $("program-render").classList.toggle("hidden", !rendered);
    // Sync program-card language toggle to what we're actually showing.
    currentLanguage = detectProgramLanguage(program);
    programLangCtl.set(currentLanguage);
    const renderHost = $("program-render");
    if (renderHost) renderHost.setAttribute("dir", currentLanguage === "he" ? "rtl" : "ltr");
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

  // Start an async job (build/adjust) then poll /api/job/:id until done.
  // Returns { token, program }. onTick(seconds) lets us update the status text.
  async function runJob(url, body, onTick) {
    const start = await postJSON(url, body); // { job_id, token, status }
    const jobId = start.job_id;
    const token = start.token;
    const began = Date.now();
    // poll every 2s, up to ~4 minutes (cold starts + generation)
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const secs = Math.round((Date.now() - began) / 1000);
      let job;
      try {
        const res = await fetch("/api/job/" + encodeURIComponent(jobId));
        job = await res.json();
        if (!res.ok) continue; // transient (e.g. cold start) — keep polling
      } catch (_) {
        continue; // network blip during cold start — keep polling
      }
      if (onTick) onTick(secs, job);
      if (job.status === "done") return { token: token || job.token, program: job.program };
      if (job.status === "error") throw new Error(job.error || "Engine error.");
    }
    throw new Error("This is taking longer than expected. Your code is " + token + " — try loading it again in a minute.");
  }

  // BUILD
  $("build-btn").addEventListener("click", async () => {
    saveIntakeDraft();
    const intake = collectIntake();
    currentIntake = intake;
    const err = validateIntake(intake);
    const btn = $("build-btn");
    if (err) { setStatus($("build-status"), err, "err"); return; }
    btn.disabled = true;
    $("build-label").innerHTML = '<span class="spinner"></span> Building your program…';
    setStatus($("build-status"), "Reading your goals and mapping your training week…", "");
    try {
      const data = await runJob(
        "/api/build",
        { intake, token: currentToken || undefined },
        (secs, job) => {
          const labels = {
            queued: "Queued",
            preparing: "Reading your goals and constraints",
            generating: "Building the training block",
            validating: "Running coaching quality checks",
            refining: "Refining a failed quality check",
            finalizing: "Finalizing your program",
          };
          const stage = labels[job?.stage] || "Building your program";
          const attempt = job?.attempt > 1 ? ` · pass ${job.attempt}` : "";
          setStatus($("build-status"), stage + attempt + ` · ${secs}s`, "");
        }
      );
      showProgram(data.program, data.token);
      setStatus($("build-status"), "Done. Your program is below — copy and save your personal code first.", "ok");
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
      const data = await runJob(
        "/api/adjust",
        { token: currentToken, request },
        (secs) => setStatus($("adjust-status"), `Adjusting only what changed… (${secs}s)`, "")
      );
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
      // Rebuildable = intake saved but the last build failed (empty program).
      // Offer a one-click retry with the same token instead of a dead code.
      if (data.rebuildable && data.intake) {
        currentToken = data.token;
        store.set(LS_TOKEN, data.token);
        setStatus($("return-status"), "We saved your intake but the last build didn't finish. Retrying now…", "");
        try {
          const built = await runJob(
            "/api/build",
            { intake: data.intake, token: data.token },
            (secs) => setStatus($("return-status"), `Building again… (${secs}s)`, "")
          );
          showProgram(built.program, built.token);
          setStatus($("return-status"), "Your program is ready.", "ok");
        } catch (rebuildErr) {
          setStatus($("return-status"), (rebuildErr && rebuildErr.message) || "Rebuild failed. Please try again in a minute.", "err");
        }
        return;
      }
      currentIntake = data.intake || currentIntake;
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
      const n = await window.buildStrengthSpreadsheet(currentProgram, currentIntake);
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
    try {
      await navigator.clipboard.writeText(currentToken);
      setStatus($("token-status"), "Code copied. Paste it somewhere safe so you can come back and adjust your program.", "ok");
    } catch (_) {
      setStatus($("token-status"), "Copy didn't work — select the code above and copy it manually, then save it somewhere safe.", "err");
    }
  });

  // Auto-load if we already have a token saved locally
  if (currentToken) {
    fetch("/api/program/" + encodeURIComponent(currentToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.program) { $("return-token").value = currentToken; } })
      .catch(() => {});
  }
})();
