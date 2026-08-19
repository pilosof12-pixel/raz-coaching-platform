import { normalizeDay, parseProgramModel, strengthDaysForWeek } from './program_model.js';
import { tacticalGppAnalysis } from './coaching_progression_gpp.js';

function isWarmupName(name) {
  return /^\s*\[WARMUP\](?:\s|$)/i.test(String(name || '').trim());
}

function parseWeekBlock(program, weekNumber) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (!lines.length) return null;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  if (!Number.isInteger(index.day) || !Number.isInteger(index.exercise)) return null;
  return { re, match, header, index, rows: lines.slice(1).map((line) => line.split('\t')) };
}

function makeRow(headerLength, index, day, spec) {
  const cells = Array(headerLength).fill('');
  cells[index.day] = day;
  cells[index.exercise] = spec.exercise;
  if (Number.isInteger(index.weight)) cells[index.weight] = spec.weight;
  if (Number.isInteger(index.sets)) cells[index.sets] = spec.sets;
  if (Number.isInteger(index.reps)) cells[index.reps] = spec.reps;
  if (Number.isInteger(index.rest)) cells[index.rest] = spec.rest;
  if (Number.isInteger(index['target rpe'])) cells[index['target rpe']] = spec.effort;
  if (Number.isInteger(index.notes)) cells[index.notes] = spec.notes;
  if (Number.isInteger(index.results)) cells[index.results] = '';
  return cells;
}

function supportSpec(pattern, weekNumber) {
  if (pattern === 'push') {
    return {
      exercise: 'Push-up',
      weight: 'BW',
      sets: '2',
      reps: weekNumber === 4 ? '12-15' : '15',
      rest: '60-90s',
      effort: '6',
      notes: 'Low-cost tactical pushing GPP. Leave clear reserve; this support work is trimmed before the 3K, ruck, pull-up or key strength priorities.',
    };
  }
  return {
    exercise: 'Dead Bug',
    weight: 'BW',
    sets: '2',
    reps: '8 / side',
    rest: '60s',
    effort: '5-6',
    notes: 'Low-cost trunk-control GPP. Keep it crisp and subordinate to the 3K, ruck, pull-up and key strength priorities.',
  };
}

function chooseStrengthDay(model, parsed, weekNumber) {
  const semanticDays = strengthDaysForWeek(model, weekNumber);
  if (!semanticDays.length) return null;
  const candidateDays = new Set(semanticDays.map((day) => day.day));
  const counts = new Map();
  for (const cells of parsed.rows) {
    const rawDay = String(cells[parsed.index.day] || '').trim();
    const exercise = String(cells[parsed.index.exercise] || '').trim();
    const semantic = normalizeDay(rawDay);
    if (!candidateDays.has(semantic) || !exercise || isWarmupName(exercise)) continue;
    if (!counts.has(rawDay)) counts.set(rawDay, 0);
    counts.set(rawDay, counts.get(rawDay) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

function insertSupportRows(program, weekNumber, patterns, model) {
  if (!patterns.length) return { program, inserted: [] };
  const parsed = parseWeekBlock(program, weekNumber);
  if (!parsed) return { program, inserted: [] };
  const targetDay = chooseStrengthDay(model, parsed, weekNumber);
  if (!targetDay) return { program, inserted: [] };

  let insertionIndex = -1;
  parsed.rows.forEach((cells, i) => {
    if (String(cells[parsed.index.day] || '').trim() === targetDay) insertionIndex = i + 1;
  });
  if (insertionIndex < 0) return { program, inserted: [] };

  const specs = patterns.map((pattern) => supportSpec(pattern, weekNumber));
  const cells = specs.map((spec) => makeRow(parsed.header.length, parsed.index, targetDay, spec));
  parsed.rows.splice(insertionIndex, 0, ...cells);
  const inner = [parsed.header.join('\t'), ...parsed.rows.map((row) => row.join('\t'))].join('\n');
  return {
    program: String(program || '').replace(parsed.re, parsed.match[1] + inner + parsed.match[3]),
    inserted: specs.map((spec) => ({ week: weekNumber, day: targetDay, exercise: spec.exercise })),
  };
}

// The validator already defines a deliberately small tactical GPP floor. When a
// generated candidate has adequate strength architecture but omits only that
// floor, restore the canonical two-set support dose deterministically instead of
// spending four model calls asking for the same tiny addition. Over-budget GPP is
// never auto-repaired here; it remains a coaching/trim decision for the repair
// loop and the fail-closed validators.
export function normalizeTacticalGppFloor(program, intake = {}) {
  let candidate = String(program || '');
  const repairs = [];

  for (let week = 1; week <= 4; week++) {
    const model = parseProgramModel(candidate, intake);
    const analysis = tacticalGppAnalysis(candidate, intake, model);
    if (!analysis.applicable) return { program: candidate, repaired: repairs.length > 0, repairs };
    const row = analysis.weeks.find((item) => item.week === week);
    if (!row || row.over_budget || !row.missing?.length) continue;

    const safeMissing = row.missing.filter((pattern) => pattern === 'push' || pattern === 'core');
    const inserted = insertSupportRows(candidate, week, safeMissing, model);
    candidate = inserted.program;
    repairs.push(...inserted.inserted);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
