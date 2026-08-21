// Objective, quality-preserving fast repairs.
// These repairs are intentionally narrow: they may remove false client-facing
// progression wording, but they never change exercises, sets, reps, load, rest,
// RPE, day placement, or any other training prescription.

function parseWeek(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const notes = ['notes', 'coaching note'].map((k) => idx[k]).find(Number.isInteger);
  if (!Number.isInteger(notes)) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return { re, match, lines, header, rows, notes };
}

function neutralizeFalseProgressionClaim(note) {
  let out = String(note || '');
  const before = out;

  // Only neutralize objective week-over-week claims. Preserve the surrounding
  // execution cue and all prescription fields.
  out = out.replace(/\b(?:trim|reduce|drop|cut|lower)\b([^.;]{0,24})\b(sets?|set count|total work|volume|reps?|distance)\b/gi,
    (_m, middle, metric) => `use the listed ${String(metric).toLowerCase()}`);
  out = out.replace(/\b(?:fewer|less)\s+(?:total\s+)?(sets?|reps?|work|volume|distance)\b/gi,
    (_m, metric) => `the listed ${String(metric).toLowerCase()}`);
  out = out.replace(/\b(?:slightly less|less)\s+total\s+(?:work|volume)\b/gi, 'the listed total work');
  out = out.replace(/\bfewer\s+total\s+reps?\b/gi, 'the listed total reps');
  out = out.replace(/\b(?:repeat|hold|keep|maintain|match)\b[^.;]{0,30}\b(?:this|the|same)\s+(?:load|weight|dose)\b/gi,
    'use the listed load');
  out = out.replace(/\brepeat\s+(?:this|the)\s+load\b/gi, 'use the listed load');

  // Cosmetic cleanup only.
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  return { text: out, changed: out !== before };
}

export function repairSafeObjectiveLanguage(program, flags = []) {
  const relevant = (Array.isArray(flags) ? flags : [])
    .filter((flag) => flag?.code === 'V34_PROGRESSION_LANGUAGE_MISMATCH')
    .filter((flag) => Number.isInteger(flag?.week) && Number.isInteger(flag?.row));
  if (!relevant.length) return { program: String(program || ''), changed: false, changed_rows: 0 };

  let output = String(program || '');
  let changedRows = 0;

  // Work week-by-week so row indices stay identical to the validator's parsed rows.
  for (const week of [...new Set(relevant.map((f) => f.week))]) {
    const parsed = parseWeek(output, week);
    if (!parsed) continue;
    const targetRows = new Set(relevant.filter((f) => f.week === week).map((f) => f.row));
    let weekChanged = false;

    for (const rowIndex of targetRows) {
      const cells = parsed.rows[rowIndex];
      if (!cells) continue;
      const originalNote = String(cells[parsed.notes] || '');
      const repaired = neutralizeFalseProgressionClaim(originalNote);
      if (!repaired.changed) continue; // Claim may be in Load/Reps: leave it for model repair.
      cells[parsed.notes] = repaired.text || 'Use the listed prescription and preserve the stated execution quality.';
      changedRows++;
      weekChanged = true;
    }

    if (weekChanged) {
      const body = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
      output = output.replace(parsed.re, `$1${body}$3`);
    }
  }

  return { program: output, changed: changedRows > 0, changed_rows: changedRows };
}
