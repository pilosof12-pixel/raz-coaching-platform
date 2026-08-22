// Coaching governance rules: the disciplines a program has to keep once its
// structure is sound.
//
// Each rule here answers a question the coach review kept raising about live
// programs that passed every structural gate. They are deliberately separate
// from the structural audit: a program can be complete, coherent and correctly
// sequenced and still quietly overrun the athlete's evening, drift a
// maintenance lift upward for no reason, or hand a skill quota to a 13-year-old
// with no instruction to stop when quality goes.
//
// Only rules with an objective answer block release. Time estimates and
// coaching emphasis are advisory: being confidently wrong about a session's
// length is worse than reporting it.

import { parseWeek, sessionDurations } from './v34_workload_accounting.js';
import { classifyExercise, CATEGORY, ROLE } from './v38_movement_taxonomy.js';

function txt(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function kgOf(raw) {
  const m = String(raw || '').match(/\+?\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function rowKey(cells, parsed) {
  return `${String(cells[parsed.day] || '').trim().toLowerCase()}|${String(cells[parsed.exercise] || '').trim().toLowerCase()}`;
}

// The athlete's stated time budget, read the same way the planner reads it so
// the rule and the brief cannot disagree about the ceiling.
export function sessionBudgetMinutes(intake = {}) {
  const numeric = Number(intake?.session_duration_minutes || intake?.session_minutes || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const raw = String(intake?.session_length || intake?.time_per_session || '').trim();
  const nums = [...raw.matchAll(/\d{2,3}/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}

// --- item 11: skill work is a ceiling, not a quota ---------------------------

// A stop condition tells the athlete when to end the set early. Without one, a
// prescribed attempt count reads as work that must be completed, which is how
// skill sessions turn into fatigue sessions.
const QUALITY_STOP = /\b(?:stop|end the set|cut the set|quality|clean|crisp|miss(?:es|ed)?|symmetr|balance|form|breaks? down|deteriorat|no grind|leave|in reserve|up to|maximum|no more than|at most)\b/i;

export function collectSkillCeilingFlags(program, intake = {}) {
  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const { role, category } = classifyExercise(name);
      if (role !== ROLE.SKILL_PRACTICE && category !== CATEGORY.SKILL) continue;
      const note = `${txt(cells[parsed.notes])} ${parsed.load == null ? '' : txt(cells[parsed.load])}`;
      if (QUALITY_STOP.test(note)) continue;
      flags.push({
        code: 'V43_SKILL_QUOTA_WITHOUT_CEILING',
        week,
        exercise: name,
        day: String(cells[parsed.day] || '').trim(),
        message: `${name} (Week ${week}) prescribes skill attempts with no quality ceiling. Prescribed attempts are the maximum allowed, not a target to complete: say when to stop, whether that is a miss, lost symmetry, worsening balance or form breaking down.`,
      });
    }
  }
  return flags;
}

// --- item 12: the session has to fit the athlete's evening -------------------

export function collectSessionDurationFlags(program, intake = {}) {
  const budget = sessionBudgetMinutes(intake);
  if (!budget) return [];
  const flags = [];
  for (let week = 1; week <= 4; week++) {
    if (!parseWeek(program, week)) continue;
    for (const { day, minutes } of sessionDurations(program, week)) {
      if (minutes <= budget * 1.15) continue;
      flags.push({
        code: 'V43_SESSION_EXCEEDS_TIME_BUDGET',
        week,
        day,
        estimated_minutes: Math.round(minutes),
        budget_minutes: budget,
        message: `${day} (Week ${week}) estimates ${Math.round(minutes)} minutes against a stated ${budget}-minute budget. Cut optional accessories first, then redundant hypertrophy, then secondary support; keep the primary work and its rest intact.`,
      });
    }
  }
  return flags;
}

// --- item 13: maintenance is held, not progressed ----------------------------

// Movements that serve a goal the athlete asked only to maintain. Nothing about
// a passing week is a reason to add load to them.
export function maintenancePatterns(intake = {}) {
  const goals = txt(intake.maintenance_goals).toLowerCase();
  if (!goals.trim()) return [];
  const patterns = [];
  if (/squat/.test(goals)) patterns.push({ label: 'squat', re: /squat/i });
  if (/deadlift/.test(goals)) patterns.push({ label: 'deadlift', re: /deadlift/i });
  if (/press|bench/.test(goals)) patterns.push({ label: 'press', re: /press|bench/i });
  if (/pull|chin/.test(goals)) patterns.push({ label: 'pull', re: /pull[- ]?up|chin[- ]?up/i });
  return patterns;
}

const EXPLICIT_REASON = /\b(?:only if|if\b|when\b|earned|provided|unless|because|to (?:re-?)?establish|re-?test|priority (?:has )?changed)\b/i;

export function collectMaintenanceDriftFlags(program, intake = {}) {
  const patterns = maintenancePatterns(intake);
  if (!patterns.length) return [];
  // A goal named as primary or secondary is not maintenance, whatever else it says.
  const developed = `${txt(intake.primary_goals)} ${txt(intake.secondary_goals)}`.toLowerCase();
  const active = patterns.filter((p) => !p.re.test(developed));
  if (!active.length) return [];

  const flags = [];
  let previous = new Map();
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const thisWeek = new Map();
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const pattern = active.find((p) => p.re.test(name));
      if (!pattern) continue;
      const key = rowKey(cells, parsed);
      const sets = firstNum(cells[parsed.sets]);
      const load = parsed.load == null ? null : kgOf(cells[parsed.load]);
      thisWeek.set(key, { sets, load });
      const before = previous.get(key);
      if (!before) continue;
      const loadRose = Number.isFinite(load) && Number.isFinite(before.load) && load > before.load;
      const setsRose = Number.isFinite(sets) && Number.isFinite(before.sets) && sets > before.sets;
      if (!loadRose && !setsRose) continue;
      if (EXPLICIT_REASON.test(txt(cells[parsed.notes]))) continue;
      flags.push({
        code: 'V43_MAINTENANCE_AUTO_PROGRESSED',
        week,
        exercise: name,
        goal: pattern.label,
        message: `${name} (Week ${week}) increases ${loadRose ? 'load' : 'set count'} but ${pattern.label} is a maintenance goal for this athlete. Maintenance runs at the minimum reliable dose; another week passing is not a reason to add work.`,
      });
    }
    for (const [k, v] of thisWeek) previous.set(k, v);
  }
  return flags;
}

// --- item 14: every hard session says what to do when it goes wrong ----------

const AUTOREGULATION = /\b(?:if|when|should)\b[^.;]{0,80}\b(?:rpe|rir|grind|slow|speed|bar speed|technique|form|pain|sore|flare|niggle|readiness|beat up|tired|fatigued|miss)\b/i;
const RESPONSE = /\b(?:stop|hold|repeat|drop|cut|reduce|back off|stay at|skip|swap|switch|keep)\b/i;
const HARD_INTENSITY = 7.5;

function maxRpe(raw) {
  const nums = String(raw || '').match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const rpes = nums.map(Number).filter((n) => n >= 1 && n <= 10);
  return rpes.length ? Math.max(...rpes) : null;
}

export function collectAutoregulationFlags(program, intake = {}) {
  const flags = [];
  const head = String(program || '').split(/START_WEEK1_TSV/i)[0];
  // A response stated once for the whole block covers every session it names.
  const blockLevel = AUTOREGULATION.test(head) && RESPONSE.test(head);

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const rpeIndex = parsed.header.findIndex((h) => /rpe|rir/i.test(String(h || '')));
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const { category } = classifyExercise(name);
      const isPrimary = [CATEGORY.KNEE_DOMINANT, CATEGORY.HIP_DOMINANT, CATEGORY.VERTICAL_PULL, CATEGORY.VERTICAL_PUSH].includes(category);
      if (!isPrimary) continue;
      const rpe = rpeIndex < 0 ? null : maxRpe(cells[rpeIndex]);
      if (!Number.isFinite(rpe) || rpe < HARD_INTENSITY) continue;
      const note = txt(cells[parsed.notes]);
      if ((AUTOREGULATION.test(note) && RESPONSE.test(note))) continue;
      // The block-level guidance has to actually name this movement to count.
      if (blockLevel && new RegExp(name.split(/\s+/).slice(-2).join('\\s+'), 'i').test(head)) continue;
      flags.push({
        code: 'V43_NO_AUTOREGULATION_PATH',
        week,
        exercise: name,
        day: String(cells[parsed.day] || '').trim(),
        rpe,
        message: `${name} (Week ${week}) is prescribed at RPE ${rpe} with no stated response if RPE overshoots, readiness is poor, pain appears or technique deteriorates. Say what happens: hold the load, cut a set, change the variation, or repeat the last successful week.`,
      });
    }
  }
  return flags;
}

