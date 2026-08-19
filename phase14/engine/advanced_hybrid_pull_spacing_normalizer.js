import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function primaryText(intake = {}) { return arr(intake.primary_goals).map(String).join(' | '); }
function hasPrimaryOap(intake = {}) { return /one[- ]?arm\s*(?:pull|chin)|\boap\b/i.test(primaryText(intake)); }
function isWarmup(name) { return /^\s*\[WARMUP\](?:\s|$)/i.test(String(name || '')); }
function isStrictOap(name) { return /^\s*One-Arm Pull-up\s*$/i.test(String(name || '')); }
function isAssistedOap(name) { return /^\s*Assisted One-Arm Pull-up\s*$/i.test(String(name || '')); }
function isWeightedBilateral(name) { return /^\s*Weighted\s+(?:Pull|Chin)-?up\s*$/i.test(String(name || '')); }
function isTargetPull(name) { return isStrictOap(name) || isAssistedOap(name) || isWeightedBilateral(name); }

function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function upperNum(raw) {
  const nums = [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}
function dayIndex(day) { return WEEKDAYS.indexOf(String(day || '').trim().slice(0, 3).toLowerCase()); }
function adjacentDays(a, b) {
  const ia = dayIndex(a), ib = dayIndex(b);
  if (ia < 0 || ib < 0) return false;
  const forward = (ib - ia + 7) % 7;
  const backward = (ia - ib + 7) % 7;
  return Math.min(forward, backward) === 1;
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
  const effort = col('target rpe', 'effort');
  const notes = col('notes', 'coaching note');
  if (![day, exercise, sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return { re, match, header, rows, day, exercise, sets, reps, effort, notes };
}

function rowInfo(parsed, cells, rowIndex) {
  const name = String(cells[parsed.exercise] || '').trim();
  if (!name || isWarmup(name) || !isTargetPull(name)) return null;
  const setCount = firstNum(cells[parsed.sets]);
  const repCount = upperNum(cells[parsed.reps]);
  const effort = Number.isInteger(parsed.effort) ? upperNum(cells[parsed.effort]) : null;
  const totalReps = Number.isFinite(setCount) && Number.isFinite(repCount) ? setCount * repCount : 0;
  const high = isStrictOap(name) || isAssistedOap(name)
    ? ((effort ?? 0) >= 8 || totalReps >= 4)
    : ((effort ?? 0) >= 8 && (setCount ?? 0) >= 3);
  const specificity = isStrictOap(name) ? 3 : isAssistedOap(name) ? 2 : 1;
  return {
    cells,
    rowIndex,
    name,
    day: String(cells[parsed.day] || '').trim(),
    sets: setCount,
    reps: repCount,
    effort,
    totalReps,
    high,
    specificity,
  };
}

function addTechnicalCue(existing) {
  const note = String(existing || '').trim();
  if (/technical adjacent-day exposure|rpe\s*<=?\s*6\.5|recovery-first pulling microdose/i.test(note)) return note;
  const cue = 'Recovery-first pulling microdose: technical adjacent-day exposure only, keep it at RPE 6-6.5 or easier and stop well before local fatigue.';
  return note ? `${note} ${cue}` : cue;
}

function chooseLowerPriority(a, b) {
  if (a.specificity !== b.specificity) return a.specificity < b.specificity ? a : b;
  // When specificity is identical, preserve the lower-volume / earlier quality row
  // and trim the row carrying more local stress. If tied, trim the later TSV row.
  if (a.totalReps !== b.totalReps) return a.totalReps > b.totalReps ? a : b;
  if ((a.effort ?? 0) !== (b.effort ?? 0)) return (a.effort ?? 0) > (b.effort ?? 0) ? a : b;
  return a.rowIndex > b.rowIndex ? a : b;
}

function makeTechnical(parsed, row) {
  const before = {
    sets: row.cells[parsed.sets],
    reps: row.cells[parsed.reps],
    effort: Number.isInteger(parsed.effort) ? row.cells[parsed.effort] : null,
  };

  if (isStrictOap(row.name) || isAssistedOap(row.name)) {
    const currentSets = firstNum(row.cells[parsed.sets]);
    row.cells[parsed.sets] = String(Number.isFinite(currentSets) ? Math.max(1, Math.min(2, currentSets)) : 2);
    row.cells[parsed.reps] = '1 per arm';
  } else {
    const currentSets = firstNum(row.cells[parsed.sets]);
    const currentReps = upperNum(row.cells[parsed.reps]);
    row.cells[parsed.sets] = String(Number.isFinite(currentSets) ? Math.max(1, Math.min(2, currentSets)) : 2);
    row.cells[parsed.reps] = String(Number.isFinite(currentReps) ? Math.max(1, Math.min(3, currentReps)) : 3);
  }

  if (Number.isInteger(parsed.effort)) row.cells[parsed.effort] = '6-6.5';
  if (Number.isInteger(parsed.notes)) row.cells[parsed.notes] = addTechnicalCue(row.cells[parsed.notes]);

  return {
    exercise: row.name,
    day: row.day,
    before,
    after: {
      sets: row.cells[parsed.sets],
      reps: row.cells[parsed.reps],
      effort: Number.isInteger(parsed.effort) ? row.cells[parsed.effort] : null,
    },
  };
}

// Frozen Coaching Spec v1.0 AH-04 remains the authority. This normalizer does not
// weaken or reinterpret the rule; it only makes its specified repair deterministic.
// When two demanding pulling exposures land on adjacent days, preserve the more
// OAP-specific exposure and convert the lower-priority row to a true technical
// microdose. The exposure remains present, but it no longer qualifies as substantive
// local pulling stress under the same AH-04 thresholds used by the validator.
export function normalizeAdvancedHybridAdjacentPulling(program, intake = {}) {
  const original = String(program || '');
  if (!isHighConcurrencyHybrid(intake) || !hasPrimaryOap(intake)) {
    return { program: original, repaired: false, repairs: [] };
  }

  let candidate = original;
  const repairs = [];

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;

    let changed = false;
    for (let guard = 0; guard < 12; guard++) {
      const pulls = parsed.rows
        .map((cells, rowIndex) => rowInfo(parsed, cells, rowIndex))
        .filter(Boolean)
        .filter((row) => row.high);

      let pair = null;
      for (let i = 0; i < pulls.length && !pair; i++) {
        for (let j = i + 1; j < pulls.length; j++) {
          if (adjacentDays(pulls[i].day, pulls[j].day)) {
            pair = [pulls[i], pulls[j]];
            break;
          }
        }
      }
      if (!pair) break;

      const victim = chooseLowerPriority(pair[0], pair[1]);
      const repair = makeTechnical(parsed, victim);
      repairs.push({
        type: 'advanced_hybrid_adjacent_pull_microdose',
        week,
        conflict: pair.map((row) => ({ day: row.day, exercise: row.name })),
        ...repair,
      });
      changed = true;
    }

    if (changed) {
      const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
      candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
    }
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
