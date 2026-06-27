// Reusable spreadsheet builder. Emits a 4-week block when the engine provides it,
// gracefully falls back to Week 1 only. Exposes window.buildStrengthSpreadsheet.
// Depends on ExcelJS (loaded via exceljs.lib.js).

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

  function cleanCell(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
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

  function renderPasteTab(workbook, sheetName, rows) {
    const paste = workbook.addWorksheet(sheetName);
    [12, 34, 24, 8, 12, 10, 12, 50, 18].forEach((width, i) => { paste.getColumn(i + 1).width = width; });
    rows.forEach((row, rIdx) => {
      const r = paste.getRow(rIdx + 1);
      row.forEach((value, cIdx) => {
        const cell = r.getCell(cIdx + 1);
        cell.value = value;
        styleCell(cell, {
          fill: rIdx === 0 ? "FF1F4E78" : "FFFFFFFF",
          font: { name: "Calibri", size: rIdx === 0 ? 11 : 10, bold: rIdx === 0, color: { argb: rIdx === 0 ? "FFFFFFFF" : "FF111111" } }
        });
        if (rIdx > 0 && cIdx === 1 && value && window.ExerciseDemos) {
          const demo = window.ExerciseDemos.resolveExerciseDemo(value);
          if (demo && demo.url) {
            cell.value = { text: value, hyperlink: demo.url, tooltip: "Open demo in YouTube (use incognito to avoid watch-history)" };
            cell.font = { name: "Calibri", size: 10, color: { argb: "FF0563C1" }, underline: true };
          }
        }
      });
      r.height = rIdx === 0 ? 22 : 28;
    });
    paste.views = [{ state: "frozen", ySplit: 1 }];
  }

  function renderStrengthBlock(ws, weeks) {
    const widths = [4.28, 34, 26, 8, 11, 10, 12, 42, 16.8];
    widths.forEach((width, i) => { ws.getColumn(i + 1).width = width; });
    // Paint a black canvas large enough for 4 weeks of dense rows.
    for (let r = 1; r <= 400; r++) {
      ws.getRow(r).height = r < 13 ? 14 : 18;
      for (let c = 1; c <= 9; c++) {
        styleCell(ws.getRow(r).getCell(c), {
          fill: "FF000000",
          font: { name: "Calibri", size: 9, color: { argb: "FFFFFFFF" } },
          border: "FF222222"
        });
      }
    }
    let excelRow = 13;
    weeks.forEach((wk) => {
      // Banner
      ws.mergeCells("B" + excelRow + ":I" + excelRow);
      const banner = ws.getCell("B" + excelRow);
      banner.value = "WEEK " + wk.week;
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
        c.value = h;
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
      dataRows.forEach((row) => {
        const day = row[0] || currentDay || "";
        if (currentDay !== null && day !== currentDay) {
          if (excelRow - 1 > groupStart) ws.mergeCells(groupStart, 1, excelRow - 1, 1);
          const dayCell = ws.getRow(groupStart).getCell(1);
          dayCell.value = currentDay;
          styleCell(dayCell, {
            fill: "FF18D3C5",
            font: { name: "Calibri", size: 8, bold: true, color: { argb: "FF000000" } },
            alignment: { horizontal: "center", vertical: "middle", textRotation: 90, wrapText: true },
            border: "FF18D3C5"
          });
          excelRow += 1;
          groupStart = excelRow;
        }
        currentDay = day;
        const r = ws.getRow(excelRow);
        r.height = 38;
        for (let c = 2; c <= 8; c++) {
          const cell = r.getCell(c);
          const rawValue = row[c - 1] || "";
          cell.value = rawValue;
          styleCell(cell, {
            fill: "FFEDEDED",
            font: { name: "Calibri", size: 9, bold: c === 2 || c === 7, color: { argb: c === 7 ? "FF0E9C91" : "FF111111" } },
            alignment: { horizontal: [2, 3, 8].includes(c) ? "left" : "center", vertical: "middle", wrapText: true }
          });
          if (c === 2 && rawValue && window.ExerciseDemos) {
            const demo = window.ExerciseDemos.resolveExerciseDemo(rawValue);
            if (demo && demo.url) {
              cell.value = { text: rawValue, hyperlink: demo.url, tooltip: "Open demo in YouTube (use incognito to avoid watch-history)" };
              cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF0563C1" }, underline: true };
            }
          }
        }
        const resultCell = r.getCell(9);
        resultCell.value = "";
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
        dayCell.value = currentDay;
        styleCell(dayCell, {
          fill: "FF18D3C5",
          font: { name: "Calibri", size: 8, bold: true, color: { argb: "FF000000" } },
          alignment: { horizontal: "center", vertical: "middle", textRotation: 90, wrapText: true },
          border: "FF18D3C5"
        });
      }
      // Spacer between weeks
      excelRow += 2;
    });
  }

  async function buildStrengthSpreadsheet(text) {
    if (!window.ExcelJS) throw new Error("Spreadsheet engine did not load. Check your connection and try again.");
    if (window.ExerciseDemos && window.ExerciseDemos.load) {
      try { await window.ExerciseDemos.load(); } catch (e) { console.warn("Exercise demos failed to load, falling back to search:", e); }
    }
    const weeks = extractAllWeeks(text);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Raz Pilosof Strength Program Coaching Engine";
    workbook.created = new Date();
    const ws = workbook.addWorksheet("Strength Block", { views: [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 12 }] });
    weeks.forEach((wk) => {
      renderPasteTab(workbook, "PASTE_WEEK_" + wk.week, wk.rows);
    });
    const readme = workbook.addWorksheet("README", { views: [{ showGridLines: false }] });
    readme.getColumn(1).width = 4;
    readme.getColumn(2).width = 100;

    renderStrengthBlock(ws, weeks);

    readme.getCell("B2").value = "Strength Block Spreadsheet";
    readme.getCell("B2").font = { name: "Calibri", size: 20, bold: true, color: { argb: "FF000000" } };
    const weeksFound = weeks.map((w) => "Week " + w.week).join(", ");
    readme.getCell("B4").value = "Created by the AI Coaching Engine. This workbook contains " + weeks.length + " week(s): " + weeksFound + ". Use the Strength Block sheet for the client-facing program. Use the black Results column to record completed work.";
    readme.getCell("B4").alignment = { wrapText: true };

    readme.getCell("B6").value = "Exercise Demo Links — Privacy Notice";
    readme.getCell("B6").font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF000000" } };
    const disclosure = (window.ExerciseDemos && window.ExerciseDemos.getPrivacyDisclosure)
      ? window.ExerciseDemos.getPrivacyDisclosure()
      : "Exercise demos open in YouTube. To keep them out of your watch history, open them in incognito/private mode, or replace 'youtube.com' with 'youtube-nocookie.com' in the URL.";
    readme.getCell("B7").value = disclosure;
    readme.getCell("B7").alignment = { wrapText: true, vertical: "top" };
    readme.getCell("B7").font = { name: "Calibri", size: 10, color: { argb: "FF333333" } };
    readme.getRow(7).height = 60;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = weeks.length > 1 ? "strength_block_4_weeks.xlsx" : "strength_block_week1.xlsx";
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