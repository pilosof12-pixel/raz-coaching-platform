import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  if (tier === 'secondary') return arr(intake.secondary_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function lower(v) { return String(v || '').toLowerCase(); }
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function upperNum(raw) {
  const nums = [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}
function dayIndex(day) { return WEEKDAYS.indexOf(String(day || '').trim().slice(0, 3).toLowerCase()); }
function formatClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function parseDistanceMeters(raw) {
  const m = String(raw || '').match(/\b(\d{3,4})\s*m\b/i);
  if (m) return Number(m[1]);
  const km = String(raw || '').match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
  return km ? Number(km[1]) * 1000 : null;
}
function parseKm(raw) {
  const m = String(raw || '').match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
}
function replaceKm(raw, km) {
  const src = String(raw || '');
  if (!/\b\d+(?:\.\d+)?\s*km\b/i.test(src)) return `${km} km`;
  return src.replace(/\b\d+(?:\.\d+)?\s*km\b/i, `${km} km`);
}
function addCue(existing, cue, marker) {
  const note = String(existing || '').trim();
  if (marker && lower(note).includes(lower(marker))) return note;
  return note ? `${note} ${cue}` : cue;
}

function parseWeek(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const day = idx.day;
  const exercise = idx.exercise;
  const sets = idx.sets;
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![day, exercise, sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return {
    re, match, header, rows,
    day,
    exercise,
    load: col('weight', 'load / target', 'load/target'),
    sets,
    reps,
    rest: idx.rest,
    effort: col('target rpe', 'effort'),
    notes: col('notes', 'coaching note'),
  };
}
function rebuild(candidate, parsed) {
  const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
  return candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function isRunName(name) { return /^\s*(?:Run|Zone-2 Run)\s*$/i.test(String(name || '')); }
function isKeyIntervalRow(parsed, cells) {
  if (isWarmup(cells[parsed.exercise]) || !isRunName(cells[parsed.exercise])) return false;
  return (firstNum(cells[parsed.sets]) ?? 0) >= 2 && Number.isFinite(parseDistanceMeters(cells[parsed.reps]));
}
function isLowerStrengthName(name) {
  return /^\s*(?:Back Squat|Front Squat|Deadlift|Conventional Deadlift|Romanian Deadlift|Split Squat|Bulgarian Split Squat|Reverse Lunge|Forward Lunge|Walking Lunge)\s*$/i.test(String(name || ''));
}

export function normalizeAdvancedHybridSecondaryRunStability(program, intake = {}) {
  const original = String(program || '');
  const primary = lower(goals(intake, 'primary'));
  const secondary = lower(goals(intake, 'secondary'));
  if (!isHighConcurrencyHybrid(intake) || /marathon|\brun(?:ning)?\b/.test(primary) || !/marathon|\brun(?:ning)?\b/.test(secondary)) {
    return { program: original, repaired: false, repairs: [] };
  }

  const week1 = parseWeek(original, 1);
  if (!week1) return { program: original, repaired: false, repairs: [] };
  const baseline = week1.rows
    .filter((cells) => !isWarmup(cells[week1.exercise]) && isRunName(cells[week1.exercise]))
    .map((cells) => parseKm(cells[week1.reps]))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (!Number.isFinite(baseline) || baseline <= 0) return { program: original, repaired: false, repairs: [] };

  let candidate = original;
  const repairs = [];
  for (let week = 2; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = false;
    parsed.rows.forEach((cells, row) => {
      if (isWarmup(cells[parsed.exercise]) || !isRunName(cells[parsed.exercise])) return;
      const km = parseKm(cells[parsed.reps]);
      if (!Number.isFinite(km) || km <= baseline * 1.001) return;
      const before = cells[parsed.reps];
      cells[parsed.reps] = replaceKm(cells[parsed.reps], baseline);
      if (Number.isInteger(parsed.notes)) {
        cells[parsed.notes] = addCue(
          cells[parsed.notes],
          'Secondary endurance is held at the Week 1 tolerated dose so primary squat/OAP progress and MMA recovery keep the recovery budget.',
          'secondary endurance is held at the week 1 tolerated dose',
        );
      }
      repairs.push({ type: 'advanced_secondary_run_stability', week, row, before, after: cells[parsed.reps] });
      changed = true;
    });
    if (changed) candidate = rebuild(candidate, parsed);
  }
  return { program: candidate, repaired: repairs.length > 0, repairs };
}

function youthFullBarPrereqs(intake = {}) {
  const source = lower(`${txt(intake.current_numbers)} ${txt(intake.clarification_answers)} ${txt(intake.notes)}`);
  const ringMu = /ring muscle[- ]?up[^.\n|]{0,40}(?:achiev|perform|yes|can)|(?:achiev|perform|can)[^.\n|]{0,40}ring muscle[- ]?up/.test(source);
  const pull = [...source.matchAll(/(\d{1,2})\s*(?:strict\s*)?pull[- ]?ups?/g)].map((m) => Number(m[1])).find((n) => n >= 10);
  const dip = [...source.matchAll(/(\d{1,2})\s*(?:good\s*)?(?:ring\s*)?dips?/g)].map((m) => Number(m[1])).find((n) => n >= 5);
  return ringMu && Number.isFinite(pull) && Number.isFinite(dip);
}
function isHandstandEntry(name) { return /controlled handstand kick[- ]?up|freestanding handstand/i.test(String(name || '')); }
function isTransition(name) { return /^\s*Bar Muscle-up Transition Drill\s*$/i.test(String(name || '')); }
function isFullMuscleUp(name) { return /^\s*(?:Banded Muscle-up|Bar Muscle-up|Muscle-up)\s*$/i.test(String(name || '')); }
function isPowerName(name) { return /explosive hip-to-bar|box jump|broad jump|sprint/i.test(String(name || '')); }

export function normalizeYouthSkillAcquisitionQuality(program, intake = {}) {
  const original = String(program || '');
  const athleteAge = Number(intake.age || intake.age_years || 0);
  if (!(Number.isFinite(athleteAge) && athleteAge > 0 && athleteAge < 18)) {
    return { program: original, repaired: false, repairs: [] };
  }

  let candidate = original;
  const repairs = [];
  const week1 = parseWeek(candidate, 1);
  const powerBaseline = new Map();
  if (week1) {
    week1.rows.forEach((cells) => {
      const name = String(cells[week1.exercise] || '').trim();
      if (isWarmup(name) || !isPowerName(name)) return;
      powerBaseline.set(`${lower(cells[week1.day])}|${lower(name)}`, {
        sets: firstNum(cells[week1.sets]),
        reps: upperNum(cells[week1.reps]),
      });
    });
  }

  const needsFullBar = /bar muscle[- ]?up/i.test(goals(intake, 'primary')) && youthFullBarPrereqs(intake);

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = false;

    parsed.rows.forEach((cells, row) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (isWarmup(name)) return;

      if (isHandstandEntry(name)) {
        const sets = firstNum(cells[parsed.sets]);
        const reps = upperNum(cells[parsed.reps]);
        const attempts = (sets ?? 0) * (reps ?? 0);
        if (attempts > 12) {
          const before = { sets: cells[parsed.sets], reps: cells[parsed.reps], attempts };
          cells[parsed.sets] = String(Number.isFinite(sets) ? Math.max(1, Math.min(4, sets)) : 4);
          cells[parsed.reps] = String(Number.isFinite(reps) ? Math.max(1, Math.min(3, reps)) : 3);
          if (Number.isInteger(parsed.notes)) {
            cells[parsed.notes] = addCue(
              cells[parsed.notes],
              'Attempt count is a ceiling, not a quota: stay around 8-12 excellent entries and progress balance quality rather than adding attempts.',
              'attempt count is a ceiling, not a quota',
            );
          }
          repairs.push({ type: 'youth_handstand_attempt_cap', week, row, before, after: { sets: cells[parsed.sets], reps: cells[parsed.reps] } });
          changed = true;
        }
      }

      if (week > 1 && isPowerName(name)) {
        const baseline = powerBaseline.get(`${lower(cells[parsed.day])}|${lower(name)}`);
        if (!baseline) return;
        const sets = firstNum(cells[parsed.sets]);
        const reps = upperNum(cells[parsed.reps]);
        let rowChanged = false;
        const before = { sets: cells[parsed.sets], reps: cells[parsed.reps] };
        if (Number.isFinite(baseline.sets) && Number.isFinite(sets) && sets > baseline.sets) {
          cells[parsed.sets] = String(baseline.sets);
          rowChanged = true;
        }
        if (Number.isFinite(baseline.reps) && Number.isFinite(reps) && reps > baseline.reps) {
          cells[parsed.reps] = String(baseline.reps);
          rowChanged = true;
        }
        if (rowChanged) {
          if (Number.isInteger(parsed.notes)) {
            cells[parsed.notes] = addCue(
              cells[parsed.notes],
              'Progress height, speed and technical output before adding power volume; stop if output drops.',
              'progress height, speed and technical output before adding power volume',
            );
          }
          repairs.push({ type: 'youth_power_output_before_volume', week, row, exercise: name, before, after: { sets: cells[parsed.sets], reps: cells[parsed.reps] } });
          changed = true;
        }
      }
    });

    if (needsFullBar) {
      const hasFull = parsed.rows.some((cells) => !isWarmup(cells[parsed.exercise]) && isFullMuscleUp(cells[parsed.exercise]));
      if (!hasFull) {
        const transitionIndexes = parsed.rows
          .map((cells, i) => ({ cells, i }))
          .filter(({ cells }) => !isWarmup(cells[parsed.exercise]) && isTransition(cells[parsed.exercise]));
        let offset = 0;
        for (const entry of transitionIndexes) {
          const i = entry.i + offset;
          const transition = parsed.rows[i];
          const transitionSets = firstNum(transition[parsed.sets]);
          if (Number.isFinite(transitionSets) && transitionSets > 3) transition[parsed.sets] = '3';

          const cells = new Array(parsed.header.length).fill('');
          cells[parsed.day] = transition[parsed.day];
          cells[parsed.exercise] = 'Banded Muscle-up';
          if (Number.isInteger(parsed.load)) cells[parsed.load] = 'Band assistance selected for a smooth full bar turnover';
          cells[parsed.sets] = '2';
          cells[parsed.reps] = '1';
          if (Number.isInteger(parsed.rest)) cells[parsed.rest] = '90 sec';
          if (Number.isInteger(parsed.effort)) cells[parsed.effort] = '6';
          if (Number.isInteger(parsed.notes)) cells[parsed.notes] = 'Integrated assisted full-skill bar muscle-up singles after component practice. Use enough assistance for a clean catch; stop after any miss or technical deterioration.';
          parsed.rows.splice(i + 1, 0, cells);
          offset += 1;
          repairs.push({ type: 'youth_integrated_banded_bar_muscle_up', week, day: transition[parsed.day] });
          changed = true;
        }
      }
    }

    if (changed) candidate = rebuild(candidate, parsed);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}

function tacticalContext(intake = {}) {
  return lower(`${goals(intake)} ${txt(intake.notes)} ${txt(intake.sport)} ${txt(intake.injuries)}`);
}
function isTactical3KLike(intake = {}) {
  const primary = lower(goals(intake, 'primary'));
  const ctx = tacticalContext(intake);
  return /\b3\s*k(?:m)?\b/.test(primary) && /(?:tactical|military|special[- ]?operations|selection|operator|combat[- ]?ready|\bruck\b)/.test(ctx);
}
function current3kSeconds(intake = {}) {
  const source = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)} ${txt(intake.clarification_answers)}`;
  const patterns = [
    /\b3\s*k(?:m)?\b[^\d]{0,24}(\d{1,2}):(\d{2})/i,
    /(\d{1,2}):(\d{2})[^\n|]{0,24}\b3\s*k(?:m)?\b/i,
  ];
  for (const re of patterns) {
    const m = source.match(re);
    if (!m) continue;
    const sec = Number(m[1]) * 60 + Number(m[2]);
    if (Number.isFinite(sec) && sec > 0) return sec;
  }
  return null;
}
function intervalRows(parsed) {
  return parsed.rows.map((cells, row) => ({ cells, row })).filter(({ cells }) => isKeyIntervalRow(parsed, cells));
}
function priorWeekdayName(day) {
  const idx = dayIndex(day);
  return idx < 0 ? null : WEEKDAYS[(idx + 6) % 7];
}

export function normalizeTactical3KRaceSpecificity(program, intake = {}) {
  const original = String(program || '');
  if (!isTactical3KLike(intake)) return { program: original, repaired: false, repairs: [] };

  let candidate = original;
  const repairs = [];
  const snapshots = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    for (const entry of intervalRows(parsed)) snapshots.push({ week, parsed, ...entry, distance: parseDistanceMeters(entry.cells[parsed.reps]) });
  }
  const distances = snapshots.map((x) => x.distance).filter(Number.isFinite);
  const allShort = distances.length > 0 && distances.every((d) => d <= 400);
  const current = current3kSeconds(intake);

  if (allShort && Number.isFinite(current)) {
    const targets = {
      2: { distance: 600, sets: 4, low: current * (600 / 3000) * 0.98, high: current * (600 / 3000) * 1.00 },
      3: { distance: 800, sets: 4, low: current * (800 / 3000) * 0.96, high: current * (800 / 3000) * 0.99 },
    };
    for (const week of [2, 3]) {
      const parsed = parseWeek(candidate, week);
      if (!parsed) continue;
      const rows = intervalRows(parsed);
      if (!rows.length) continue;
      const { cells, row } = rows[0];
      const t = targets[week];
      const before = { load: Number.isInteger(parsed.load) ? cells[parsed.load] : null, sets: cells[parsed.sets], reps: cells[parsed.reps] };
      cells[parsed.sets] = String(t.sets);
      cells[parsed.reps] = `${t.distance} m`;
      if (Number.isInteger(parsed.load)) cells[parsed.load] = `${t.distance} m @ ${formatClock(t.low)}-${formatClock(t.high)}`;
      if (Number.isInteger(parsed.rest)) cells[parsed.rest] = week === 2 ? '2:30' : '2:30-3:00';
      if (Number.isInteger(parsed.effort)) cells[parsed.effort] = week === 2 ? '8' : '8-8.5';
      if (Number.isInteger(parsed.notes)) {
        cells[parsed.notes] = `Primary 3K race-specific sustained repetitions anchored to current ${formatClock(current)} 3K capacity, not goal pace. Keep the final rep as controlled as the first.`;
      }
      repairs.push({ type: 'tactical_3k_longer_race_specific_reps', week, row, before, after: { load: Number.isInteger(parsed.load) ? cells[parsed.load] : null, sets: cells[parsed.sets], reps: cells[parsed.reps] } });
      candidate = rebuild(candidate, parsed);
    }
  }

  // T3K-05 convergence: when a key interval session follows lower-body strength by
  // one day, retain the movement but make the preceding dose unmistakably low-volume
  // maintenance. This preserves strength without asking the key 3K session to absorb
  // avoidable residual fatigue.
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const keyDays = [...new Set(intervalRows(parsed).map(({ cells }) => String(cells[parsed.day] || '').trim()))];
    let changed = false;
    for (const keyDay of keyDays) {
      const prev = priorWeekdayName(keyDay);
      if (!prev) continue;
      parsed.rows.forEach((cells, row) => {
        if (String(cells[parsed.day] || '').trim().slice(0, 3).toLowerCase() !== prev) return;
        const name = String(cells[parsed.exercise] || '').trim();
        if (isWarmup(name) || !isLowerStrengthName(name)) return;
        const setCount = firstNum(cells[parsed.sets]);
        const reps = upperNum(cells[parsed.reps]);
        const rpe = Number.isInteger(parsed.effort) ? upperNum(cells[parsed.effort]) : null;
        const high = ((setCount ?? 0) >= 3 && ((setCount ?? 0) * (reps ?? 0)) >= 9 && (rpe ?? 0) >= 7.5) || ((setCount ?? 0) >= 2 && (rpe ?? 0) >= 8.5);
        if (!high) return;
        const before = { sets: cells[parsed.sets], reps: cells[parsed.reps], effort: Number.isInteger(parsed.effort) ? cells[parsed.effort] : null };
        cells[parsed.sets] = String(Number.isFinite(setCount) ? Math.max(1, Math.min(2, setCount)) : 2);
        if (Number.isInteger(parsed.effort)) cells[parsed.effort] = '7';
        if (Number.isInteger(parsed.notes)) {
          cells[parsed.notes] = addCue(
            cells[parsed.notes],
            'Low-volume maintenance only: protect tomorrow’s primary 3K quality session and stop every set with clear bar-speed reserve.',
            'low-volume maintenance only: protect tomorrow',
          );
        }
        repairs.push({ type: 'tactical_key_run_preceding_strength_trim', week, row, exercise: name, key_day: keyDay, before, after: { sets: cells[parsed.sets], reps: cells[parsed.reps], effort: Number.isInteger(parsed.effort) ? cells[parsed.effort] : null } });
        changed = true;
      });
    }
    if (changed) candidate = rebuild(candidate, parsed);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
