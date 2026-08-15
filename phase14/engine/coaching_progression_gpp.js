import { parseProgramModel, directGoalExposures, strengthDaysForWeek, WEEKDAY_ORDER } from './program_model.js';
import { RetriableValidationError } from './exercise_dictionary.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

export function athleteAge(intake = {}) {
  const direct = Number(intake.age || intake.age_years || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const m = `${txt(intake.notes)} ${txt(intake.current_numbers)}`.match(/(?:athlete\s+is|age\s*[:=]?)\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

export function isTacticalHybridIntake(intake = {}) {
  const context = JSON.stringify({
    primary_goals: intake.primary_goals,
    secondary_goals: intake.secondary_goals,
    maintenance_goals: intake.maintenance_goals,
    notes: intake.notes,
    sport: intake.sport,
  });
  return /\b(?:tactical|military|special[- ]?operations|selection prep|combat[- ]?ready|operator)\b/i.test(context);
}

function goalText(intake = {}) {
  return [
    ...arr(intake.primary_goals),
    ...arr(intake.secondary_goals),
    ...arr(intake.maintenance_goals),
  ].map(String).join(' | ');
}

function hasProgressionIntent(goal = {}) {
  if (goal.tier === 'maintenance') return false;
  if (/\b(?:maintain|preserve|hold|keep)\b/i.test(String(goal.raw || ''))) return false;
  return goal.tier === 'primary' || goal.tier === 'secondary';
}

function effortSignature(effort) {
  if (!effort) return '';
  return `${effort.type || ''}:${effort.raw || effort.value || ''}`;
}

function exposureSignature(exposure) {
  const ex = exposure.exercise || exposure;
  const dose = ex.dose || {};
  return [
    ex.base_movement || '',
    (ex.execution_modifiers || []).join(','),
    (ex.assistance_methods || []).join(','),
    (ex.loading_methods || []).join(','),
    dose.load || '',
    dose.sets_raw || dose.sets || '',
    dose.reps_raw || dose.reps || '',
    dose.duration || '',
    dose.rest || '',
    effortSignature(dose.effort),
  ].join('|');
}

export function progressionAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  const targets = (model.goals || []).filter(hasProgressionIntent);
  const targetsOut = [];
  const violations = [];

  for (const target of targets) {
    const weeks = [];
    for (const week of model.weeks || []) {
      const exposures = directGoalExposures(model, target.family, week.week);
      const signature = exposures
        .map(exposureSignature)
        .sort()
        .join(' || ');
      weeks.push({ week: week.week, signature, count: exposures.length });
    }
    const present = weeks.filter((w) => w.count > 0);
    const unique = new Set(present.map((w) => w.signature));
    const progressed = present.length >= 2 && unique.size >= 2;
    const row = { family: target.family, tier: target.tier, goal: target.raw, progressed, weeks };
    targetsOut.push(row);
    if (present.length >= 3 && !progressed) violations.push(row);
  }

  return { model, targets: targetsOut, violations };
}

export function validateProgressionArchitectureSemantic(program, intake = {}, suppliedModel = null) {
  const result = progressionAnalysis(program, intake, suppliedModel);
  if (result.violations.length) {
    const summary = result.violations
      .map((v) => `${v.tier} goal '${v.goal}' repeats the same direct prescription across the block`)
      .join('; ');
    throw new RetriableValidationError(
      'PROGRESSION_ARCHITECTURE_MISSING',
      'PRIOR ATTEMPT FAILED FOUR-WEEK PROGRESSION VALIDATION. ' +
        `${summary}. A progression target does not require guaranteed athlete improvement, but the prescription must show a credible progression pathway across the four weeks. ` +
        'For loaded strength use load/reps/sets or a deliberate harder-easier exposure structure. For bodyweight strength use reps, sets, tempo, pause, ROM or a verified harder variation. For skill acquisition use a visible change in assistance, attempt target, hold target, ROM or verified progression rung. ' +
        'Maintenance goals may remain stable. Do not add fatigue merely to make the spreadsheet look different.',
      {
        violations: result.violations,
        semantic_model_version: result.model.version,
      },
    );
  }
  return { ok: true, ...result };
}

const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
});

