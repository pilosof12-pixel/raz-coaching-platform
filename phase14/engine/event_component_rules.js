// engine/event_component_rules.js
//
// What an event is made of, and whether the block trained it.
//
// This is the concept the grader did not have. It cost the first Hyrox block
// 1.05 across two findings -- four of eight stations absent (0.60) and almost
// no running off a station (0.45) -- and both were invisible to every rule we
// had, because nothing knew a race has required parts.
//
// The thresholds are the coach's, given as rules with numbers so they could
// become checks. Where he marked something as judgement rather than rule, it is
// not encoded: he was explicit that 25% of a wall-ball set and 25% of a maximal
// strength event do not impose the same stress, so the dose floor flags
// coverage and does not pretend to design the session.

import { rows } from './coach_rules.js';
import { namedComponentsFor, eventIsOrdered } from './coach_standard.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

// How each component is recognised in a program, and what the race asks for.
// The race figures are the published Hyrox distances, used only to size the
// coach's 25% dose floor -- they are the event's definition, not a coaching
// judgement.
const COMPONENT_SPEC = {
  'SkiErg':            { match: /ski ?erg|ski ?machine/i,                               race: { metres: 1000 } },
  'Sled Push':         { match: /sled push|prowler push|sled drive/i,                   race: { metres: 50 } },
  'Sled Pull':         { match: /sled pull|rope pull|sled drag/i,                       race: { metres: 50 } },
  'Burpee Broad Jump': { match: /burpee broad jump|burpee long jump/i,                  race: { metres: 80 } },
  // The exclusion looks at the whole name, not at what follows the word. A
  // negative lookahead passed on "Chest-Supported Row" because Row is the last
  // word and nothing follows it, so a cable row counted as the rowing erg --
  // which quietly satisfied the compromised-running floor and hid the very
  // finding this file exists to catch.
  'Row':               { match: /\brow(er|ing)?\b/i, race: { metres: 1000 },
                         not: /cable|chest|barbell|pendlay|seated|bent|dumbbell|machine|inverted|ring|t-?bar|landmine|renegade/i },
  'Farmers Carry':     { match: /farmer'?s? (carry|walk)/i,                             race: { metres: 200 } },
  'Sandbag Lunge':     { match: /sandbag lunge|sandbag walking lunge/i,                 race: { metres: 100 } },
  'Wall Ball':         { match: /wall ?ball/i,                                          race: { reps: 100 } },
  'Swim':              { match: /\bswim\b/i,                                            race: null },
  'Bike':              { match: /\bbike\b|cycling|bike ?erg/i,                          race: null },
  'Run':               { match: /\brun\b|\brunning\b|treadmill/i,                       race: null },
};

const DOSE_FRACTION = 0.25;          // "at least 25% of race distance / reps / duration"
const COVERAGE_WEEK1 = 0.75;         // "Week 1: at least 75% of named components"
const MIN_EXPOSURES_W1_W3 = 2;       // "at least 2 total direct exposures across the three weeks"

const matcherFor = (name) => {
  const spec = COMPONENT_SPEC[name];
  const re = spec?.match || new RegExp(String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const not = spec?.not;
  return { test: (s) => re.test(String(s || '')) && !(not && not.test(String(s || ''))) };
};

// A row is a direct exposure of a component when it names it and carries enough
// work to count. A single token set does not satisfy coverage; the coach said
// so explicitly.
function exposureOf(row, component) {
  if (isWarmup(row.name) || !matcherFor(component).test(row.name)) return null;
  const spec = COMPONENT_SPEC[component];
  const sets = Number(row.sets) || 1;
  const reps = String(row.reps || '');
  const metres = (reps.match(/(\d+(?:\.\d+)?)\s*m\b/i) || [])[1];
  const count = (reps.match(/^(\d+)\b/) || [])[1];
  const done = metres ? sets * Number(metres) : count ? sets * Number(count) : null;

  if (!spec?.race || done === null) return { row, sufficient: true, unknownDose: true };
  const need = (spec.race.metres || spec.race.reps) * DOSE_FRACTION;
  return { row, sufficient: done >= need, done, need, unknownDose: false };
}

export function componentExposures(program, intake = {}) {
  const components = namedComponentsFor(intake);
  if (!components.length) return null;
  const byWeek = new Map();
  for (const r of rows(program)) {
    for (const c of components) {
      const e = exposureOf(r, c);
      if (!e) continue;
      const key = `${r.week}|${c}`;
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key).push(e);
    }
  }
  const trainedIn = (week, c) => (byWeek.get(`${week}|${c}`) || []).some((e) => e.sufficient);
  return { components, trainedIn, byWeek };
}

// --- 1. coverage by week ------------------------------------------------------

export function eventComponentCoverage(program, intake = {}) {
  const model = componentExposures(program, intake);
  if (!model) return [];
  const { components, trainedIn } = model;
  const out = [];

  const missingIn = (week) => components.filter((c) => !trainedIn(week, c));
  const seenBy = (week) => components.filter((c) => [1, 2, 3, 4].slice(0, week).some((w) => trainedIn(w, c)));

  // Week 1: at least 75% of named components have a direct exposure.
  const week1 = components.length - missingIn(1).length;
  if (week1 < Math.ceil(components.length * COVERAGE_WEEK1)) {
    out.push({
      rule: 'EVENT_COMPONENT_COVERAGE_WEEK1',
      week: 1,
      detail: `Week 1 trains ${week1} of ${components.length} named race components against a floor of ${Math.ceil(components.length * COVERAGE_WEEK1)} (75%). Absent: ${missingIn(1).join(', ')}.`,
    });
  }

  // By the end of week 2: every component has appeared at least once.
  const byTwo = seenBy(2);
  if (byTwo.length < components.length) {
    const absent = components.filter((c) => !byTwo.includes(c));
    out.push({
      rule: 'EVENT_COMPONENT_NEVER_TRAINED',
      week: 2,
      components: absent,
      detail: `${absent.join(', ')} ${absent.length === 1 ? 'is a named race component that has' : 'are named race components that have'} not been trained by the end of week 2, when every component must have appeared at least once.`,
    });
  }

  // Weeks 1-3: two direct exposures each. Week 4 is exempt -- competition week
  // may keep only what serves race feel.
  for (const c of components) {
    const n = [1, 2, 3].filter((w) => trainedIn(w, c)).length;
    if (n > 0 && n < MIN_EXPOSURES_W1_W3) {
      out.push({
        rule: 'EVENT_COMPONENT_SINGLE_EXPOSURE',
        component: c,
        detail: `${c} is trained once across weeks 1 to 3, against a floor of ${MIN_EXPOSURES_W1_W3} direct exposures, and no rehearsal supplies the second.`,
      });
    }
  }
  return out;
}

// --- 2. a component the athlete has a number for ------------------------------

export function benchmarkedComponentNeglected(program, intake = {}) {
  const model = componentExposures(program, intake);
  if (!model) return [];
  const { components, trainedIn } = model;
  const numbers = `${String(intake.current_numbers || '')} ${JSON.stringify(intake.performance_markers || [])}`;
  const out = [];
  for (const c of components) {
    if (!matcherFor(c).test(numbers)) continue;
    // "it must appear by Week 1 ... at least one direct exposure per week in
    // weeks 1 and 2 ... direct or rehearsal in week 3."
    const missed = [1, 2].filter((w) => !trainedIn(w, c));
    if (!missed.length) continue;
    out.push({
      rule: 'BENCHMARKED_COMPONENT_NEGLECTED',
      component: c,
      detail: `${c} is a race component the athlete has given a number for, so it carries a higher requirement than an unbenchmarked one: an exposure in week 1 and one in every week to week 2. It is absent in week${missed.length > 1 ? 's' : ''} ${missed.join(' and ')}.`,
    });
  }
  return out;
}

// --- 3. running off a station -------------------------------------------------
//
// "A few easy sled steps followed five minutes later by jogging does not count."
// The parts of his definition a table can carry are adjacency and dose; the
// two-minute transition window is not written in these rows, so it is not
// asserted here.

const RUN_LIKE = /\brun\b|\brunning\b|treadmill|\bski ?erg\b|\brow(er)?\b/i;

export function compromisedWorkMissing(program, intake = {}) {
  const components = namedComponentsFor(intake);
  if (components.length < 2) return [];
  const stations = components.filter((c) => !/^(run|swim|bike)$/i.test(c));
  if (!stations.length) return [];

  const isStation = (name) => stations.some((c) => matcherFor(c).test(name));
  const pairsByWeek = new Map();

  let day = '';
  let prev = null;
  for (const r of rows(program)) {
    if (isWarmup(r.name)) continue;
    if (r.dayLabel && r.dayLabel !== day) { day = r.dayLabel; prev = null; }
    const station = isStation(r.name);
    const running = /\brun\b|\brunning\b|treadmill/i.test(r.name);
    if (prev) {
      const key = r.week;
      if (!pairsByWeek.has(key)) pairsByWeek.set(key, { stationThenRun: 0, runThenStation: 0 });
      if (prev.station && running) pairsByWeek.get(key).stationThenRun += 1;
      if (prev.running && station) pairsByWeek.get(key).runThenStation += 1;
    }
    prev = { station, running };
  }

  const out = [];
  // "Week 1: at least 1 compromised pair. Week 2: at least 2." Week 3 wants a
  // reduced exposure; week 4 has no minimum.
  for (const [week, floor] of [[1, 1], [2, 2], [3, 1]]) {
    const seen = pairsByWeek.get(week) || { stationThenRun: 0, runThenStation: 0 };
    if (seen.stationThenRun < floor) {
      out.push({
        rule: 'COMPROMISED_RUNNING_MISSING',
        week,
        found: seen.stationThenRun,
        detail: `Week ${week} prescribes ${seen.stationThenRun} run-off-a-station pair${seen.stationThenRun === 1 ? '' : 's'} against a floor of ${floor}. Running in isolation is not the race demand: the athlete has to resume running after a station, and a kilometre from a clean state is a different task from the same kilometre after a sled.`,
      });
    }
  }
  // Both directions must appear across weeks 1 and 2.
  const early = [1, 2].reduce((n, w) => n + (pairsByWeek.get(w)?.runThenStation || 0), 0);
  if (early === 0) {
    out.push({
      rule: 'TRANSITION_DIRECTION_MISSING',
      detail: 'No station is prescribed immediately after a run in weeks 1 or 2. Station-then-run and run-then-station are different qualities, and an alternating race needs both.',
    });
  }
  return out;
}

// --- 4. a rehearsal, not just a hard session ----------------------------------

const REHEARSAL_COMPONENT_SHARE = 0.5;
const REHEARSAL_MIN_TRANSITIONS = 3;
const LAST_REHEARSAL_MIN_DAYS = 8;

export function raceRehearsalMissing(program, intake = {}) {
  const components = namedComponentsFor(intake);
  if (components.length < 2) return [];
  const needed = Math.ceil(components.length * REHEARSAL_COMPONENT_SHARE);

  // A rehearsal is one day that carries at least half the components and at
  // least three transitions between them.
  const byDay = new Map();
  let key = '';
  for (const r of rows(program)) {
    if (isWarmup(r.name)) continue;
    if (r.dayLabel) key = `${r.week}|${r.dayLabel}`;
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, { week: r.week, names: [] });
    byDay.get(key).names.push(r.name);
  }

  const rehearsals = [];
  for (const [, day] of byDay) {
    const present = components.filter((c) => day.names.some((n) => matcherFor(c).test(n)));
    if (present.length < needed) continue;
    let transitions = 0;
    let last = null;
    for (const n of day.names) {
      const which = components.find((c) => matcherFor(c).test(n)) || null;
      if (which && last && which !== last) transitions += 1;
      if (which) last = which;
    }
    if (transitions >= REHEARSAL_MIN_TRANSITIONS) rehearsals.push({ week: day.week, present: present.length, transitions });
  }

  const out = [];
  // "Week 2: at least one rehearsal required."
  if (!rehearsals.some((r) => r.week <= 2)) {
    out.push({
      rule: 'RACE_REHEARSAL_MISSING',
      detail: `No session in weeks 1 or 2 rehearses the race: that needs at least ${needed} of the ${components.length} components in one session with at least ${REHEARSAL_MIN_TRANSITIONS} transitions between them${eventIsOrdered(intake) ? ', in competition order' : ''}. Isolated intervals with full recovery between every component are not a rehearsal.`,
    });
  }
  // "The final near-competition rehearsal must occur at least 8 days before."
  const late = rehearsals.filter((r) => r.week === 4);
  if (late.length) {
    out.push({
      rule: 'REHEARSAL_INSIDE_FINAL_WEEK',
      week: 4,
      detail: `A full race rehearsal sits in competition week. The last one belongs at least ${LAST_REHEARSAL_MIN_DAYS} days out; inside the final seven days it costs more than it teaches.`,
    });
  }
  return out;
}

