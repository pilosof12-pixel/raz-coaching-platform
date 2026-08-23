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

// Patterns that support a stated goal closely enough to carry a session, when
// they are actually loaded and given a real dose.
const GOAL_ADJACENT = [
  { goal: /one[- ]?arm\s*(?:pull|chin)|\boap\b|pull[- ]?up|chin[- ]?up/i, movement: /pull-?up|chin-?up/i },
  { goal: /squat/i, movement: /squat|leg press/i },
  { goal: /overhead press|\bohp\b/i, movement: /overhead press|push press|shoulder press/i },
  { goal: /deadlift/i, movement: /deadlift|romanian/i },
];
function servesGoalWhenLoaded(name, cells, parsed, intake) {
  const goals = `${txt(intake.primary_goals)} ${txt(intake.secondary_goals)}`;
  const match = GOAL_ADJACENT.find((g) => g.goal.test(goals) && g.movement.test(name));
  if (!match) return false;
  const sets = firstNum(cells[parsed.sets]) || 0;
  if (sets < 3) return false;
  const loadText = parsed.load == null ? '' : String(cells[parsed.load] || '');
  const rpe = maxRpe(cells[6]);
  // Either explicitly loaded, or loaded to an effort that means business.
  return hasExternalLoad(loadText) || /rpe|rir/i.test(loadText) && Number.isFinite(rpe) && rpe >= 7;
}

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
      // A coach's correction: a weighted chin-up at 4x4 is legitimate primary
      // work for a pulling goal, even though the goal names the one-arm version.
      // Loaded, repeated, goal-adjacent work has a claim the bare name does not.
      else if (servesGoalWhenLoaded(name, cells, parsed, intake)) entry.servesGoal = true;
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

// --- the accessory has to match the athlete, not just carry load -------------

// A coach's framing: once you know an athlete's limits and abilities, matching
// the accessory to the demand is straightforward. Someone pressing 90 kg
// overhead should be doing wall handstand push-ups, or pike push-ups at least --
// a plain push-up asks them for nothing. The engine had no notion that a
// bodyweight movement has rungs.
const PUSH_LADDER = [
  { rung: 1, re: /^(?:incline|knee)\s+push-?up$/i, name: 'Incline Push-up' },
  { rung: 2, re: /^push-?up$/i, name: 'Push-up' },
  { rung: 3, re: /^(?:decline|feet[- ]elevated)\s+push-?up$/i, name: 'Decline Push-up' },
  { rung: 4, re: /^pike\s+push-?up$/i, name: 'Pike Push-up' },
  { rung: 5, re: /^wall\s+handstand\s+push-?up$/i, name: 'Wall Handstand Push-up' },
  { rung: 6, re: /^handstand\s+push-?up$/i, name: 'Handstand Push-up' },
];
// The rung a demonstrated strict press earns. Deliberately coarse: the point is
// to stop a strong presser being given a movement that asks nothing, not to
// prescribe an exact progression.
const PRESS_RUNG_FLOOR = [
  { pressKg: 80, rung: 5, suggest: 'Wall Handstand Push-up' },
  { pressKg: 60, rung: 4, suggest: 'Pike Push-up' },
];

export function demonstratedPressKg(intake = {}) {
  const src = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;
  const m = [...src.matchAll(/(?:overhead press|strict press|\bohp\b|push press)[^\d]{0,30}(\d+(?:\.\d+)?)\s*kg\b/gi)]
    .map((x) => Number(x[1])).filter(Number.isFinite);
  return m.length ? Math.max(...m) : null;
}

export function collectAccessoryLevelFlags(program, intake = {}) {
  const press = demonstratedPressKg(intake);
  if (!press) return [];
  const floor = PRESS_RUNG_FLOOR.find((f) => press >= f.pressKg);
  if (!floor) return [];

  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const rung = PUSH_LADDER.find((r) => r.re.test(name));
      if (!rung || rung.rung >= floor.rung) continue;
      // Adding external load lifts any rung to a real demand.
      if (hasExternalLoad(parsed.load == null ? '' : String(cells[parsed.load] || ''))) continue;

      flags.push({
        code: 'V53_ACCESSORY_BELOW_DEMONSTRATED_LEVEL',
        week,
        day: String(cells[parsed.day] || '').trim(),
        exercise: name,
        press_kg: press,
        suggested: floor.suggest,
        message: `${name} (Week ${week}) asks nothing of an athlete who strict presses ${press} kg. At that level the bodyweight pressing options are ${floor.suggest} or harder; use one of those, or load the movement.`,
      });
    }
  }
  return flags;
}

