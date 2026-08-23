// Does the work actually do anything?
//
// A coach reading a live program called a single set of bodyweight Decline
// Push-ups "a waste of an exercise" for an athlete who overhead presses 80 kg
// and chins with 80 kg added, and said a session of chin-ups, hamstring curls
// and neck isometrics was too light to be worth travelling for. Both are true,
// and neither had anything in the engine to object: every structural rule asked
// whether work was PRESENT, none asked whether it was a stimulus.
//
// These two rules ask the coach's question instead. They are review signals, not
// gates: whether a given dose stimulates a given athlete is a judgement, and the
// cost of being wrong about it is a rejected program that was fine.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise, CATEGORY, ROLE } from './v38_movement_taxonomy.js';
import { goalTierFor } from './v52_session_hierarchy.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function maxRpe(raw) {
  const nums = String(raw || '').match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const rpes = nums.map(Number).filter((n) => n >= 1 && n <= 10);
  return rpes.length ? Math.max(...rpes) : null;
}
function hasExternalLoad(text) {
  return /\d+\s*(?:kg|lb)\b|\bRM\b|%|\bband\b|\bvest\b|\bplate\b|\bsled\b|\bsandbag\b/i.test(String(text || ''));
}

// The heaviest thing the athlete has actually demonstrated. An athlete who has
// shown nothing loaded is never told their bodyweight work is too easy.
export function demonstratedLoadKg(intake = {}) {
  const src = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;
  const kg = [...src.matchAll(/(\d+(?:\.\d+)?)\s*kg\b/gi)].map((m) => Number(m[1])).filter(Number.isFinite);
  return kg.length ? Math.max(...kg) : null;
}

// Loading is only a fair expectation where the athlete has something to load with.
export function canAddExternalLoad(intake = {}) {
  const equipment = `${txt(intake.equipment)} ${txt(intake.training_location)}`;
  if (/no external weight|bodyweight only|no weights/i.test(equipment)) return false;
  return /commercial|full gym|barbell|dumbbell|plate|weight|machine|cable|kettlebell/i.test(equipment);
}

// Movements whose difficulty is normally set by load rather than by leverage.
const LOADABLE = new Set([
  CATEGORY.HORIZONTAL_PUSH, CATEGORY.HORIZONTAL_PULL, CATEGORY.VERTICAL_PUSH,
  CATEGORY.KNEE_DOMINANT, CATEGORY.HIP_DOMINANT, CATEGORY.TISSUE_CAPACITY,
]);

export function collectUnderloadedAccessoryFlags(program, intake = {}) {
  const demonstrated = demonstratedLoadKg(intake);
  if (!demonstrated || demonstrated < 60) return [];
  if (!canAddExternalLoad(intake)) return [];

  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const { category, role } = classifyExercise(name);
      if (!LOADABLE.has(category)) continue;
      if (role === ROLE.SKILL_PRACTICE) continue;

      const loadText = parsed.load == null ? '' : String(cells[parsed.load] || '');
      if (hasExternalLoad(loadText)) continue;
      // "RPE-selected load" is a deliberate instruction to load to an effort, not
      // an absence of load.
      if (/rpe|rir|effort/i.test(loadText)) continue;

      const sets = firstNum(cells[parsed.sets]) || 0;
      const rpe = maxRpe(cells[6]);
      // A single set of unloaded work is filler whatever it is called. Two or
      // more can still be a legitimate low-cost exposure.
      if (sets >= 2) continue;

      flags.push({
        code: 'V53_UNDERLOADED_ACCESSORY',
        week,
        day: String(cells[parsed.day] || '').trim(),
        exercise: name,
        sets,
        rpe,
        demonstrated_kg: demonstrated,
        message: `${name} (Week ${week}) is one set at bodyweight for an athlete who has demonstrated ${demonstrated} kg. That is not a stimulus at this level: load it, raise the dose to something that counts, or use the slot for work that does.`,
      });
    }
  }
  return flags;
}

