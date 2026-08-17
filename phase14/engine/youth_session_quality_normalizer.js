function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function age(intake = {}) {
  const n = Number(intake.age || intake.age_years || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function goalText(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals)].map(String).join(' | ');
}
function evidenceText(intake = {}) {
  return [intake.current_numbers, intake.performance_markers, intake.clarification_answers, intake.notes].map(txt).join(' | ');
}
function hasBarAndBands(intake = {}) {
  const equipment = txt(intake.equipment).toLowerCase();
  return /pull[- ]?up bar|\bbar\b/.test(equipment) && /band/.test(equipment);
}
function warmup(name) { return /^\s*\[WARMUP\](?:\s|$)/i.test(String(name || '')); }
function barSkill(name) { return /bar muscle[- ]?up|muscle[- ]?up transition/i.test(String(name || '')); }
function kickup(name) { return /controlled handstand kick[- ]?up|freestanding handstand/i.test(String(name || '')); }
function handstandHold(name) { return /handstand/i.test(String(name || '')) && /hold/i.test(String(name || '')); }
function explicitWallHold(name) { return /wall/i.test(String(name || '')) && handstandHold(name); }
function mislabeledTransition(cells, index) {
  const exercise = String(cells[index.exercise] || '');
  const notes = String(cells[index.notes] || '');
  const load = String(cells[index.weight] || '');
  if (barSkill(exercise)) return false;
  if (!/pull[- ]?up/i.test(exercise)) return false;
  if (!/bar muscle[- ]?up.*(?:transition|turnover)|(?:transition|turnover).*bar muscle[- ]?up/i.test(notes)) return false;
  return /band|assist|bodyweight|\bbw\b/i.test(`${load} ${notes}`);
}

function parseWeekBlock(program, weekNumber) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (!lines.length) return null;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  for (const required of ['day', 'exercise', 'weight', 'sets', 'reps', 'rest', 'notes']) {
    if (!Number.isInteger(index[required])) return null;
  }
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return { re, match, header, index, rows };
}

function makeRow(headerLength, index, day, spec) {
  const cells = Array(headerLength).fill('');
  cells[index.day] = day;
  cells[index.exercise] = spec.exercise;
  cells[index.weight] = spec.weight;
  cells[index.sets] = spec.sets;
  cells[index.reps] = spec.reps;
  cells[index.rest] = spec.rest;
  if (Number.isInteger(index['target rpe'])) cells[index['target rpe']] = spec.effort;
  cells[index.notes] = spec.notes;
  if (Number.isInteger(index.results)) cells[index.results] = '';
  return cells;
}

function transitionSpec(week) {
  const weight = [
    'BW + moderate band',
    'BW + slightly lighter band if every rep stays fast and symmetrical',
    'BW + lightest band that preserves a clean symmetrical turnover',
    'BW + retain the lightest clean Week 3 band',
  ][Math.max(0, Math.min(3, week - 1))];
  return {
    exercise: 'Bar Muscle-up Transition Drill', weight,
    sets: week === 4 ? '2' : '3', reps: '2', rest: '90s', effort: '5-6',
    notes: week === 4
      ? 'Direct bar-specific turnover practice. Retain the best clean Week 3 assistance and technique with lower total volume; no failed reps.'
      : 'Direct bar-specific turnover practice for first bar muscle-up acquisition. Reduce assistance only after fast symmetrical reps; stop before failed turnover attempts.',
  };
}
function kickupSpec(week) {
  return {
    exercise: 'Controlled Handstand Kick-up', weight: 'BW',
    sets: week === 4 ? '3' : '4', reps: '1-2 attempts', rest: '60s', effort: '5',
    notes: week === 4
      ? 'Fresh independent-balance practice. Retain the best clean Week 3 entry and balance quality with fewer attempts; stop before misses accumulate.'
      : 'Fresh independent-balance practice. Progress successful entries and clean unsupported balance quality rather than fatigue or repeated failed attempts.',
  };
}

