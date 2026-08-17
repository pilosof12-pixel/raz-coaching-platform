function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function goals(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}

function transformWeekBlocks(program, transformRows) {
  const lines = String(program || '').split('\n');
  const out = [];
  let inWeek = false;
  let header = null;
  let rows = [];
  let delimiter = '\t';

  const flush = () => {
    if (!header) return;
    out.push(header);
    for (const row of transformRows(rows, delimiter)) out.push(row);
    header = null;
    rows = [];
  };

  for (const line of lines) {
    if (/^START_WEEK\d+_TSV\s*$/.test(line)) {
      inWeek = true;
      out.push(line);
      continue;
    }
    if (/^END_WEEK\d+_TSV\s*$/.test(line)) {
      flush();
      inWeek = false;
      out.push(line);
      continue;
    }
    if (!inWeek) {
      out.push(line);
      continue;
    }
    if (!header && line.trim()) {
      header = line;
      delimiter = line.includes('\t') ? '\t' : ',';
      continue;
    }
    if (header) rows.push(line);
  }
  flush();
  return out.join('\n');
}

export function repairYouthPrimarySkillOrder(program, intake = {}) {
  const age = Number(intake.age || intake.age_years || 0);
  if (!(Number.isFinite(age) && age > 0 && age < 18)) return String(program || '');
  if (!/bar muscle-up|freestanding handstand|handstand/i.test(goals(intake))) return String(program || '');

  return transformWeekBlocks(program, (rows, delimiter) => {
    const parsed = rows.map((line, index) => ({ line, index, cells: line.split(delimiter) }));
    const byDay = [];
    let group = [];
    let currentDay = null;
    const pushGroup = () => { if (group.length) byDay.push(group); group = []; };
    for (const row of parsed) {
      if (!row.line.trim()) { pushGroup(); byDay.push([row]); currentDay = null; continue; }
      const day = String(row.cells[0] || '');
      if (currentDay !== null && day !== currentDay) pushGroup();
      currentDay = day;
      group.push(row);
    }
    pushGroup();

    const repaired = [];
    for (const dayRows of byDay) {
      if (dayRows.length === 1 && !dayRows[0].line.trim()) { repaired.push(dayRows[0].line); continue; }
      const warmups = [];
      const skills = [];
      const support = [];
      for (const row of dayRows) {
        const ex = String(row.cells[1] || '');
        if (/^\s*\[WARMUP\]/i.test(ex)) warmups.push(row);
        else if (/bar muscle-up|transition|hip-to-bar|handstand|kick-up/i.test(ex)) skills.push(row);
        else support.push(row);
      }
      repaired.push(...warmups, ...skills, ...support);
    }
    return repaired.map((row) => typeof row === 'string' ? row : row.line);
  });
}

export function repairHybridMarathonEventAnchor(program, intake = {}) {
  const goalText = goals(intake);
  if (!/\bmarathon\b/i.test(goalText)) return String(program || '');

  return transformWeekBlocks(program, (rows, delimiter) => {
    const parsed = rows.map((line) => ({ line, cells: line.split(delimiter) }));
    if (!parsed.length) return rows;
    const header = String(arguments?.[2] || '');
    // Production TSV schema is stable: Day, Exercise, Weight, Sets, Reps, Rest, Target RPE, Notes, Results.
    const EX = 1, WEIGHT = 2, REPS = 4, NOTES = 7;
    const runRows = parsed.filter((row) => /^\s*Run\s*$/i.test(String(row.cells[EX] || '')));
    const alreadyAnchored = runRows.some((row) => {
      const text = `${row.cells[WEIGHT] || ''} ${row.cells[REPS] || ''} ${row.cells[NOTES] || ''}`;
      return (/\blong(?:[- ]run)?\b|long aerobic|endurance run/i.test(text) && /\b\d+(?:\.\d+)?\s*(?:km|miles?|min|minutes?|hours?|hrs?)\b/i.test(text));
    });
    if (alreadyAnchored) return rows;

    const measurable = runRows.find((row) => {
      const text = `${row.cells[WEIGHT] || ''} ${row.cells[REPS] || ''} ${row.cells[NOTES] || ''}`;
      return /\b\d+(?:\.\d+)?\s*(?:km|miles?|min|minutes?|hours?|hrs?)\b/i.test(text);
    });
    if (!measurable) return rows;

    const prior = String(measurable.cells[NOTES] || '').trim();
    measurable.cells[NOTES] = `${prior}${prior ? ' ' : ''}Long aerobic run; marathon progression anchor.`;
    measurable.line = measurable.cells.join(delimiter);
    return parsed.map((row) => row.line);
  });
}
