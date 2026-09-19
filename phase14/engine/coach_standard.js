// engine/coach_standard.js
//
// The reviewing coach's own scoring model, encoded. The prose it comes from is
// docs/qa/COACHING_REVIEW_STANDARD.md; this file holds only the parts a machine
// can evaluate.
//
// The important thing this settles: for three delivered programs the coach gave
// both a set of findings with point costs and an overall score, and we had been
// reading the costs as the score. They are not. Subtracting them from ten
// misses by 0.15, 0.80 and 0.15. The weighted dimension scores reproduce all
// three exactly -- 8.2300, 7.6380, 8.9290 -- so the costs are severity markers
// that set a dimension's score, and the dimensions produce the number.
//
// That distinction changes what is worth building. A defect's cost is not what
// it removes from the total; what it removes is its cost times the weight of
// the dimension it lands in. The same 0.40 finding is worth 0.14 of the overall
// score in a fight camp's strength dimension and 0.032 in its execution rules.

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const txt = (v) => arr(v).map((x) => String(x || '')).join(' ').toLowerCase();
const goals = (intake, tier) => txt(intake[`${tier}_goals`]);

export const PROGRAM_TYPE = {
  WEIGHTLIFTING: 'weightlifting',
  TACTICAL_ENDURANCE: 'tactical_endurance',
  COMBAT_CAMP: 'combat_camp',
  IN_SEASON_TEAM_SPORT: 'in_season_team_sport',
  // An event made of two or more named components known before the day: a
  // Hyrox, a triathlon, a strongman card, a defined selection test. Added after
  // the first Hyrox block came back `unclassified` and had to be scored on
  // borrowed tactical-endurance weights.
  HYBRID_MULTI_COMPONENT_EVENT: 'hybrid_multi_component_event',
  UNCLASSIFIED: 'unclassified',
};

// Weights are the coach's, per type, and each set sums to 1. They are not
// interchangeable: the combat set puts 35% on strength maintenance, which is
// why one exercise choice moved Program 3 by 0.4.
export const DIMENSIONS = {
  // His weights for a multi-component event. Event specificity carries the most
  // because the largest defect he found on the first such program was
  // incomplete component coverage, charged at 0.60, and the next was compromised
  // running at 0.45.
  //
  // Unlike the four sets above, these have not been shown to reproduce his own
  // published score: his six dimension scores against these weights give 7.4650
  // and he published 7.3. The other four sets reproduce his scores to four
  // decimal places. The gap is recorded rather than tuned away, because fitting
  // six weights to one observation would make the model agree with him once and
  // mean nothing afterwards.
  [PROGRAM_TYPE.HYBRID_MULTI_COMPONENT_EVENT]: [
    ['event_specificity_and_component_coverage', 0.30],
    ['conditioning_progression_and_race_preparation', 0.20],
    ['strength_maintenance_and_interference', 0.15],
    ['taper_and_competition_week', 0.15],
    ['athlete_specific_constraints', 0.10],
    ['execution_rules_and_autoregulation', 0.10],
  ],
  [PROGRAM_TYPE.WEIGHTLIFTING]: [
    ['competition_lift_specificity', 0.30],
    ['loading_progression', 0.25],
    ['fatigue_management', 0.20],
    ['athlete_specific_modification', 0.15],
    ['execution_rules', 0.10],
  ],
  [PROGRAM_TYPE.TACTICAL_ENDURANCE]: [
    ['primary_goal_specificity', 0.32],
    ['progression_and_overload', 0.20],
    ['concurrent_training_structure', 0.20],
    ['secondary_goal_integration', 0.10],
    ['athlete_specific_constraints', 0.10],
    ['execution_rules', 0.08],
  ],
  [PROGRAM_TYPE.COMBAT_CAMP]: [
    ['camp_specificity_and_hierarchy', 0.15],
    ['fatigue_and_sport_integration', 0.20],
    ['strength_and_power_maintenance', 0.35],
    ['injury_and_symptom_modification', 0.10],
    ['taper_and_competition_week', 0.12],
    ['execution_rules', 0.08],
  ],
  // Added after the first calibration found three in-season footballer programs
  // returning zero findings, which meant "no rule looked", not "nothing wrong".
  // The central problem here is neither building one timed outcome nor tapering
  // into one event: it is holding qualities around a repeating match cycle.
  [PROGRAM_TYPE.IN_SEASON_TEAM_SPORT]: [
    ['match_week_integration', 0.30],
    ['strength_and_power_maintenance', 0.25],
    ['fatigue_and_tissue_load', 0.20],
    ['athlete_specific_availability', 0.10],
    ['secondary_quality_support', 0.07],
    ['execution_rules', 0.08],
  ],
};

