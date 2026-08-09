// Goal-specific specialist rule router for the compact Phase 15 path.
// These are distilled decision rules from the authored coaching clusters. They are
// injected only when the intake calls for them, keeping the OpenAI prompt compact.

import {
  getGoalFamily,
  parseSkillBenchmarks,
  selectRungForSkill,
} from './skill_progressions.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function str(v) { return typeof v === 'string' ? v : JSON.stringify(v || ''); }
function goals(intake) {
  // Specialist progression routers are for actual progression goals. A maintenance or
  // nice-to-have mention must not activate a lower-rung skill prescription that competes
  // with higher-priority goals.
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals)]
    .map(str).filter(Boolean);
}

function parseStreetGoal(text) {
  const s = String(text || '');
  const movement = /weighted\s+(?:chin.?up|chinup)/i.test(s) ? 'Weighted Chin-up'
    : /weighted\s+(?:pull.?up|pullup)/i.test(s) ? 'Weighted Pull-up'
    : /weighted\s+dips?|dip\s+with\s+weight/i.test(s) ? 'Weighted Dip'
    : null;
  if (!movement) return null;

  const maxStrength = /\b1\s*rm\b|\b1rm\b|max(?:imum)?\s*(?:strength|single|load)?|heavy\s*(?:single|double|triple)|\b[123]\s*rm\b/i.test(s);
  const repMatch = s.match(/(?:\+\s*(\d+(?:\.\d+)?)\s*kg[^\n,;]{0,40})?(?:x|×)\s*(\d+)\b/i)
    || s.match(/(\d+)\s*(?:clean\s*)?reps?[^\n,;]{0,40}\+\s*(\d+(?:\.\d+)?)\s*kg/i);
  const loadedEndurance = !!repMatch && Number(repMatch[2] || repMatch[1]) >= 6;
  return { movement, expression: maxStrength && !loadedEndurance ? 'max_strength' : loadedEndurance ? 'loaded_endurance' : maxStrength ? 'max_strength' : 'general_strength', raw:s };
}

function currentExternal1rm(intake, movement) {
  const src = str(intake.current_numbers || intake.current_strength || intake.performance_markers);
  const family = movement === 'Weighted Dip' ? '(?:weighted\\s+dip|dips?)'
    : movement === 'Weighted Pull-up' ? '(?:weighted\\s+pull.?up|pullup)'
    : '(?:weighted\\s+chin.?up|chinup)';
  const re = new RegExp(`${family}[^\\n|]{0,80}\\+\\s*(\\d+(?:\\.\\d+)?)\\s*kg[^\\n|]{0,60}(?:1\\s*rm|1rm|max)`, 'i');
  const m = src.match(re);
  return m ? Number(m[1]) : null;
}

function currentOapStrict(intake) {
  const src = JSON.stringify(intake || {});
  for (const re of [/(?:one.?arm pull.?up|oap)[^\d]{0,60}(\d+)\s*(?:strict\s*)?(?:reps?|rep|maximum|max)/i, /(\d+)\s*strict\s*(?:one.?arm pull.?ups?|oaps?)/i]) {
    const m = src.match(re); if (m) return Number(m[1]);
  }
  return null;
}

