import { parseProgramModel } from './program_model.js';
import { auditProgramStructure } from './v38_structural_audit.js';
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

function removeWeekRow(program, weekNumber, sourceRow) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return program;
  const lines = match[2].split('\n');
  if (sourceRow < 1 || sourceRow >= lines.length) return program;
  lines.splice(sourceRow, 1);
  return String(program || '').replace(re, match[1] + lines.join('\n') + match[3]);
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

// A week built entirely from two-set accessories has nothing left to trim: the
// floor above refuses to cut below two sets, and the only rows carrying more are
// the primary and direct-goal exposures this repair must never touch. That was a
// dead end -- zero legal moves, an unrepairable hard failure, and four
// regeneration attempts spent producing the same shape again.
//
// The coach's cut order answers it: cut optional accessories first, then
// redundant hypertrophy, then secondary support. So when no set can be trimmed,
// remove the lowest-priority support row outright. A session may never drop below
// three work exercises, because a two-exercise session is itself a hard
// structural violation -- trading one for the other repairs nothing.
const MIN_WORK_EXERCISES_PER_SESSION = 3;

function removableRows(program, intake, err) {
  const model = parseProgramModel(program, intake);
  const offenders = overKeys(err);
  const rows = [];

  for (const week of model.weeks || []) {
    for (const day of week.days || []) {
      const work = (day.exercises || []).filter((e) => e?.role !== 'warm_up' && e?.modality !== 'warm_up');
      if (work.length <= MIN_WORK_EXERCISES_PER_SESSION) continue;
      for (const exercise of work) {
        if (exercise?.direct_goal_exposure) continue;
        if (['running', 'ruck', 'sport', 'recovery', 'skill'].includes(exercise?.modality)) continue;
        const pattern = movementPatternForExercise(exercise);
        if (!pattern || !offenders.has(`${week.week}:${pattern}`)) continue;
        rows.push({
          week: week.week,
          day: day.day,
          sourceRow: Number(exercise.source_row),
          exercise: exercise.display_name,
          pattern,
          sets: Number(exercise?.dose?.sets || 0),
          priority: candidatePriority(exercise),
        });
      }
    }
  }

  rows.sort((a, b) => a.priority - b.priority || a.sets - b.sets || a.week - b.week || a.sourceRow - b.sourceRow);
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
  const original = String(program || '');
  const maxReductions = Math.max(1, Number(options.maxReductions || 48));
  const maxRemovals = Math.max(0, Number(options.maxRemovals ?? 8));
  let candidate = original;
  const reductions = [];
  let removals = 0;

  // A repair that does not clear the gate buys nothing: the program still fails,
  // still regenerates, and has lost coaching content on the way out. So the
  // result is all-or-nothing -- either this returns a program that genuinely
  // passes and is no worse structurally, or it returns the original untouched
  // and leaves the decision to regeneration.
  const giveUp = (unresolved) => ({ program: original, repaired: false, reductions, unresolved });

  for (let step = 0; step < maxReductions; step++) {
    const failure = currentMrvFailure(candidate, intake);
    if (!failure) break;

    const rows = reducibleRows(candidate, intake, failure);
    if (rows.length) {
      const row = rows[0];
      const nextSets = row.sets - 1;
      candidate = rewriteWeekSets(candidate, row.week, row.sourceRow, nextSets);
      reductions.push({ ...row, action: 'trim', from_sets: row.sets, to_sets: nextSets });
      continue;
    }

    // Nothing left to trim: fall back to the coach's cut order and drop the
    // lowest-priority support row. Bounded, because a program needing more than
    // a handful of deletions is structurally wrong rather than merely over
    // budget, and regeneration is the honest answer to that.
    if (removals >= maxRemovals) return giveUp(failure);
    const removable = removableRows(candidate, intake, failure);
    if (!removable.length) return giveUp(failure);
    const drop = removable[0];
    candidate = removeWeekRow(candidate, drop.week, drop.sourceRow);
    reductions.push({ ...drop, action: 'remove', from_sets: drop.sets, to_sets: 0 });
    removals += 1;
  }

  const unresolved = currentMrvFailure(candidate, intake);
  if (unresolved) return giveUp(unresolved);
  if (!reductions.length) return { program: original, repaired: false, reductions };

  // Trading an over-volume week for a hollowed-out session repairs nothing. If
  // the trim introduced any structural failure the original did not have, it is
  // not an improvement and is discarded.
  const before = auditProgramStructure(original, intake).filter((f) => f.severity === 'hard').length;
  const after = auditProgramStructure(candidate, intake).filter((f) => f.severity === 'hard').length;
  if (after > before) {
    return { program: original, repaired: false, reductions, unresolved: null, rejected: 'introduced_structural_failure' };
  }

  return { program: candidate, repaired: true, reductions };
}