const OLY = /\bsnatch\b|\bclean and jerk\b|\bclean & jerk\b|\bc&j\b/i;
const TIMED_RUN = /\b\d+(?:\.\d+)?\s*k(?:m)?\b|\bmarathon\b|\bhalf\b|\bmile\b/i;

// The events whose components are known before the day. Running is a repeated
// component of a Hyrox rather than one of the eight stations, and is listed
// separately because the compromised-work rules pair it with the others.
export const EVENT_COMPONENTS = {
  hyrox: {
    ordered: true,
    components: ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row',
      'Farmers Carry', 'Sandbag Lunge', 'Wall Ball'],
    cyclic: 'Run',
  },
  triathlon: { ordered: true, components: ['Swim', 'Bike', 'Run'], cyclic: null },
  duathlon: { ordered: true, components: ['Run', 'Bike'], cyclic: null },
};

// What this athlete's event is made of, if anything knows.
export function namedComponentsFor(intake = {}) {
  const hay = `${String(intake.sport || '')} ${String(intake.event_type || '')} ${JSON.stringify(intake.primary_goals || intake.primary_goal || '')}`.toLowerCase();
  if (Array.isArray(intake.event_components) && intake.event_components.length) return [...intake.event_components];
  for (const [name, spec] of Object.entries(EVENT_COMPONENTS)) {
    if (hay.includes(name)) return [...spec.components];
  }
  return [];
}

export function eventIsOrdered(intake = {}) {
  const hay = `${String(intake.sport || '')} ${String(intake.event_type || '')}`.toLowerCase();
  if (typeof intake.ordered_components === 'boolean') return intake.ordered_components;
  for (const [name, spec] of Object.entries(EVENT_COMPONENTS)) if (hay.includes(name)) return spec.ordered;
  return false;
}

export function selectProgramType(intake = {}, options = {}) {
  const primary = goals(intake, 'primary');
  const secondary = `${goals(intake, 'secondary')} ${goals(intake, 'maintenance')}`;
  const sport = String(intake.sport || '').toLowerCase();

  // Combat first: an MMA athlete four weeks from a fight is a camp whatever
  // else their goals mention. When the caller knows how far out the event is,
  // four weeks is the boundary; when it does not, event_type plus a full sport
  // week is enough, because that is the only shape this branch has ever seen.
  const isCombat = String(intake.event_type || '').toLowerCase() === 'combat';
  const withinFourWeeks = Number.isFinite(options.weeksToEvent) ? options.weeksToEvent <= 4 : true;
  if (isCombat && withinFourWeeks && arr(intake.sport_schedule).length >= 5) {
    return PROGRAM_TYPE.COMBAT_CAMP;
  }

  // A repeating fixture with no A-priority event to taper into.
  const fixtures = /\bmd\s*[-+]?\s*\d|\bmatch day\b|\bmatchday\b|\bfixture\b|\bmatch\b|\bgame day\b/i;
  const inSeason = /in[- ]season/i.test(`${sport} ${String(intake.season_phase || '')} ${primary} ${secondary}`)
    || fixtures.test(`${String(intake.notes || '')} ${String(intake.sport_schedule ? JSON.stringify(intake.sport_schedule) : '')}`);
  const tapering = Number.isFinite(options.weeksToEvent) && options.weeksToEvent <= 4;
  if (inSeason && !tapering && !OLY.test(primary)) return PROGRAM_TYPE.IN_SEASON_TEAM_SPORT;

  if (/weightlifting/.test(sport) || OLY.test(primary)) return PROGRAM_TYPE.WEIGHTLIFTING;

  if (TIMED_RUN.test(primary) && /ruck|pull[- ]?up|strength|tactical/i.test(secondary)
    && !/squat|deadlift|press/i.test(primary)) return PROGRAM_TYPE.TACTICAL_ENDURANCE;

  // Multi-component events come last of the typed branches, deliberately. His
  // routing is: a specific sport model wins if one exists, then an event with
  // two or more known required components, then a single-task event, then
  // category coverage when the components are not knowable. A powerlifting meet
  // has three named lifts and would satisfy the component test, but the
  // weightlifting branch above already holds better lift-specific rules and
  // must not be overwritten by a more general one.
  if (namedComponentsFor(intake).length >= 2) return PROGRAM_TYPE.HYBRID_MULTI_COMPONENT_EVENT;

  return PROGRAM_TYPE.UNCLASSIFIED;
}