// --- item 9: symptom response names the stressor that caused it --------------

// Modalities an injury history can be attributed to, with the words that link a
// symptom to each. A response that does not name the implicated modality is
// treating a symptom without addressing its source.
const SYMPTOM_SOURCES = [
  { modality: 'running', symptom: /shin|tibial|stress fracture|plantar|achilles|calf|it band|runner/i, response: /run(?:ning)?|interval|mileage|km|pace|impact/i },
  { modality: 'rucking', symptom: /ruck|pack|load carriage/i, response: /ruck|pack|carry|load carriage/i },
  { modality: 'pulling', symptom: /elbow|epicondyl|forearm|biceps tendon/i, response: /pull|chin|grip|hang|curl/i },
  { modality: 'pressing', symptom: /shoulder|impingement|rotator|ac joint/i, response: /press|push|overhead|dip/i },
];

export function collectCausalInjuryResponseFlags(program, intake = {}) {
  const history = `${txt(intake.injuries)} ${txt(intake.pain)} ${txt(intake.notes)}`;
  if (/none reported/i.test(txt(intake.injuries)) && !/\b(?:previous|history of|prior)\b/i.test(history)) return [];
  const head = String(program || '').split(/START_WEEK1_TSV/i)[0];
  if (!/\b(?:if|when|should)\b/i.test(head)) return [];

  const flags = [];
  for (const source of SYMPTOM_SOURCES) {
    if (!source.symptom.test(history)) continue;
    // Find the sentence that responds to this symptom.
    const sentences = head.split(/(?<=[.!?])\s+/).filter((s) => source.symptom.test(s) || /\bif\b/i.test(s));
    const addressed = sentences.some((s) => source.symptom.test(s) && source.response.test(s));
    if (addressed) continue;
    flags.push({
      code: 'V43_INJURY_RESPONSE_NOT_CAUSAL',
      modality: source.modality,
      message: `The athlete has a documented ${source.modality} symptom history, but the program's symptom guidance never says to modify the ${source.modality} stressor when it returns. Change the stressor most plausibly linked to onset rather than applying one universal rule.`,
    });
  }
  return flags;
}