// --- 5. a race component whose load is never related to the race --------------
//
// His calibration note draws the line precisely: RPE-selected load is not a
// defect on accessory work that carries an RPE and a stop criterion -- a Pallof
// Press at RPE 6 is anchored enough for its role. It becomes a defect when the
// load is what makes the work specific to the event. A sled at "RPE-selected
// load" in a race block, when the competition sled load is a known figure, is
// training the movement and not the race.
const LOAD_DEFINED_COMPONENTS = new Set(['Sled Push', 'Sled Pull', 'Farmers Carry', 'Sandbag Lunge', 'Wall Ball']);
const UNANCHORED_LOAD = /^\s*(?:rpe[- ]selected|rpe[- ]based|as prescribed|athlete[- ]selected|challenging|moderate|light|heavy)\b/i;

export function componentLoadUnanchored(program, intake = {}) {
  const components = namedComponentsFor(intake).filter((c) => LOAD_DEFINED_COMPONENTS.has(c));
  if (!components.length) return [];
  const out = [];
  const seen = new Set();
  for (const r of rows(program)) {
    if (isWarmup(r.name)) continue;
    const which = components.find((c) => matcherFor(c).test(r.name));
    if (!which || seen.has(which)) continue;
    const load = String(r.load || '').trim();
    if (load && !UNANCHORED_LOAD.test(load)) continue;
    seen.add(which);
    out.push({
      rule: 'COMPONENT_LOAD_UNANCHORED',
      component: which,
      movement: r.name,
      detail: `${r.name} is the ${which} station and is prescribed at "${load || 'no load at all'}". This is the one place an unanchored load is a real defect rather than a harmless one: the competition load is a known figure, and it is the load that makes this work specific to the race rather than to the movement.`,
    });
  }
  return out;
}

