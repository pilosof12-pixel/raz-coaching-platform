import { directGoalExposures, parseProgramModel } from './program_model.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function text(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function athleteAge(intake = {}) {
  const n = Number(intake.age || intake.age_years || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function goalText(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals)].map(String).join(' | ');
}

function intakeEvidence(intake = {}) {
  return [
    intake.current_numbers,
    intake.performance_markers,
    intake.clarification_answers,
    intake.notes,
  ].map(text).join(' | ');
}

function hasBarAndBands(intake = {}) {
  const equipment = text(intake.equipment).toLowerCase();
  return /pull[- ]?up bar|bar/.test(equipment) && /band/.test(equipment);
}

function isWarmupName(name) {
  return /^\s*\[WARMUP\](?:\s|$)/i.test(String(name || ''));
}

function isYouthPrimarySkillName(name) {
  return /bar muscle[- ]?up|muscle[- ]?up transition|controlled handstand kick[- ]?up|freestanding handstand|handstand balance|wall handstand/i.test(String(name || ''));
}

function hasWallStaticExposure(model, weekNumber) {
  const week = model?.weeks?.find((w) => w.week === weekNumber);
  if (!week) return false;
  return week.days.some((day) => day.exercises.some((exercise) => {
    if (exercise?.role === 'warm_up' || exercise?.modality === 'warm_up') return false;
    const name = String(exercise?.display_name || '').toLowerCase();
    if (!/handstand/.test(name) || !/wall/.test(name)) return false;
    const dose = String(exercise?.dose?.duration || exercise?.dose?.reps_raw || '').toLowerCase();
    return /hold|isometric/.test(name) || /\b\d+(?:\.\d+)?\s*(?:sec|secs|second|seconds|min|mins|minute|minutes)\b/.test(dose);
  }));
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

function makeRow(headerLength, index, day, { exercise, weight, sets, reps, rest, effort, notes }) {
  const cells = Array(headerLength).fill('');
  cells[index.day] = day;
  cells[index.exercise] = exercise;
  if (Number.isInteger(index.weight)) cells[index.weight] = weight;
  if (Number.isInteger(index.sets)) cells[index.sets] = sets;
  if (Number.isInteger(index.reps)) cells[index.reps] = reps;
  if (Number.isInteger(index.rest)) cells[index.rest] = rest;
  if (Number.isInteger(index['target rpe'])) cells[index['target rpe']] = effort;
  if (Number.isInteger(index.notes)) cells[index.notes] = notes;
  if (Number.isInteger(index.results)) cells[index.results] = '';
  return cells;
}

function insertYouthRows(program, weekNumber, specs) {
  if (!specs.length) return { program, inserted: [] };
  const parsed = parseWeekBlock(program, weekNumber);
  if (!parsed) return { program, inserted: [] };
  const { match, header, index, rows } = parsed;

  const active = rows
    .map((cells, i) => ({ cells, i, day: String(cells[index.day] || '').trim(), exercise: String(cells[index.exercise] || '').trim() }))
    .filter((row) => row.day && row.exercise && !isWarmupName(row.exercise));
  if (!active.length) return { program, inserted: [] };
  const targetDay = active[0].day;
  const dayRows = rows
    .map((cells, i) => ({ cells, i, day: String(cells[index.day] || '').trim(), exercise: String(cells[index.exercise] || '').trim() }))
    .filter((row) => row.day === targetDay);
  if (!dayRows.length) return { program, inserted: [] };

  let insertionIndex = dayRows[0].i;
  for (const row of dayRows) {
    if (row.i < insertionIndex) continue;
    if (isWarmupName(row.exercise) || isYouthPrimarySkillName(row.exercise)) insertionIndex = row.i + 1;
    else break;
  }

  const inserted = specs.map((spec) => makeRow(header.length, index, targetDay, spec));
  rows.splice(insertionIndex, 0, ...inserted);
  const inner = [header.join('\t'), ...rows.map((cells) => cells.join('\t'))].join('\n');
  const candidate = String(program || '').replace(parsed.re, match[1] + inner + match[3]);
  return { program: candidate, inserted: specs.map((spec) => ({ week: weekNumber, day: targetDay, exercise: spec.exercise })) };
}

function barTransitionSpec(week) {
  const weight = [
    'BW + moderate band',
    'BW + slightly lighter band if every rep stays fast and symmetrical',
    'BW + lightest band that preserves a clean symmetrical turnover',
    'BW + retain the lightest clean Week 3 band',
  ][Math.max(0, Math.min(3, week - 1))];
  const sets = week === 4 ? '2' : '3';
  return {
    exercise: 'Bar Muscle-up Transition Drill',
    weight,
    sets,
    reps: '2',
    rest: '90s',
    effort: '5-6',
    notes: week === 4
      ? 'Direct bar-specific turnover practice. Consolidate the best clean Week 3 assistance and technique with less total volume; no failed reps.'
      : 'Direct bar-specific turnover practice for first bar muscle-up acquisition. Reduce assistance only after fast symmetrical reps; stop before failed turnover attempts.',
  };
}

function kickupSpec(week) {
  const sets = ['3', '4', '4', '3'][Math.max(0, Math.min(3, week - 1))];
  return {
    exercise: 'Controlled Handstand Kick-up',
    weight: 'BW',
    sets,
    reps: '1-2 attempts',
    rest: '60s',
    effort: '5',
    notes: week === 4
      ? 'Fresh independent-balance practice. Match the best clean Week 3 entry and balance quality with fewer attempts; stop before misses accumulate.'
      : 'Fresh independent-balance practice. Progress successful entries and clean unsupported balance quality rather than fatigue or repeated failed attempts.',
  };
}

function wallHoldSpec(week) {
  const reps = ['15-20 sec', '20-25 sec', '20-30 sec', '20-25 sec'][Math.max(0, Math.min(3, week - 1))];
  return {
    exercise: 'Wall Handstand Hold',
    weight: 'BW',
    sets: week === 4 ? '2' : '3',
    reps,
    rest: '60-90s',
    effort: '5-6',
    notes: week === 4
      ? 'Wall-supported line and shoulder-capacity consolidation. Retain the best Week 3 body-line standard with lower volume.'
      : 'Substantive wall-supported position capacity for line, confidence and shoulder endurance. Keep ribs/pelvis controlled and stop well before fatigue failure.',
  };
}

// Narrow deterministic repair for a very specific acquisition state. It does not
// invent a new goal or regress an achieved skill. It only restores source-authored
// components when the intake explicitly says the youth athlete is still acquiring
// the first bar muscle-up / freestanding handstand and the generated candidate
// omitted the corresponding canonical direct/component row.
export function normalizeYouthAcquisitionGoalFloors(program, intake = {}) {
  const age = athleteAge(intake);
  if (!(age != null && age < 18)) return { program: String(program || ''), repaired: false, repairs: [] };

  const goals = goalText(intake);
  const evidence = intakeEvidence(intake);
  const barGoal = /(?:first\s+)?bar muscle[- ]?up/i.test(goals);
  const handstandGoal = /freestanding handstand|handstand balance|unsupported handstand/i.test(goals);
  const barAcquisition = barGoal && (/\bfirst\b/i.test(goals) || /cannot perform[^.]{0,40}bar muscle[- ]?up|no (?:clean )?bar muscle[- ]?up/i.test(evidence));
  const handstandAcquisition = handstandGoal && (/no reliable unsupported balance|no reliable.*freestanding|cannot.*freestanding|wall[- ]?facing handstand|back[- ]?to[- ]?wall/i.test(evidence));
  if (!barAcquisition && !handstandAcquisition) return { program: String(program || ''), repaired: false, repairs: [] };

  let candidate = String(program || '');
  const repairs = [];
  for (let week = 1; week <= 4; week++) {
    const model = parseProgramModel(candidate, intake);
    const specs = [];

    if (handstandAcquisition && directGoalExposures(model, 'handstand', week).length === 0) {
      specs.push(kickupSpec(week));
    }
    if (barAcquisition && hasBarAndBands(intake) && directGoalExposures(model, 'bar_muscle_up', week).length === 0) {
      specs.push(barTransitionSpec(week));
    }
    if (handstandAcquisition && !hasWallStaticExposure(model, week)) {
      specs.push(wallHoldSpec(week));
    }

    const inserted = insertYouthRows(candidate, week, specs);
    candidate = inserted.program;
    repairs.push(...inserted.inserted);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
