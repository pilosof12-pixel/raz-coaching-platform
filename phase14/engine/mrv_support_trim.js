import { parseProgramModel } from './program_model.js';
import {
  movementPatternForExercise,
  validateWeeklyVolumeBudgetSemantic,
} from './semantic_program_qa.js';

function normalizedHeaderCell(value) {
  return String(value || '').trim().toLowerCase();
}

function rewriteWeekSets(program, weekNumber, sourceRow, nextSets) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return program;

  const lines = match[2].split('\n');
  if (!lines.length || sourceRow < 1 || sourceRow >= lines.length) return program;
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(delim).map(normalizedHeaderCell);
  const setsIndex = header.indexOf('sets');
  if (setsIndex < 0) return program;

  const cells = lines[sourceRow].split(delim);
  if (setsIndex >= cells.length) return program;
  cells[setsIndex] = String(nextSets);
  lines[sourceRow] = cells.join(delim);

  const replacement = match[1] + lines.join('\n') + match[3];
  return String(program || '').replace(re, replacement);
}

function currentMrvFailure(program, intake) {
  try {
    validateWeeklyVolumeBudgetSemantic(program, intake);
    return null;
  } catch (err) {
    if (err?.code !== 'WEEKLY_MRV_EXCEEDED') throw err;
    return err;
  }
}

function overKeys(err) {
  return new Set((err?.details?.over || []).map((item) => `${Number(item.week)}:${String(item.pattern || '')}`));
}

function candidatePriority(exercise) {
  const notes = String(exercise?.notes || '');
  const base = String(exercise?.base_movement || '');
  if (exercise?.role === 'accessory' || /\b(?:accessory|optional|finisher)\b/i.test(notes)) return 0;
  if (['row_strength', 'lunge', 'split_squat', 'carry'].includes(base)) return 1;
  if (exercise?.role === 'support') return 2;
  return 3;
}

function reducibleRows(program, intake, err) {
  const model = parseProgramModel(program, intake);
  const offenders = overKeys(err);
  const rows = [];

  for (const week of model.weeks || []) {
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        if (exercise?.role === 'warm_up' || exercise?.modality === 'warm_up') continue;
        if (exercise?.direct_goal_exposure) continue;
        if (['running', 'ruck', 'sport', 'recovery', 'skill'].includes(exercise?.modality)) continue;

        const pattern = movementPatternForExercise(exercise);
        if (!pattern || !offenders.has(`${week.week}:${pattern}`)) continue;
        const sets = Number(exercise?.dose?.sets || 0);
        if (!Number.isFinite(sets) || sets <= 2) continue;

        rows.push({
          week: week.week,
          day: day.day,
          sourceRow: Number(exercise.source_row),
          exercise: exercise.display_name,
          pattern,
          sets,
          priority: candidatePriority(exercise),
        });
      }
    }
  }

  rows.sort((a, b) => a.priority - b.priority || b.sets - a.sets || a.week - b.week || a.sourceRow - b.sourceRow);
  return rows;
}

// Deterministic, bounded repair for gross weekly over-volume. This is deliberately
// conservative: it only trims set count on non-direct strength/GPP support rows.
// It never deletes a named-goal exposure, never touches run/ruck/event work, never
// changes exercise identity/load/reps, and never reduces a retained support row
// below two sets. If those safe trims cannot restore the hard volume budget, the
// normal WEEKLY_MRV_EXCEEDED validator remains authoritative and the candidate
// still enters the grounded AI repair/fail-closed path.
export function trimExcessSupportVolume(program, intake = {}, options = {}) {
  const maxReductions = Math.max(1, Number(options.maxReductions || 48));
  let candidate = String(program || '');
  const reductions = [];

  for (let step = 0; step < maxReductions; step++) {
    const failure = currentMrvFailure(candidate, intake);
    if (!failure) {
      return { program: candidate, repaired: reductions.length > 0, reductions };
    }

    const rows = reducibleRows(candidate, intake, failure);
    if (!rows.length) {
      return { program: candidate, repaired: reductions.length > 0, reductions, unresolved: failure };
    }

    const row = rows[0];
    const nextSets = row.sets - 1;
    candidate = rewriteWeekSets(candidate, row.week, row.sourceRow, nextSets);
    reductions.push({ ...row, from_sets: row.sets, to_sets: nextSets });
  }

  const unresolved = currentMrvFailure(candidate, intake);
  return { program: candidate, repaired: reductions.length > 0, reductions, unresolved };
}