export const EVENT_COMPONENT_RULES = [
  eventComponentCoverage, benchmarkedComponentNeglected, compromisedWorkMissing, raceRehearsalMissing,
  componentLoadUnanchored,
];

// --- the brief ----------------------------------------------------------------
//
// This is the half that actually raises a score, and its absence is why the
// first Hyrox block came back at 7.3.
//
// The engine's own grader found two problems with that program. The coach found
// seven. The 31,742-character brief that produced it never contained the words
// "wall ball", "sandbag" or "burpee", never said "compromised", and never said
// "race pace". The model wrote a competent general hybrid block because that is
// exactly what it was asked for. Checking for the missing stations afterwards
// finds the defect; naming them beforehand prevents it.

const RACE_TEXT = {
  'SkiErg': '1000 m',
  'Sled Push': '50 m at competition load',
  'Sled Pull': '50 m at competition load',
  'Burpee Broad Jump': '80 m',
  'Row': '1000 m',
  'Farmers Carry': '200 m at competition load',
  'Sandbag Lunge': '100 m at competition load',
  'Wall Ball': '100 reps',
};

export function buildEventComponentBrief(intake = {}) {
  const components = namedComponentsFor(intake);
  if (components.length < 2) return '';
  const ordered = eventIsOrdered(intake);
  const numbers = `${String(intake.current_numbers || '')} ${JSON.stringify(intake.performance_markers || [])}`;
  const benchmarked = components.filter((c) => matcherFor(c).test(numbers));
  const week1Floor = Math.ceil(components.length * COVERAGE_WEEK1);
  const rehearsalFloor = Math.ceil(components.length * REHEARSAL_COMPONENT_SHARE);

  const lines = [
    '* TRAIN THE EVENT, NOT THE FITNESS THE EVENT HAPPENS TO NEED.',
    `  This athlete's race is made of ${components.length} named parts, and every one of them is a skill with a technique and a pace of its own. A block that builds general strength and general running is not a block that prepares for this race.`,
    '',
    `  The parts: ${components.map((c) => (RACE_TEXT[c] ? `${c} (${RACE_TEXT[c]})` : c)).join(', ')}.`,
    '',
    `  - Week 1 must give a direct exposure to at least ${week1Floor} of the ${components.length}.`,
    `  - By the end of Week 2 all ${components.length} must have appeared at least once.`,
    '  - Each one needs at least two direct exposures across Weeks 1 to 3.',
    '  - An exposure counts when it reaches about a quarter of the race dose at race execution: a quarter of the distance, a quarter of the reps, or a quarter of the duration at a stated race-relevant intensity. Loaded parts use at least 90% of competition load. One token set does not count.',
    '  - Competition week is exempt. Keep only what serves race feel and readiness.',
  ];

  if (benchmarked.length) {
    lines.push('',
      `  ${benchmarked.join(' and ')} carr${benchmarked.length === 1 ? 'ies' : 'y'} a number the athlete gave us, so ${benchmarked.length === 1 ? 'it' : 'they'} must appear in Week 1, again in Week 2, and be prescribed against that number rather than left to feel.`);
  }

  lines.push('',
    '* THE RACE IS RUN TIRED, SO TRAIN IT TIRED.',
    '  Running from a clean start is not the demand. The athlete has to pick the pace back up immediately after a station, and a kilometre off a sled is a different task from the same kilometre fresh.',
    '',
    '  - Week 1: at least one pair of a station followed straight into a run.',
    '  - Week 2: at least two such pairs.',
    '  - Week 3: at least one, at reduced volume.',
    '  - Across Weeks 1 and 2, train both directions: a station into a run, and a run into a station. They are different qualities.',
    '  - Hold the run in these pairs at 95-102% of planned race pace. If pace or technique falls away, end the session rather than grinding it out.',
    '',
    '* ONE SESSION THAT LOOKS LIKE THE RACE.',
    `  Weeks 1 or 2 must contain a genuine rehearsal: at least ${rehearsalFloor} of the ${components.length} parts in a single session${ordered ? ', in competition order' : ''}, at least three transitions between them, loaded parts at 90-100% of competition load, running at 95-102% of race pace, and at least 30% of expected race duration.`,
    '  Isolated intervals with full recovery between every part are not a rehearsal.',
    '  Do not place a full rehearsal inside the last seven days; the final one belongs at least eight days out.');

  return lines.join('\n');
}