// --- what the athlete has told you they will not do ---------------------------

// A coach's last point: do not keep prescribing an accessory the athlete has
// already demonstrated he will not perform. The engine cannot infer that, so it
// is now asked as an optional intake question, and honoured here. An exercise
// nobody does is worse than no exercise: it occupies a slot and quietly makes
// the plan wrong.

// Movement words worth matching on. Matching whole free-text answers directly
// would catch every incidental word the athlete happened to type.
function excludedMovements(intake = {}) {
  const answers = intake?.clarification_answers || {};
  const raw = `${txt(answers.adherence_exclusions)} ${txt(intake.exercise_exclusions)} ${txt(intake.will_not_do)}`;
  if (!raw.trim()) return [];
  // Split on separators an athlete would naturally use, then keep phrases that
  // look like movement names rather than explanations.
  return raw.split(/[,;\n]|\band\b|\bor\b/i)
    .map((x) => x
      // Strip the sentence the athlete wrapped the movement in, leading verbs
      // included: keeping them produced "will not do do machine hamstring curls".
      .replace(/\b(?:i|do not|don't|won't|will not|cannot|can't|never|rarely|hate|skip|skipped|dislike|refuse to|avoid|any|all|the|these|those)\b/gi, ' ')
      .replace(/^\s*(?:do|doing|does|did|perform|performing|use|using)\b/i, ' ')
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim())
    // Singular and plural both need to match an exercise name.
    .map((x) => x.replace(/\b(\w{4,}?)s\b/g, '$1'))
    .filter((x) => x.length >= 4 && x.split(/\s+/).length <= 4);
}

export function collectAdherenceFlags(program, intake = {}) {
  const excluded = excludedMovements(intake);
  if (!excluded.length) return [];
  const flags = [];

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const hit = excluded.find((x) => {
        const needle = x.toLowerCase();
        return name.toLowerCase().includes(needle) || needle.includes(name.toLowerCase());
      });
      if (!hit) continue;
      flags.push({
        code: 'V53_PRESCRIBES_DECLINED_MOVEMENT',
        week,
        day: String(cells[parsed.day] || '').trim(),
        exercise: name,
        declined: hit,
        message: `${name} (Week ${week}) is something this athlete has said they will not do ("${hit}"). Programming it wastes the slot: choose a movement that trains the same quality and that they will actually perform.`,
      });
    }
  }
  return flags;
}

export function collectSessionSubstanceFlags(program, intake = {}) {
  return [
    ...collectUnderloadedAccessoryFlags(program, intake),
    ...collectAccessoryLevelFlags(program, intake),
    ...collectThinSessionFlags(program, intake),
    ...collectAdherenceFlags(program, intake),
  ];
}

export function buildSessionSubstanceBrief(intake = {}) {
  const demonstrated = demonstratedLoadKg(intake);
  const lines = [];
  if (demonstrated && demonstrated >= 60 && canAddExternalLoad(intake)) {
    lines.push(`STIMULUS FLOOR: this athlete has demonstrated ${demonstrated} kg. A single set of an unloaded pressing or pulling accessory does nothing for them. Load the accessory, give it a dose that counts, or use the slot for something that earns its place.`);
  }
  const press = demonstratedPressKg(intake);
  const floor = press ? PRESS_RUNG_FLOOR.find((f) => press >= f.pressKg) : null;
  if (floor) {
    lines.push(`ACCESSORY LEVEL: this athlete strict presses ${press} kg. Bodyweight pressing for them starts at ${floor.suggest}; a plain or decline push-up asks nothing. Match the variant to what they can already do, or load it.`);
  }
  const declined = excludedMovements(intake);
  if (declined.length) {
    lines.push(`ADHERENCE: this athlete has said they will not do ${declined.join(', ')}. Do not program any of it. Pick movements that train the same quality and that they will actually perform.`);
  }
  lines.push('SESSION SUBSTANCE: every session the athlete travels for needs at least three pieces of substantive work - loaded or repeated, at a real effort. Trunk and tissue work supports a session; it does not constitute one. If a day cannot carry primary work, give it meaningful accessory work rather than filler.');
  return lines.join('\n');
}