// --- assembly ----------------------------------------------------------------

export function collectGovernanceFlags(program, intake = {}) {
  return [
    ...collectSkillCeilingFlags(program, intake),
    ...collectSessionDurationFlags(program, intake),
    ...collectMaintenanceDriftFlags(program, intake),
    ...collectAutoregulationFlags(program, intake),
    ...collectCausalInjuryResponseFlags(program, intake),
  ];
}

// A skill quota with no stop condition, and a maintenance lift drifting upward,
// are objective errors. Duration estimates and causal-response judgements are
// reported for review rather than blocking a release.
export const GOVERNANCE_HARD_CODES = new Set([
  'V43_SKILL_QUOTA_WITHOUT_CEILING',
  'V43_MAINTENANCE_AUTO_PROGRESSED',
]);

export function buildGovernanceBrief(intake = {}) {
  const lines = [];
  const budget = sessionBudgetMinutes(intake);
  if (budget) {
    lines.push(`SESSION DURATION: estimate each session including rest and transitions. ${budget} minutes is the ceiling. If a session runs over, cut optional accessories first, then redundant hypertrophy, then secondary support. Never cut primary work or shorten the rest that makes it work.`);
  }
  const maintenance = maintenancePatterns(intake);
  if (maintenance.length) {
    lines.push(`MAINTENANCE GOALS (${maintenance.map((m) => m.label).join(', ')}): hold the minimum reliable dose across all four weeks. Do not add load or sets just because a week passed. Progress these only if the goal hierarchy changes, and say so on the row when it does.`);
  }
  lines.push('AUTOREGULATION: every hard primary set must say what happens if RPE overshoots, readiness is poor, pain appears or technique deteriorates - hold the load, cut a set, change the variation, or repeat the last successful week. A prescription with no failure path is incomplete.');
  const skillGoal = /muscle[- ]?up|handstand|planche|lever|skill|gymnastic/i.test(`${txt(intake.primary_goals)} ${txt(intake.secondary_goals)}`);
  if (skillGoal) {
    lines.push('SKILL WORK IS A CEILING, NOT A QUOTA: prescribed attempts are the maximum allowed. State the stop condition on every skill row - a miss, lost symmetry, worsening balance or form breaking down ends the set early. Power work progresses through output, never through slower reps or more fatigue.');
  }
  for (const source of SYMPTOM_SOURCES) {
    if (source.symptom.test(`${txt(intake.injuries)} ${txt(intake.pain)} ${txt(intake.notes)}`)) {
      lines.push(`CAUSAL INJURY RESPONSE: this athlete has a ${source.modality} symptom history. If it returns, the response must modify the ${source.modality} stressor most plausibly linked to onset. Do not fall back on one universal rule such as always cutting easy volume first.`);
    }
  }
  return lines.join('\n');
}
