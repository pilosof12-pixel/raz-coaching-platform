// v34 coaching-architecture guidance.
//
// Every rule below is derived from intake facts -- goal text, demonstrated
// capacity, priority tier, injury history, equipment, recovery context -- and is
// emitted only when those facts are present. No avatar names, no fixed weekdays,
// no hardcoded benchmark rows.

import { buildReadinessBrief } from './v34_readiness.js';
import { statedRunningBaselineKm } from './v34_workload_accounting.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function lower(v) { return String(v || '').toLowerCase(); }
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  if (tier === 'secondary') return arr(intake.secondary_goals).map(String).join(' | ');
  if (tier === 'maintenance') return arr(intake.maintenance_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function benchmarks(intake = {}) {
  return `${txt(intake.current_numbers)} ${txt(intake.performance_markers)} ${txt(intake.clarification_answers)} ${txt(intake.notes)}`;
}

// --- 2A: unilateral pull outcome specificity --------------------------------

export function currentStrictOapReps(intake = {}) {
  const src = benchmarks(intake);
  const m = src.match(/one[- ]?arm (?:pull|chin)[- ]?up[^\d\n|]{0,30}(\d{1,2})\s*(?:strict\s*)?reps?/i)
    || src.match(/(\d{1,2})\s*strict\s*reps?[^\n|]{0,30}one[- ]?arm/i);
  return m ? Number(m[1]) : null;
}
export function targetConsecutiveReps(goalText = '') {
  const m = String(goalText).match(/(\d{1,2})\s*(?:consecutive\s*)?(?:strict\s*)?(?:one[- ]?arm\s*)?(?:pull|chin)[- ]?ups?/i)
    || String(goalText).match(/^\s*(\d{1,2})\s+one\s*arm/i);
  return m ? Number(m[1]) : null;
}

// --- 2B: reduced-support balance requirement --------------------------------

export function wallHandstandSeconds(intake = {}) {
  const seconds = [...benchmarks(intake).matchAll(/(\d{1,3})\s*seconds?/gi)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  return /handstand/i.test(benchmarks(intake)) && seconds.length ? Math.max(...seconds) : null;
}

// --- 5: source-linked symptom response --------------------------------------

// Which impact stressors this program actually contains, so the symptom rule can
// name the provocative source rather than always blaming easy running.
export function impactStressorProfile(intake = {}) {
  const all = lower(`${goals(intake)} ${txt(intake.notes)} ${txt(intake.pain)}`);
  return {
    intervals: /interval|repeat|3\s*k|5\s*k|10\s*k|track|tempo|race/.test(all),
    ruck: /ruck|loaded march|pack march|backpack/.test(all),
    easyRunning: /run|jog|aerobic|\b\d+\s*k(?:m)?\b|marathon/.test(all),
    impactHistory: /shin|tibial|stress fracture|plantar|achilles/.test(all),
  };
}

export function buildSymptomResponseRules(intake = {}) {
  const profile = impactStressorProfile(intake);
  if (!profile.impactHistory) return [];
  const rules = [
    'SYMPTOM RESPONSE IS SOURCE-LINKED, NOT BLANKET: when impact symptoms appear, reduce the stressor that actually provoked them, or the most recently increased one, rather than defaulting to the same lever every time.',
  ];
  if (profile.intervals) rules.push('If symptoms appear during or in the 24h after the quality/interval session, reduce that session first - fewer repetitions, less pace demand, or hold the interval progression - before touching easy aerobic volume.');
  if (profile.ruck) rules.push('If symptoms appear during or after loaded carrying, hold or reduce the ruck variable that most recently moved (pace, then distance, then load) before changing running.');
  if (profile.easyRunning) rules.push('Only when symptoms are diffuse accumulated impact soreness with no single provocative session should easy-running volume be the first thing reduced.');
  rules.push('In all cases, if a loading variable was increased in the last 7-10 days and symptoms followed, remove or reduce THAT variable first and repeat the last symptom-free week. This is a tolerance gate, not a diagnosis.');
  return rules;
}

// --- 6: maintenance defaults to hold ----------------------------------------

export function buildMaintenanceHoldRules(intake = {}) {
  const maintenance = goals(intake, 'maintenance');
  if (!maintenance.trim()) return [];
  return [
    `MAINTENANCE DEFAULTS TO HOLD: the maintenance priorities (${maintenance}) do not progress just because the calendar advanced from one week to the next. Their default state across the block is an unchanged dose.`,
    'Progress a maintenance item only when ALL of these hold: the primary goal is actually progressing, recovery is clearly green, the maintenance work still sits below its intended effort ceiling, and the increase does not cost primary training quality. Otherwise repeat the previous week exactly.',
    'It is correct and expected for a maintenance lift or a maintenance endurance dose to read identically across several weeks. Do not manufacture load or rep increases to make the block look progressive.',
  ];
}

// --- 7B / 9D: volume ceilings and intra-session stop rules -------------------

function hardPullingCeilingRules(intake = {}) {
  const primary = lower(goals(intake, 'primary'));
  const secondary = lower(goals(intake, 'secondary'));
  const endurancePrimary = /\b\d+\s*k(?:m)?\b|marathon|run|row|ruck|swim|cycl/.test(primary);
  const pullSecondary = /pull[- ]?up|chin[- ]?up|muscle[- ]?up/.test(secondary);
  if (!endurancePrimary || !pullSecondary) return [];
  return [
    'SECONDARY PULLING ALLOCATION: with an endurance primary goal and pulling as a secondary goal, roughly one weighted exposure plus one main bodyweight volume exposure is the useful default, with an optional third low-cost exposure only when recovery is clearly green.',
    'Keep total hard vertical pulling to roughly 10 or fewer genuinely hard sets per week unless the program states why more is justified. Wanting more pull-ups is not by itself a reason to add another five-set session.',
  ];
}

function intraSessionStopRules(intake = {}) {
  const sportSessions = Number(intake.sport_sessions_per_week || 0);
  const concurrent = sportSessions >= 3 || /mma|bjj|jiu|wrestl|box|combat|sport/i.test(lower(txt(intake.sport)));
  if (!concurrent) return [];
  return [
    'INTRA-SESSION STOP RULE FOR HIGH-INTENSITY COMPOUND WORK: for a heavily concurrent athlete, a prescribed set count is a ceiling, not an obligation. Where a compound lift is prescribed at high intensity, state the stop condition in the row, for example "up to 3 x 3; stop after 2 sets if the RPE ceiling is exceeded, technique materially deteriorates, or bar speed clearly falls".',
    'Never require the final set purely because the table lists it when the intended effort ceiling has already been reached.',
  ];
}

// --- 8: youth skill architecture --------------------------------------------

function youthArchitectureRules(intake = {}) {
  const age = Number(intake.age || intake.age_years || 0);
  if (!(age > 0 && age < 18)) return [];
  const rules = [];
  const wallSeconds = wallHandstandSeconds(intake);
  if (/handstand/i.test(goals(intake)) && wallSeconds != null && wallSeconds >= 20) {
    rules.push(`HANDSTAND SPECIFICITY: wall-supported capacity is already about ${wallSeconds} seconds, which is adequate. Additional passive wall holds no longer drive the freestanding outcome. Include at least one reduced-support balance-correction drill each skill session - for example chest-to-wall toe pulls, heel pulls, wall floats, or a controlled fingertip-correction drill - and trim some passive wall-hold volume to make room. Kick-ups plus wall holds alone are insufficient.`);
  }
  rules.push('SESSION DIFFERENTIATION: two weekly skill sessions do not have to be identical. Giving one session a bar-skill emphasis with handstand entry practice, and the other a handstand-balance emphasis with lighter integrated bar work, is preferred - provided the weekly frequency of each primary skill is preserved.');
  rules.push('BODYWEIGHT STRENGTH PROGRESSION: once a useful rep range is reached, do not keep adding reps. Progress instead through harder leverage, a pause, slower tempo, greater range of motion, added ring-stability demand, reduced assistance, or a harder variation - choosing whichever suits the movement and the athlete.');
  rules.push('YOUTH PAIN DIFFERENTIATION: normal muscular effort and next-day muscular fatigue are acceptable. Sharp or localised joint pain at the wrist, elbow, shoulder or knee, or a visible change in technique, means stop the exposure and regress it - not push through.');
  return rules;
}

// --- 4A: session time ceiling -----------------------------------------------

function timeCeilingRules(intake = {}) {
  const minutes = Number(intake.session_duration_minutes || 0)
    || Number((String(intake.session_length || '').match(/(\d+)/) || [])[1] || 0);
  if (!minutes) return [];
  return [
    `SESSION TIME CEILING: each session must fit ${minutes} minutes INCLUDING warm-up, every prescribed rest interval, transitions between exercises and skill setup - not just the work sets.`,
    'If the plan does not fit, remove redundant lower-priority work in this order of protection: keep primary skill/goal practice, then integrated full-skill practice, then one secondary drill for the same goal, then two to three genuinely useful support movements. Never shorten prescribed rest merely to fit the ceiling, because that changes the training quality the rest exists to protect.',
  ];
}

// --- 2C / 7C: endurance and loaded-carry framing -----------------------------

function enduranceSpecificityRules(intake = {}) {
  const all = lower(goals(intake));
  const rules = [];
  if (/\b\d+\s*k(?:m)?\b|marathon|time trial/.test(all)) {
    rules.push('EVENT SPECIFICITY: across a multi-week development block the event-specific session must progress toward longer, more race-relevant sustained repetitions, not repeat the same short repeat every week. The exact distances are a coaching choice; the direction is not. Starting pace comes from demonstrated current performance, never from goal pace alone.');
  }
  const baseline = statedRunningBaselineKm(intake);
  if (baseline) {
    rules.push(`RUNNING VOLUME ACCOUNTING: this athlete's established tolerated volume is about ${baseline.low}-${baseline.high} km/week. When you claim the plan sits at or below that baseline, count everything - easy runs, warm-up jog, strides, interval repetitions, recovery jogging and cooldown. Do not describe a week as at-or-below baseline if full session accounting clearly exceeds it.`);
  }
  if (/ruck|loaded march|pack march/.test(all)) {
    rules.push('LOADED-CARRY FRAMING: if the long-term goal pace is materially faster than what this block prescribes, label the block as an early developmental step toward that standard rather than implying it reaches it. Never progress load, distance and pace aggressively at the same time.');
  }
  return rules;
}

export function buildV34ArchitectureBrief(intake = {}, options = {}) {
  const sections = [];

  const readiness = buildReadinessBrief(intake, options);
  if (readiness) sections.push(readiness);

  const rules = [
    ...enduranceSpecificityRules(intake),
    ...buildMaintenanceHoldRules(intake),
    ...buildSymptomResponseRules(intake),
    ...hardPullingCeilingRules(intake),
    ...intraSessionStopRules(intake),
    ...youthArchitectureRules(intake),
    ...timeCeilingRules(intake),
  ];

  // Unilateral pull outcome specificity, only when the goal is a rep count the
  // athlete cannot yet hit and current capacity is known.
  const oapGoalText = `${goals(intake, 'primary')} ${goals(intake, 'secondary')}`;
  if (/one[- ]?arm (?:pull|chin)[- ]?up|\boap\b/i.test(oapGoalText)) {
    const current = currentStrictOapReps(intake);
    const target = targetConsecutiveReps(oapGoalText);
    if (Number.isFinite(current) && current >= 1 && Number.isFinite(target) && target > current) {
      rules.push(`UNILATERAL REP-OUTCOME SPECIFICITY: the goal is ${target} consecutive strict reps and demonstrated capacity is about ${current}. A block built only from isolated singles trains the wrong outcome. Lead the direct exposure with a multi-rep priority set of ${Math.max(1, current - 1)}-${current} clean reps per side according to readiness, then follow with 1-2 clean singles per side. On a poor-readiness day, all-singles for that day is an acceptable regression.`);
      rules.push('Progress that outcome through cleaner multi-rep execution, more sides earning the extra rep, lower RPE at the same reps, better left/right symmetry, and eventually a second multi-rep exposure - never by blindly inflating total unilateral volume.');
    }
  }

  if (!sections.length && !rules.length) return '';
  return [
    ...sections,
    ...(rules.length ? ['=== V34 COACHING ARCHITECTURE ===', ...rules.map((r) => `* ${r}`)] : []),
  ].join('\n');
}