function activeDayNames(rows, index) {
  const out = [];
  for (const cells of rows) {
    const day = String(cells[index.day] || '').trim();
    const exercise = String(cells[index.exercise] || '').trim();
    if (!day || !exercise || warmup(exercise)) continue;
    if (!out.includes(day)) out.push(day);
  }
  return out;
}
function rowIndexesForDay(rows, index, day) {
  const out = [];
  rows.forEach((cells, i) => { if (String(cells[index.day] || '').trim() === day) out.push(i); });
  return out;
}
function insertSkillRow(rows, headerLength, index, day, spec) {
  const dayIndexes = rowIndexesForDay(rows, index, day);
  if (!dayIndexes.length) return false;
  let at = dayIndexes[0];
  while (at <= dayIndexes[dayIndexes.length - 1]) {
    const exercise = String(rows[at]?.[index.exercise] || '');
    if (warmup(exercise) || kickup(exercise) || barSkill(exercise)) at += 1;
    else break;
  }
  rows.splice(at, 0, makeRow(headerLength, index, day, spec));
  return true;
}

export function normalizeYouthSessionQuality(program, intake = {}) {
  const athleteAge = age(intake);
  if (!(athleteAge != null && athleteAge < 18)) return { program: String(program || ''), repaired: false, repairs: [] };

  const goals = goalText(intake);
  const evidence = evidenceText(intake);
  const barAcquisition = /(?:first\s+)?bar muscle[- ]?up/i.test(goals) && (/\bfirst\b/i.test(goals) || /cannot perform[^.]{0,40}bar muscle[- ]?up|no (?:clean )?bar muscle[- ]?up/i.test(evidence));
  const handstandAcquisition = /freestanding handstand|handstand balance|unsupported handstand/i.test(goals) && /no reliable unsupported balance|no reliable.*freestanding|cannot.*freestanding|wall[- ]?facing handstand|back[- ]?to[- ]?wall/i.test(evidence);
  if (!barAcquisition && !handstandAcquisition) return { program: String(program || ''), repaired: false, repairs: [] };

  let candidate = String(program || '');
  const repairs = [];

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeekBlock(candidate, week);
    if (!parsed) continue;
    const { header, index, rows, match, re } = parsed;

    // Correct internally contradictory rows: Notes may reveal a mislabeled model
    // row, but the corrected Exercise cell is what creates semantic identity.
    for (const cells of rows) {
      if (!mislabeledTransition(cells, index)) continue;
      const day = String(cells[index.day] || '').trim();
      cells[index.exercise] = 'Bar Muscle-up Transition Drill';
      repairs.push({ type: 'relabel_bar_transition', week, day });
    }

    const days = activeDayNames(rows, index);
    for (const day of days) {
      let indexes = rowIndexesForDay(rows, index, day);
      let dayRows = indexes.map((i) => rows[i]);

      if (handstandAcquisition && !dayRows.some((cells) => kickup(cells[index.exercise]))) {
        if (insertSkillRow(rows, header.length, index, day, kickupSpec(week))) {
          repairs.push({ type: 'insert_independent_balance', week, day });
        }
      }

      indexes = rowIndexesForDay(rows, index, day);
      dayRows = indexes.map((i) => rows[i]);
      if (barAcquisition && hasBarAndBands(intake) && !dayRows.some((cells) => barSkill(cells[index.exercise]))) {
        if (insertSkillRow(rows, header.length, index, day, transitionSpec(week))) {
          repairs.push({ type: 'insert_bar_transition', week, day });
        }
      }

      // One direct transition drill per Youth acquisition session is enough.
      // Extra duplicate transition rows add fatigue without a distinct purpose.
      indexes = rowIndexesForDay(rows, index, day);
      const transitionIndexes = indexes.filter((i) => barSkill(rows[i][index.exercise]));
      for (const duplicateIndex of transitionIndexes.slice(1).sort((a, b) => b - a)) {
        rows.splice(duplicateIndex, 1);
        repairs.push({ type: 'remove_duplicate_bar_transition', week, day });
      }

      // If an explicit wall-supported capacity row exists, a second generic
      // Handstand Hold in the same session is redundant rather than a new skill.
      indexes = rowIndexesForDay(rows, index, day);
      const holdIndexes = indexes.filter((i) => handstandHold(rows[i][index.exercise]));
      const explicitWall = holdIndexes.filter((i) => explicitWallHold(rows[i][index.exercise]));
      if (holdIndexes.length > 1 && explicitWall.length) {
        const keep = explicitWall[0];
        for (const duplicateIndex of holdIndexes.filter((i) => i !== keep).sort((a, b) => b - a)) {
          rows.splice(duplicateIndex, 1);
          repairs.push({ type: 'remove_redundant_handstand_hold', week, day });
        }
      }
    }

    const inner = [header.join('\t'), ...rows.map((cells) => cells.join('\t'))].join('\n');
    candidate = candidate.replace(re, match[1] + inner + match[3]);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