export function explicitCalendarDayBudget(intake = {}) {
  const context = `${txt(intake.notes)} ${txt(intake.schedule_notes)} ${txt(intake.availability_notes)}`.toLowerCase();
  const word = '(?:one|two|three|four|five|six|seven|[1-7])';
  const patterns = [
    new RegExp(`\\b(?:across|within|over|up to|max(?:imum)?(?: of)?|available for|train(?:ing)?(?: across| over| within)?)\\s+(${word})\\s+calendar\\s+days?\\b`, 'i'),
    new RegExp(`\\b(${word})\\s+calendar\\s+days?\\b`, 'i'),
  ];
  for (const re of patterns) {
    const m = context.match(re);
    if (!m) continue;
    const raw = String(m[1]).toLowerCase();
    const value = Number(raw) || NUMBER_WORDS[raw] || 0;
    if (value >= 1 && value <= 7) return value;
  }
  return null;
}

function weekdayIndex(day) {
  return WEEKDAY_ORDER.indexOf(String(day || '').toLowerCase());
}

function maxCircularWeekdayStreak(daySet) {
  const active = WEEKDAY_ORDER.map((d) => daySet.has(d));
  if (!active.some(Boolean)) return 0;
  if (active.every(Boolean)) return 7;
  const doubled = active.concat(active);
  let best = 0;
  let run = 0;
  for (const on of doubled) {
    if (on) {
      run += 1;
      best = Math.max(best, Math.min(run, 7));
    } else {
      run = 0;
    }
  }
  return best;
}

function hasShinImpactHistory(intake = {}) {
  const context = `${txt(intake.injuries)} ${txt(intake.notes)} ${txt(intake.pain)}`;
  return /\b(?:shin(?:[- ]?splints?)?|medial tibial|tibial stress)\b/i.test(context);
}

function substantivePullSets(day) {
  let sets = 0;
  for (const exercise of day?.exercises || []) {
    if (exercise?.base_movement !== 'pull_up') continue;
    const n = Number(exercise?.dose?.sets || 0);
    if (Number.isFinite(n) && n > 0) sets += n;
  }
  return sets;
}

function adjacentWeekdayPairs(days) {
  const unique = [...new Set(days)].filter((d) => weekdayIndex(d) >= 0);
  const pairs = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = weekdayIndex(unique[i]);
      const b = weekdayIndex(unique[j]);
      const diff = Math.abs(a - b);
      if (diff === 1 || diff === 6) pairs.push([unique[i], unique[j]]);
    }
  }
  return pairs;
}

export function tacticalScheduleAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!isTacticalHybridIntake(intake)) return { applicable: false, model, weeks: [], violations: [] };

  const calendarBudget = explicitCalendarDayBudget(intake);
  const shinRisk = hasShinImpactHistory(intake);
  const pullPriority = (model.goals || []).some((goal) => goal.family === 'pull_up' && ['primary', 'secondary'].includes(goal.tier));
  const flexible = String(intake.gym_availability_mode || '').toLowerCase() === 'flexible' && !arr(intake.available_gym_days).length;
  const weeks = [];
  const violations = [];

  for (const week of model.weeks || []) {
    const trainingDays = new Set();
    const impactDays = new Set();
    const priorityPullDays = [];

    for (const day of week.days || []) {
      const substantive = (day.exercises || []).some((exercise) => exercise.role !== 'warm_up' && exercise.modality !== 'warm_up' && exercise.modality !== 'recovery');
      if (substantive) trainingDays.add(day.day);
      if ((day.exercises || []).some((exercise) => ['running', 'ruck'].includes(exercise.modality))) impactDays.add(day.day);
      if (pullPriority && substantivePullSets(day) >= 2) priorityPullDays.push(day.day);
    }

    const strengthDays = strengthDaysForWeek(model, week.week).map((day) => day.day);
    const strengthDaySet = new Set(strengthDays.filter((day) => weekdayIndex(day) >= 0));
    const impactDaySet = new Set([...impactDays].filter((day) => weekdayIndex(day) >= 0));
    const adjacentPriorityPullDays = adjacentWeekdayPairs(priorityPullDays);
    const maxStrengthStreak = maxCircularWeekdayStreak(strengthDaySet);
    const maxImpactStreak = maxCircularWeekdayStreak(impactDaySet);
    const rowViolations = [];

    if (calendarBudget && trainingDays.size > calendarBudget) {
      rowViolations.push({
        type: 'calendar_day_budget_exceeded',
        budget: calendarBudget,
        scheduled: trainingDays.size,
        days: [...trainingDays],
      });
    }
    if (flexible && maxStrengthStreak >= 3) {
      rowViolations.push({
        type: 'strength_days_overclustered',
        max_streak: maxStrengthStreak,
        days: strengthDays,
      });
    }
    if (shinRisk && maxImpactStreak >= 4) {
      rowViolations.push({
        type: 'impact_days_overclustered',
        max_streak: maxImpactStreak,
        days: [...impactDays],
      });
    }
    if (adjacentPriorityPullDays.length) {
      rowViolations.push({
        type: 'priority_pull_days_adjacent',
        pairs: adjacentPriorityPullDays,
        days: priorityPullDays,
      });
    }

    const row = {
      week: week.week,
      calendar_budget: calendarBudget,
      unique_training_days: trainingDays.size,
      training_days: [...trainingDays],
      strength_days: strengthDays,
      max_strength_streak: maxStrengthStreak,
      impact_days: [...impactDays],
      max_impact_streak: maxImpactStreak,
      priority_pull_days: priorityPullDays,
      adjacent_priority_pull_days: adjacentPriorityPullDays,
      violations: rowViolations,
    };
    weeks.push(row);
    if (rowViolations.length) violations.push(row);
  }

  return { applicable: true, model, weeks, violations, calendar_budget: calendarBudget, shin_risk: shinRisk, pull_priority: pullPriority };
}

