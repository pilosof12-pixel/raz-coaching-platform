// engine/coach_rules.js
//
// The checkable half of the coach's standard, run against a delivered program.
//
// This is a grader, not a gate. Nothing here refuses a build. Its job is to
// answer one question we have never been able to answer offline: would the
// coach have found something here? Every rule below targets a finding he
// actually made, so the grader can be measured against his eighteen rather than
// believed.
//
// Rules he filed under "Judgement, not rules" are absent on purpose. Whether an
// accessory earns its recovery cost, and whether one exercise is mechanically
// close enough to another, are the two he was clearest about not being able to
// reduce -- and they are exactly the two that would be easiest to fake.

import { parseWeek } from './v34_workload_accounting.js';
import { weekdayKey } from './weekday.js';
import { classifyExercise } from './v38_movement_taxonomy.js';
import { THRESHOLDS } from './coach_standard.js';
import { campPlanByWeek } from './v78_sport_taper.js';

const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const num = (s) => { const m = String(s || '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };

export function narrativeOf(program) {
  const s = String(program || '');
  const at = s.search(/START_WEEK1_TSV/i);
  return at < 0 ? s : s.slice(0, at);
}

export function goalText(intake = {}, tiers = ['primary', 'secondary', 'maintenance']) {
  return tiers.map((t) => arr(intake[`${t}_goals`]).join(' ')).join(' ');
}

// Every working row of every week, with the day it belongs to carried forward.
export function rows(program) {
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let lastDay = '';
    parsed.rows.forEach((cells) => {
      const raw = String(cells[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      out.push({
        week,
        day: weekdayKey(lastDay) || '',
        dayLabel: String(lastDay || '').trim(),
        name,
        load: Number.isInteger(parsed.load) ? String(cells[parsed.load] || '') : '',
        sets: num(cells[parsed.sets]),
        reps: String(cells[parsed.reps] || ''),
        rest: Number.isInteger(parsed.rest) ? String(cells[parsed.rest] || '') : '',
        rpe: Number.isInteger(parsed.rest) ? num(cells[parsed.rest + 1]) : null,
        notes: Number.isInteger(parsed.notes) ? String(cells[parsed.notes] || '') : '',
        cells,
      });
    });
  }
  return out;
}

// The week wraps. Saturday, Sunday and Monday are three consecutive training
// days, and reading the calendar left to right scored them as two -- which is
// how the coach's three-consecutive-lower-body-days finding stayed invisible on
// a program whose three days were exactly Sat, Sun, Mon.
// The longest run, and which days are in it. The finding used to report the
// run length beside the whole training set, so a tactical week read "trains 4
// days in a row (mon, wed, thu, fri, sat)" -- five days, one of them not
// adjacent to the rest. The count was right and the evidence beside it was
// not, which is the kind of thing that costs a tool its credibility with the
// person reading it.
export const longestRunDays = (days) => {
  const present = WEEK_ORDER.map((d) => days.has(d));
  if (present.every(Boolean)) return [...WEEK_ORDER];
  let best = [];
  let run = [];
  for (let i = 0; i < 14; i += 1) {
    if (present[i % 7]) {
      run.push(WEEK_ORDER[i % 7]);
      if (run.length > best.length) best = [...run];
    } else run = [];
  }
  return best.slice(0, 7);
};

const longestRun = (days) => longestRunDays(days).length;

// --- 1. consecutive training days, flexible availability ----------------------

// Competition week is counted from the event, so its rows are labelled "Day -4"
// rather than "Thu" and weekdayKey correctly returns nothing for them. That made
// this rule blind to exactly the week where stacking days matters most: the
// Hyrox block trained Day -4, -3, -2 and -1 back to back and the rule reported
// nothing, because as far as it could see competition week had no days at all.
// The coach charged it 0.25.
const COUNTDOWN = /^\s*day\s*-\s*(\d+)\s*$/i;
function countdownRun(labels) {
  const n = [...new Set(labels.map((l) => Number((COUNTDOWN.exec(String(l || '')) || [])[1]))
    .filter(Number.isFinite))].sort((a, b) => b - a);
  if (!n.length) return [];
  let best = [n[0]];
  let run = [n[0]];
  for (let i = 1; i < n.length; i += 1) {
    if (n[i - 1] - n[i] === 1) run.push(n[i]);
    else run = [n[i]];
    if (run.length > best.length) best = [...run];
  }
  return best.map((x) => `day -${x}`);
}

export function consecutiveTrainingDays(program, intake = {}) {
  if (String(intake.gym_availability_mode || '').toLowerCase() !== 'flexible') return [];
  const limit = THRESHOLDS.MAX_CONSECUTIVE_LIFTING_DAYS;
  const byWeek = new Map();
  const labelsByWeek = new Map();
  for (const r of rows(program)) {
    if (!labelsByWeek.has(r.week)) labelsByWeek.set(r.week, []);
    labelsByWeek.get(r.week).push(r.dayLabel);
    if (!r.day) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, new Set());
    byWeek.get(r.week).add(r.day);
  }
  // A week whose rows carry no weekday at all is a countdown week; read its run
  // from the countdown instead.
  for (const [week, labels] of labelsByWeek) {
    if (byWeek.has(week)) continue;
    const run = countdownRun(labels);
    if (run.length) byWeek.set(week, new Set(run));
  }
  const out = [];
  for (const [week, days] of byWeek) {
    const countdown = [...days].every((d) => /^day -\d+$/.test(d));
    const streak = countdown ? [...days] : longestRunDays(days);
    if (streak.length > limit) {
      out.push({
        rule: 'CONSECUTIVE_TRAINING_DAYS',
        week,
        days: [...days],
        streak,
        detail: `Week ${week} trains ${streak.length} days in a row (${streak.join(', ')}) against a limit of ${limit} when availability is flexible.`,
      });
    }
  }
  return out;
}

// --- 2. consecutive lower-leg loading days ------------------------------------
//
// His definition, not ours: a day counts when it carries a run of 20 minutes or
// more, running intervals, a ruck of 45 minutes or more, or lower-body
// resistance with a working set at RPE 6.5 or higher.

const LOWER_BODY_LIFT = /\bsquat\b|\bdeadlift\b|\blunge\b|\bstep[- ]?up\b|\bhip thrust\b|\bleg press\b|\bsplit squat\b|\bhamstring\b|\bcalf\b/i;
const RUN = /\brun(?:ning)?\b|\bjog\b/i;
const RUCK = /\bruck\b|\bbackpack carry\b|\bloaded carry\b/i;

export function lowerLegLoadingDay(r) {
  const minutes = (String(r.reps).match(/(\d+(?:\.\d+)?)\s*min/i) || [])[1];
  if (RUN.test(r.name)) {
    if (minutes && Number(minutes) >= THRESHOLDS.LOWER_LEG_LOADING_RUN_MINUTES) return 'run >= 20 min';
    if (/interval|repeat|\bx\s*\d+\s*m\b|\d+\s*m\b/i.test(`${r.reps} ${r.load} ${r.notes}`)) return 'running intervals';
  }
  if (RUCK.test(r.name) && minutes && Number(minutes) >= THRESHOLDS.LOWER_LEG_LOADING_RUCK_MINUTES) return 'ruck >= 45 min';
  if (LOWER_BODY_LIFT.test(r.name)) {
    const rpe = num(String(r.cells.join(' ')).match(/RPE\s*([\d.]+)/i)?.[1]) ?? r.rpe;
    if (rpe != null && rpe >= THRESHOLDS.LOWER_LEG_LOADING_MIN_RPE) return `lower-body lift at RPE ${rpe}`;
  }
  return null;
}

// Only for an athlete the intake says has a history here; he was explicit that
// this is tied to the shin history and is not a universal rule.
const IMPACT_HISTORY = /\bshin\b|\bstress fracture\b|\bstress reaction\b|\btibial\b|\bimpact\b/i;

export function consecutiveLowerLegDays(program, intake = {}) {
  const history = `${intake.injuries || ''} ${JSON.stringify(intake.pain || {})}`;
  if (!IMPACT_HISTORY.test(history)) return [];
  if (String(intake.gym_availability_mode || '').toLowerCase() !== 'flexible') return [];
  const limit = THRESHOLDS.MAX_CONSECUTIVE_LOWER_LEG_LOADING_DAYS;
  const byWeek = new Map();
  for (const r of rows(program)) {
    if (!r.day) continue;
    const why = lowerLegLoadingDay(r);
    if (!why) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, new Map());
    if (!byWeek.get(r.week).has(r.day)) byWeek.get(r.week).set(r.day, why);
  }
  const out = [];
  for (const [week, days] of byWeek) {
    const run = longestRun(new Set(days.keys()));
    if (run > limit) {
      out.push({
        rule: 'CONSECUTIVE_LOWER_LEG_DAYS',
        week,
        detail: `Week ${week} loads the lower leg on ${run} consecutive days against a limit of ${limit} for an athlete with impact history: ${[...days].map(([d, w]) => `${d} (${w})`).join(', ')}.`,
      });
    }
  }
  return out;
}

// --- 3. a benchmarked movement that serves a goal and is never trained --------

export function benchmarks(intake = {}) {
  const out = [];
  for (const line of String(intake.current_numbers || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z '()\-\/]*?)\s*:\s*(.+)$/);
    if (!m) continue;
    const name = m[1].trim();
    if (!name || /^current/i.test(name)) continue;
    out.push({ name, value: m[2].trim(), kg: num((m[2].match(/([\d.]+)\s*kg/i) || [])[1]) });
  }
  return out;
}


// "Trap bar deadlift, split squats, sled pushes, hip thrusts and all upper body
// are comfortable. Heavy back squat is not."
//
// A substring search over that field reports back squat as tolerated, because
// the sentence saying it is not contains its name. The athlete's most dangerous
// lift read as their safest one, and the brief built from it would have told
// the model to prescribe the movement the coach capped programs at 6.0 for.
const NEGATED_CLAUSE = /\b(?:is not|are not|not tolerated|avoid|cannot|can't|no longer|except|but not|other than)\b/i;

export function toleratedFor(name, text) {
  const needle = String(name || '').toLowerCase().trim();
  if (!needle) return false;
  let found = false;
  for (const clause of String(text || '').split(/(?<=[.;])\s+/)) {
    if (!clause.toLowerCase().includes(needle)) continue;
    if (NEGATED_CLAUSE.test(clause)) return false;
    found = true;
  }
  return found;
}

// Words that say how a movement is loaded, not which movement it is. A weighted
// pull-up and a pull-up are the same movement at two loads; a snatch pull and a
// snatch are not the same movement at two loads.
// Also form words. "Strict Pull-ups" and "Pull-up" are the same movement
// written twice, and requiring "strict" to appear in the exercise name turned
// the athlete's own pull-up benchmark into a movement the block had skipped.
const NOT_THE_MOVEMENT = /^(?:weighted|heavy|light|barbell|dumbbell|db|kettlebell|kb|machine|cable|banded|band|assisted|trap|bar|safety|goblet|strict|pronated|supinated|paused|tempo|controlled)$/i;

// Plurals are the same movement too: pull-ups is pull-up, squats is squat.
// "Press" must survive, so a word ending in a double s is left alone.
export function singular(w) {
  if (/ss$/i.test(w)) return w;
  if (/es$/i.test(w) && w.length > 4) return w.slice(0, -2);
  if (/s$/i.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

export function movementWords(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOT_THE_MOVEMENT.test(w))
    .map(singular);
}

// The coach's discriminator for when a substitute covers a benchmarked
// movement: it must preserve the same primary force action and prime-mover
// pattern, and be loadable in the same general strength range. Dip and a loaded
// ring push-up cover Bench Press maintenance on that test. Hip Thrust does not
// cover Trap Bar Deadlift, because it keeps hip extension and drops the heavy
// standing pull, the bracing, the grip and the coordinated whole-body force.
//
// This is a map of movement FUNCTIONS, not of equivalent exercises. He was
// explicit that a general equivalence table cannot be built from three reviews,
// and these eight buckets are the coarsest thing that answers his rule.
export const MOVEMENT_FUNCTION = [
  // The competition lifts are their own function. A snatch at 85% is not a
  // substitute for a snatch pull, which is why the missing pull was his
  // largest Program 1 finding while the block was full of snatches.
  ['olympic_lift', /\b(?:snatch|clean and jerk|power clean|hang clean|\bjerk\b)\b/i, /\bpull\b/i],
  ['loaded_standing_pull', /\b(?:deadlift|snatch pull|clean pull|high pull|rdl|romanian)\b/i, null],
  ['knee_dominant_squat', /\bsquat\b|\bleg press\b|\bbulgarian\b|\blunge\b|\bstep[- ]?up\b/i, null],
  ['hip_extension', /\bhip thrust\b|\bglute bridge\b|\bback extension\b|\bgood ?morning\b/i, null],
  ['horizontal_press', /\bbench press\b|\bdip\b|\bpush[- ]?up\b|\bfloor press\b|\bchest press\b/i, null],
  ['vertical_press', /\boverhead press\b|\bohp\b|\bpush press\b|\bmilitary press\b|\bshoulder press\b|\bstrict press\b/i, null],
  ['vertical_pull', /\bpull[- ]?up\b|\bchin[- ]?up\b|\blat pulldown\b|\bmuscle[- ]?up\b/i, null],
  ['horizontal_pull', /\brow\b|\bface pull\b/i, null],
];

export function movementFunction(name) {
  const n = String(name || '');
  for (const [fn, re, veto] of MOVEMENT_FUNCTION) {
    if (!re.test(n)) continue;
    if (veto && veto.test(n)) continue;
    return fn;
  }
  return null;
}

// Exposed when every word that identifies the movement appears in the exercise.
// Matching on a single shared token let a Dumbbell Bulgarian Split Squat count
// as training a Back Squat, which is how a missing benchmark and a mis-read
// pain field cancelled each other out and produced the right answer by luck.
export function movementExposed(benchmarkName, exerciseNames) {
  const words = movementWords(benchmarkName);
  if (!words.length) return null;
  return exerciseNames.find((n) => {
    const hay = String(n).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).map(singular).join(' ');
    return words.every((w) => hay.includes(w));
  }) || null;
}

const TOKENS = /\b(snatch|clean|jerk|squat|deadlift|press|bench|pull|row|dip|push|run|ruck|carry)\b/gi;
const tokensOf = (s) => [...new Set(String(s).toLowerCase().match(TOKENS) || [])];

// A goal that names no movement but asks for strength or power to be kept
// covers every benchmarked resistance movement the athlete tolerates. Without
// this, "Maintain the strength and power I already have" matched nothing, and
// the trap bar deadlift -- his largest Program 3 finding -- stayed invisible.
const GENERIC_STRENGTH_GOAL = /maintain[^.]*\b(strength|power)\b/i;

const NOT_A_LIFT = /\b(\d+\s*km|3\s*km|reps|min|sessions?)\b/i;

export function benchmarkExposure(program, intake = {}) {
  const experience = String(intake.experience || '').toLowerCase();
  const advanced = /advanced|elite/.test(experience) || Number(intake.training_years) >= 3;
  if (!advanced) return [];

  const goals = goalText(intake);
  // "Maintain useful squat and deadlift strength" names its movements, so it
  // does not licence every benchmark in the intake. Reading it as generic made
  // an untrained push-up benchmark look like a missing maintenance quality.
  const generic = GENERIC_STRENGTH_GOAL.test(goals) && !tokensOf(goals).some((t) => /squat|deadlift|press|bench|snatch|clean|jerk|pull|row|dip/.test(t));
  const tolerated = String(intake.pain?.tolerated_movements || '').toLowerCase();
  const painful = String(intake.pain?.description || '').toLowerCase();
  const painActive = intake.pain?.active === true;

  const trained = rows(program).map((r) => r.name.toLowerCase());
  const out = [];

  for (const b of benchmarks(intake)) {
    const toks = tokensOf(b.name);
    if (!toks.length || NOT_A_LIFT.test(b.name)) continue;

    // Does it serve a stated goal?
    const named = toks.some((t) => new RegExp(`\\b${t}`, 'i').test(goals));
    if (!named && !generic) continue;

    // Is it tolerated? An active symptom that names this movement removes the
    // requirement -- that is the coach's first conflict-resolution rule. The
    // tolerated list is read clause by clause, because it also records what the
    // athlete cannot do.
    if (painActive && toks.some((t) => painful.includes(t)) && !toleratedFor(b.name, tolerated)) continue;

    if (movementExposed(b.name, trained)) continue;

    // A substitute preserving the same movement function satisfies a
    // maintenance requirement. This is the coach's own answer on Bench Press:
    // Dip and a loaded ring push-up cover it, and he would add no finding.
    const fn = movementFunction(b.name);
    const substitute = fn ? trained.find((n) => movementFunction(n) === fn) : null;
    if (substitute) continue;

    // What stands nearest: something sharing the movement's head word.
    const head = movementWords(b.name).slice(-1)[0];
    const cousin = head ? trained.find((n) => n.includes(head)) : null;
    out.push({
      rule: 'BENCHMARK_UNEXPOSED',
      movement: b.name,
      benchmark: b.value,
      nearest: cousin || null,
      detail: `${b.name} is benchmarked at ${b.value}, serves a stated goal${generic && !named ? ' (maintain existing strength)' : ''}, and is not symptom-limited, but no exercise in the block trains it${cousin ? `. The nearest thing present is "${cousin}"` : ' and nothing in its family appears at all'}.`,
    });
  }
  return out;
}

// --- 4. an improvement goal held flat for the whole block ---------------------

// A goal names a movement; a shared word does not. Matching on the token
// "press" from a 100 kg overhead press goal pulled in Pallof Press and Leg
// Press Machine, neither of which has anything to do with it. This is a
// vocabulary of goals we have actually seen, not an equivalence table between
// exercises -- the coach was explicit that the second cannot be built from
// three reviews.
const GOAL_MOVEMENTS = [
  { goal: /overhead press|\bohp\b|shoulder press/i, family: /overhead press|\bohp\b|push press|strict press|military press/i },
  { goal: /bench press/i, family: /bench press/i },
  { goal: /pull[- ]?ups?\b/i, family: /pull[- ]?up|chin[- ]?up/i },
  { goal: /muscle[- ]?ups?\b/i, family: /muscle[- ]?up/i },
  { goal: /back squat|front squat|\bsquat\b/i, family: /\bsquat\b/i },
  { goal: /deadlift/i, family: /deadlift/i },
  { goal: /snatch/i, family: /snatch/i },
  { goal: /clean and jerk|clean & jerk/i, family: /\bclean\b|\bjerk\b/i },
  { goal: /\bruck\b/i, family: /ruck|backpack carry|loaded carry/i },
  { goal: /marathon|\d+\s*km|\brun\b/i, family: /\brun(?:ning)?\b|\bjog\b/i },
  // A 2 km erg goal is served by the erg, not by a cable row. This family used
  // to be /\brow\b|\berg\b/, which matched "Seated Cable Row", "Chest-Supported
  // Row" and "Cable Row" while missing "Rower" entirely -- no word boundary
  // falls after "row" in "rower". So for a masters rower returning to a 2 km
  // erg, three accessories counted as the goal movement and the erg itself was
  // invisible to every goal rule. The exclusion reads the whole name, because a
  // negative lookahead placed after the word passes when the excluded term
  // never follows it.
  { goal: /\brows?\b|\browing\b|\berg\b/i,
    family: /^(?!.*(?:cable|chest|barbell|pendlay|seated|bent|dumbbell|machine|inverted|ring|t-?bar|landmine|renegade))(?:.*\brow(?:er|ing)?\b|.*\berg\b)/i },
  { goal: /\bdips?\b/i, family: /\bdip\b/i },

  // Calisthenics skills. Without these the engine could see two of the
  // calisthenics athlete's five goals: the planche, the front lever and the
  // freestanding handstand push-up produced no family at all, so every rule
  // that asks "does this serve a stated goal" answered no for his pressing and
  // straight-arm work. That is how his handstand push-up progressions -- pike
  // push-ups and handstand push-up negatives, prescribed for a goal he stated
  // in those words -- were charged as accessory duplication serving nothing.
  //
  // Each family is the progression ladder a coach would actually use for the
  // skill, because that is what "serves the goal" means for a skill: the
  // negative and the assisted variant are the work, not accessories beside it.
  { goal: /handstand push[- ]?ups?\b|\bhspu\b/i,
    family: /handstand push[- ]?up|pike push[- ]?up|\bhspu\b/i },
  { goal: /\bplanche\b/i, family: /planche/i },
  { goal: /front lever/i, family: /front lever/i },
  { goal: /back lever/i, family: /back lever/i },
  // The balance skill, not the pressing one. A handstand push-up goal is the
  // entry above and matches first, so this must not swallow it.
  { goal: /handstands?\b(?![- ]?push)/i, family: /handstand(?![- ]?push)/i },
  { goal: /human flag/i, family: /human flag/i },
];

// A goal phrased as a hold is not an improvement goal, whichever tier it sits
// in. "Keep front squat strength while sharpening the lifts" is a secondary
// goal asking for maintenance, and reading it as improvement made four squat
// variations into defects for not progressing -- which is the opposite of what
// that athlete was asked for.
const HOLD_PHRASING = /\b(?:keep|maintain|maintaining|hold|holding|preserve|preserving|retain|retaining|maintenance|without losing|stay(?:ing)? (?:strong|athletic))\b/i;

export function goalFamilies(intake = {}, tiers = ['primary', 'secondary']) {
  return goalFamilyTiers(intake, tiers).map((g) => g.family);
}

// Every movement family the athlete asked for anything about, improvement or
// maintenance. goalFamilies drops goals phrased as a hold, which is right for
// "must this progress" and exactly wrong for "does this serve a stated goal":
// it made "Maintain the squat and hamstring strength I have" mean the athlete
// had asked for nothing, so a block full of squats read as pure redundancy.
export function statedGoalFamilies(intake = {}) {
  const text = ['primary', 'secondary', 'maintenance'].flatMap((t) => arr(intake[`${t}_goals`]).map(String)).join(' ');
  return GOAL_MOVEMENTS.filter((g) => g.goal.test(text)).map((g) => g.family);
}

// Which tier a goal sits in decides what a flat block costs: the coach revised
// his own 0.15 upward for a primary goal, because that 0.15 was set on a
// secondary pull-up while the athlete's primary 3 km work was still moving.
export function goalFamilyTiers(intake = {}, tiers = ['primary', 'secondary']) {
  const out = [];
  for (const tier of tiers) {
    for (const text of arr(intake[`${tier}_goals`]).map(String)) {
      if (HOLD_PHRASING.test(text)) continue;
      for (const g of GOAL_MOVEMENTS) {
        if (!g.goal.test(text)) continue;
        if (out.some((x) => x.family === g.family)) continue;
        out.push({ family: g.family, tier, goal: text });
      }
    }
  }
  return out;
}

// A load the athlete can act on: kilos, a percentage of a max, or a pace. "RPE
// 7" alone is a cap on a load, not a load. The coach's own carve-out: an
// RPE-selected prescription bounded by checkable intensity rules -- "Week 1 use
// 80-82% at RPE 7" -- is anchored, because the percentage is the anchor.
export function loadAnchored(r) {
  const text = String(r.cells.join(' '));
  return /\d+(?:\.\d+)?\s*kg\b/i.test(text)
    || /\d{2,3}\s*%/.test(text)
    || /\d{1,2}:\d{2}\s*\/?\s*(?:km|mi|\d+\s*m)\b/i.test(text)
    || /\bbodyweight\b|\bband\b|\bsled\b/i.test(text);
}

export function improvementGoalFlat(program, intake = {}) {
  const tiered = goalFamilyTiers(intake);
  if (!tiered.length) return [];
  const tierOf = (name) => (tiered.find((g) => g.family.test(name)) || {}).tier;
  const byName = new Map();
  for (const r of rows(program)) {
    const n = r.name;
    if (!tierOf(n)) continue;
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const out = [];
  for (const [name, list] of byName) {
    const weeks = [...new Set(list.map((r) => r.week))];
    if (weeks.length < THRESHOLDS.IDENTICAL_WEEKS_DEFECT_AFTER) continue;
    const sig = (w) => list.filter((r) => r.week === w)
      .map((r) => `${r.sets}|${r.reps}|${r.load}`.toLowerCase()).sort().join('~');
    const first = sig(weeks[0]);
    if (!weeks.every((w) => sig(w) === first)) continue;
    // Held is fine when the block says it is held.
    const said = list.some((r) => /maintain|maintenance|held|hold|unchanged|submaximal support/i.test(r.notes));
    const tier = tierOf(name);
    const anchored = list.some(loadAnchored);
    // His decomposition, kept as two parts so they cannot be summed twice:
    // flat primary progression is 0.35, and the missing load anchor is a
    // separate 0.15 raised by unanchoredPrimaryLoad. Together they are the 0.50
    // he quoted, and he was explicit it is 0.50 for the defect, not per lift.
    const cost = tier === 'primary' ? 0.35 : 0.15;
    out.push({
      rule: 'IMPROVEMENT_GOAL_FLAT',
      movement: name,
      weeks: weeks.length,
      tier,
      anchored,
      cost,
      explained: said,
      detail: `${name} is identical in all ${weeks.length} weeks (${first.split('~')[0]}) while it serves a stated ${tier} improvement goal${said ? ', and the note calls it support rather than saying the block deliberately holds it' : ' and nothing says the dose is deliberately held'}${tier === 'primary' && !anchored ? '. No kilo, percentage or pace appears anywhere in those rows, so neither the athlete nor a grader can tell what was prescribed, let alone whether it progressed' : ''}.`,
    });
  }
  return out;
}

// --- 5. weightlifting intensification band ------------------------------------

// The athlete's demonstrated max for a named lift, from current_numbers.
export function benchmarkMax(intake = {}, pattern) {
  for (const line of String(intake.current_numbers || '').split('\n')) {
    if (!pattern.test(line)) continue;
    const all = [...line.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)].map((m) => Number(m[1]));
    if (all.length) return Math.max(...all);
  }
  return null;
}

// Intensity as a fraction of demonstrated max, computed from the kilos on the
// bar rather than read out of the prose. The first version only understood
// "88% of current max" written in a cell, so a live program that prescribed
// 95 kg and 99 kg against a 112 kg snatch -- and did reach the band -- had no
// percentage anywhere and the rule reported nothing at all.
export function intensificationBand(program, intake = {}) {
  const LIFTS = [
    { name: 'Snatch', row: /^snatch$/i, bench: /snatch/i, band: THRESHOLDS.OLY_WEEK3_SNATCH_INTENSITY_BAND },
    { name: 'Clean and Jerk', row: /^clean and jerk$/i, bench: /clean and jerk/i, band: THRESHOLDS.OLY_WEEK3_CJ_INTENSITY_BAND },
  ];
  const all = rows(program);
  const out = [];
  for (const lift of LIFTS) {
    const max = benchmarkMax(intake, lift.bench);
    const lifted = all.filter((r) => lift.row.test(r.name.trim()));
    if (!lifted.length) continue;
    const pctOf = (r) => {
      const stated = [...String(r.cells.join(' ')).matchAll(/(\d{2,3})\s*%\s*of\s*(?:current\s*)?max/gi)].map((m) => Number(m[1]) / 100);
      if (stated.length) return Math.max(...stated);
      const kg = (String(r.load).match(/(\d+(?:\.\d+)?)\s*kg/i) || [])[1];
      return max && kg ? Number(kg) / max : null;
    };
    const byWeek3 = lifted.filter((r) => r.week >= 3).map(pctOf).filter(Number.isFinite);
    if (!byWeek3.length) continue;
    const top = Math.max(...byWeek3);
    if (top >= lift.band[0]) continue;
    out.push({ name: lift.name, top, max, need: lift.band[0] });
  }
  if (!out.length) return [];
  // One finding, however many lifts fall short. The coach wrote "intensity
  // never reaches the 89-90% intensification band" once for a block where both
  // competition lifts were under it, and splitting it in two made the grader
  // look like it disagreed with him when it agreed.
  return [{
    rule: 'INTENSIFICATION_BAND_NOT_REACHED',
    lifts: out.map((x) => x.name),
    detail: `By Week 3 no competition lift reaches its intensification band: ${out.map((x) => `${x.name} tops at ${(x.top * 100).toFixed(1)}% of the demonstrated ${x.max ? `${x.max} kg ` : ''}max against ${(x.need * 100).toFixed(0)}%`).join('; ')}.`,
  }];
}

// --- 6. running goal-speed progression ----------------------------------------

const secs = (s) => {
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function goalSpeedProgression(program, intake = {}) {
  const goal = arr(intake.primary_goals).join(' ');
  const g = goal.match(/(\d+(?:\.\d+)?)\s*km/i);
  if (!g) return [];
  const km = Number(g[1]);
  // "Improve 3 km from 13:30 to sub-12:00" states where the athlete is and
  // where they are going, in that order. Taking the first time made the goal
  // the athlete's current time, so a block that never moved scored as already
  // faster than target.
  const times = [...goal.matchAll(/(\d{1,2}:\d{2})/g)].map((m) => secs(m[1])).filter(Boolean);
  const target = times.length ? Math.min(...times) : null;
  if (!km || !target) return [];
  const goalSecPerKm = target / km;

  const best = new Map();
  for (const r of rows(program)) {
    if (!RUN.test(r.name)) continue;
    const dist = String(r.reps).match(/(\d+(?:\.\d+)?)\s*(m|km)\b/i);
    // "1:44-1:45 per 400 m" and "1:42 / 400 m" are the same prescription. The
    // rule only understood the slash, so when a live run wrote "per" it stopped
    // seeing any pace at all and reported the defect as fixed. The program was
    // at 90.6% of goal speed in Week 3 against a 95% threshold.
    const text = String(r.cells.join(' '));
    const cands = [
      ...[...text.matchAll(/(\d{1,2}:\d{2})\s*(?:\/|per)\s*(\d+)\s*m\b(?!in)/gi)]
        .map((m) => secs(m[1]) / (Number(m[2]) / 1000)),
      ...[...text.matchAll(/(\d{1,2}:\d{2})\s*(?:\/|per)\s*km/gi)].map((m) => secs(m[1])),
    ].filter((x) => Number.isFinite(x) && x > 0);
    // The fastest end of a band is the exposure the athlete actually gets.
    let secPerKm = cands.length ? Math.min(...cands) : null;
    if (secPerKm == null && dist && /interval|repeat/i.test(`${r.notes} ${r.load}`)) continue;
    if (secPerKm == null) continue;
    // Quality work only, decided structurally rather than by vocabulary. Asking
    // whether the row mentions "easy" anywhere excluded every interval session
    // in a live program, because each one ends "Do 10 min easy cooldown after
    // the last rep" -- so the rule reported a block at 90.6% of goal speed as
    // having nothing wrong with it. A quality rep is prescribed as a distance;
    // an easy run is prescribed as a duration.
    const repDistance = /(\d+(?:\.\d+)?)\s*(?:m|km)\b(?!in)/i.test(String(r.reps));
    const named = /interval|repeat|\bx\s*\d+/i.test(`${r.name} ${r.load}`);
    if (!repDistance && !named) continue;
    const frac = goalSecPerKm / secPerKm;
    if (!best.has(r.week) || frac > best.get(r.week).frac) best.set(r.week, { frac, secPerKm });
  }
  const out = [];
  for (const [week, need] of [[3, THRESHOLDS.RUN_WEEK3_MIN_FRACTION_OF_GOAL_SPEED],
    [4, THRESHOLDS.RUN_WEEK4_MIN_FRACTION_OF_GOAL_SPEED]]) {
    const got = best.get(week);
    if (!got) continue;
    if (got.frac >= need) continue;
    out.push({
      rule: 'GOAL_SPEED_NOT_APPROACHED',
      week,
      detail: `Week ${week}'s fastest quality running is ${(got.frac * 100).toFixed(1)}% of goal speed (${Math.round(got.secPerKm)} s/km against a goal of ${Math.round(goalSecPerKm)} s/km); the standard asks for at least ${(need * 100).toFixed(0)}%.`,
    });
  }
  return out;
}

// --- 7. an athlete fact the intake does not contain ---------------------------

const ASSERTED_CUT = /\b(?:routine|usual|standard|typical|his|her|your)\s+(\d+(?:\.\d+)?)\s*kg\s*(?:weight\s*)?cut\b|\b(\d+(?:\.\d+)?)\s*kg\s*cut\b/i;

export function unsupportedAthleteFact(program, intake = {}) {
  const src = String(program || '');
  const head = src.split(/START_WEEK1_TSV/i)[0];
  const intakeText = JSON.stringify(intake).toLowerCase();
  const out = [];
  const m = head.match(ASSERTED_CUT);
  if (m) {
    const stated = /weight_cut|weight_class_status|weigh_in|\bcut\b/.test(intakeText);
    if (!stated) {
      out.push({
        rule: 'UNSUPPORTED_ATHLETE_FACT',
        claim: m[0].trim(),
        detail: `The block states "${m[0].trim()}" as an established fact about the athlete, and the intake contains no weight cut at all.`,
      });
    }
  }
  return out;
}

// --- all of it ----------------------------------------------------------------

// --- 13. a primary goal in kilos or minutes, prescribed without a number ------

export function unanchoredPrimaryLoad(program, intake = {}) {
  const tiered = goalFamilyTiers(intake, ['primary']);
  if (!tiered.length) return [];
  // Only where the goal itself is a number the athlete is chasing.
  const targeted = tiered.filter((g) => /\d+\s*(?:kg|km|m\b)|\d{1,2}:\d{2}/i.test(g.goal));
  if (!targeted.length) return [];
  const byName = new Map();
  for (const r of rows(program)) {
    if (!targeted.some((g) => g.family.test(r.name))) continue;
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  // Which movement patterns in this family already carry the number. A goal
  // family matches on words, so "Weighted pull-up with 40 kg for 3" also
  // catches "Australian Pull-up" -- a bodyweight row that cannot serve a
  // weighted vertical pulling goal and cannot be prescribed in kilos either.
  // If another movement in the family does carry the load and is a different
  // pattern, the unanchored one is not the goal movement and charging it is a
  // false positive. Where nothing in the family is anchored there is no second
  // opinion available, and the finding stands -- which is the defect this rule
  // exists for.
  const anchoredCategories = new Set();
  for (const [name, list] of byName) {
    if (!list.some(loadAnchored)) continue;
    const { category } = classifyExercise(name);
    if (category && category !== 'unknown') anchoredCategories.add(category);
  }

  const out = [];
  for (const [name, list] of byName) {
    if (list.some(loadAnchored)) continue;
    const { category } = classifyExercise(name);
    if (anchoredCategories.size && category && category !== 'unknown'
      && !anchoredCategories.has(category)) continue;
    const goal = targeted.find((g) => g.family.test(name));
    out.push({
      rule: 'PRIMARY_LOAD_UNANCHORED',
      movement: name,
      detail: `${name} serves the primary goal "${goal.goal}" and is prescribed without a single kilo, percentage or pace in any week. The athlete cannot tell whether Week 1 is 70% or 92%, and nothing in the block lets them or anyone else verify progression toward a target stated as a number.`,
    });
  }
  return out;
}

export const RULES = [
  consecutiveTrainingDays,
  consecutiveLowerLegDays,
  benchmarkExposure,
  improvementGoalFlat,
  intensificationBand,
  goalSpeedProgression,
  unsupportedAthleteFact,
  ruckDistanceBelowTolerance,
  dayMinusOneStacked,
  sportScheduleChangedSilently,
  contingencyCreatesAdjacentDuplicate,
  trainingDaysVsIntake,
  unanchoredPrimaryLoad,
  inSeasonCaps,
  sprintSpeedExposure,
  sprintDistanceSpecificity,
  repeatedSprintExposure,
  eccentricHamstringTiming,
  promisedMovementAbsent,
  repeatedSprintProgression,
  accessoryRedundancy,
  taperAgainstSource,
];

export function gradeProgram(program, intake = {}) {
  return RULES.flatMap((fn) => {
    try { return fn(program, intake); } catch (e) { return [{ rule: 'RULE_THREW', detail: `${fn.name}: ${e.message}` }]; }
  });
}

// --- 8. a goal-specific distance cut below what the athlete already tolerates -

const paceMinPerKm = (text) => {
  const all = [...String(text).matchAll(/(\d{1,2}):(\d{2})\s*(?:[-–]\s*\d{1,2}:\d{2}\s*)?\/\s*km/gi)]
    .map((m) => Number(m[1]) + Number(m[2]) / 60);
  return all.length ? Math.max(...all) : null;
};

export function toleratedDistance(intake = {}, pattern) {
  const text = `${intake.pain?.tolerated_movements || ''} ${intake.notes || ''}`;
  // The window after the range must not run past the next number, or
  // "Current 18-20 km/week running and one 8-10 km ruck" lets the running
  // baseline claim the word "ruck" and answer as though it were the ruck's.
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:to|[-–])\s*(\d+(?:\.\d+)?)\s*km[^.\d]{0,24}/gi)) {
    if (pattern.test(m[0])) return { low: Number(m[1]), high: Number(m[2]) };
  }
  return null;
}

export function ruckDistanceBelowTolerance(program, intake = {}) {
  const goal = `${arr(intake.secondary_goals).join(' ')} ${arr(intake.primary_goals).join(' ')}`;
  if (!RUCK.test(goal) && !/ruck/i.test(goal)) return [];
  const tol = toleratedDistance(intake, /ruck/i);
  if (!tol) return [];
  const out = [];
  const seen = new Set();
  for (const r of rows(program)) {
    if (!RUCK.test(r.name)) continue;
    const explicit = (String(r.reps).match(/(\d+(?:\.\d+)?)\s*km\b/i) || [])[1];
    let km = explicit ? Number(explicit) : null;
    if (km == null) {
      const mins = (String(r.reps).match(/(\d+(?:\.\d+)?)\s*min/i) || [])[1];
      const pace = paceMinPerKm(r.cells.join(' '));
      if (mins && pace) km = Number(mins) / pace;
    }
    if (km == null || km >= tol.low) continue;
    if (seen.has(r.week)) continue;
    seen.add(r.week);
    out.push({
      rule: 'GOAL_DISTANCE_BELOW_TOLERANCE',
      week: r.week,
      detail: `Week ${r.week}'s ruck covers about ${km.toFixed(1)} km, and the intake says ${tol.low}-${tol.high} km with the same load is already tolerated without symptoms. The goal is a ruck distance, so the block is training below the athlete's established distance.`,
    });
  }
  return out;
}

// --- 9. the day before the event carries two primers -------------------------

export function dayMinusOneStacked(program, intake = {}, now = Date.now()) {
  let plan = null;
  try { plan = campPlanByWeek(intake, now); } catch { return []; }
  if (!plan) return [];
  const weeks = [...plan.keys()];
  const final = plan.get(weeks[weeks.length - 1]);
  if (!final) return [];
  const order = WEEK_ORDER;
  const eventIdx = order.findIndex((d) => final.days.get(d)?.event);
  if (eventIdx <= 0) return [];
  const dayBefore = order[eventIdx - 1];
  const cell = final.days.get(dayBefore);
  if (!cell || !cell.sport) return [];
  const gym = rows(program).filter((r) => r.week === final.week && r.day === dayBefore);
  if (!gym.length) return [];
  // An explicit either/or resolves it.
  const src = String(program || '');
  if (/\b(?:not both|either[^.]{0,80}\bor\b[^.]{0,60}\bnot\b|one or the other|that session is the primer|skip the gym primer)\b/i.test(src)) return [];
  return [{
    rule: 'DAY_MINUS_ONE_STACKED',
    day: dayBefore,
    detail: `Day -1 carries both an MMA ${cell.sport} session and ${gym.length} gym exercise${gym.length > 1 ? 's' : ''} (${[...new Set(gym.map((r) => r.name))].join(', ')}), and nothing says they are alternatives. Either may be trivial on its own; the block should state that one supplies the primer and the other is not also performed.`,
  }];
}

// --- 10. the block rewrites the athlete's sport week without saying so --------

export function sportScheduleChangedSilently(program, intake = {}, now = Date.now()) {
  let plan = null;
  try { plan = campPlanByWeek(intake, now); } catch { return []; }
  if (!plan) return [];
  const stated = new Map(arr(intake.sport_schedule)
    .map((s) => [weekdayKey(s && s.day), String((s && s.intensity) || '').toLowerCase()]).filter(([d]) => d));
  const demoted = [];
  for (const [week, p] of plan) {
    for (const [day, cell] of p.days) {
      const was = stated.get(day);
      if (!was || !cell.sport) continue;
      if (/hard|spar|live/.test(was) && cell.sport !== 'hard') demoted.push({ week, day });
    }
  }
  if (!demoted.length) return [];
  const src = String(program || '');
  // The change is fine when the block owns it as a recommendation and says what
  // happens if the sport coach does not make it.
  const owned = /\b(?:this (?:program|block) assumes|required camp (?:modification|recommendation)|ask your (?:MMA |sport |head )?coach|recommend(?:ed|ation)? (?:that )?(?:your )?(?:MMA |sport )?coach)\b/i.test(src);
  const fallback = /\bif (?:friday|saturday|sunday|monday|tuesday|wednesday|thursday|the (?:session|sport session|mat session)) (?:remains|stays|is still)\b/i.test(src);
  if (owned && fallback) return [];
  const days = WEEK_ORDER.filter((d) => demoted.some((x) => x.day === d)).join(', ');
  return [{
    rule: 'SPORT_SCHEDULE_CHANGED_SILENTLY',
    detail: `The camp schedule reduces ${days} from the intake's hard session to lighter work in ${demoted.length} week-days, and presents it as what the athlete's week already is. ${owned ? 'It is named as a recommendation but' : 'It is not named as a recommendation, and'} ${fallback ? '' : 'the block does not say what the gym becomes if the sport coach keeps the session hard'}.`.trim(),
  }];
}

// --- 11. a contingency that puts the same main lift on consecutive days -------

const SUB_RULE = /\buse (?:the )?([A-Z][A-Za-z ]{2,30}?)(?:\s+maintenance dose)?\s+(?:instead of|in place of)\s+(?:same-day\s+)?([A-Z][A-Za-z ]{2,30}?)\b/g;

export function contingencyCreatesAdjacentDuplicate(program) {
  const src = String(program || '');
  const all = rows(src);
  const dayIndex = (d) => WEEK_ORDER.indexOf(d);
  const out = [];
  const seen = new Set();
  for (const m of src.matchAll(SUB_RULE)) {
    const replacement = m[1].trim();
    const replaced = m[2].trim();
    if (!replacement || !replaced) continue;
    const hostDays = new Set(all.filter((r) => r.name.toLowerCase().includes(replaced.toLowerCase())).map((r) => r.day));
    const already = new Set(all.filter((r) => r.name.toLowerCase().includes(replacement.toLowerCase())).map((r) => r.day));
    for (const host of hostDays) {
      if (!host || already.has(host)) continue;
      const i = dayIndex(host);
      const neighbours = [WEEK_ORDER[(i + 6) % 7], WEEK_ORDER[(i + 1) % 7]].filter((d) => already.has(d));
      if (!neighbours.length) continue;
      const key = `${replacement}|${host}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // A contingency that forbids its own bad outcome is not this defect.
      //
      // His objection is that TAKING the substitution puts the lift on two
      // consecutive days "which was not the plan the athlete was given" -- so a
      // block that names the movement and says not to take it when that would
      // happen has answered him. The sport-schedule rule already carries the
      // same shape of escape for the same reason: a decision the program owns
      // out loud is a different thing from one it makes silently.
      const guarded = new RegExp(`${replacement.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^.]{0,120}\\b(?:two days in a row|consecutive days|back to back)\\b`, 'i');
      const refuses = /\b(?:do not take it|don't take it|do not make the swap|skip the substitution|keep the day as written)\b/i;
      if (guarded.test(src) && refuses.test(src)) continue;
      out.push({
        rule: 'CONTINGENCY_CREATES_ADJACENT_DUPLICATE',
        movement: replacement,
        detail: `A contingency swaps ${replaced} on ${host} for ${replacement}, which is already prescribed on ${neighbours.join(' and ')}. Taking the substitution puts ${replacement} on two consecutive days, which was not the plan the athlete was given.`,
      });
    }
  }
  return out;
}

// --- 12. the number of training days does not match the intake field ---------

export function trainingDaysVsIntake(program, intake = {}) {
  const stated = Number(intake.days_per_week);
  if (!Number.isFinite(stated) || stated <= 0) return [];
  const byWeek = new Map();
  for (const r of rows(program)) {
    if (!r.day) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, new Set());
    byWeek.get(r.week).add(r.day);
  }
  const counts = [...byWeek.values()].map((s) => s.size);
  if (!counts.length || counts.every((c) => c === stated)) return [];
  const head = String(program || '').split(/START_WEEK1_TSV/i)[0];
  // Saying which reading governs resolves it.
  // Programs write "three formal strength sessions", not "3". Matching only the
  // digit meant a block that did explain itself was flagged anyway.
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  const forms = [String(stated), WORDS[stated]].filter(Boolean).join('|');
  const kinds = '(?:gym|strength|formal|resistance|lifting|barbell)';
  // Adjacent, not merely nearby. An 80-character window let the "3" in
  // "Weeks 2-3 lengthen the quality reps ... while most strength" count as an
  // explanation of days_per_week, and the rule went quiet on a program that
  // explains nothing.
  const explained = new RegExp(`\\b(?:${forms})\\b(?:\\s+\\w+){0,2}\\s+${kinds}\\b|${kinds}\\b(?:\\s+\\w+){0,3}\\s+\\b(?:${forms})\\b`, 'i').test(head)
    || /\bdays_per_week\b/i.test(head);
  if (explained) return [];
  const most = Math.max(...counts);
  return [{
    rule: 'TRAINING_DAYS_VS_INTAKE',
    detail: `The intake says days_per_week: ${stated} and the block trains on ${most} calendar days, without saying which reading governs. ${stated} formal strength sessions spread across ${most} calendar days may be exactly right; the athlete cannot tell that from what they were sent.`,
  }];
}

// --- 14. in-season team sport: the three caps the coach specified ------------
//
// He gave operational definitions for these, which is the only reason they are
// encoded ahead of him scoring an in-season program. Everything else about the
// type stays unwritten until those programs come back with scores; his
// instruction, and the right one -- otherwise we are theorising ahead of
// calibration again.

const MATCH = /\bmatch\b|\bgame\b|\bfixture\b/i;
const STRENGTH_OR_POWER = /\bsquat\b|\bdeadlift\b|\bpress\b|\bpull[- ]?up\b|\brow\b|\bhip thrust\b|\bnordic\b|\bhamstring curl\b|\bjump\b|\bthrow\b|\bsprint\b|\bsled\b|\bprowler\b|\bclean\b|\bsnatch\b/i;

export function matchDay(intake = {}) {
  for (const s of arr(intake.sport_schedule)) {
    if (MATCH.test(String((s && s.intensity) || ''))) return weekdayKey(s && s.day);
  }
  return null;
}

const dayBefore = (d) => WEEK_ORDER[(WEEK_ORDER.indexOf(d) + 6) % 7];

export function inSeasonCaps(program, intake = {}) {
  const md = matchDay(intake);
  if (!md) return [];
  const out = [];
  const all = rows(program);

  // Heavy lower body on MD-1: his definition is a squat, deadlift, split squat
  // or comparable lift at RPE 7 or above for two or more work sets, on the day
  // before a match.
  const mdMinusOne = dayBefore(md);
  const heavy = all.filter((r) => r.day === mdMinusOne
    && LOWER_BODY_LIFT.test(r.name)
    && (r.sets ?? 0) >= 2
    && (num(String(r.cells.join(' ')).match(/RPE\s*([\d.]+)/i)?.[1]) ?? 0) >= 7);
  if (heavy.length) {
    out.push({
      rule: 'HEAVY_LOWER_BODY_ON_MD_MINUS_ONE',
      cap: 6.5,
      detail: `${[...new Set(heavy.map((r) => r.name))].join(', ')} is prescribed on ${mdMinusOne.toUpperCase()}, the day before the ${md.toUpperCase()} match, at RPE 7 or above for two or more work sets. That is a hard cap on the whole program.`,
    });
  }

  // No direct strength or power exposure at all, despite maintenance goals.
  const wantsStrength = /\b(?:strength|power|speed|sprint)\b/i.test(goalText(intake));
  const anyStrength = all.some((r) => STRENGTH_OR_POWER.test(r.name));
  if (wantsStrength && all.length && !anyStrength) {
    out.push({
      rule: 'NO_STRENGTH_EXPOSURE_IN_SEASON',
      cap: 7.0,
      detail: 'The athlete asks to hold strength, power or speed through the season and the block contains no direct strength or power exposure anywhere in four weeks.',
    });
  }

  // Training scheduled as though no match exists.
  const onMatchDay = all.filter((r) => r.day === md);
  const mentionsMatch = MATCH.test(String(program || '').split(/START_WEEK1_TSV/i)[0]);
  if (onMatchDay.length && !mentionsMatch) {
    out.push({
      rule: 'FIXTURE_IGNORED',
      cap: 6.0,
      detail: `The block schedules ${onMatchDay.length} gym exercise${onMatchDay.length > 1 ? 's' : ''} on ${md.toUpperCase()}, which the intake gives as match day, and never mentions the match anywhere in the summary.`,
    });
  }
  return out;
}

// --- 15. sprint speed and repeated-sprint ability -----------------------------
//
// From his football review. Three delivered programs for the same footballer
// scored 8.2, 8.7 and 9.0, and the whole spread sat in how they handled speed:
// one never prescribed a sprint at all, one never got past 20 m against a 30 m
// benchmark, and all three called a shuttle with a minute of rest "repeated
// sprint" work.

const SPRINT_NAME = /\bsprint\b|\bacceleration\b|\bflying\b|\bshuttle\b|\brun\b/i;
// Without the plurals this missed "Fast relaxed accelerations", which is how
// the best of the three football programs was accused of having no sprint work.
const SPRINT_INTENT = /\bsprints?\b|\baccelerations?\b|\bmax(?:imal)? speed\b|\bflying\b|\bspeed\b/i;

// Seconds a rest cell expresses: "60 s", "2:30", "20-30 s".
export function restSecondsOf(text) {
  const s = String(text || '');
  const clock = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  // "2 min 30 s" is a compound, not a maximum. Taking the largest number and
  // multiplying it by sixty because the string contained "min" turned two and
  // a half minutes into half an hour, and a ninety-second rest into the same.
  const compound = s.match(/(\d+(?:\.\d+)?)\s*min(?:ute)?s?\s*(\d+(?:\.\d+)?)\s*s(?:ec)?/i);
  if (compound) return Number(compound[1]) * 60 + Number(compound[2]);
  const mins = s.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (mins) return Number(mins[1]) * 60;
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  return Math.max(...nums);
}

const effortPct = (r) => {
  const all = [...String(r.cells.join(' ')).matchAll(/(\d{2,3})\s*%/g)].map((m) => Number(m[1]));
  return all.length ? Math.max(...all) : null;
};
const metres = (r) => {
  const m = String(r.reps).match(/(\d+(?:\.\d+)?)\s*m\b(?!in)/i);
  return m ? Number(m[1]) : null;
};

// The athlete's own sprint benchmark distance, from current_numbers.
export function sprintBenchmark(intake = {}) {
  const m = String(intake.current_numbers || '').match(/(\d+(?:\.\d+)?)\s*m\b[^\n]*?(\d+(?:\.\d+)?)\s*s\b/i);
  return m ? { metres: Number(m[1]), seconds: Number(m[2]) } : null;
}

// A row that is actually a sprint: named as one, with a distance and a rep
// count. His rule for Program A -- a warm-up with two build-ups does not count,
// because neither intensity, distance nor rep quality is prescribed.
function sprintRows(program) {
  return rows(program).filter((r) => SPRINT_NAME.test(r.name)
    && SPRINT_INTENT.test(`${r.name} ${r.load} ${r.notes}`)
    && metres(r) != null && (r.sets ?? 0) >= 1);
}

export function sprintSpeedExposure(program, intake = {}) {
  const primary = arr(intake.primary_goals).join(' ');
  if (!/\bsprint\b|\bspeed\b/i.test(primary)) return [];
  // A sport session explicitly marked as speed work satisfies it.
  if (arr(intake.sport_schedule).some((s) => /sprint|speed/i.test(String((s && s.intensity) || '')))) return [];
  const byWeek = new Map();
  for (const r of sprintRows(program)) byWeek.set(r.week, true);
  const missing = [1, 2, 3, 4].filter((w) => parseWeek(program, w) && !byWeek.has(w));
  if (!missing.length) return [];
  const bench = sprintBenchmark(intake);
  return [{
    rule: 'SPRINT_SPEED_EXPOSURE_MISSING',
    weeks: missing,
    detail: `Holding sprint speed is a primary goal${bench ? ` and the intake benchmarks it at ${bench.metres} m in ${bench.seconds} s` : ''}, and week${missing.length > 1 ? 's' : ''} ${missing.join(', ')} contain${missing.length > 1 ? '' : 's'} no prescribed sprint: no distance, no rep count, no intended speed. Build-ups inside a warm-up do not count, because nothing about their quality is prescribed.`,
  }];
}

// By Week 3, one speed session should reach the benchmark distance or 75% of
// it at 95% or more. Derived from the difference he scored between B, which
// stayed at 20 m against a 30 m benchmark, and C, which reached 30 m.
export function sprintDistanceSpecificity(program, intake = {}) {
  const primary = arr(intake.primary_goals).join(' ');
  if (!/\bsprint\b|\bspeed\b/i.test(primary)) return [];
  const bench = sprintBenchmark(intake);
  if (!bench) return [];
  const need = bench.metres * 0.75;
  const qualifying = sprintRows(program).filter((r) => r.week <= 3 && (metres(r) ?? 0) >= need && (effortPct(r) ?? 100) >= 95);
  if (qualifying.length) return [];
  const best = Math.max(0, ...sprintRows(program).filter((r) => r.week <= 3).map((r) => metres(r) ?? 0));
  if (!best) return [];
  return [{
    rule: 'SPRINT_DISTANCE_BELOW_BENCHMARK',
    detail: `The sprint benchmark is ${bench.metres} m and the longest sprint prescribed by Week 3 is ${best} m, short of the ${Math.round(need)} m that 75% of the benchmark asks for. The athlete is never exposed to the later part of the distance the goal is measured over.`,
  }];
}

// His machine-usable definition: more than two repetitions, each 10 s or less,
// intended effort 95% or more, recovery under 60 s and deliberately incomplete.
const RSA_GOAL = /repeat(?:ed)?[- ]sprint|repeat(?:ed)? effort|repeat sprint|late[- ]match sprint/i;

export function repeatedSprintExposure(program, intake = {}) {
  const goals = `${arr(intake.secondary_goals).join(' ')} ${arr(intake.primary_goals).join(' ')}`;
  if (!RSA_GOAL.test(goals)) return [];
  if (arr(intake.sport_schedule).some((s) => RSA_GOAL.test(String((s && s.intensity) || '')))) return [];
  const qualifying = rows(program).filter((r) => {
    if (!SPRINT_NAME.test(r.name) && !/prowler|sled/i.test(r.name)) return false;
    if ((r.sets ?? 0) < 3) return false;
    const rest = restSecondsOf(r.rest);
    if (rest == null || rest >= 60) return false;
    const effort = effortPct(r);
    if (effort != null && effort < 95) return false;
    return true;
  });
  if (qualifying.length) return [];
  const candidates = rows(program).filter((r) => SPRINT_NAME.test(r.name) || /prowler|sled/i.test(r.name));
  const shown = candidates.slice(0, 1).map((r) => `${r.name} ${r.sets}x${r.reps}, ${r.rest} recovery${effortPct(r) ? `, ${effortPct(r)}%` : ''}`)[0];
  return [{
    rule: 'REPEATED_SPRINT_EXPOSURE_MISSING',
    detail: `Improving repeated-sprint ability is a stated goal, and no week contains an exposure that meets the definition: more than two repetitions, each 10 s or less, at 95% effort or above, with under 60 s of deliberately incomplete recovery.${shown ? ` The nearest thing present is ${shown}, which is quality work with near-full recovery rather than repeatability work.` : ''}`,
  }];
}

// --- 16. eccentric hamstring exposure and the match ---------------------------
//
// For an athlete with recent hamstring strain history, the main eccentric dose
// belongs at least 72 hours before the match where the schedule permits, and
// lower-soreness work inside 48 hours.

const ECCENTRIC_HAMSTRING = /\bnordic\b|\brazor curl\b|\bglute[- ]ham raise\b|\bghr\b|\beccentric[^.]{0,20}hamstring\b/i;
const HAMSTRING_HISTORY = /hamstring|biceps femoris/i;

export function eccentricHamstringTiming(program, intake = {}) {
  const history = `${intake.injuries || ''} ${JSON.stringify(intake.pain || {})}`;
  if (!HAMSTRING_HISTORY.test(history)) return [];
  const md = matchDay(intake);
  if (!md) return [];
  const mdIndex = WEEK_ORDER.indexOf(md);
  const hoursBefore = (day) => {
    const i = WEEK_ORDER.indexOf(day);
    if (i < 0) return null;
    return ((mdIndex - i + 7) % 7) * 24;
  };
  const out = [];
  const seen = new Set();
  for (const r of rows(program)) {
    if (!ECCENTRIC_HAMSTRING.test(r.name)) continue;
    const h = hoursBefore(r.day);
    if (h == null || h >= 72) continue;
    if (seen.has(r.day)) continue;
    seen.add(r.day);
    out.push({
      rule: 'ECCENTRIC_HAMSTRING_TOO_CLOSE_TO_MATCH',
      day: r.day,
      detail: `${r.name} is prescribed on ${r.day.toUpperCase()}, ${h} hours before the ${md.toUpperCase()} match, for an athlete with recent hamstring strain history. The main eccentric dose belongs at least 72 hours out; inside 48 hours use lower-soreness hamstring work instead.`,
    });
  }
  return out;
}

// --- 17. the narrative promises a movement the block never prescribes --------
//
// His criticism of our claims rule, and he was right: it compares a claim about
// a subject against that subject's numbers, so it can only see claims about
// things the block actually contains. A football program said "Week 2 adds one
// acceleration rep" and contained no acceleration anywhere. Nothing looked,
// because there was nothing to look at.

const ADD_VERB = /\b(?:adds?|adding|introduc\w+|includes?|bring\w* in|steps? up to|progress(?:es|ing)? to)\b/i;
// "clean" is deliberately absent: in these programs it is almost always an
// adjective -- "if Week 1 stayed clean" -- and reading it as the lift accused a
// football block of promising power cleans. The olympic lifts are reachable
// through "snatch" and "jerk".
//
// Each entry carries the words that count as training it, because a Prowler
// Push is a sled and a row named "Run" can still prescribe accelerations.
const MOVEMENT_TERMS = [
  ['acceleration', /accelerat/i], ['sprint', /sprint/i], ['shuttle', /shuttle/i],
  ['squat', /squat/i], ['deadlift', /deadlift/i], ['nordic', /nordic/i],
  ['hip thrust', /hip thrust/i], ['pull-up', /pull[- ]?up/i], ['chin-up', /chin[- ]?up/i],
  ['row', /\brow\b/i], ['press', /press/i], ['dip', /\bdip\b/i],
  ['push-up', /push[- ]?up/i], ['sled', /sled|prowler/i], ['prowler', /sled|prowler/i],
  ['ruck', /ruck|backpack carry/i], ['jump', /jump|hop\b|bound/i], ['throw', /throw/i],
  ['snatch', /snatch/i], ['jerk', /jerk/i], ['lunge', /lunge|split squat/i],
];

export function promisedMovementAbsent(program) {
  const src = String(program || '');
  const head = narrativeOf(src);
  // The whole row, not only its name: a row called "Run" whose note reads
  // "90-92% relaxed accelerations" does prescribe accelerations.
  const trained = rows(src).map((r) => r.cells.join(' ').toLowerCase()).join(' | ');
  const out = [];
  const seen = new Set();
  for (const sentence of head.split(/(?<=[.;])\s+/)) {
    if (!ADD_VERB.test(sentence)) continue;
    for (const clause of sentence.split(/\s*;\s*/)) {
      if (!ADD_VERB.test(clause)) continue;
      for (const [term, trains] of MOVEMENT_TERMS) {
        if (!new RegExp(`\\b${term}s?\\b`, 'i').test(clause)) continue;
        if (trains.test(trained)) continue;
        if (seen.has(term)) continue;
        seen.add(term);
        out.push({
          rule: 'PROMISED_MOVEMENT_ABSENT',
          movement: term,
          detail: `The block says it will add ${term} work -- "${clause.trim().slice(0, 140)}" -- and no exercise in any week is a ${term}. The athlete is told about a progression in something they are never prescribed.`,
        });
      }
    }
  }
  return out;
}

// --- coverage: did the rule look, or did it just find nothing to look at? ----
//
// Four rules reported defects as fixed on a live program when they had gone
// blind. Goal-speed could not parse "per 400 m" and then excluded every
// interval as "easy"; the intensification band wanted a percentage in a cell
// and got kilos; the training-days rule matched a stray digit. Every one
// returned an empty array, which is the same thing a clean program returns.
//
// An empty result has two meanings and they are not interchangeable. This
// separates them: a rule that governs, found its inputs and found nothing wrong
// is a pass. A rule that governs and could not find its inputs is a hole, and
// saying so out loud is the only thing that would have caught those four
// without reading the programs by hand.

const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '' && v !== false);

export const RULE_INPUTS = {
  benchmarkExposure: (p, i) => ({
    governs: /advanced|elite/i.test(String(i.experience || '')) || Number(i.training_years) >= 3,
    found: has(benchmarks(i)) && has(rows(p)),
  }),
  improvementGoalFlat: (p, i) => ({ governs: has(goalFamilyTiers(i)), found: has(rows(p)) }),
  // The probe has to want what the rule wants. Asking only whether competition
  // lift rows exist called a block covered when every one of those rows said
  // "RPE-selected load" and the rule could compute no intensity from any of
  // them -- the same silence this whole mechanism exists to catch.
  intensificationBand: (p, i) => ({
    governs: /snatch|clean and jerk/i.test(goalText(i)),
    found: has(rows(p).filter((r) => /^(snatch|clean and jerk)$/i.test(r.name.trim())
      && (/(\d+(?:\.\d+)?)\s*kg/i.test(String(r.load)) || /(\d{2,3})\s*%\s*of\s*(?:current\s*)?max/i.test(r.cells.join(' ')))))
      && (benchmarkMax(i, /snatch/i) != null || benchmarkMax(i, /clean and jerk/i) != null),
  }),
  goalSpeedProgression: (p, i) => {
    const goal = arr(i.primary_goals).join(' ');
    const governs = /\d+(?:\.\d+)?\s*km/i.test(goal) && /\d{1,2}:\d{2}/.test(goal);
    const quality = rows(p).filter((r) => RUN.test(r.name)
      && (/(\d+(?:\.\d+)?)\s*(?:m|km)\b(?!in)/i.test(String(r.reps)) || /interval|repeat/i.test(`${r.name} ${r.load}`)));
    const paced = quality.filter((r) => /(\d{1,2}:\d{2})\s*(?:\/|per)\s*(?:\d+\s*m\b|km)/i.test(r.cells.join(' ')));
    return { governs, found: has(paced) };
  },
  ruckDistanceBelowTolerance: (p, i) => ({
    governs: /ruck/i.test(`${arr(i.secondary_goals).join(' ')} ${arr(i.primary_goals).join(' ')}`),
    found: toleratedDistance(i, /ruck/i) != null && has(rows(p).filter((r) => RUCK.test(r.name))),
  }),
  sprintSpeedExposure: (p, i) => ({
    governs: /\bsprint\b|\bspeed\b/i.test(arr(i.primary_goals).join(' ')),
    found: has(rows(p)),
  }),
  sprintDistanceSpecificity: (p, i) => ({
    governs: /\bsprint\b|\bspeed\b/i.test(arr(i.primary_goals).join(' ')) && sprintBenchmark(i) != null,
    found: has(rows(p).filter((r) => SPRINT_NAME.test(r.name))),
  }),
  repeatedSprintExposure: (p, i) => ({
    governs: RSA_GOAL.test(`${arr(i.secondary_goals).join(' ')} ${arr(i.primary_goals).join(' ')}`),
    found: has(rows(p)),
  }),
  taperAgainstSource: (p, i) => ({
    governs: hasEvent(i),
    found: has(rows(p).filter((r) => (r.sets ?? 0) > 0)),
  }),
  accessoryRedundancy: (p, i) => ({
    governs: has(statedGoalFamilies(i)),
    found: has(rows(p).filter((r) => movementFunction(r.name))),
  }),
  repeatedSprintProgression: (p, i) => ({
    governs: RSA_GOAL.test(`${arr(i.secondary_goals).join(' ')} ${arr(i.primary_goals).join(' ')}`),
    found: has(rows(p).filter((r) => (SPRINT_NAME.test(r.name) || /prowler|sled/i.test(r.name)) && restSecondsOf(r.rest) != null)),
  }),
  unanchoredPrimaryLoad: (p, i) => ({
    governs: has(goalFamilyTiers(i, ['primary']).filter((g) => /\d+\s*(?:kg|km|m\b)|\d{1,2}:\d{2}/i.test(g.goal))),
    found: has(rows(p)),
  }),
  consecutiveTrainingDays: (p, i) => ({
    governs: String(i.gym_availability_mode || '').toLowerCase() === 'flexible',
    found: has(rows(p).filter((r) => r.day)),
  }),
  consecutiveLowerLegDays: (p, i) => ({
    governs: /\bshin\b|\bstress fracture\b|\btibial\b|\bimpact\b/i.test(`${i.injuries || ''} ${JSON.stringify(i.pain || {})}`)
      && String(i.gym_availability_mode || '').toLowerCase() === 'flexible',
    found: has(rows(p).filter((r) => r.day)),
  }),
  eccentricHamstringTiming: (p, i) => ({
    governs: /hamstring|biceps femoris/i.test(`${i.injuries || ''} ${JSON.stringify(i.pain || {})}`) && matchDay(i) != null,
    found: has(rows(p).filter((r) => r.day)),
  }),
  inSeasonCaps: (p, i) => ({ governs: matchDay(i) != null, found: has(rows(p)) }),
  trainingDaysVsIntake: (p, i) => ({ governs: Number.isFinite(Number(i.days_per_week)), found: has(rows(p).filter((r) => r.day)) }),
};

// Rules whose inputs are the program's prose rather than its table, and which
// cannot go blind in the same way.
const ALWAYS_COVERED = new Set(['unsupportedAthleteFact', 'contingencyCreatesAdjacentDuplicate',
  'promisedMovementAbsent', 'dayMinusOneStacked', 'sportScheduleChangedSilently']);

export function gradeWithCoverage(program, intake = {}) {
  const findings = gradeProgram(program, intake);
  const blind = [];
  for (const fn of RULES) {
    if (ALWAYS_COVERED.has(fn.name)) continue;
    const probe = RULE_INPUTS[fn.name];
    if (!probe) { blind.push({ rule: fn.name, why: 'no coverage probe defined' }); continue; }
    let r;
    try { r = probe(program, intake); } catch (e) { blind.push({ rule: fn.name, why: `probe threw: ${e.message}` }); continue; }
    if (!r.governs) continue;
    if (!r.found) blind.push({ rule: fn.name, why: 'governs this athlete but found nothing in the program to judge' });
  }
  return { findings, blind };
}

// --- 18. repeated-sprint work has to move, not only exist --------------------
//
// His answer came in two halves and only the first was encoded. A block can
// contain a qualifying repeated-sprint exposure and still repeat it unchanged
// for four weeks, which is the same defect as any other flat improvement goal.
//
// By Week 3 one variable must improve: one more repetition, 10% more distance,
// or 10% less recovery. Week 4 may consolidate. The other two he listed --
// average sprint time, and decrement while peak is held -- need timed results
// the program cannot contain, so they are not encoded and their absence is not
// read as a failure.

export function repeatedSprintProgression(program, intake = {}) {
  const goals = `${arr(intake.secondary_goals).join(' ')} ${arr(intake.primary_goals).join(' ')}`;
  if (!RSA_GOAL.test(goals)) return [];
  const candidates = rows(program).filter((r) => {
    if (!SPRINT_NAME.test(r.name) && !/prowler|sled/i.test(r.name)) return false;
    const rest = restSecondsOf(r.rest);
    return rest != null && rest < 90 && (r.sets ?? 0) >= 3;
  });
  const byWeek = new Map();
  for (const r of candidates) {
    const m = (String(r.reps).match(/(\d+(?:\.\d+)?)\s*m\b(?!in)/i) || [])[1];
    const cur = { reps: r.sets ?? 0, metres: m ? Number(m) : null, rest: restSecondsOf(r.rest) };
    const best = byWeek.get(r.week);
    // One exposure per week: the densest one is the block's answer.
    if (!best || cur.reps > best.reps || (cur.rest != null && best.rest != null && cur.rest < best.rest)) byWeek.set(r.week, cur);
  }
  const w1 = byWeek.get(1);
  const upTo3 = [2, 3].map((w) => byWeek.get(w)).filter(Boolean);
  if (!w1 || !upTo3.length) return [];
  const improved = upTo3.some((w) => w.reps >= w1.reps + 1
    || (w.metres != null && w1.metres != null && w.metres >= w1.metres * 1.10)
    || (w.rest != null && w1.rest != null && w.rest <= w1.rest * 0.90));
  if (improved) return [];
  const show = (w) => (w ? `${w.reps} x ${w.metres ?? '?'} m / ${w.rest ?? '?'} s` : '-');
  return [{
    rule: 'REPEATED_SPRINT_NOT_PROGRESSING',
    detail: `Improving repeated-sprint ability is a stated goal and nothing about the exposure moves by Week 3: ${[1, 2, 3].map((w) => `W${w} ${show(byWeek.get(w))}`).join(', ')}. One variable is enough -- a repetition, 10% more distance, or 10% less recovery -- and Week 4 may consolidate.`,
  }];
}

// --- 19. accessory redundancy, the checkable half ----------------------------
//
// He filed accessory value under "Judgement, not rules" and was exact about
// where the line falls: "The checkable part is redundancy and goal relevance.
// The final marginal value judgement remains coaching judgement."
//
// So this asks only the checkable question -- does one movement function get
// several slots a week while serving nothing the athlete asked for -- and never
// the other one, which is whether a given exercise earns its recovery cost.
//
// Three of his four accessory findings are this exact shape: four rowing
// exposures for a weightlifter, two rows and two bench presses for a
// footballer, two rows and two overhead presses for the same footballer. The
// fourth is not, and stays unencoded: a single row and a single Pallof Press in
// a late fight camp, which is a marginal-return call and not a duplication.

export function accessoryRedundancy(program, intake = {}) {
  // A goal that names no movement makes every function goal-relevant, and there
  // is nothing to measure. That is the fight camp, and he raised a different
  // kind of finding there.
  const families = statedGoalFamilies(intake);
  if (!families.length) return [];
  const benched = benchmarks(intake).map((b) => b.name);

  const serves = (fn, names) => names.some((n) => families.some((f) => f.test(n))
    || benched.some((b) => movementFunction(b) === fn && families.some((f) => f.test(b))));

  const byWeek = new Map();
  for (const r of rows(program)) {
    const fn = movementFunction(r.name);
    if (!fn) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, new Map());
    const m = byWeek.get(r.week);
    if (!m.has(fn)) m.set(fn, []);
    m.get(fn).push(r.name);
  }
  const offending = new Map();
  for (const [, m] of byWeek) {
    for (const [fn, names] of m) {
      // Two different exercises, not the same one done twice. A lift repeated
      // across the week is frequency; two movements filling one slot is the
      // duplication he charged for.
      const distinct = [...new Set(names)];
      if (distinct.length < 2) continue;
      if (serves(fn, distinct)) continue;
      if (!offending.has(fn)) offending.set(fn, new Set());
      for (const n of distinct) offending.get(fn).add(n);
    }
  }
  if (!offending.size) return [];
  const shown = [...offending].map(([fn, names]) => `${fn.replace(/_/g, ' ')} (${[...names].join(', ')})`);
  return [{
    rule: 'ACCESSORY_REDUNDANCY',
    functions: [...offending.keys()],
    detail: `The block spends more than one slot a week on the same movement function while that function serves none of the athlete's stated goals: ${shown.join('; ')}. Whether any single one of these earns its place is a coaching call, but the duplication is time and recovery that the stated goals are not getting.`,
  }];
}

// --- 20. the taper, against the numbers the source actually gives ------------
//
// The Competition Preparation / Peaking / Tapering cluster is one of the four
// documents the generator's knowledge is built on, and none of it had ever
// reached the engine: "pretaper", "taper duration" and "Mujika" appear zero
// times in engine_instructions.txt. Every taper rule the engine had came
// second-hand, through a coach reading a delivered program.
//
// Mujika's meta-analysis, as the cluster summarises it:
//
//   Volume     reduced 41-60% of pretaper is the strongest general starting
//              point, and is the primary fatigue-reduction lever
//   Intensity  maintained -- keep competition-relevant load, pace or intent
//              while sharply reducing repetitions
//   Frequency  held more than volume; sessions become shorter, not fewer
//
// The cluster states its own evidence boundary, so this is written as a band
// with a wide tolerance rather than a target: it flags a taper that barely
// reduces volume, one that cuts frequency as hard as volume, and one that
// throws the intensity away with the work.

import { STATE as COMP_STATE, stateForWeek, hasEvent } from './v68_competition_state.js';

const TAPER_VOLUME_BAND = [0.41, 0.60];
const TAPER_MIN_REDUCTION = 0.25;      // below this the week is not a taper at all
const FREQUENCY_FLOOR = 0.70;          // sessions stay; they get shorter
//
// No intensity threshold is encoded. The cluster is explicit that intensity is
// maintained and gives numbers for volume, duration and frequency -- and none
// for intensity, saying only that the athlete "can still touch meaningful
// loads". A first version invented an 85% floor and flagged a meet week at 82%
// of its pre-taper top load, which is a number the source does not support.

function weekLoad(program) {
  const out = new Map();
  for (const r of rows(program)) {
    if (!out.has(r.week)) out.set(r.week, { sets: 0, days: new Set(), topKg: 0 });
    const w = out.get(r.week);
    w.sets += r.sets ?? 0;
    // The day LABEL, not a weekday key. Competition week is written on a
    // countdown -- "Day -5" to "Day -1" -- which weekdayKey correctly refuses
    // to resolve, so counting keys reported a five-session week as zero
    // sessions and called a sound taper a frequency collapse.
    if (r.dayLabel) w.days.add(r.dayLabel);
    const kg = Number((String(r.load).match(/(\d+(?:\.\d+)?)\s*kg/i) || [])[1]);
    if (Number.isFinite(kg) && kg > w.topKg) w.topKg = kg;
  }
  return out;
}

export function taperAgainstSource(program, intake = {}, now = Date.now()) {
  if (!hasEvent(intake)) return [];
  const weeks = [1, 2, 3, 4].filter((w) => parseWeek(program, w));
  const compWeek = weeks.find((w) => stateForWeek(intake, w, now) === COMP_STATE.COMPETITION_WEEK);
  if (!compWeek || compWeek === 1) return [];
  const load = weekLoad(program);
  const taper = load.get(compWeek);
  const pre = weeks.filter((w) => w < compWeek).map((w) => load.get(w)).filter(Boolean);
  if (!taper || pre.length < 2) return [];

  const baseSets = pre.reduce((n, w) => n + w.sets, 0) / pre.length;
  const baseDays = pre.reduce((n, w) => n + w.days.size, 0) / pre.length;
  if (!baseSets) return [];

  const cut = 1 - taper.sets / baseSets;
  const out = [];

  if (cut < TAPER_MIN_REDUCTION) {
    out.push({
      rule: 'TAPER_VOLUME_NOT_REDUCED',
      detail: `Week ${compWeek} is competition week and carries ${taper.sets} working sets against a pre-taper average of ${baseSets.toFixed(0)} -- a reduction of ${(cut * 100).toFixed(0)}%. The strongest general starting point is ${TAPER_VOLUME_BAND[0] * 100}-${TAPER_VOLUME_BAND[1] * 100}% off pre-taper volume, and volume is the lever that sheds fatigue.`,
    });
  }

  // Duration. "8 to 14 days is a defensible general starting window when no
  // individual taper history exists." In a block whose final week is the event,
  // the 8-14 day window opens in the week before it -- so the reduction has to
  // have started by then. A block that holds volume flat and empties it only in
  // the last seven days has tapered for half the window.
  //
  // The threshold is deliberately loose. Every competition program we have
  // begins the descent at 27-33% by that week, so 10% is a floor that catches a
  // block which has not begun rather than one that begins gently.
  const preTaperWeek = load.get(compWeek - 1);
  if (preTaperWeek && pre.length >= 2) {
    const earlier = pre.filter((w) => w !== preTaperWeek);
    const earlyBase = earlier.length ? earlier.reduce((n, w) => n + w.sets, 0) / earlier.length : 0;
    const begun = earlyBase ? 1 - preTaperWeek.sets / earlyBase : 0;
    if (earlyBase && begun < 0.10 && cut >= TAPER_MIN_REDUCTION) {
      out.push({
        rule: 'TAPER_COMPRESSED_INTO_FINAL_WEEK',
        detail: `The whole reduction lands in competition week: week ${compWeek - 1} carries ${preTaperWeek.sets} working sets against ${earlyBase.toFixed(0)} earlier, ${begun <= 0 ? 'no reduction at all' : `only ${(begun * 100).toFixed(0)}% down`}, and then week ${compWeek} drops ${(cut * 100).toFixed(0)}%. The general starting window is 8 to 14 days, which opens in week ${compWeek - 1}; a taper confined to the last seven days is half of it.`,
      });
    }
  }

  // Frequency is not the lever -- through the taper, and not into competition
  // week.
  //
  // This floor was measured against competition week, which put it in direct
  // conflict with the coach's own review: he charged a HYROX block 0.20 for
  // four straight competition-week days, and the only way to break the run was
  // to drop to three, which this rule then refused. Four sessions into a
  // four-day window are necessarily consecutive, so the two rules together had
  // no legal layout at all and the engine left the week alone.
  //
  // He resolved it by scoping the floor: it governs the taper week before
  // competition week, where keeping the athlete turning up costs nothing, and
  // not competition week itself, where a fourth session manufactured only to
  // preserve frequency is the thing being paid for. Frequency is not an end in
  // itself -- the taper sheds fatigue by reducing workload while intensity and
  // quality are held.
  if (preTaperWeek && baseDays && preTaperWeek.days.size / baseDays < FREQUENCY_FLOOR) {
    out.push({
      rule: 'TAPER_CUTS_FREQUENCY_NOT_VOLUME',
      detail: `Week ${compWeek - 1} is the taper week and drops from ${baseDays.toFixed(1)} training days to ${preTaperWeek.days.size}. Frequency is held through a taper more than volume is -- the athlete keeps turning up, and the sessions get shorter. Competition week itself is not governed by this floor.`,
    });
  }

  return out;
}
