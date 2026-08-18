function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goalText(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function isTacticalIntake(intake = {}) {
  const ctx = `${goalText(intake)} ${txt(intake.notes)} ${txt(intake.sport)}`;
  return /\b(?:tactical|military|special[- ]?operations|selection prep|combat[- ]?ready|operator)\b/i.test(ctx);
}
function hasPullGoal(intake = {}) {
  return /\b(?:strict\s+)?pull[- ]?ups?\b/i.test(goalText(intake));
}
function benchmark(intake = {}) {
  const source = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;
  const m = source.match(/weighted\s+(?:pull|chin)[- ]?up[^\n|]{0,40}?\+\s*(\d+(?:\.\d+)?)\s*kg\s*(?:x|×)\s*(\d{1,2})\b/i);
  if (!m) return null;
  const load = Number(m[1]);
  const reps = Number(m[2]);
  return Number.isFinite(load) && load > 0 && Number.isFinite(reps) && reps > 1 ? { load, reps } : null;
}
function roundDown2p5(n) { return Math.max(2.5, Math.floor((Number(n) + 1e-9) / 2.5) * 2.5); }
function plusKg(raw = '') {
  const m = String(raw || '').match(/\+\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function firstNum(raw = '') {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function repUpper(raw = '') {
  const nums = [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}
function parseWeek(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const required = ['day','exercise'];
  if (required.some((k) => !Number.isInteger(idx[k]))) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  return {
    re, match, header, idx, rows,
    day: idx.day,
    exercise: idx.exercise,
    load: col('weight','load / target','load/target'),
    sets: idx.sets,
    reps: col('reps','reps / duration','reps/duration'),
    rest: idx.rest,
    effort: col('target rpe','effort'),
    notes: col('notes','coaching note'),
  };
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function isWeighted(name) { return /^\s*Weighted\s+(?:Pull|Chin)-?up\s*$/i.test(String(name || '')); }
function isGenericPull(name) { return /^\s*(?:Pull-up|Chin-up)\s*$/i.test(String(name || '')); }
function heavyStrength(name) { return /^\s*(?:Back Squat|Deadlift|Overhead Press)\s*$/i.test(String(name || '')); }
function safeDose(bm) {
  return {
    load: roundDown2p5(bm.load * 0.75),
    sets: 3,
    reps: Math.max(2, Math.min(4, bm.reps - 1)),
  };
}
function setCell(cells, idx, value) { if (Number.isInteger(idx)) cells[idx] = String(value); }

export function normalizeTacticalWeightedPullExposure(program, intake = {}) {
  const original = String(program || '');
  const bm = benchmark(intake);
  if (!isTacticalIntake(intake) || !hasPullGoal(intake) || !bm) return { program: original, repaired: false, repairs: [] };

  let candidate = original;
  const repairs = [];
  const target = safeDose(bm);

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.load) || !Number.isInteger(parsed.sets) || !Number.isInteger(parsed.reps)) continue;

    const weighted = [];
    parsed.rows.forEach((cells, i) => {
      const name = cells[parsed.exercise] || '';
      if (!isWarmup(name) && isWeighted(name)) weighted.push({ cells, i });
    });

    if (weighted.length) {
      for (const row of weighted) {
        const load = plusKg(row.cells[parsed.load]);
        const sets = firstNum(row.cells[parsed.sets]);
        const reps = repUpper(row.cells[parsed.reps]);
        const tooClose = Number.isFinite(load) && Number.isFinite(sets) && Number.isFinite(reps) && sets >= 2 && reps >= bm.reps && load > bm.load * 0.85;
        const ambiguous = !Number.isFinite(load) || load <= 0;
        if (!tooClose && !ambiguous) continue;
        setCell(row.cells, parsed.load, `+${target.load} kg`);
        setCell(row.cells, parsed.sets, target.sets);
        setCell(row.cells, parsed.reps, target.reps);
        if (Number.isInteger(parsed.effort)) row.cells[parsed.effort] = '7-8';
        if (Number.isInteger(parsed.notes)) {
          const note = String(row.cells[parsed.notes] || '').trim();
          const cue = `Submaximal weighted pulling anchored below the demonstrated +${bm.load} kg x ${bm.reps} benchmark; keep every rep strict.`;
          row.cells[parsed.notes] = note ? `${note} ${cue}` : cue;
        }
        repairs.push({ type: 'reduce_or_anchor_weighted_pull', week, row: row.i, load_kg: target.load, sets: target.sets, reps: target.reps });
      }
    } else {
      let anchorIndex = parsed.rows.findIndex((cells) => !isWarmup(cells[parsed.exercise]) && heavyStrength(cells[parsed.exercise]));
      if (anchorIndex < 0) continue;
      const day = String(parsed.rows[anchorIndex][parsed.day] || '').trim();

      // Prefer converting an ambiguous same-day generic pull row instead of adding volume.
      const convertible = parsed.rows.findIndex((cells) => {
        if (String(cells[parsed.day] || '').trim() !== day) return false;
        if (!isGenericPull(cells[parsed.exercise])) return false;
        const loadText = Number.isInteger(parsed.load) ? String(cells[parsed.load] || '') : '';
        return /rpe[- ]?selected|load|weighted|\+/i.test(loadText) && !/bodyweight|\bbw\b/i.test(loadText);
      });

      if (convertible >= 0) {
        const cells = parsed.rows[convertible];
        cells[parsed.exercise] = 'Weighted Pull-up';
        setCell(cells, parsed.load, `+${target.load} kg`);
        setCell(cells, parsed.sets, target.sets);
        setCell(cells, parsed.reps, target.reps);
        if (Number.isInteger(parsed.effort)) cells[parsed.effort] = '7-8';
        if (Number.isInteger(parsed.notes)) cells[parsed.notes] = `Submaximal weighted support anchored below the demonstrated +${bm.load} kg x ${bm.reps} benchmark; full hang, strict reps, no grind.`;
        repairs.push({ type: 'convert_ambiguous_weighted_pull', week, row: convertible, day, load_kg: target.load, sets: target.sets, reps: target.reps });
      } else {
        const cells = new Array(parsed.header.length).fill('');
        cells[parsed.day] = day;
        cells[parsed.exercise] = 'Weighted Pull-up';
        setCell(cells, parsed.load, `+${target.load} kg`);
        setCell(cells, parsed.sets, target.sets);
        setCell(cells, parsed.reps, target.reps);
        if (Number.isInteger(parsed.rest)) cells[parsed.rest] = '2-3 min';
        if (Number.isInteger(parsed.effort)) cells[parsed.effort] = '7-8';
        if (Number.isInteger(parsed.notes)) cells[parsed.notes] = `Submaximal weighted support anchored below the demonstrated +${bm.load} kg x ${bm.reps} benchmark; preserve separate strict bodyweight pull-up volume.`;
        parsed.rows.splice(anchorIndex + 1, 0, cells);
        repairs.push({ type: 'insert_weighted_pull_floor', week, day, load_kg: target.load, sets: target.sets, reps: target.reps });
      }
    }

    if (repairs.some((r) => r.week === week)) {
      const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
      candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
    }
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
