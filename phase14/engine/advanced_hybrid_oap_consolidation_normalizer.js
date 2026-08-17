import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v].filter(Boolean) : []; }
function primaryText(intake = {}) { return arr(intake.primary_goals).map(String).join(' | '); }
function isStrictOap(name) { return /^\s*One-Arm Pull-up\s*$/i.test(String(name || '')); }
function isWarmup(name) { return /^\s*\[WARMUP\](?:\s|$)/i.test(String(name || '')); }

function parseWeek(program, weekNumber) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  if (!Number.isInteger(index.exercise) || !Number.isInteger(index.sets) || !Number.isInteger(index.notes)) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return { re, match, header, index, rows };
}

// Deliberately mirrors advanced_hybrid_quality.js numericSets(): the release gate
// uses the first numeric value in the Sets cell. A generated value such as
// "4 / arm" or "4 sets" is therefore not ambiguous to the validator and must not
// make the deterministic repair silently no-op. We still reject fractional set
// counts because writing a fractional training set would not be a safe repair.
function numericSets(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function strictRows(parsed) {
  const out = [];
  parsed.rows.forEach((cells, rowIndex) => {
    const exercise = String(cells[parsed.index.exercise] || '').trim();
    if (!exercise || isWarmup(exercise) || !isStrictOap(exercise)) return;
    const sets = numericSets(cells[parsed.index.sets]);
    if (sets == null) return;
    out.push({ rowIndex, cells, sets });
  });
  return out;
}

function totalSets(rows) { return rows.reduce((sum, row) => sum + row.sets, 0); }

function addConsolidationCue(existing) {
  const note = String(existing || '').trim();
  if (/week\s*4.*(?:consolidat|retain|preserve)|(?:consolidat|retain|preserve).*week\s*3/i.test(note)) return note;
  const cue = 'Week 4 consolidation: retain Week 3 strict one-arm pull-up quality with no increase in strict attempt volume.';
  return note ? `${note} ${cue}` : cue;
}

// The Advanced Hybrid quality gate already defines the contract: Week 4 strict
// One-Arm Pull-up volume may hold or reduce versus Week 3, but must not increase.
// This normalizer changes only that violated axis. It never adds OAP work, never
// changes Weeks 1-3, and never touches assisted OAP rows. Set parsing intentionally
// matches the release validator; repaired Week-4 set cells become exact integers
// so a range/suffix cannot hide a higher-volume interpretation after convergence.
export function normalizeAdvancedHybridWeek4OapConsolidation(program, intake = {}) {
  const original = String(program || '');
  if (!isHighConcurrencyHybrid(intake) || !/(?:one[- ]?arm pull[- ]?ups?|\boap\b)/i.test(primaryText(intake))) {
    return { program: original, repaired: false, repairs: [] };
  }

  const week3 = parseWeek(original, 3);
  const week4 = parseWeek(original, 4);
  if (!week3 || !week4) return { program: original, repaired: false, repairs: [] };

  const w3Rows = strictRows(week3);
  const w4Rows = strictRows(week4);
  if (!w3Rows.length || !w4Rows.length) return { program: original, repaired: false, repairs: [] };

  const w3Total = totalSets(w3Rows);
  const w4Total = totalSets(w4Rows);
  if (!(w4Total > w3Total) || w3Total < 1) return { program: original, repaired: false, repairs: [] };

  let excess = w4Total - w3Total;
  const removedRows = [];
  const reducedRows = [];

  // Preserve at least one set in every retained strict-OAP row first. If Week 4
  // has more strict-OAP rows than the Week-3 set ceiling can support, remove only
  // trailing redundant strict rows until the target is representable.
  for (let i = w4Rows.length - 1; i >= 0 && excess > 0; i--) {
    const row = w4Rows[i];
    const reducible = Math.max(0, row.sets - 1);
    if (reducible > 0) {
      const cut = Math.min(excess, reducible);
      row.sets -= cut;
      row.cells[week4.index.sets] = String(row.sets);
      row.cells[week4.index.notes] = addConsolidationCue(row.cells[week4.index.notes]);
      excess -= cut;
      reducedRows.push({ row: row.rowIndex, sets_removed: cut, sets_remaining: row.sets });
    }
  }

  if (excess > 0) {
    const removable = w4Rows.slice(1).sort((a, b) => b.rowIndex - a.rowIndex);
    for (const row of removable) {
      if (excess <= 0) break;
      if (row.sets > excess) continue;
      week4.rows.splice(row.rowIndex, 1);
      excess -= row.sets;
      removedRows.push({ row: row.rowIndex, sets_removed: row.sets });
    }
  }

  if (excess > 0) return { program: original, repaired: false, repairs: [] };

  // Row deletion may have changed indexes, but only after all set edits are done.
  const remainingStrict = week4.rows.filter((cells) => isStrictOap(cells[week4.index.exercise]));
  if (!remainingStrict.length) return { program: original, repaired: false, repairs: [] };
  for (const cells of remainingStrict) cells[week4.index.notes] = addConsolidationCue(cells[week4.index.notes]);

  const finalTotal = remainingStrict.reduce((sum, cells) => sum + (numericSets(cells[week4.index.sets]) || 0), 0);
  if (finalTotal > w3Total || finalTotal < 1) return { program: original, repaired: false, repairs: [] };

  const inner = [week4.header.join('\t'), ...week4.rows.map((cells) => cells.join('\t'))].join('\n');
  const candidate = original.replace(week4.re, week4.match[1] + inner + week4.match[3]);
  return {
    program: candidate,
    repaired: true,
    repairs: [{ type: 'week4_strict_oap_volume', week3_sets: w3Total, week4_sets_before: w4Total, week4_sets_after: finalTotal, reduced_rows: reducedRows, removed_rows: removedRows }],
  };
}