// --- is the session worth travelling for? ------------------------------------

// Work that asks something of the athlete: loaded or repeated, at an effort that
// is not merely maintenance.
function isSubstantive(cells, parsed) {
  const name = String(cells[parsed.exercise] || '').trim();
  if (!name || isWarmup(name)) return false;
  const { category } = classifyExercise(name);
  if (category === CATEGORY.TRUNK || category === CATEGORY.TISSUE_CAPACITY) return false;
  const sets = firstNum(cells[parsed.sets]) || 0;
  if (sets < 2) return false;
  // Effort alone is the wrong test. A deliberately lighter exposure of a loaded
  // lift is real work and is frequently required -- the lower-cost squat
  // exposure a primary squat goal demands sits at RPE 6 by design, and judging
  // it on effort called correct programming a thin session.
  const loadText = parsed.load == null ? '' : String(cells[parsed.load] || '');
  if (hasExternalLoad(loadText)) return true;
  const rpe = maxRpe(cells[6]);
  return !Number.isFinite(rpe) || rpe >= 7;
}

// A day earns its exemption by serving a goal, not by describing itself. Calling
// a session a "low-cost support day" was letting it off precisely the criticism
// a coach made of it -- that it was not worth travelling for. A day carrying
// primary or secondary goal work has a purpose whatever its dose; a day of pure
// support has to justify itself on substance.

const MIN_SUBSTANTIVE_ROWS = 3;

export function collectThinSessionFlags(program, intake = {}) {
  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const byDay = new Map();
    for (const cells of parsed.rows) {
      const day = String(cells[parsed.day] || '').trim();
      const name = String(cells[parsed.exercise] || '').trim();
      if (!day || !name || isWarmup(name)) continue;
      if (!byDay.has(day)) byDay.set(day, { rows: [], substantive: 0, servesGoal: false });
      const entry = byDay.get(day);
      entry.rows.push(name);
      if (goalTierFor(name, intake) !== 'support') entry.servesGoal = true;
      if (isSubstantive(cells, parsed)) entry.substantive += 1;
    }

    for (const [day, entry] of byDay) {
      // A conditioning-only day is single-purpose by design.
      const conditioningOnly = entry.rows.every((n) => {
        const c = classifyExercise(n).category;
        return c === CATEGORY.ENDURANCE || c === CATEGORY.LOADED_CARRY;
      });
      if (conditioningOnly) continue;
      if (entry.servesGoal) continue;
      if (entry.substantive >= MIN_SUBSTANTIVE_ROWS) continue;

      flags.push({
        code: 'V53_THIN_SESSION',
        week,
        day,
        substantive: entry.substantive,
        exercises: entry.rows,
        message: `${day} (Week ${week}) carries only ${entry.substantive} piece(s) of substantive work (${entry.rows.join(', ')}). A session the athlete travels for should be worth the trip: give it another meaningful exposure rather than filling it with trunk and tissue work.`,
      });
    }
  }
  return flags;
}

export function collectSessionSubstanceFlags(program, intake = {}) {
  return [...collectUnderloadedAccessoryFlags(program, intake), ...collectThinSessionFlags(program, intake)];
}

export function buildSessionSubstanceBrief(intake = {}) {
  const demonstrated = demonstratedLoadKg(intake);
  const lines = [];
  if (demonstrated && demonstrated >= 60 && canAddExternalLoad(intake)) {
    lines.push(`STIMULUS FLOOR: this athlete has demonstrated ${demonstrated} kg. A single set of an unloaded pressing or pulling accessory does nothing for them. Load the accessory, give it a dose that counts, or use the slot for something that earns its place.`);
  }
  lines.push('SESSION SUBSTANCE: every session the athlete travels for needs at least three pieces of substantive work - loaded or repeated, at a real effort. Trunk and tissue work supports a session; it does not constitute one. If a day cannot carry primary work, give it meaningful accessory work rather than filler.');
  return lines.join('\n');
}
