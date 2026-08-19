import { parseProgramModel } from './program_model.js';

function athleteAge(intake = {}) {
  const n = Number(intake.age || intake.age_years || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isPrimaryYouthSkillExercise(exercise) {
  const base = String(exercise?.base_movement || '');
  const name = String(exercise?.display_name || '');
  return ['bar_muscle_up', 'handstand'].includes(base) || /bar muscle-up|transition|hip-to-bar|handstand|kick-up/i.test(name);
}

function rewriteWeek(program, weekNumber, moves) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return program;

  const lines = match[2].split('\n');
  const originalLines = lines.slice();
  for (const move of moves) {
    const positions = move.sourceRows.slice().sort((a, b) => a - b);
    // Exercise objects come from the semantic program model, which does not carry
    // the original TSV line text — look it up by source_row from the lines this
    // function already parsed instead of a nonexistent `.raw` field.
    const reordered = [...move.skillRows, ...move.supportRows].map((row) => originalLines[row.source_row]);
    if (positions.length !== reordered.length || reordered.some((line) => line === undefined)) continue;
    positions.forEach((sourceRow, i) => {
      if (sourceRow >= 1 && sourceRow < lines.length) lines[sourceRow] = reordered[i];
    });
  }

  return String(program || '').replace(re, match[1] + lines.join('\n') + match[3]);
}

// Deterministic ordering repair only. It never changes exercise identity, dose,
// notes, day labels, or weekly volume. For youth sessions containing primary
// gymnastics skills, existing skill rows are moved ahead of existing support
// rows while warm-up rows remain in their original positions.
export function normalizeYouthPrimarySkillOrder(program, intake = {}) {
  const age = athleteAge(intake);
  if (!(age != null && age < 18)) return { program: String(program || ''), reordered: false, moves: [] };

  const model = parseProgramModel(program, intake);
  const moves = [];
  let candidate = String(program || '');

  for (const week of model.weeks || []) {
    const weekMoves = [];
    for (const day of week.days || []) {
      const work = (day.exercises || [])
        .filter((exercise) => exercise?.role !== 'warm_up' && exercise?.modality !== 'warm_up')
        .slice()
        .sort((a, b) => Number(a.source_row) - Number(b.source_row));
      const skillRows = work.filter(isPrimaryYouthSkillExercise);
      if (!skillRows.length) continue;
      const supportRows = work.filter((exercise) => !isPrimaryYouthSkillExercise(exercise));
      const alreadyFresh = work.slice(0, skillRows.length).every(isPrimaryYouthSkillExercise);
      if (alreadyFresh) continue;

      const move = {
        week: week.week,
        day: day.day,
        sourceRows: work.map((exercise) => Number(exercise.source_row)),
        skillRows,
        supportRows,
      };
      weekMoves.push(move);
      moves.push({
        week: week.week,
        day: day.day,
        moved_skills: skillRows.map((exercise) => exercise.display_name),
        preserved_support: supportRows.map((exercise) => exercise.display_name),
      });
    }
    if (weekMoves.length) candidate = rewriteWeek(candidate, week.week, weekMoves);
  }

  return { program: candidate, reordered: moves.length > 0, moves };
}