export function validateTacticalScheduleArchitectureSemantic(program, intake = {}, suppliedModel = null) {
  const result = tacticalScheduleAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };

  const summary = result.violations.map((week) => {
    const parts = week.violations.map((v) => {
      if (v.type === 'calendar_day_budget_exceeded') return `${v.scheduled} training days exceed the explicit ${v.budget}-calendar-day budget`;
      if (v.type === 'strength_days_overclustered') return `${v.max_streak} consecutive strength days despite flexible scheduling`;
      if (v.type === 'impact_days_overclustered') return `${v.max_streak} consecutive run/ruck impact days despite shin-impact history`;
      if (v.type === 'priority_pull_days_adjacent') return `substantive pull-up priority work is placed on adjacent days (${v.pairs.map((p) => p.join('/')).join(', ')})`;
      return v.type;
    });
    return `Week ${week.week}: ${parts.join('; ')}`;
  }).join(' ');

  throw new RetriableValidationError(
    'TACTICAL_SCHEDULE_ARCHITECTURE_VIOLATION',
    'PRIOR ATTEMPT FAILED TACTICAL WEEKLY-ARCHITECTURE VALIDATION. ' +
      `${summary}. Respect an explicitly stated total calendar-day budget by combining compatible low-cost endurance with strength when needed. ` +
      'When gym availability is flexible, do not default three strength sessions onto three consecutive days. Separate substantive priority pull-up exposures by at least one calendar day unless one exposure is clearly a tiny technique micro-dose. ' +
      'For an athlete with prior shin-impact irritation, do not create a four-day chain of intervals, ruck and running merely because each session is individually reasonable. Preserve the named run/ruck frequencies while distributing stress across the available week.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      calendar_budget: result.calendar_budget,
      schedule_policy: 'priority_spaced_with_explicit_calendar_budget',
    },
  );
}

