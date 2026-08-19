import { youthConsolidationRetentionAnalysis } from './coaching_consolidation_quality.js';

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-–—_\/]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWeekBlock(program, weekNumber) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  for (const required of ['exercise', 'weight', 'sets', 'reps', 'notes']) {
    if (!Number.isInteger(index[required])) return null;
  }
  const rows = lines.slice(1).map((line) => ({ line, cells: line.split('\t') }));
  if (rows.some((row) => row.cells.length !== header.length)) return null;
  return { re, match, header, index, rows };
}

function rowsForExercise(parsed, exerciseName) {
  const wanted = normName(exerciseName);
  return parsed.rows.filter((row) => normName(row.cells[parsed.index.exercise]) === wanted);
}

function positiveSets(raw) {
  const n = Number(String(raw || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function retentionNote(existing, exerciseName) {
  const base = String(existing || '').trim();
  const cue = /handstand|kick[- ]?up/i.test(String(exerciseName || ''))
    ? 'Week 4 consolidation: match or retain the best clean Week 3 entry and balance quality with fewer total attempts; stop before misses accumulate.'
    : /explosive|jump|throw|power/i.test(String(exerciseName || ''))
      ? 'Week 4 consolidation: match or retain the best clean Week 3 height, speed and execution quality with lower total fatigue.'
      : 'Week 4 consolidation: retain the best clean Week 3 performance standard while reducing total fatigue.';
  if (/\b(?:retain|preserve|match|express|keep|best)\b/i.test(base) && /\bweek\s*3\b/i.test(base)) return base;
  return base ? `${base} ${cue}` : cue;
}

function lowerWeek4SetCost(w3Cells, w4Cells, index) {
  const w3Sets = positiveSets(w3Cells[index.sets]);
  const w4Sets = positiveSets(w4Cells[index.sets]);
  if (!Number.isFinite(w3Sets) || !Number.isFinite(w4Sets)) return;
  if (w4Sets < w3Sets) return;
  if (w3Sets <= 1) return;
  w4Cells[index.sets] = String(Math.max(1, w3Sets - 1));
}

// Narrow deterministic convergence repair for Youth Week 4. The semantic
// validator remains authoritative. We only act when that validator has already
// identified a reset, and only when the same exercise has one unambiguous row in
// Week 3 and Week 4. Failed scalar axes inherit the earned Week-3 standard while
// Week-4 set cost is reduced; pure skill-quality resets receive an explicit
// Week-3 retention target. Ambiguous layouts are left untouched and still fail
// closed in the normal validation chain.
export function normalizeYouthWeek4Consolidation(program, intake = {}) {
  const original = String(program || '');
  const before = youthConsolidationRetentionAnalysis(original, intake);
  if (!before.applicable || before.waived || !before.violations.length) {
    return { program: original, repaired: false, repairs: [] };
  }

  const week3 = parseWeekBlock(original, 3);
  const week4 = parseWeekBlock(original, 4);
  if (!week3 || !week4) return { program: original, repaired: false, repairs: [] };

  const repairs = [];
  for (const violation of before.violations) {
    const w3Rows = rowsForExercise(week3, violation.exercise);
    const w4Rows = rowsForExercise(week4, violation.exercise);
    if (w3Rows.length !== 1 || w4Rows.length !== 1) continue;

    const w3 = w3Rows[0].cells;
    const w4 = w4Rows[0].cells;
    const axes = new Set((violation.scalar_retention_failures || []).map((failure) => failure.axis));
    const changedAxes = [];

    if (axes.has('reps') || axes.has('duration')) {
      const source = String(w3[week3.index.reps] || '').trim();
      if (source) {
        w4[week4.index.reps] = source;
        changedAxes.push(axes.has('duration') ? 'duration' : 'reps');
      }
    }

    if (axes.has('load') || axes.has('less_assistance')) {
      const source = String(w3[week3.index.weight] || '').trim();
      if (source) {
        w4[week4.index.weight] = source;
        changedAxes.push(axes.has('less_assistance') ? 'less_assistance' : 'load');
      }
    }

    if (changedAxes.length) lowerWeek4SetCost(w3, w4, week4.index);

    if (violation.skill_quality_reset || changedAxes.length) {
      w4[week4.index.notes] = retentionNote(w4[week4.index.notes], violation.exercise);
    }

    if (violation.skill_quality_reset || changedAxes.length) {
      repairs.push({ exercise: violation.exercise, axes: [...changedAxes, ...(violation.skill_quality_reset ? ['skill_quality'] : [])] });
    }
  }

  if (!repairs.length) return { program: original, repaired: false, repairs: [] };

  const inner = [week4.header.join('\t'), ...week4.rows.map((row) => row.cells.join('\t'))].join('\n');
  const candidate = original.replace(week4.re, week4.match[1] + inner + week4.match[3]);
  const after = youthConsolidationRetentionAnalysis(candidate, intake);

  // Deterministic repair must be monotonic with respect to the validator it owns.
  // If it did not remove at least one identified reset, keep the original and let
  // the bounded AI repair loop/fail-closed path handle the candidate.
  if (after.violations.length >= before.violations.length) {
    return { program: original, repaired: false, repairs: [] };
  }

  return {
    program: candidate,
    repaired: true,
    repairs,
    before_violations: before.violations.length,
    after_violations: after.violations.length,
  };
}