// --- scoring -----------------------------------------------------------------

// Caps are applied last and the lowest wins, which is the coach's own ordering.
export const CAPS = {
  SYMPTOM_REPRODUCTION_IGNORED: 6.0,
  PRIMARY_GOAL_OMITTED: 6.5,
  COMPETITION_WEEK_IS_A_BUILD_WEEK: 7.0,
  COMPETITION_WEEK_BUILD_WITH_HARD_CONTACT: 6.5,
  AVAILABLE_DAY_VIOLATION: 7.0,
  // In-season team sport.
  HEAVY_LOWER_BODY_ON_MD_MINUS_ONE: 6.5,
  NO_STRENGTH_EXPOSURE_IN_SEASON: 7.0,
  FIXTURE_IGNORED: 6.0,
};

export function weightedScore(type, dimensionScores = {}) {
  const dims = DIMENSIONS[type];
  if (!dims) return { ok: false, missing: ['unknown_program_type'], score: null };
  let total = 0;
  const missing = [];
  for (const [name, weight] of dims) {
    const value = dimensionScores[name];
    if (!Number.isFinite(value)) { missing.push(name); continue; }
    total += value * weight;
  }
  // A partial score is worse than no score: it looks like a number and is not
  // one. The caller gets told what was missing instead.
  if (missing.length) return { ok: false, missing, score: null };
  return { ok: true, missing: [], score: total };
}

export function applyCaps(score, capsTriggered = []) {
  const values = capsTriggered.map((c) => CAPS[c]).filter(Number.isFinite);
  if (!values.length) return { score, capped: false, cap: null };
  const cap = Math.min(...values);
  return score > cap ? { score: cap, capped: true, cap } : { score, capped: false, cap };
}

// The published score: weighted dimensions, then caps, rounded to one decimal
// the way every Phase 1 score was given.
export function overallScore(type, dimensionScores, capsTriggered = []) {
  const weighted = weightedScore(type, dimensionScores);
  if (!weighted.ok) return { ...weighted, overall: null };
  const { score, capped, cap } = applyCaps(weighted.score, capsTriggered);
  return { ok: true, missing: [], raw: weighted.score, capped, cap, overall: Math.round(score * 10) / 10 };
}

// --- thresholds --------------------------------------------------------------
//
// Only the numbers the coach committed to. Everything he placed under
// "Judgement, not rules" is deliberately absent: a preference encoded as a gate
// is worse than one left out, because it fails builds for a reason nobody can
// satisfy.

export const THRESHOLDS = {
  // Exposure
  MAINTENANCE_MIN_EXPOSURES_PER_WEEK: 1,
  MAINTENANCE_MIN_WORK_SETS: 2,
  MAINTENANCE_MIN_TOTAL_REPS: 4,
  MAINTENANCE_RPE_RANGE: [6, 8],
  MAINTENANCE_MIN_LOAD_FRACTION_OF_BENCHMARK: 0.75,
  OLY_MIN_SNATCH_EXPOSURES_PER_WEEK: 3,
  OLY_MIN_CJ_EXPOSURES_PER_WEEK: 3,
  PULLUP_GOAL_MIN_DIRECT_EXPOSURES_PER_WEEK: 2,

  // Progression
  RUN_WEEK3_MIN_FRACTION_OF_GOAL_SPEED: 0.95,
  RUN_WEEK4_MIN_FRACTION_OF_GOAL_SPEED: 0.97,
  OLY_WEEK3_SNATCH_INTENSITY_BAND: [0.88, 0.90],
  OLY_WEEK3_CJ_INTENSITY_BAND: [0.89, 0.90],
  IDENTICAL_WEEKS_DEFECT_AFTER: 3,

  // Tolerated baseline rebuild, as a fraction below the lower end of baseline
  BASELINE_MAX_SHORTFALL_BY_WEEK: [0.30, 0.20, 0.10, null],
  BASELINE_SUSTAINED_SHORTFALL_LIMIT: 0.20,

  // Scheduling
  MAX_CONSECUTIVE_LIFTING_DAYS: 3,
  MAX_CONSECUTIVE_LOWER_LEG_LOADING_DAYS: 2,
  LOWER_LEG_LOADING_RUN_MINUTES: 20,
  LOWER_LEG_LOADING_RUCK_MINUTES: 45,
  LOWER_LEG_LOADING_MIN_RPE: 6.5,
};

