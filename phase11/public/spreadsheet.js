// Reusable spreadsheet builder.
// Emits one "Strength Block - Week N" tab per week the engine provides, plus a README
// that includes the full program narrative.
// Exposes window.buildStrengthSpreadsheet. Depends on ExcelJS.

(function () {
  const REQUIRED = ["Day", "Exercise", "Weight", "Sets", "Reps", "Rest", "Target RPE", "Notes", "Results"];
  const SYNONYMS = {
    "day": "Day",
    "exercise": "Exercise",
    "movement": "Exercise",
    "weight": "Weight",
    "load": "Weight",
    "load/rir": "Target RPE",
    "sets": "Sets",
    "reps": "Reps",
    "reps/duration": "Reps",
    "duration": "Reps",
    "rest": "Rest",
    "target rpe": "Target RPE",
    "rpe": "Target RPE",
    "load/rir/rpe": "Target RPE",
    "notes": "Notes",
    "modification": "Notes",
    "modifications": "Notes",
    "purpose": "Notes",
    "results": "Results"
  };

  const DAY_HE = { Mon: "יום ב׳", Tue: "יום ג׳", Wed: "יום ד׳", Thu: "יום ה׳", Fri: "יום ו׳", Sat: "שבת", Sun: "יום א׳" };
  const HEADER_HE = {
    Exercise: "תרגיל", Weight: "עומס", Sets: "סטים", Reps: "חזרות / זמן",
    Rest: "מנוחה", "Target RPE": "יעד RPE / RIR", Notes: "הערות", Results: "תוצאות"
  };

  function isHebrewProgram(text) {
    return /[\u0590-\u05FF]/.test(String(text || ""));
  }

  // Excel and spreadsheet viewers love auto-coercing strings such as "4-6"
  // into dates. All machine-output cells are coaching text, not dates, so we
  // write them explicitly as strings and force Text format on ambiguous cells.
  function setTextCell(cell, value) {
    const text = value === null || value === undefined ? "" : String(value);
    cell.value = text;
    cell.numFmt = "@";
    return text;
  }


  function cleanCell(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  }
  function normalizeHeader(value) {
    const key = cleanCell(value).toLowerCase();
    return SYNONYMS[key] || cleanCell(value);
  }
  function parseMarkdownTable(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const tableLines = lines.filter((line) => line.includes("|"));
    if (tableLines.length < 2) return null;
    const rows = tableLines
      .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cleanCell))
      .filter((cells) => cells.length >= 2)
      .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
    return rows.length ? rows : null;
  }
  function parseDelimitedRegion(text, startMarker, endMarker) {
    let raw = text.replace(/```(?:text|tsv|plaintext)?/gi, "").replace(/```/g, "").trim();
    if (startMarker && endMarker) {
      const s = raw.indexOf(startMarker);
      const e = raw.indexOf(endMarker);
      if (s === -1 || e === -1 || e <= s) return null;
      raw = raw.slice(s + startMarker.length, e).trim();
    }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return null;
    const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
    if (!delimiter) return null;
    return lines.map((line) => line.split(delimiter).map(cleanCell));
  }
  function parseDelimited(text) {
    return (
      parseDelimitedRegion(text, "START_WEEK1_TSV", "END_WEEK1_TSV") ||
      parseDelimitedRegion(text, null, null)
    );
  }
  function convertRows(rows) {
    if (!rows || rows.length < 2) throw new Error("Could not find a table with a header row and exercise rows.");
    const headers = rows[0].map(normalizeHeader);
    const headerMap = {};
    headers.forEach((h, i) => { if (!headerMap[h]) headerMap[h] = i; });
    if (headerMap.Exercise === undefined) throw new Error("Could not find an Exercise column.");
    const out = [REQUIRED];
    let lastDay = "";
    for (const row of rows.slice(1)) {
      if (!row.some(Boolean)) continue;
      const get = (name) => {
        const idx = headerMap[name];
        return idx === undefined ? "" : cleanCell(row[idx]);
      };
      let day = get("Day") || lastDay;
      if (day) lastDay = day;
      const exercise = get("Exercise");
      if (!exercise || /^exercise$/i.test(exercise)) continue;
      const weight = get("Weight");
      const sets = get("Sets");
      const reps = get("Reps");
      const rest = get("Rest");
      const rpe = get("Target RPE");
      let notes = get("Notes");
      const modification = get("Modification");
      if (modification && !notes.includes(modification)) notes = notes ? `${notes} / ${modification}` : modification;
      out.push([day, exercise, weight, sets, reps, rest, rpe, notes, ""]);
    }
    if (out.length < 2) throw new Error("No exercise rows were found after the header.");
    return out;
  }
  function extractRows(text) {
    const rows = parseDelimited(text) || parseMarkdownTable(text);
    return convertRows(rows);
  }
  function extractWeek(text, weekNumber) {
    const start = "START_WEEK" + weekNumber + "_TSV";
    const end = "END_WEEK" + weekNumber + "_TSV";
    const region = parseDelimitedRegion(text, start, end);
    if (!region) return null;
    try { return convertRows(region); } catch (_) { return null; }
  }
  function extractAllWeeks(text) {
    const weeks = [];
    const w1 = extractWeek(text, 1);
    weeks.push({ week: 1, rows: w1 || extractRows(text) });
    for (let n = 2; n <= 4; n++) {
      const rows = extractWeek(text, n);
      if (rows) weeks.push({ week: n, rows });
    }
    return weeks;
  }

  function styleCell(cell, options = {}) {
    cell.font = options.font || { name: "Calibri", size: 9, color: { argb: "FF111111" } };
    cell.alignment = options.alignment || { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.fill || "FFEDEDED" } };
    cell.border = {
      top: { style: "thin", color: { argb: options.border || "FFCFCFCF" } },
      left: { style: "thin", color: { argb: options.border || "FFCFCFCF" } },
      bottom: { style: "thin", color: { argb: options.border || "FFCFCFCF" } },
      right: { style: "thin", color: { argb: options.border || "FFCFCFCF" } }
    };
  }

  // Render ONE styled "Strength Block - Week N" sheet for a single week.
  function renderWeekSheet(ws, wk, options = {}) {
    const isHebrew = !!options.isHebrew;
    const intake = options.intake || {};
    const widths = [4.28, 34, 26, 8, 11, 10, 12, 42, 16.8];
    widths.forEach((width, i) => { ws.getColumn(i + 1).width = width; });

    // Black canvas (matches the existing visual style)
    for (let r = 1; r <= 200; r++) {
      ws.getRow(r).height = r < 13 ? 14 : 18;
      for (let c = 1; c <= 9; c++) {
        styleCell(ws.getRow(r).getCell(c), {
          fill: "FF000000",
          font: { name: "Calibri", size: 9, color: { argb: "FFFFFFFF" } },
          border: "FF222222"
        });
      }
    }

    // Client-facing workbook identity. Keep the training table compact, but use
    // the otherwise-empty top canvas to make the export feel like a coaching
    // deliverable rather than a raw data dump.
    ws.mergeCells("B2:I3");
    const brand = ws.getCell("B2");
    brand.value = "RAZ PERFORMANCE";
    styleCell(brand, {
      fill: "FF000000",
      font: { name: "Calibri", size: 18, bold: true, color: { argb: "FF18D3C5" } },
      alignment: { horizontal: isHebrew ? "right" : "left", vertical: "middle" },
      border: "FF000000"
    });
    ws.mergeCells("B4:I5");
    const subtitle = ws.getCell("B4");
    subtitle.value = isHebrew ? "תוכנית אימון אישית, שבוע " + wk.week : "Individualized Training Block, Week " + wk.week;
    styleCell(subtitle, {
      fill: "FF000000",
      font: { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } },
      alignment: { horizontal: isHebrew ? "right" : "left", vertical: "middle" },
      border: "FF000000"
    });

    // Compact program context so the workbook remains understandable when it is
    // shared or opened away from the web app. This is descriptive only; it does
    // not expose internal engine scores or private coaching labels.
    const primary = Array.isArray(intake.primary_goals) ? intake.primary_goals.filter(Boolean).join(" + ") : "";
    const sport = String(intake.sport || "").trim();
    const sessions = intake.days_per_week ? String(intake.days_per_week) : "";
    const contextLines = [];
    if (primary) contextLines.push((isHebrew ? "מטרות עיקריות: " : "Primary goals: ") + primary);
    if (sessions) contextLines.push((isHebrew ? "אימוני כוח בשבוע: " : "Strength sessions/week: ") + sessions);
    if (sport) contextLines.push((isHebrew ? "ספורט משולב: " : "Concurrent sport: ") + sport);
    if (contextLines.length) {
      ws.mergeCells("B7:I10");
      const contextCell = ws.getCell("B7");
      setTextCell(contextCell, contextLines.join("\n"));
      styleCell(contextCell, {
        fill: "FF0E1111",
        font: { name: "Calibri", size: 9, color: { argb: "FFDCE8E6" } },
        alignment: { horizontal: isHebrew ? "right" : "left", vertical: "middle", wrapText: true, readingOrder: isHebrew ? "rtl" : "ltr" },
        border: "FF26302F"
      });
    }

    let excelRow = 13;
    // WEEK N banner
    ws.mergeCells("B" + excelRow + ":I" + excelRow);
    const banner = ws.getCell("B" + excelRow);
    banner.value = isHebrew ? ("שבוע " + wk.week) : ("WEEK " + wk.week);
    styleCell(banner, {
      fill: "FF18D3C5",
      font: { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } },
      alignment: { horizontal: "center", vertical: "middle" },
      border: "FFCFCFCF"
    });
    ws.getRow(excelRow).height = 22;
    excelRow += 1;

    // Header row
    REQUIRED.slice(1).forEach((h, i) => {
      const c = ws.getRow(excelRow).getCell(i + 2);
      c.value = isHebrew ? (HEADER_HE[h] || h) : h;
      styleCell(c, {
        fill: i + 2 === 9 ? "FF000000" : "FFD9D9D9",
        font: { name: "Calibri", size: 9, bold: true, color: { argb: i + 2 === 9 ? "FFFFFFFF" : "FF111111" } },
        alignment: { horizontal: "center", vertical: "middle", wrapText: true }
      });
    });
    ws.getRow(excelRow).height = 20;
    excelRow += 1;

    // Data rows grouped by Day
    let groupStart = excelRow;
    let currentDay = null;
    const dataRows = wk.rows.slice(1);
    // Apply a thick teal bottom border across all 9 columns of the given row
    // to visually separate one training day from the next.
    const applyDayBottomBorder = (excelRowNum) => {
      for (let c = 1; c <= 9; c++) {
        const cell = ws.getRow(excelRowNum).getCell(c);
        const existing = cell.border || {};
        cell.border = {
          top: existing.top || { style: "thin", color: { argb: "FFCFCFCF" } },
          left: existing.left || { style: "thin", color: { argb: "FFCFCFCF" } },
          right: existing.right || { style: "thin", color: { argb: "FFCFCFCF" } },
          bottom: { style: "medium", color: { argb: "FF18D3C5" } }
        };
      }
    };
    dataRows.forEach((row) => {
      const day = row[0] || currentDay || "";
      if (currentDay !== null && day !== currentDay) {
        if (excelRow - 1 > groupStart) ws.mergeCells(groupStart, 1, excelRow - 1, 1);
        const dayCell = ws.getRow(groupStart).getCell(1);
        dayCell.value = isHebrew ? (DAY_HE[currentDay] || currentDay) : currentDay;
        styleCell(dayCell, {
          fill: "FF18D3C5",
          font: { name: "Calibri", size: 8, bold: true, color: { argb: "FF000000" } },
          alignment: { horizontal: "center", vertical: "middle", textRotation: 90, wrapText: true },
          border: "FF18D3C5"
        });
        // Draw the separator on the LAST row of the previous day.
        applyDayBottomBorder(excelRow - 1);
        groupStart = excelRow;
      }
      currentDay = day;
      const r = ws.getRow(excelRow);
      r.height = 38;
      for (let c = 2; c <= 8; c++) {
        const cell = r.getCell(c);
        const rawValue = row[c - 1] || "";
        setTextCell(cell, rawValue);
        styleCell(cell, {
          fill: "FFEDEDED",
          font: { name: "Calibri", size: 9, bold: c === 2 || c === 7, color: { argb: c === 7 ? "FF0E9C91" : "FF111111" } },
          alignment: { horizontal: [2, 3, 8].includes(c) ? "left" : "center", vertical: "middle", wrapText: true }
        });
        if (c === 2 && rawValue && window.ExerciseDemos) {
          const demo = window.ExerciseDemos.resolveExerciseDemo(rawValue);
          if (demo && demo.url) {
            cell.value = { text: rawValue, hyperlink: demo.url, tooltip: isHebrew ? "פתח הדגמה ב-YouTube" : "Open demo in YouTube (use incognito to avoid watch-history)" };
            cell.numFmt = "@";
            cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF0563C1" }, underline: true };
          }
        }
      }
      const resultCell = r.getCell(9);
      setTextCell(resultCell, "");
      styleCell(resultCell, {
        fill: "FF000000",
        font: { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } },
        alignment: { horizontal: "center", vertical: "middle", wrapText: true }
      });
      excelRow += 1;
    });
    if (currentDay !== null) {
      if (excelRow - 1 > groupStart) ws.mergeCells(groupStart, 1, excelRow - 1, 1);
      const dayCell = ws.getRow(groupStart).getCell(1);
      dayCell.value = isHebrew ? (DAY_HE[currentDay] || currentDay) : currentDay;
      styleCell(dayCell, {
        fill: "FF18D3C5",
        font: { name: "Calibri", size: 8, bold: true, color: { argb: "FF000000" } },
        alignment: { horizontal: "center", vertical: "middle", textRotation: 90, wrapText: true },
        border: "FF18D3C5"
      });
      // Draw the closing separator on the final day's last row.
      applyDayBottomBorder(excelRow - 1);
    }
  }

  // Strip TSV machine blocks from the program text so README shows clean prose.
  function stripMachineBlocks(text) {
    if (!text) return "";
    let cleaned = text;
    const markers = [
      ["START_WEEK1_TSV", "END_WEEK1_TSV"],
      ["START_WEEK2_TSV", "END_WEEK2_TSV"],
      ["START_WEEK3_TSV", "END_WEEK3_TSV"],
      ["START_WEEK4_TSV", "END_WEEK4_TSV"]
    ];
    markers.forEach(([s, e]) => {
      const re = new RegExp(s + "[\\s\\S]*?" + e, "g");
      cleaned = cleaned.replace(re, "");
    });
    // Remove QA marker lines.
    cleaned = cleaned.replace(/^QA_FORMULA_VIOLATION_COUNT:.*$/gm, "");
    cleaned = cleaned.replace(/^QA_NOTES:.*$/gm, "");
    // Strip leftover code fences.
    cleaned = cleaned.replace(/```[a-z]*\n?/gi, "");
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Render README with the full engine narrative (the prose the page shows).
  function renderReadme(readme, weeks, programText, options = {}) {
    const isHebrew = !!options.isHebrew;
    readme.getColumn(1).width = 4;
    readme.getColumn(2).width = 110;
    readme.getCell("B2").value = isHebrew ? "RAZ Performance - סיכום התוכנית" : "RAZ Performance - Program Summary";
    readme.getCell("B2").font = { name: "Calibri", size: 20, bold: true, color: { argb: "FF000000" } };

    const weeksFound = weeks.map((w) => "Week " + w.week).join(", ");
    readme.getCell("B4").value = isHebrew
      ? "הקובץ כולל " + weeks.length + " שבועות. כל שבוע נמצא בלשונית נפרדת. רשום את הביצוע בפועל בעמודת התוצאות השחורה."
      : "This workbook contains " + weeks.length + " week(s): " + weeksFound + ". Each week lives on its own tab. Record completed work in the black Results column.";
    readme.getCell("B4").alignment = { wrapText: true, vertical: "top" };
    readme.getRow(4).height = 40;

    let row = 6;
    const narrative = stripMachineBlocks(programText);
    if (narrative) {
      readme.getCell("B" + row).value = isHebrew ? "הערות אימון" : "Coaching Notes";
      readme.getCell("B" + row).font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF000000" } };
      row += 1;
      // Split narrative into ~80-char-wrapped paragraphs into Excel rows so it
      // displays cleanly. ExcelJS handles wrapText so we can paste each paragraph
      // into one cell and let row height auto-feel.
      const paragraphs = narrative.split(/\n{2,}/).filter((p) => p.trim());
      paragraphs.forEach((p) => {
        const cell = readme.getCell("B" + row);
        cell.value = p.trim();
        cell.alignment = { wrapText: true, vertical: "top", horizontal: isHebrew ? "right" : "left", readingOrder: isHebrew ? "rtl" : "ltr" };
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF222222" } };
        // Rough height estimate: ~15px per ~95 chars (col width 110).
        const lines = Math.ceil(p.length / 95) + (p.match(/\n/g) || []).length + 1;
        readme.getRow(row).height = Math.min(Math.max(lines * 14, 18), 360);
        row += 1;
      });
      row += 1;
    }

    // Privacy disclosure stays at the bottom.
    readme.getCell("B" + row).value = isHebrew ? "קישורי הדגמה - פרטיות" : "Exercise Demo Links - Privacy Notice";
    readme.getCell("B" + row).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF000000" } };
    row += 1;
    const disclosure = (window.ExerciseDemos && window.ExerciseDemos.getPrivacyDisclosure)
      ? window.ExerciseDemos.getPrivacyDisclosure()
      : "Exercise demos open in YouTube. To keep them out of your watch history, open them in incognito/private mode, or replace 'youtube.com' with 'youtube-nocookie.com' in the URL.";
    readme.getCell("B" + row).value = disclosure;
    readme.getCell("B" + row).alignment = { wrapText: true, vertical: "top", horizontal: isHebrew ? "right" : "left", readingOrder: isHebrew ? "rtl" : "ltr" };
    readme.getCell("B" + row).font = { name: "Calibri", size: 10, color: { argb: "FF333333" } };
    readme.getRow(row).height = 60;
  }

  async function buildStrengthSpreadsheet(text, intake = {}) {
    if (!window.ExcelJS) throw new Error("Spreadsheet engine did not load. Check your connection and try again.");
    if (window.ExerciseDemos && window.ExerciseDemos.load) {
      try { await window.ExerciseDemos.load(); } catch (e) { console.warn("Exercise demos failed to load, falling back to search:", e); }
    }
    const weeks = extractAllWeeks(text);
    const isHebrew = isHebrewProgram(text);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Raz Pilosof Strength Program Coaching Engine";
    workbook.created = new Date();

    // One styled sheet per week. No PASTE tabs.
    weeks.forEach((wk) => {
      const sheetName = "Strength Block - Week " + wk.week;
      const ws = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 14, rightToLeft: isHebrew }]
      });
      renderWeekSheet(ws, wk, { isHebrew, intake });
    });

    // README with the full engine narrative.
    const readme = workbook.addWorksheet(isHebrew ? "הנחיות" : "README", { views: [{ showGridLines: false, rightToLeft: isHebrew }] });
    renderReadme(readme, weeks, text, { isHebrew });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = weeks.length > 1 ? "strength_block_" + weeks.length + "_weeks.xlsx" : "strength_block_week1.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return weeks.reduce((acc, w) => acc + (w.rows.length - 1), 0);
  }

  function hasSpreadsheetData(text) {
    try { extractRows(text); return true; } catch (_) { return false; }
  }
  function getProgramTable(text) {
    try { return extractRows(text); } catch (_) { return null; }
  }
  function splitProgramNarrative(text) {
    if (!text) return { before: "", after: "" };
    const markers = [
      ["START_WEEK1_TSV", "END_WEEK1_TSV"],
      ["START_WEEK2_TSV", "END_WEEK2_TSV"],
      ["START_WEEK3_TSV", "END_WEEK3_TSV"],
      ["START_WEEK4_TSV", "END_WEEK4_TSV"]
    ];
    let firstStart = -1;
    let lastEnd = -1;
    markers.forEach(([s, e]) => {
      const si = text.indexOf(s);
      const ei = text.indexOf(e);
      if (si !== -1 && ei !== -1 && ei > si) {
        if (firstStart === -1 || si < firstStart) firstStart = si;
        const endPos = ei + e.length;
        if (endPos > lastEnd) lastEnd = endPos;
      }
    });
    if (firstStart !== -1 && lastEnd !== -1) {
      let before = text.slice(0, firstStart).replace(/```(?:text|tsv|plaintext)?\s*$/i, "").trim();
      let after = text.slice(lastEnd).replace(/^\s*```/i, "").trim();
      markers.forEach(([s, e]) => {
        const re = new RegExp(s + "[\\s\\S]*?" + e, "g");
        before = before.replace(re, "");
        after = after.replace(re, "");
      });
      return { before: before.trim(), after: after.trim() };
    }
    const lines = text.split(/\r?\n/);
    const keep = lines.filter((l) => !(l.includes("|") || /\t/.test(l)));
    return { before: keep.join("\n").trim(), after: "" };
  }

  window.buildStrengthSpreadsheet = buildStrengthSpreadsheet;
  window.hasSpreadsheetData = hasSpreadsheetData;
  window.getProgramTable = getProgramTable;
  window.splitProgramNarrative = splitProgramNarrative;
})();
