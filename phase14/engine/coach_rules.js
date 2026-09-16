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
const longestRun = (days) => {
  const present = WEEK_ORDER.map((d) => days.has(d));
  if (present.every(Boolean)) return 7;
  let best = 0;
  let run = 0;
  for (let i = 0; i < 14; i += 1) {
    if (present[i % 7]) { run += 1; if (run > best) best = run; } else run = 0;
  }
  return Math.min(best, 7);
};

// --- 1. consecutive training days, flexible availability ----------------------

export function consecutiveTrainingDays(program, intake = {}) {
  if (String(intake.gym_availability_mode || '').toLowerCase() !== 'flexible') return [];
  const limit = THRESHOLDS.MAX_CONSECUTIVE_LIFTING_DAYS;
  const byWeek = new Map();
  for (const r of rows(program)) {
    if (!r.day) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, new Set());
    byWeek.get(r.week).add(r.day);
  }
  const out = [];
  for (const [week, days] of byWeek) {
    const run = longestRun(days);
    if (run > limit) {
      out.push({
        rule: 'CONSECUTIVE_TRAINING_DAYS',
        week,
        detail: `Week ${week} trains ${run} days in a row (${[...days].join(', ')}) against a limit of ${limit} when availability is flexible.`,
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
  { goal: /\brows?\b|\berg\b/i, family: /\brow\b|\berg\b/i },
  { goal: /\bdips?\b/i, family: /\bdip\b/i },
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

export function intensificationBand(program, intake = {}) {
  const pct = [];
  for (const r of rows(program)) {
    for (const m of String(r.cells.join(' ')).matchAll(/(\d{2,3})\s*%\s*of\s*(?:current\s*)?max/gi)) {
      pct.push({ week: r.week, name: r.name, pct: Number(m[1]) });
    }
  }
  if (!pct.length) return [];
  const isOly = /snatch|clean|jerk/i;
  const lifts = pct.filter((p) => isOly.test(p.name));
  if (!lifts.length) return [];
  const byWeek3 = lifts.filter((p) => p.week >= 3);
  if (!byWeek3.length) return [];
  const [lo] = THRESHOLDS.OLY_WEEK3_SNATCH_INTENSITY_BAND;
  const top = Math.max(...byWeek3.map((p) => p.pct));
  if (top >= lo * 100) return [];
  return [{
    rule: 'INTENSIFICATION_BAND_NOT_REACHED',
    peak: top,
    required: lo * 100,
    detail: `By Week 3 the heaviest competition-lift exposure is ${top}% of current max, and the standard asks for at least ${lo * 100}%. Peak across the block: ${Math.max(...lifts.map((p) => p.pct))}%.`,
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
    const pace = String(r.cells.join(' ')).match(/(\d{1,2}:\d{2})\s*\/\s*(\d+)\s*m\b/i)
      || String(r.cells.join(' ')).match(/(\d{1,2}:\d{2})\s*\/\s*km/i);
    let secPerKm = null;
    if (pace && pace[2]) secPerKm = secs(pace[1]) / (Number(pace[2]) / 1000);
    else if (pace) secPerKm = secs(pace[1]);
    else if (dist && /interval|repeat/i.test(`${r.notes} ${r.load}`)) continue;
    if (secPerKm == null) continue;
    // Quality work only: an easy run is not an attempt at goal pace.
    if (/easy|conversational|zone ?2|recovery|cool/i.test(r.cells.join(' '))) continue;
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
  const out = [];
  for (const [name, list] of byName) {
    if (list.some(loadAnchored)) continue;
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
  const explained = new RegExp(`\\b(?:${forms})\\b[^.]{0,80}\\b${kinds}\\b|\\b${kinds}\\b[^.]{0,80}\\b(?:${forms})\\b`, 'i').test(head)
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
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  const top = Math.max(...nums);
  if (/\bmin\b/i.test(s)) return top * 60;
  return top;
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
