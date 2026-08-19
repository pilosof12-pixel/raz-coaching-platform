// Total-workload accounting.
//
// The engine reasoned mostly from main work sets, so a session could quietly
// exceed a stated time ceiling once rest and transitions were counted, and a
// running week could claim to sit "at or below baseline" while interval reps,
// warm-up jog and cooldown pushed it past. Both estimates below are deliberately
// transparent and conservative rather than precise: they exist to catch clear
// contradictions, not to pretend to stopwatch accuracy.

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

export function parseWeek(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![idx.day, idx.exercise, idx.sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((l) => l.split('\t'));
  if (rows.some((c) => c.length !== header.length)) return null;
  return { re, match, header, rows, day: idx.day, exercise: idx.exercise, load: col('weight', 'load / target'), sets: idx.sets, reps, rest: idx.rest, notes: col('notes', 'coaching note') };
}

// Seconds expressed by a rest cell, e.g. "2-3 min", "90 sec", "2:30".
export function restSeconds(raw) {
  const s = String(raw || '');
  const clock = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  const top = Math.max(...nums);
  if (/\bmin/i.test(s)) return top * 60;
  if (/\bsec|\bs\b/i.test(s)) return top;
  return null;
}

// Minutes a duration-style rep cell expresses ("25 min", "30 sec/side").
function repMinutes(raw) {
  const s = String(raw || '');
  const min = s.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (min) return Number(min[1]);
  const sec = s.match(/(\d+(?:\.\d+)?)\s*sec/i);
  if (sec) return Number(sec[1]) / 60;
  return null;
}

// Conservative session duration including work, prescribed rest, warm-up and a
// per-exercise transition/setup allowance.
export function estimateSessionMinutes(rows, parsed, { transitionMinutesPerExercise = 1.5, secondsPerRep = 5, workingPaceMinPerKm = 5 } = {}) {
  let minutes = 0;
  const seen = new Set();
  for (const cells of rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name) continue;
    const sets = Math.max(1, firstNum(cells[parsed.sets]) || 1);
    const repsCell = String(cells[parsed.reps] || '');
    const durationMin = repMinutes(repsCell);
    // A distance cell is not a repetition count: "400 m" means one 400 m effort,
    // not 400 reps. Estimate its time from distance and a working pace.
    const metres = repsCell.match(/\b(\d{2,4})\s*m\b/i);
    const kmCell = repsCell.match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
    const distanceKm = metres ? Number(metres[1]) / 1000 : (kmCell ? Number(kmCell[1]) : null);
    const reps = (durationMin == null && distanceKm == null) ? (firstNum(repsCell) || 0) : 0;
    const work = durationMin != null
      ? durationMin * sets
      : (distanceKm != null
        ? distanceKm * sets * workingPaceMinPerKm
        : (sets * reps * secondsPerRep) / 60);
    const rest = restSeconds(cells[parsed.rest]);
    // Rest happens between sets, not after the last one.
    const restMin = rest ? (rest * Math.max(0, sets - 1)) / 60 : 0;
    minutes += work + restMin;
    if (!isWarmup(name) && !seen.has(name)) {
      seen.add(name);
      minutes += transitionMinutesPerExercise;
    }
  }
  return Math.round(minutes * 10) / 10;
}

export function sessionDurations(program, week, options = {}) {
  const parsed = parseWeek(program, week);
  if (!parsed) return [];
  const byDay = new Map();
  for (const cells of parsed.rows) {
    const day = String(cells[parsed.day] || '').trim();
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(cells);
  }
  return [...byDay.entries()].map(([day, rows]) => ({ day, minutes: estimateSessionMinutes(rows, parsed, options) }));
}

// --- running volume ---------------------------------------------------------

function isRunName(name) { return /\brun(?:ning)?\b/i.test(String(name || '')) && !/ruck|backpack|march/i.test(String(name || '')); }

// Estimated km for one running row, counting interval reps, duration-based easy
// running, warm-up jog and any stated cooldown.
export function runRowKm(cells, parsed, easyPaceMinPerKm = 6) {
  const name = cells[parsed.exercise];
  if (!isRunName(name)) return 0;
  const sets = Math.max(1, firstNum(cells[parsed.sets]) || 1);
  const repsCell = String(cells[parsed.reps] || '');
  let km = 0;

  const metres = repsCell.match(/\b(\d{2,4})\s*m\b/i);
  const kms = repsCell.match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
  const minutes = repMinutes(repsCell);
  if (metres) km += (Number(metres[1]) / 1000) * sets;
  else if (kms) km += Number(kms[1]) * sets;
  else if (minutes != null) km += (minutes * sets) / easyPaceMinPerKm;

  // Warm-up rows carry jog time plus stated strides; count both.
  const note = `${cells[parsed.notes] || ''} ${cells[parsed.load] || ''}`;
  const strides = note.match(/(\d+)\s*(?:x|×)\s*(\d{2,3})\s*m\b/i);
  if (strides) km += (Number(strides[1]) * Number(strides[2])) / 1000;
  const cooldown = note.match(/cool[- ]?down[^.\d]{0,20}(\d+(?:\.\d+)?)\s*(min|km)\b/i);
  if (cooldown) km += cooldown[2].toLowerCase() === 'km' ? Number(cooldown[1]) : Number(cooldown[1]) / easyPaceMinPerKm;
  return km;
}

export function projectedWeeklyRunningKm(program, week, easyPaceMinPerKm = 6) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  let km = 0;
  for (const cells of parsed.rows) km += runRowKm(cells, parsed, easyPaceMinPerKm);
  return Math.round(km * 10) / 10;
}

// Established tolerated weekly running volume, if the intake documents one.
export function statedRunningBaselineKm(intake = {}) {
  const src = `${txt(intake.notes)} ${txt(intake.clarification_answers)} ${txt(intake.pain)} ${txt(intake.current_numbers)}`;
  const range = src.match(/(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*km\s*(?:\/|per\s*)week/i);
  if (range) return { low: Number(range[1]), high: Number(range[2]) };
  const single = src.match(/(?:about|around|roughly|~)?\s*(\d{1,3})\s*km\s*(?:\/|per\s*)week/i);
  return single ? { low: Number(single[1]), high: Number(single[1]) } : null;
}

// Advisory signals, not hard rejections: an abrupt jump over a tolerated
// baseline matters most when the athlete has an impact-injury history.
export function runningVolumeSignals(program, intake = {}, { tolerance = 1.1 } = {}) {
  const baseline = statedRunningBaselineKm(intake);
  if (!baseline) return [];
  const impactHistory = /shin|tibial|stress fracture|plantar|achilles/i.test(`${txt(intake.injuries)} ${txt(intake.pain)} ${txt(intake.notes)}`);
  const signals = [];
  for (let week = 1; week <= 4; week++) {
    const projected = projectedWeeklyRunningKm(program, week);
    if (projected == null || projected <= 0) continue;
    if (projected > baseline.high * tolerance) {
      signals.push({
        code: 'V34_RUNNING_VOLUME_ABOVE_BASELINE',
        week,
        projected_km: projected,
        baseline_km: `${baseline.low}-${baseline.high}`,
        impact_history: impactHistory,
      });
    }
  }
  return signals;
}