export function knownStrictPullUpMax(intake = {}) {
  const context = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)} ${txt(intake.clarification_answers)}`;
  const patterns = [
    /\bstrict\s+pull[- ]?ups?\s*:\s*(\d{1,2})\s*(?:reps?)?\b/i,
    /\b(?:current|max(?:imum)?)\s+(?:strict\s+)?pull[- ]?ups?[^\d]{0,12}(\d{1,2})\b/i,
    /\b(\d{1,2})\s+(?:strict\s+)?pull[- ]?ups?\b/i,
  ];
  for (const re of patterns) {
    const m = context.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
  }
  return null;
}

function repUpperBound(raw) {
  const nums = [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return nums.length ? Math.max(...nums) : null;
}

function effortUpperBound(effort) {
  if (!effort) return null;
  if (effort?.range && Number.isFinite(Number(effort.range.max))) return Number(effort.range.max);
  const n = Number(effort.value);
  return Number.isFinite(n) ? n : null;
}

function isBodyweightPullUp(exercise) {
  if (exercise?.base_movement !== 'pull_up') return false;
  const load = String(exercise?.dose?.load || '').toLowerCase();
  if ((exercise.loading_methods || []).includes('weighted')) return false;
  if (/^\s*\+/.test(load)) return false;
  if (/\b(?:kg|lb|lbs|pounds?)\b/.test(load) && !/bodyweight|\bbw\b/.test(load)) return false;
  return true;
}

export function pullUpDoseAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  const knownMax = knownStrictPullUpMax(intake);
  if (!knownMax) return { applicable: false, model, known_max_reps: null, violations: [], rows: [] };

  const rows = [];
  const violations = [];
  for (const week of model.weeks || []) {
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        if (!isBodyweightPullUp(exercise)) continue;
        const sets = Number(exercise?.dose?.sets || 0);
        const repsUpper = repUpperBound(exercise?.dose?.reps_raw || exercise?.dose?.reps);
        const effortUpper = effortUpperBound(exercise?.dose?.effort);
        if (!Number.isFinite(sets) || sets < 1 || !Number.isFinite(repsUpper)) continue;
        const ratio = repsUpper / knownMax;
        const nearMaxRepeated = sets >= 3 && ratio >= 0.85;
        const contradictsSubmaxRpe = sets >= 3 && effortUpper != null && effortUpper <= 8.5 && ratio >= 0.80;
        const row = {
          week: week.week,
          day: day.day,
          exercise: exercise.display_name,
          sets,
          reps_upper: repsUpper,
          effort_upper: effortUpper,
          known_max_reps: knownMax,
          max_rep_ratio: ratio,
          violation: nearMaxRepeated || contradictsSubmaxRpe,
        };
        rows.push(row);
        if (row.violation) violations.push(row);
      }
    }
  }

  return { applicable: true, model, known_max_reps: knownMax, rows, violations };
}

export function validateKnownMaxPullUpDoseSemantic(program, intake = {}, suppliedModel = null) {
  const result = pullUpDoseAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations.map((v) =>
    `Week ${v.week} ${v.day}: ${v.sets} sets with a ${v.reps_upper}-rep upper target is too close to the known ${v.known_max_reps}-rep strict pull-up maximum for the stated submaximal effort`
  ).join('; ');
  throw new RetriableValidationError(
    'PULL_UP_DOSE_EXCEEDS_KNOWN_CAPACITY',
    'PRIOR ATTEMPT FAILED KNOWN-CAPACITY PULL-UP DOSE VALIDATION. ' +
      `${summary}. Calibrate repeated working sets to the demonstrated rep maximum. A max-rep benchmark is not a normal multi-set prescription. ` +
      'Keep quality volume comfortably below the fresh max, or use fewer reps per set, fewer sets, added load with lower reps, or another deliberate progression variable. Do not label repeated near-max sets RPE 7-8 merely to make the numbers look progressive.',
    {
      violations: result.violations,
      known_max_reps: result.known_max_reps,
      semantic_model_version: result.model.version,
      dose_policy: 'known_max_calibrated_repeated_sets',
    },
  );
}

function supportPattern(exercise) {
  if (!exercise || exercise.role === 'warm_up' || exercise.modality === 'warm_up') return null;
  const base = String(exercise.base_movement || '').toLowerCase();
  const display = String(exercise.display_name || '').toLowerCase();
  const s = `${base} ${display}`;
  // Specific movement identities must win over generic name fragments. Pallof
  // Press is trunk/anti-rotation work; the word "press" must not turn it into a
  // pushing exercise. This mirrors the ruck-before-run precedence in ProgramModel.
  if (/(^|[_\s-])(plank|pallof|rollout|ab.?wheel|dead.?bug|bird.?dog|leg.?raise|knee.?raise|hollow|core|anti.?rotation)([_\s-]|$)/i.test(s)) return 'core';
  if (/(^|[_\s-])(push.?up|bench|press|dip|push)([_\s-]|$)/i.test(s)) return 'push';
  if (/(^|[_\s-])(split.?squat|lunge|step.?up|pistol)([_\s-]|$)/i.test(s)) return 'unilateral_lower';
  if (/(^|[_\s-])(carry|farmer|suitcase)([_\s-]|$)/i.test(s)) return 'carry';
  return null;
}

function relevantPainWaiver(intake = {}, pattern) {
  if (intake?.pain?.active !== true) return false;
  const p = `${txt(intake.pain)} ${txt(intake.injuries)}`;
  if (pattern === 'push') return /(?:shoulder|wrist|press|push.?up|bench).*pain|pain.*(?:shoulder|wrist|press|push.?up|bench)/i.test(p);
  if (pattern === 'core') return /(?:abdominal|trunk|core|lumbar|low back).*pain|pain.*(?:abdominal|trunk|core|lumbar|low back)/i.test(p);
  return false;
}

function hasNamedSupportGoal(intake = {}, pattern) {
  const goals = goalText(intake);
  if (pattern === 'push') return /\b(?:push[- ]?ups?|bench(?: press)?|overhead press|ohp|dips?|pressing strength)\b/i.test(goals);
  if (pattern === 'core') return /\b(?:core|trunk|plank|anti[- ]?rotation|abdominals?|hanging leg raise)\b/i.test(goals);
  return false;
}

export function tacticalGppAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!isTacticalHybridIntake(intake)) return { applicable: false, model, weeks: [], violations: [] };

  const weeks = [];
  const violations = [];
  const requirePush = !relevantPainWaiver(intake, 'push');
  const requireCore = !relevantPainWaiver(intake, 'core');
  const pushIsGoal = hasNamedSupportGoal(intake, 'push');
  const coreIsGoal = hasNamedSupportGoal(intake, 'core');

  for (const week of model.weeks || []) {
    const strengthDays = strengthDaysForWeek(model, week.week);
    if (strengthDays.length < 2) continue;
    const totals = { push: 0, core: 0, unilateral_lower: 0, carry: 0 };
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        const pattern = supportPattern(exercise);
        if (!pattern) continue;
        const sets = Number(exercise?.dose?.sets || 0);
        if (Number.isFinite(sets) && sets > 0) totals[pattern] += sets;
      }
    }
    const missing = [];
    if (requirePush && totals.push < 2) missing.push('push');
    if (requireCore && totals.core < 2) missing.push('core');
    const lowCostSupportSets = totals.push + totals.core;
    const overBudgetReasons = [];
    if (!pushIsGoal && totals.push > 6) overBudgetReasons.push(`push support ${totals.push} sets exceeds the 6-set non-priority ceiling`);
    if (!coreIsGoal && totals.core > 6) overBudgetReasons.push(`trunk support ${totals.core} sets exceeds the 6-set non-priority ceiling`);
    if (!pushIsGoal && !coreIsGoal && lowCostSupportSets > 10) overBudgetReasons.push(`${lowCostSupportSets} combined push/core sets is too much support volume`);
    const overBudget = overBudgetReasons.length > 0;
    const row = {
      week: week.week,
      strength_days: strengthDays.length,
      totals,
      missing,
      low_cost_support_sets: lowCostSupportSets,
      over_budget: overBudget,
      over_budget_reasons: overBudgetReasons,
    };
    weeks.push(row);
    if (missing.length || overBudget) violations.push(row);
  }

  return { applicable: true, model, weeks, violations, requirePush, requireCore, push_is_goal: pushIsGoal, core_is_goal: coreIsGoal };
}

export function validateTacticalGppCoverageSemantic(program, intake = {}, suppliedModel = null) {
  const result = tacticalGppAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations.map((v) => {
    const parts = [];
    if (v.missing.length) parts.push(`missing ${v.missing.join(' + ')} GPP`);
    if (v.over_budget) parts.push(v.over_budget_reasons.join('; '));
    return `Week ${v.week}: ${parts.join('; ')}`;
  }).join(' ');
  throw new RetriableValidationError(
    'TACTICAL_GPP_COVERAGE_MISSING',
    'PRIOR ATTEMPT FAILED TACTICAL GPP / PRIORITY-BUDGET VALIDATION. ' +
      `${summary}. Tactical/hybrid programming should not become pull-ups, deadlifts and running only, but GPP must remain subordinate to the named priorities. ` +
      'Keep a small weekly pushing floor and trunk floor when not pain-limited, usually a few quality sets, then use remaining recovery for the primary run, ruck, pulling and key strength work. When pushing or trunk is not a named goal, keep each category inside a small support ceiling rather than letting it rival the priority work. ' +
      'Use exact canonical Exercise-column names for the support work. Safe low-cost examples from the authoritative catalog include Push-up, Dip, Overhead Press, Pallof Press, Side Plank, Dead Bug and Hanging Leg Raise. ' +
      'Useful GPP is not permission for random finishers or punishment conditioning. Trim GPP first when time or recovery is constrained.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      gpp_policy: 'priority_subordinated_floor_and_ceiling',
    },
  );
}

export function buildProgressionGppBrief(intake = {}) {
  const age = athleteAge(intake);
  const youth = age != null && age < 18;
  const tactical = isTacticalHybridIntake(intake);
  const rules = [
    '=== FOUR-WEEK PROGRESSION ARCHITECTURE ===',
    '* A four-week block is not four copied weeks. Every primary progression goal and every compatible secondary progression goal needs a visible progression pathway across the block. The athlete is not guaranteed to improve each week, but the prescription must show what is intended to progress.',
    '* Select the progression variable by exercise type. Loaded strength: load, reps, sets or deliberate heavy/volume exposure. Bodyweight strength: reps, sets, tempo, pause, ROM or verified difficulty. Skill acquisition: assistance, successful attempt target, hold/balance target, ROM or verified progression rung. Explosive work: execution quality or difficulty before fatigue volume.',
    '* Double progression is a strong default for stable strength/accessory work: earn the top of the rep range inside the RPE/RIR target, then increase difficulty/load and rebuild. Do not increase load and reps aggressively at the same time.',
    '* Maintenance is allowed to look stable. Do not manufacture weekly changes for maintenance/support work merely to make the spreadsheet look progressive.',
    '* Progress one main stress lever at a time when impact, tendon load or recovery risk is relevant. A change can be conditional on clean technique, symptom response or recovery.',
  ];

  if (youth) {
    rules.push(
      '* YOUTH PROGRESSION: make progression explicit without requiring failure. For skill work, progress successful execution, assistance, balance time, ROM or the verified rung before adding fatigue. For bodyweight foundation strength, use conservative rep/set progression, tempo/pauses or a verified harder variation when the current dose is clearly owned.',
      '* A youth Week 4 may consolidate rather than exceed Week 3, but it should still make the block logic obvious: the athlete should be able to see what improved variable was pursued and what qualifies them to move on.',
    );
  }

  if (tactical) {
    rules.push(
      '=== TACTICAL / HYBRID GPP PRIORITY BUDGET ===',
      '* Tactical specificity does not mean only training the named tests. Preserve a small general physical preparedness floor so the athlete remains balanced and robust.',
      '* Priority rule: primary running/rucking/pulling and key strength work receive most of the recoverable volume. Pushing, trunk and other accessories receive smaller support doses and are the first volume trimmed when recovery or session time tightens.',
      '* When not pain-limited and the athlete has at least two real strength sessions, include at least one low-cost pushing exposure and one low-cost trunk exposure each week. Usually 2-6 quality sets per category across the week is enough; if pushing or trunk is not a named goal, do not exceed 6 sets in that category and keep combined push/core support around 10 sets or less.',
      '* WEEKLY ARCHITECTURE: if the intake states a total calendar-day budget, respect it. Combine compatible easy running or rucking with a strength day when needed rather than silently creating extra training days. With flexible gym availability, do not default three strength sessions onto three consecutive days.',
      '* PRIORITY SPACING: separate substantive pull-up priority exposures by at least one calendar day unless one exposure is intentionally a tiny technique micro-dose. A heavy weighted pull-up day immediately followed by a substantial strict pull-up volume day is not good priority placement.',
      '* IMPACT SPACING: when shin-impact history is present, do not chain four consecutive direct run/ruck days such as intervals, ruck, easy run, long run. Preserve frequency while distributing impact across the available week.',
      '* KNOWN-MAX CALIBRATION: a fresh strict pull-up maximum is a capacity benchmark, not a repeated-set prescription. Do not prescribe several work sets near that max while labeling them RPE 7-8. Use the known max to keep repeated quality sets comfortably submaximal, or use lower reps with added load.',
      '* CANONICAL SUPPORT VOCABULARY: the Exercise column must use exact catalog names, not family labels or invented synonyms. Low-cost push options include Push-up, Dip and Overhead Press. Low-cost trunk options include Pallof Press, Side Plank, Dead Bug and Hanging Leg Raise. Optional support patterns may use Reverse Lunge, Bulgarian Split Squat, Farmer Carry or Suitcase Carry when justified. Put tempo, loading or tactical execution detail in Weight/Notes rather than inventing a new exercise name.',
      '* A normal gym session should feel complete when time allows: primary lift/skill plus one or two useful support pieces is preferable to doing a token compound set and leaving, but never fill time with junk volume.',
      '* For a direct ruck/loaded-march exposure, use the canonical Backpack Carry exercise name and put pack load, pace/distance and ruck execution detail in the remaining fields. For running sessions use the canonical Run exercise name and put interval/easy/long-session detail in the remaining fields.',
      '* GPP is not random conditioning. Burpees, arbitrary operator circuits and extra HIIT do not satisfy the pushing/trunk floor unless they are independently justified by a named capacity need.',
    );
  }

  return rules.join('\n');
}
