import { parseProgramModel, directGoalExposures, strengthDaysForWeek } from './program_model.js';
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

export function tacticalGppAnalysis(program, intake = {}, suppliedModel = null) {
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!isTacticalHybridIntake(intake)) return { applicable: false, model, weeks: [], violations: [] };

  const weeks = [];
  const violations = [];
  const requirePush = !relevantPainWaiver(intake, 'push');
  const requireCore = !relevantPainWaiver(intake, 'core');

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
    const overBudget = lowCostSupportSets > 12;
    const row = { week: week.week, strength_days: strengthDays.length, totals, missing, low_cost_support_sets: lowCostSupportSets, over_budget: overBudget };
    weeks.push(row);
    if (missing.length || overBudget) violations.push(row);
  }

  return { applicable: true, model, weeks, violations, requirePush, requireCore };
}

export function validateTacticalGppCoverageSemantic(program, intake = {}, suppliedModel = null) {
  const result = tacticalGppAnalysis(program, intake, suppliedModel);
  if (!result.applicable || !result.violations.length) return { ok: true, ...result };
  const summary = result.violations.map((v) => {
    const parts = [];
    if (v.missing.length) parts.push(`missing ${v.missing.join(' + ')} GPP`);
    if (v.over_budget) parts.push(`${v.low_cost_support_sets} push/core sets is too much low-priority support for this priority profile`);
    return `Week ${v.week}: ${parts.join('; ')}`;
  }).join(' ');
  throw new RetriableValidationError(
    'TACTICAL_GPP_COVERAGE_MISSING',
    'PRIOR ATTEMPT FAILED TACTICAL GPP / PRIORITY-BUDGET VALIDATION. ' +
      `${summary}. Tactical/hybrid programming should not become pull-ups, deadlifts and running only, but GPP must remain subordinate to the named priorities. ` +
      'Keep a small weekly pushing floor and trunk floor when not pain-limited, usually a few quality sets, then use remaining recovery for the primary run, ruck, pulling and key strength work. ' +
      'Useful GPP is not permission for random finishers or punishment conditioning. Trim GPP first when time or recovery is constrained.',
    {
      violations: result.violations,
      semantic_model_version: result.model.version,
      gpp_policy: 'priority_subordinated_floor',
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
      '* When not pain-limited and the athlete has at least two real strength sessions, include at least one low-cost pushing exposure and one low-cost trunk exposure each week. Usually 2-6 quality sets per category across the week is enough; do not turn them into competing hypertrophy goals unless the intake asks for that.',
      '* A normal gym session should feel complete when time allows: primary lift/skill plus one or two useful support pieces is preferable to doing a token compound set and leaving, but never fill time with junk volume.',
      '* GPP examples must come from verified exercises and athlete needs: push-ups/dips/pressing, Pallof/Side Plank/rollout/leg-raise family, unilateral lower-body work, carries or local robustness work. Choose needs-based items, not a checklist.',
      '* GPP is not random conditioning. Burpees, arbitrary operator circuits and extra HIIT do not satisfy the pushing/trunk floor unless they are independently justified by a named capacity need.',
    );
  }

  return rules.join('\n');
}
