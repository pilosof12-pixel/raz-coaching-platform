// Goal-specific specialist rule router for the compact Phase 15 path.
// These are distilled decision rules from authored coaching clusters plus the
// Overcoming Gravity gymnastics decision layer. They are injected only when relevant.

import {
  getGoalFamily,
  parseSkillBenchmarks,
  selectRungForSkill,
} from './skill_progressions.js';
import { overcomingGravityRulesForFamily } from './overcoming_gravity_rules.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function str(v) { return typeof v === 'string' ? v : JSON.stringify(v || ''); }
function goals(intake) {
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

function hasMedialElbowPullingSensitivity(intake) {
  const pain = str(intake?.pain || intake?.limitations || '').toLowerCase();
  return /(medial\s+elbow|golfer.?s elbow|inner\s+elbow)/i.test(pain)
    && /(pull|chin|curl|elbow)/i.test(pain);
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
    out.push(`SPECIALIST SOURCE: Overcoming Gravity decision layer + verified skill graph, family=${family}.`);
    out.push(...overcomingGravityRulesForFamily(family));
    out.push('Anti-hallucination rule: prescribe only complete named variations that exist in the verified skill graph/exercise library. Never invent a banded, wall, eccentric, partial, one-leg, tuck or deficit variation by wording alone.');

    const explicitOap = family === 'one_arm_pull_up' ? currentOapStrict(intake) : null;
    if (explicitOap != null && explicitOap >= 1) {
      out.push(`DEMONSTRATED-LEVEL OVERRIDE: athlete reports ${explicitOap} strict One-Arm Pull-up rep${explicitOap === 1 ? '' : 's'}. This direct performance evidence overrides any lower prerequisite gate that could not be parsed from the intake. Do not regress to Weighted Pull-up, Archer Pull-up or eccentrics as the main skill exposure.`);
    } else if (selection) {
      out.push(`DETERMINISTIC SKILL-GRAPH SELECTION: ${JSON.stringify(selection)}. Use observed current ability over an arbitrary easier gate.`);
    }

    if (family === 'planche') {
      out.push('Authored Planche route remains verified: Planche Lean -> Tuck Planche -> Advanced Tuck Planche -> Straddle Planche -> Full Planche, but demonstrated ability overrides a forced regression to an easier rung.');
      out.push('Planche readiness numbers are heuristics only. Technique quality, clean hold duration, pain tolerance and repeatability decide progression.');
    }
  }
  return out;
}

function streetLiftingRules(intake) {
  const out = [];
  const seen = new Set();
  const elbowSensitive = hasMedialElbowPullingSensitivity(intake);
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
      if (elbowSensitive && /Chin-up|Pull-up/.test(parsed.movement)) {
        out.push('MEDIAL-ELBOW LOAD MANAGEMENT: cap direct weighted Chin-up/Pull-up work at roughly 8-10 working sets per week across all exposures. Keep the heavy anchor and trim back-off/secondary sets first. Do not add optional hammer curls or other elbow-flexor isolation on top unless the athlete explicitly prioritizes arm hypertrophy and the elbow is quiet. Pain sensitivity is a volume constraint, not a reason to remove tolerated heavy pulling.');
      }
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
