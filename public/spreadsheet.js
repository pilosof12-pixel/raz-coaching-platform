// Reusable spreadsheet builder, extracted from the original Week 1 Spreadsheet Creator.
// Exposes window.buildStrengthSpreadsheet(tsvOrTableText) -> downloads strength_block_week1.xlsx
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
  function parseDelimited(text) {
    let raw = text.replace(/```(?:text|tsv|plaintext)?/gi, "").replace(/```/g, "").trim();
    const startIndex = raw.indexOf("START_WEEK1_TSV");
    const endIndex = raw.indexOf("END_WEEK1_TSV");
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      raw = raw.slice(startIndex, endIndex + "END_WEEK1_TSV".length);
    }
    raw = raw.replace(/^START_WEEK1_TSV\s*/i, "").replace(/\s*END_WEEK1_TSV$/i, "").trim();
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return null;
    const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
    if (!delimiter) return null;
    return lines.map((line) => line.split(delimiter).map(cleanCell));
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

  async function buildStrengthSpreadsheet(text) {
    if (!window.ExcelJS) throw new Error("Spreadsheet engine did not load. Check your connection and try again.");
    const rows = extractRows(text);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Raz Pilosof Strength Program Coaching Engine";
    workbook.created = new Date();
    const ws = workbook.addWorksheet("Strength Block", { views: [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 15 }] });
    const paste = workbook.addWorksheet("PASTE_WEEK_1");
    const readme = workbook.addWorksheet("README", { views: [{ showGridLines: false }] });
    const widths = [4.28, 34, 26, 8, 11, 10, 12, 42, 16.8];
    widths.forEach((width, i) => { ws.getColumn(i + 1).width = width; });
    [12, 34, 24, 8, 12, 10, 12, 50, 18].forEach((width, i) => { paste.getColumn(i + 1).width = width; });
    readme.getColumn(1).width = 4;
    readme.getColumn(2).width = 100;
    rows.forEach((row, rIdx) => {
      const r = paste.getRow(rIdx + 1);
      row.forEach((value, cIdx) => {
        const cell = r.getCell(cIdx + 1);
        cell.value = value;
        styleCell(cell, {
          fill: rIdx === 0 ? "FF1F4E78" : "FFFFFFFF",
          font: { name: "Calibri", size: rIdx === 0 ? 11 : 10, bold: rIdx === 0, color: { argb: rIdx === 0 ? "FFFFFFFF" : "FF111111" } }
        });
      });
      r.height = rIdx === 0 ? 22 : 28;
    });
    paste.views = [{ state: "frozen", ySplit: 1 }];
    readme.getCell("B2").value = "Strength Block Spreadsheet";
    readme.getCell("B2").font = { name: "Calibri", size: 20, bold: true, color: { argb: "FF000000" } };
    readme.getCell("B4").value = "Created by the AI Coaching Engine. Use the Strength Block sheet for the client-facing program. Use the black Results column to record completed work.";
    readme.getCell("B4").alignment = { wrapText: true };
    for (let r = 1; r <= 90; r++) {
      ws.getRow(r).height = r < 15 ? 14 : 18;
      for (let c = 1; c <= 9; c++) {
        styleCell(ws.getRow(r).getCell(c), {
          fill: "FF000000",
          font: { name: "Calibri", size: 9, color: { argb: "FFFFFFFF" } },
          border: "FF222222"
        });
      }
    }
    ws.mergeCells("B15:I15");
    const week = ws.getCell("B15");
    week.value = "WEEK 1";
    styleCell(week, {
      fill: "FF18D3C5",
      font: { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } },
      alignment: { horizontal: "center", vertical: "middle" },
      border: "FFCFCFCF"
    });
    ws.getRow(15).height = 22;
    REQUIRED.slice(1).forEach((h, i) => {
      const c = ws.getRow(16).getCell(i + 2);
      c.value = h;
      styleCell(c, {
        fill: i + 2 === 9 ? "FF000000" : "FFD9D9D9",
        font: { name: "Calibri", size: 9, bold: true, color: { argb: i + 2 === 9 ? "FFFFFFFF" : "FF111111" } },
        alignment: { horizontal: "center", vertical: "middle", wrapText: true }
      });
    });
    ws.getRow(16).height = 20;
    let excelRow = 17;
    let groupStart = 17;
    let currentDay = null;
    const dataRows = rows.slice(1);
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
        cell.value = row[c - 1] || "";
        styleCell(cell, {
          fill: "FFEDEDED",
          font: { name: "Calibri", size: 9, bold: c === 2 || c === 7, color: { argb: c === 7 ? "FF0E9C91" : "FF111111" } },
          alignment: { horizontal: [2, 3, 8].includes(c) ? "left" : "center", vertical: "middle", wrapText: true }
        });
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
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "strength_block_week1.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return rows.length - 1;
  }

  // Detect whether a program text contains a usable TSV/table block
  function hasSpreadsheetData(text) {
    try { extractRows(text); return true; } catch (_) { return false; }
  }

  window.buildStrengthSpreadsheet = buildStrengthSpreadsheet;
  window.hasSpreadsheetData = hasSpreadsheetData;
})();