function gymnasticsRules(intake) {
  const out = [];
  let benchmarks = {};
  try { benchmarks = parseSkillBenchmarks(intake) || {}; } catch (_) {}

  for (const g of goals(intake)) {
    let family = null;
    try { family = getGoalFamily(g); } catch (_) {}
    if (!family) continue;

    let selection = null;
    try { selection = selectRungForSkill(family, benchmarks, intake); } catch (_) {}
    out.push(`SPECIALIST SOURCE: Advanced Gymnastics / skill graph family=${family}.`);
    out.push('Universal skill rule: direct exposure to the actual skill family remains the anchor once the athlete can perform a measurable tolerated version. Assistance supports specificity; it does not replace it. Quality stops the set before technically poor attempts accumulate.');
    out.push('Anti-hallucination rule: prescribe only complete named variations that exist in the verified skill graph/exercise library. Never invent a banded, wall, eccentric, partial, one-leg, tuck or deficit variation by wording alone.');
    out.push('Ordering rule: primary skill work is performed after warm-up and any genuinely non-fatiguing primer, before fatigue-producing strength/hypertrophy work.');

    const explicitOap = family === 'one_arm_pull_up' ? currentOapStrict(intake) : null;
    if (explicitOap != null && explicitOap >= 1) {
      out.push(`DEMONSTRATED-LEVEL OVERRIDE: athlete reports ${explicitOap} strict One-Arm Pull-up rep${explicitOap === 1 ? '' : 's'}. This direct performance evidence overrides any lower prerequisite gate that could not be parsed from the intake. Do not regress to Weighted Pull-up, Archer Pull-up or eccentrics as the main skill exposure.`);
    } else if (selection) {
      out.push(`DETERMINISTIC SKILL-GRAPH SELECTION: ${JSON.stringify(selection)}. Use observed current ability over an arbitrary easier gate.`);
    }

    if (family === 'planche') {
      out.push('Article N2 Planche rule: use the verified route Planche Lean -> Tuck Planche -> Advanced Tuck Planche -> Straddle Planche -> Full Planche, but do NOT regress an athlete who already demonstrates a harder clean rung.');
      out.push('Planche readiness heuristics are quality-based: roughly 20s clean lean supports tuck work; about 10-15s clean tuck supports advanced tuck; about 10-15s clean advanced tuck supports meaningful straddle work. These are heuristics, not mandatory gates.');
      out.push('Planche technique standard: locked elbows, strong protraction, controlled shoulder position, posterior pelvic tilt, active glutes and rigid body line. Bent-elbow or large-lumbar-extension holds do not count as progression evidence.');
      out.push('Planche programming: give at least two weekly high-quality specific exposures when it is a primary goal and recovery permits. Use short repeatable quality holds/attempts and verified planche-family support work rather than fatigue-chasing.');
    }
  }
  return out;
}

function streetLiftingRules(intake) {
  const out = [];
  const seen = new Set();
  for (const g of goals(intake)) {
    const parsed = parseStreetGoal(g);
    if (!parsed) continue;
    const key = `${parsed.movement}:${parsed.expression}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const oneRm = currentExternal1rm(intake, parsed.movement);
    out.push(`SPECIALIST SOURCE: Advanced Bodyweight Article N8, movement=${parsed.movement}, expression=${parsed.expression}.`);
    if (oneRm != null) out.push(`Current external-load 1RM anchor parsed for ${parsed.movement}: +${oneRm} kg. Target prescriptions must be calibrated from this CURRENT benchmark, not from a future target.`);

    if (parsed.expression === 'max_strength') {
      out.push(`${parsed.movement} MAX-STRENGTH rule: keep the goal movement as the anchor lift, use low-rep heavy specific work with enough rest for rep quality, keep most work short of grinding failure, and retain a modest low-rep back-off dose. Reduce secondary volume before sacrificing anchor-lift quality.`);
      out.push('For an advanced street lifter, prefer small load jumps and exposure quality over repeated true-max attempts. A Westside/max-effort template is optional, never forced.');
    } else if (parsed.expression === 'loaded_endurance') {
      out.push(`${parsed.movement} LOADED-ENDURANCE rule: this is NOT a 1RM-only problem. Use two tracks: (1) a heavier low-rep strength-reserve exposure and (2) a specific clean-volume exposure at or near the goal external load using straight sets, ladders, clusters or density work.`);
      out.push('Dose the loaded-endurance track from CURRENT clean capacity at the relevant load whenever available. Do not prescribe the future target rep count as current working-set reps. Progress accumulated clean reps/density before forcing load increases when the goal is fixed-load endurance.');
    } else {
      out.push(`${parsed.movement} rule: determine whether the client is pursuing maximal external load or loaded endurance from the stated target/current benchmarks before finalizing sets/reps. Do not collapse both expressions into one generic weighted-calisthenics progression.`);
    }
  }
  return out;
}

export function buildSpecialistRules(intake = {}) {
  const rules = [...gymnasticsRules(intake), ...streetLiftingRules(intake)];
  if (!rules.length) return '';
  return ['=== GOAL-SPECIFIC SPECIALIST RULES ===', ...rules.map(x => `* ${x}`)].join('\n');
}

export { parseStreetGoal };