// The coach's replacement order, most specific first. Level 4 may not be used
// when a level 2 option exists -- this is the rule that produces a trap bar
// deadlift instead of a hip thrust.
export const REPLACEMENT_ORDER = [
  'exact_movement_with_tolerated_setup_change',
  'benchmarked_symptom_free_same_quality',
  'unbenchmarked_symptom_free_same_family',
  'lower_cost_general_strength_same_force_quality',
  'isolation_or_generic_assistance',
];
export const REPLACEMENT_FLOOR_WHEN_BENCHMARK_EXISTS = 2;

// Severity markers, not subtractions. Used to set a dimension's score.
export const DEDUCTIONS = {
  BENCHMARKED_MOVEMENT_UNEXPOSED: { typical: 0.48, range: [0.40, 0.55] },
  PROGRESSION_SHORT_OF_REQUIRED_INTENSITY: { typical: 0.38, range: [0.25, 0.40] },
  TOLERATED_BASELINE_NOT_REBUILT: { typical: 0.50, range: [0.40, 0.50] },
  GOAL_DISTANCE_REDUCED_DESPITE_TOLERANCE: { typical: 0.25, range: [0.25, 0.25] },
  // The ceiling moved from 0.20 to 0.25 when he charged four consecutive days
  // in competition week on run #116 -- the same defect, costing more when it
  // lands in the week that matters most.
  AVOIDABLE_CONSECUTIVE_DAY_CLUSTERING: { typical: 0.20, range: [0.10, 0.25] },
  ACCESSORY_LOW_MARGINAL_RETURN: { typical: 0.18, range: [0.15, 0.20] },
  CONTINGENCY_CREATES_DUPLICATE: { typical: 0.15, range: [0.15, 0.15] },
  TEXT_CONTRADICTS_TABLE: { typical: 0.08, range: [0.05, 0.10] },
  UNSUPPORTED_ATHLETE_FACT: { typical: 0.10, range: [0.10, 0.10] },
  // Tiered on the coach's revision: the 0.15 was right for a secondary goal
  // while the primary was still progressing. A primary goal flat for four weeks
  // is a materially larger defect, and one with no load anchor at all costs
  // another 0.15 on top, because nobody can verify what was even prescribed.
  IMPROVEMENT_GOAL_UNCHANGED_ALL_BLOCK: { typical: 0.15, range: [0.15, 0.15] },
  PRIMARY_GOAL_UNCHANGED_ALL_BLOCK: { typical: 0.35, range: [0.35, 0.35] },
  LOADING_PRESCRIPTION_UNANCHORED: { typical: 0.15, range: [0.15, 0.15] },
  INTAKE_INTERPRETATION_UNSTATED: { typical: 0.10, range: [0.10, 0.10] },
  REDUNDANT_COMPETITION_WEEK_EXPOSURE: { typical: 0.20, range: [0.20, 0.20] },
  SPORT_SCHEDULE_SILENTLY_CHANGED: { typical: 0.15, range: [0.15, 0.15] },
  // From his review of run #116, the first program he scored that none of the
  // above was written from. His words on the first of these: "Going from 2 to
  // 17 power sets is not preservation. It is a new training emphasis."
  TAPER_INTRODUCES_NEW_EMPHASIS: { typical: 0.45, range: [0.45, 0.45] },
  COACHING_LANGUAGE_FROM_ANOTHER_SPORT: { typical: 0.10, range: [0.10, 0.10] },
  PRESCRIPTION_SURVIVES_MODALITY_CHANGE: { typical: 0.20, range: [0.20, 0.20] },
  // The two he charged on the first multi-component block, and the costs he
  // gave for them: incomplete coverage of the event's named components, and a
  // block that trains running only from a clean state.
  EVENT_COMPONENT_COVERAGE_INCOMPLETE: { typical: 0.60, range: [0.40, 0.60] },
  COMPROMISED_WORK_MISSING: { typical: 0.45, range: [0.30, 0.45] },
  // The footballer's sprint findings, which he charged on all three versions at
  // 0.45, 0.35, 0.30 and 0.25 and which had no cost mapped at all -- so that
  // athlete measured 0.00 severity while carrying his single most expensive
  // finding.
  SPRINT_GOAL_UNTRAINED: { typical: 0.45, range: [0.25, 0.45] },
  REPEATED_SPRINT_DEFINITION_UNMET: { typical: 0.30, range: [0.25, 0.35] },
};

// What a finding actually costs the published score, which is the thing worth
// knowing when deciding what to build next.
export function overallCostOf(type, dimension, deductionCost) {
  const dims = DIMENSIONS[type];
  if (!dims) return null;
  const found = dims.find(([name]) => name === dimension);
  return found ? deductionCost * found[1] : null;
}
