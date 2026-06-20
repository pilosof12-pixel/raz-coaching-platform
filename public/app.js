// Front-end controller: questionnaire -> /api/build -> program -> adjust -> spreadsheet.
(function () {
  document.getElementById("yr").textContent = new Date().getFullYear();

  const $ = (id) => document.getElementById(id);
  const LS_TOKEN = "coaching_token";

  // In-memory token store (works in preview iframe where web storage is blocked).
  const memStore = {};
  const store = {
    get(k){ return memStore[k] || ""; },
    set(k,v){ memStore[k] = v; },
  };

  let currentToken = store.get(LS_TOKEN) || "";
  let currentProgram = "";

  function setStatus(el, msg, kind) {
    el.className = "status" + (kind ? " " + kind : "");
    el.textContent = msg || "";
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
    const eqMode = $("equipment_type").value;
    const equipment = eqMode === "full_gym"
      ? "Full commercial gym — all standard barbells, dumbbells, racks, machines, cables and bodyweight stations available."
      : $("equipment").value.trim();
    const sport_name = $("sport").value.trim();
    const schedule = sportSchedule();
    return {
      primary_goals: lines("goal_primary"),
      secondary_goals: lines("goal_secondary"),
      experience: $("experience").value,
      days_per_week: $("days").value,
      session_length: $("session_length").value,
      bodyweight: $("bodyweight").value.trim(),
      equipment: equipment,
      split_preference: $("split_pref").value,
      current_numbers: $("current_numbers").value.trim(),
      injuries: $("injuries").value.trim(),
      sport: sport_name,
      sport_schedule: schedule,
      notes: $("notes").value.trim(),
    };
  }

  function validateIntake(i) {
    if (!i.primary_goals || !i.primary_goals.length) return "Please list at least one primary goal.";
    if (!i.experience) return "Please choose your experience level.";
    if (!i.days_per_week) return "Please choose your training days per week.";
    if (!i.equipment) return "Please tell us what equipment you have.";
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
      if (onTick) onTick(secs);
      let job;
      try {
        const res = await fetch("/api/job/" + encodeURIComponent(jobId));
        job = await res.json();
        if (!res.ok) continue; // transient (e.g. cold start) — keep polling
      } catch (_) {
        continue; // network blip during cold start — keep polling
      }
      if (job.status === "done") return { token: token || job.token, program: job.program };
      if (job.status === "error") throw new Error(job.error || "Engine error.");
    }
    throw new Error("This is taking longer than expected. Your code is " + token + " — try loading it again in a minute.");
  }

  // BUILD
  $("build-btn").addEventListener("click", async () => {
    const intake = collectIntake();
    const err = validateIntake(intake);
    const btn = $("build-btn");
    if (err) { setStatus($("build-status"), err, "err"); return; }
    btn.disabled = true;
    $("build-label").innerHTML = '<span class="spinner"></span> Building your program…';
    setStatus($("build-status"), "This usually takes 30–60 seconds. Hang tight — don't close this tab.", "");
    try {
      const data = await runJob(
        "/api/build",
        { intake, token: currentToken || undefined },
        (secs) => setStatus($("build-status"), `Building your program… (${secs}s)`, "")
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
