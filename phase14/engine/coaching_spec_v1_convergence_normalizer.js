import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';
import { endurancePerformanceIntegrityFlags, eventProgressionBearing } from './phase15_elite_guardrails.js';

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
// Bounded near-miss matcher: catches "Run", "Interval Run", "Running
// Intervals", "Zone-2 Run Intervals" (the word "run"/"running" appears
// somewhere in the name) without matching arbitrary unrelated exercise
// names. Always combined with a sets>=2 + parseable-distance gate (see
// isKeyIntervalRow), so an easy/long single-set run is never matched.
function isRunName(name) { return /\brun(?:ning)?\b/i.test(String(name || '')); }
// The model does not always split an interval prescription into Sets + Reps. It
// frequently writes the whole scheme inside one cell ("5 x 800 m") and leaves
// Sets at 1. Reading the repetition count only from the Sets column made those
// rows invisible to the key-interval detector, so the Week 1 event-progression
// repair silently declined on exactly the programs that needed it. Recover the
// scheme from the cell text when the Sets column does not carry it.
function inlineIntervalScheme(raw) {
  const s = String(raw || '');
  const forward = s.match(/\b(\d{1,2})\s*(?:x|×)\s*(\d{2,4})\s*m\b/i);
  if (forward) return { sets: Number(forward[1]), distance: Number(forward[2]) };
  const reverse = s.match(/\b(\d{2,4})\s*m\s*(?:x|×)\s*(\d{1,2})\b/i);
  if (reverse) return { sets: Number(reverse[2]), distance: Number(reverse[1]) };
  return null;
}
// Resolve the effective repetition count and repetition distance for a running
// row, whichever way the model chose to express them.
function intervalScheme(parsed, cells) {
  const setsCol = firstNum(cells[parsed.sets]) ?? 0;
  const repsDistance = parseDistanceMeters(cells[parsed.reps]);
  if (setsCol >= 2 && Number.isFinite(repsDistance)) return { sets: setsCol, distance: repsDistance };
  for (const idx of [parsed.reps, parsed.load]) {
    if (!Number.isInteger(idx)) continue;
    const inline = inlineIntervalScheme(cells[idx]);
    if (inline && inline.sets >= 2 && inline.distance >= 100) return inline;
  }
  return null;
}
function isKeyIntervalRow(parsed, cells) {
  if (isWarmup(cells[parsed.exercise]) || !isRunName(cells[parsed.exercise])) return false;
  return intervalScheme(parsed, cells) !== null;
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
function parseMinutes(raw) {
  const m = String(raw || '').match(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/i);
  return m ? Number(m[1]) : null;
}
// A generic aerobic running row: a real running exposure that carries no
// interval structure (so isKeyIntervalRow cannot see it and Stage 2 has nothing
// to canonicalize). Its aerobic size is used to pick the lowest-risk slot.
function genericRunRows(parsed) {
  return parsed.rows
    .map((cells, row) => ({ cells, row }))
    .filter(({ cells }) => !isWarmup(cells[parsed.exercise])
      && isRunName(cells[parsed.exercise])
      && !isKeyIntervalRow(parsed, cells))
    .map((entry) => {
      const reps = entry.cells[parsed.reps];
      const km = parseKm(reps);
      const minutes = parseMinutes(reps);
      // Rank by aerobic size so the athlete's largest aerobic exposure survives.
      const size = Number.isFinite(km) ? km * 6 : (Number.isFinite(minutes) ? minutes : null);
      return { ...entry, size };
    });
}
function shinImpactHistory(intake = {}) {
  // Hyphenated "shin-splint" is the common intake spelling, so match both forms.
  return /shin[- ]?splint|shin pain|medial tibial|tibial stress/.test(lower(`${txt(intake.injuries)} ${txt(intake.notes)} ${txt(intake.pain)}`));
}
function priorWeekdayName(day) {
  const idx = dayIndex(day);
  return idx < 0 ? null : WEEKDAYS[(idx + 6) % 7];
}

// Current demonstrated ruck pace, e.g. "10 km ruck with 20 kg: 95 min" -> 570 s/km.
// Used to anchor a ruck prescription to real capacity, never to goal pace.
function currentRuckPaceSecPerKm(intake = {}) {
  const source = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)} ${txt(intake.clarification_answers)}`;
  const m = source.match(/(\d+(?:\.\d+)?)\s*km[^\n|]{0,40}?ruck[^\n|]{0,40}?:?\s*(\d{2,3})\s*min/i)
    || source.match(/ruck[^\n|]{0,40}?(\d+(?:\.\d+)?)\s*km[^\n|]{0,40}?(\d{2,3})\s*min/i);
  if (!m) return null;
  const km = Number(m[1]);
  const minutes = Number(m[2]);
  if (!(km > 0) || !(minutes > 0)) return null;
  return (minutes * 60) / km;
}
function isRuckRowName(name) {
  return /\b(?:ruck(?:ing)?|ruck march|loaded march|pack march|backpack march|backpack carry)\b/i.test(String(name || ''));
}
function hasClockTarget(raw) { return /\b\d{1,2}:\d{2}\b/.test(String(raw || '')); }

// The rucking goal is a second, independent event goal for this athlete, and the
// validator evaluates it separately from running. A ruck row that states load and
// distance but no pace target is not progression-bearing, so it raises the very
// same EVENT_PROGRESSING_SESSION_MISSING code under details.key === 'rucking'.
// No running repair can ever clear it. Anchor the EXISTING ruck row to the
// athlete's demonstrated ruck pace: no added session, distance or load, and the
// same pace band in every week so no second variable starts progressing (T3K-06).
function annotateRuckPace(candidate, intake, repairs) {
  const paceSec = currentRuckPaceSecPerKm(intake);
  if (!Number.isFinite(paceSec)) return { program: candidate, changed: false };
  const band = `${formatClock(paceSec)}-${formatClock(paceSec + 10)}/km`;
  let program = candidate;
  let changed = false;
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.load)) continue;
    let weekChanged = false;
    parsed.rows.forEach((cells, row) => {
      const name = cells[parsed.exercise];
      if (isWarmup(name) || !isRuckRowName(name)) return;
      const load = String(cells[parsed.load] || '');
      if (hasClockTarget(load)) return;
      if (!/\d/.test(load)) return;
      cells[parsed.load] = `${load.trim()} @ ${band}`;
      if (Number.isInteger(parsed.notes)) {
        cells[parsed.notes] = addCue(
          cells[parsed.notes],
          `Pace anchored to the current demonstrated ruck capacity (${formatClock(paceSec)}/km), not goal pace; hold load and distance while pace settles.`,
          'pace anchored to the current demonstrated ruck capacity',
        );
      }
      repairs.push({ type: 'tactical_ruck_event_pace_anchored', week, row });
      weekChanged = true;
      changed = true;
    });
    if (weekChanged) program = rebuild(program, parsed);
  }
  return { program, changed };
}

// Convergence contract helper. Re-parses the given program's Week 1 and asks the
// REAL validator whether the running instance of EVENT_PROGRESSING_SESSION_MISSING
// is still present. Never infer success from what was written -- measure it.
function eventFlagKeys(program, intake) {
  const week1 = parseWeek(program, 1);
  if (!week1) return null;
  const guardrailParsed = {
    idx: { day: week1.day, exercise: week1.exercise, weight: week1.load, sets: week1.sets, reps: week1.reps, notes: week1.notes },
    rows: week1.rows.map((cells) => ({ cells })),
  };
  return endurancePerformanceIntegrityFlags(program, intake, guardrailParsed)
    .filter((f) => f.code === 'EVENT_PROGRESSING_SESSION_MISSING')
    .map((f) => f.details?.key || 'unknown');
}
function runningEventFlagPresent(program, intake) {
  const keys = eventFlagKeys(program, intake);
  return keys === null ? null : keys.includes('running');
}

export function normalizeTactical3KRaceSpecificity(program, intake = {}) {
  const original = String(program || '');
  if (!isTactical3KLike(intake)) return { program: original, repaired: false, repairs: [], event_progression: { applicable: false, unrepaired_reason: 'not_tactical_3k_like' } };

  // Entry state, measured with the real validator so the postcondition below can
  // tell 'was never broken' apart from 'was broken and is still broken'.
  const entryRunningFlag = runningEventFlagPresent(original, intake);
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

  // EVENT_PROGRESSING_SESSION_MISSING convergence. That validator only checks
  // Week 1 (phase15_elite_guardrails.js endurancePerformanceIntegrityFlags)
  // and its real semantics are "does Week 1 as a whole contain at least one
  // progression-bearing running row" -- not "does every running row qualify".
  // Ask the actual validator first, on Week 1 as parsed, so an already-valid
  // program (one legitimate row plus an unrelated RPE-only row) is left
  // untouched. Only when the validator would genuinely still reject Week 1 do
  // we select and canonicalize the intended key row.
  if (Number.isFinite(current)) {
    const week1 = parseWeek(candidate, 1);
    if (week1) {
      const guardrailParsed = {
        idx: { day: week1.day, exercise: week1.exercise, weight: week1.load, sets: week1.sets, reps: week1.reps, notes: week1.notes },
        rows: week1.rows.map((cells) => ({ cells })),
      };
      const week1Flags = endurancePerformanceIntegrityFlags(candidate, intake, guardrailParsed);
      // The validator evaluates every modality goal independently (e.g. a
      // concurrent rucking goal can also emit this code) -- only the running
      // instance of the flag is this repair's concern, so filter on details.key
      // rather than treating any occurrence of the code as "running is missing".
      const stillMissing = week1Flags.some((f) => f.code === 'EVENT_PROGRESSING_SESSION_MISSING' && f.details?.key === 'running');
      if (stillMissing) {
        const target = intervalRows(week1).find(({ cells }) => {
          const ctx = `${cells[week1.exercise] || ''} ${Number.isInteger(week1.notes) ? cells[week1.notes] || '' : ''}`;
          const dose = `${cells[week1.reps] || ''} ${Number.isInteger(week1.load) ? cells[week1.load] || '' : ''} ${Number.isInteger(week1.notes) ? cells[week1.notes] || '' : ''}`;
          return !eventProgressionBearing({ ctx, dose });
        });
        if (target) {
          const { cells, row } = target;
          // Use the resolved scheme so an inline "5 x 800 m" prescription keeps its
          // real repetition count instead of inheriting a Sets cell of 1.
          const scheme = intervalScheme(week1, cells);
          const distance = (scheme && scheme.distance) || parseDistanceMeters(cells[week1.reps]) || 400;
          const low = current * (distance / 3000) * 0.97;
          const high = current * (distance / 3000) * 1.00;
          const before = {
            exercise: cells[week1.exercise],
            load: Number.isInteger(week1.load) ? cells[week1.load] : null,
            sets: cells[week1.sets],
            reps: cells[week1.reps],
          };
          cells[week1.exercise] = 'Run';
          if (scheme && (firstNum(cells[week1.sets]) ?? 0) < 2) cells[week1.sets] = String(scheme.sets);
          cells[week1.reps] = `${distance} m`;
          if (Number.isInteger(week1.load)) cells[week1.load] = `${distance} m @ ${formatClock(low)}-${formatClock(high)}`;
          if (Number.isInteger(week1.notes)) {
            // Append, never replace: existing coaching/safety language (shin
            // symptom gating, readiness rules, technical cues) must survive.
            cells[week1.notes] = addCue(
              cells[week1.notes],
              `Anchored to current ${formatClock(current)} 3K capacity, not goal pace; even splits, no sprint finish.`,
              'anchored to current',
            );
          }
          repairs.push({
            type: 'tactical_3k_week1_event_session_canonicalized',
            week: 1,
            row,
            before,
            after: {
              exercise: cells[week1.exercise],
              load: Number.isInteger(week1.load) ? cells[week1.load] : null,
              sets: cells[week1.sets],
              reps: cells[week1.reps],
            },
          });
          candidate = rebuild(candidate, week1);
        } else {
          // Stage 1b: Week 1 genuinely needs an event-specific session but carries no
          // structured interval row to canonicalize -- the model produced only generic
          // aerobic running. Repurpose the SMALLEST existing running slot in each week,
          // and only where a second generic running exposure remains, so the athlete
          // keeps real aerobic work and no session, day or weekly impact is added.
          //
          // The final-QA endurance floor re-runs on Weeks 2-4 as well, so a Week-1-only
          // rewrite provably cannot converge. Either the whole block gets a coherent
          // progression or nothing is mutated: a half-repaired program is not an
          // improvement. If any week lacks a spare aerobic slot, converting its only
          // easy run would erase a required exposure, so this fails closed instead.
          const plan = {
            1: { distance: 600, sets: 4, lowMul: 0.98, highMul: 1.00, rest: '2:30-3:00', rpe: '8', role: 'Establishes the primary 3K-specific session at current capacity.' },
            2: { distance: 600, sets: 5, lowMul: 0.98, highMul: 1.00, rest: '2:30-3:00', rpe: '8', role: 'Adds one repetition of quality volume at the same pace.' },
            3: { distance: 800, sets: 4, lowMul: 0.96, highMul: 0.99, rest: '2:30-3:00', rpe: '8-8.5', role: 'Extends to longer race-specific repetitions.' },
            4: { distance: 600, sets: 4, lowMul: 0.95, highMul: 0.97, rest: '3:00', rpe: '8-8.5', role: 'Reduces quality volume and sharpens pace for realisation.' },
          };
          const PLANNED_WEEKS = Object.keys(plan).length;
          const slots = [];
          for (let week = 1; week <= PLANNED_WEEKS; week++) {
            const parsed = week === 1 ? week1 : parseWeek(candidate, week);
            // A week that is missing or unparseable cannot be planned, so the whole
            // repair is abandoned. Skipping it would mutate the weeks around it and
            // leave a half-repaired block, which is exactly what must not happen.
            if (!parsed) { slots.length = 0; break; }
            const generic = genericRunRows(parsed).filter((x) => Number.isFinite(x.size));
            // A spare slot means at least one other generic aerobic run survives, and
            // the slot we would repurpose must have a parseable aerobic dose to rank.
            if (generic.length < 2) { slots.length = 0; break; }
            slots.push({ week, parsed, pick: generic.sort((a, b) => a.size - b.size)[0] });
          }
          // All-or-nothing: every planned week must have produced a safe slot before
          // any cell is written. A shorter list means at least one week was rejected.
          if (slots.length === PLANNED_WEEKS) {
            const gate = shinImpactHistory(intake)
              ? ' Hold or shorten this session and reduce the newest impact stressor first if shin symptoms return.'
              : '';
            for (const { week, parsed, pick } of slots) {
              const { cells, row } = pick;
              const t = plan[week];
              const low = current * (t.distance / 3000) * t.lowMul;
              const high = current * (t.distance / 3000) * t.highMul;
              const before = {
                exercise: cells[parsed.exercise],
                load: Number.isInteger(parsed.load) ? cells[parsed.load] : null,
                sets: cells[parsed.sets],
                reps: cells[parsed.reps],
              };
              cells[parsed.exercise] = 'Run';
              cells[parsed.sets] = String(t.sets);
              cells[parsed.reps] = `${t.distance} m`;
              if (Number.isInteger(parsed.load)) cells[parsed.load] = `${t.distance} m @ ${formatClock(low)}-${formatClock(high)}`;
              if (Number.isInteger(parsed.rest)) cells[parsed.rest] = t.rest;
              if (Number.isInteger(parsed.effort)) cells[parsed.effort] = t.rpe;
              if (Number.isInteger(parsed.notes)) {
                cells[parsed.notes] = addCue(
                  cells[parsed.notes],
                  `Repurposed the lowest-volume easy run into the primary 3K-specific session; the remaining easy run keeps the aerobic exposure. ${t.role} Anchored to current ${formatClock(current)} 3K capacity, not goal pace; even splits, full recovery between reps.${gate}`,
                  'repurposed the lowest-volume easy run',
                );
              }
              repairs.push({
                type: 'tactical_3k_event_session_from_generic_run',
                week,
                row,
                before,
                after: {
                  exercise: cells[parsed.exercise],
                  load: Number.isInteger(parsed.load) ? cells[parsed.load] : null,
                  sets: cells[parsed.sets],
                  reps: cells[parsed.reps],
                },
              });
              candidate = rebuild(candidate, parsed);
            }
          }
        }
      }
    }
  }

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

  const ruckAnchor = annotateRuckPace(candidate, intake, repairs);
  candidate = ruckAnchor.program;

  // Convergence contract. The Week 1 running event-progression defect is the one
  // this normalizer exists to close, so its outcome is measured against the real
  // validator rather than inferred from what was written. The result always
  // states either that the running flag is gone, or a deterministic reason why it
  // could not be repaired safely. It must never report a repair while returning a
  // candidate that still carries the same running flag.
  const post = runningEventFlagPresent(candidate, intake);
  const postKeys = eventFlagKeys(candidate, intake);
  const eventRepairs = repairs.filter((r) => /week1_event_session|event_session_from_generic_run/.test(r.type));
  const event_progression = {
    applicable: true,
    repair_attempted: entryRunningFlag === true,
    target_row_found: eventRepairs.length > 0,
    post_repair_event_bearing: post === false,
    post_repair_running_flag: post,
    // Every modality the validator still rejects, so a non-running instance (e.g.
    // the concurrent rucking goal) can never masquerade as a cleared running flag.
    post_repair_flag_keys: postKeys,
    unrepaired_reason: null,
  };
  if (Array.isArray(postKeys) && postKeys.length && !event_progression.unrepaired_reason) {
    event_progression.unrepaired_reason = `event_flag_remains:${[...new Set(postKeys)].sort().join(',')}`;
  }
  if (entryRunningFlag === true && post !== false) {
    event_progression.unrepaired_reason = eventRepairs.length > 0
      ? 'repair_applied_but_flag_persists'
      : (Number.isFinite(current) ? 'no_safe_repair_target' : 'no_current_3k_benchmark');
  }
  return { program: candidate, repaired: repairs.length > 0, repairs, event_progression };
}
