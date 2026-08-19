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
// Primary-goal progression clarity for strict One-Arm Pull-up.
//
// For an athlete who already owns the skill and is carrying heavy concurrent MMA
// and endurance load, the defensible progression axis is execution quality and
// EARNED work, not weekly set inflation. The block therefore holds base volume
// and states, per build week, exactly what advances. This changes notes only --
// no set, rep, load or assistance field is touched, so weekly strict volume is
// identical before and after.
const OAP_BUILD_STANDARD = {
  1: {
    marker: 'week 1 standard:',
    cue: 'Week 1 standard: establish the benchmark - every single starts from a dead hang, no kip or swing, and you finish each side with at least one clean rep still in reserve. Record how each side felt; this is the standard Weeks 2-3 have to beat.',
  },
  2: {
    marker: 'week 2 advance:',
    cue: 'Week 2 advance: same set count as Week 1 - the progression is execution, not volume. Beat Week 1 by controlling the descent on every single and by closing the gap between your stronger and weaker side, at the same or lower RPE.',
  },
  3: {
    marker: 'week 3 advance:',
    cue: 'Week 3 advance: same base set count again. If every prescribed single was clean at or below the target RPE and elbows and forearms feel normal, you may add ONE extra clean single on each side - earned, optional, and skipped entirely on any grind, miss or elbow niggle.',
  },
};

function addOapBuildStandard(program, intake, repairs) {
  let candidate = String(program || '');
  for (const week of [1, 2, 3]) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.index.notes)) continue;
    const rows = strictRows(parsed);
    if (!rows.length) continue;
    const { marker, cue } = OAP_BUILD_STANDARD[week];
    let changed = false;
    for (const { cells } of rows) {
      const note = String(cells[parsed.index.notes] || '').trim();
      if (note.toLowerCase().includes(marker)) continue;
      cells[parsed.index.notes] = note ? `${note} ${cue}` : cue;
      changed = true;
    }
    if (changed) {
      repairs.push({ type: 'advanced_hybrid_oap_build_standard', week });
      const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
      candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
    }
  }
  return candidate;
}

export function normalizeAdvancedHybridWeek4OapConsolidation(program, intake = {}) {
  const original = String(program || '');
  if (!isHighConcurrencyHybrid(intake) || !/(?:one[- ]?arm pull[- ]?ups?|\boap\b)/i.test(primaryText(intake))) {
    return { program: original, repaired: false, repairs: [] };
  }

  const buildStandardRepairs = [];
  const withStandards = addOapBuildStandard(original, intake, buildStandardRepairs);

  const week3 = parseWeek(withStandards, 3);
  const week4 = parseWeek(withStandards, 4);
  if (!week3 || !week4) {
    return { program: withStandards, repaired: buildStandardRepairs.length > 0, repairs: buildStandardRepairs };
  }

  const w3Rows = strictRows(week3);
  const w4Rows = strictRows(week4);
  if (!w3Rows.length || !w4Rows.length) {
    return { program: withStandards, repaired: buildStandardRepairs.length > 0, repairs: buildStandardRepairs };
  }

  const w3Total = totalSets(w3Rows);
  const w4Total = totalSets(w4Rows);
  if (!(w4Total > w3Total) || w3Total < 1) {
    return { program: withStandards, repaired: buildStandardRepairs.length > 0, repairs: buildStandardRepairs };
  }

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

  if (excess > 0) return { program: withStandards, repaired: buildStandardRepairs.length > 0, repairs: buildStandardRepairs };

  // Row deletion may have changed indexes, but only after all set edits are done.
  const remainingStrict = week4.rows.filter((cells) => isStrictOap(cells[week4.index.exercise]));
  if (!remainingStrict.length) return { program: withStandards, repaired: buildStandardRepairs.length > 0, repairs: buildStandardRepairs };
  for (const cells of remainingStrict) cells[week4.index.notes] = addConsolidationCue(cells[week4.index.notes]);

  const finalTotal = remainingStrict.reduce((sum, cells) => sum + (numericSets(cells[week4.index.sets]) || 0), 0);
  if (finalTotal > w3Total || finalTotal < 1) return { program: withStandards, repaired: buildStandardRepairs.length > 0, repairs: buildStandardRepairs };

  const inner = [week4.header.join('\t'), ...week4.rows.map((cells) => cells.join('\t'))].join('\n');
  const candidate = withStandards.replace(week4.re, week4.match[1] + inner + week4.match[3]);
  return {
    program: candidate,
    repaired: true,
    repairs: [...buildStandardRepairs, { type: 'week4_strict_oap_volume', week3_sets: w3Total, week4_sets_before: w4Total, week4_sets_after: finalTotal, reduced_rows: reducedRows, removed_rows: removedRows }],
  };
}
