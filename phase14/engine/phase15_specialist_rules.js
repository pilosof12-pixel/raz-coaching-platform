// Goal-specific specialist rule router for the compact Phase 15 path.
// These are distilled decision rules from authored coaching clusters plus the
// Overcoming Gravity gymnastics decision layer. They are injected only when relevant.

import {
  getGoalFamily,
  parseSkillBenchmarks,
  selectRungForSkill,
} from './skill_progressions.js';
import { overcomingGravityRulesForFamily } from './overcoming_gravity_rules.js';
import { buildRoadmapPromptRules } from './goal_progression_graph.js';
import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';

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

function manualAcceptanceRules(intake = {}) {
  const out = [];
  const all = `${goals(intake).join(' | ')} ${str(intake.notes)} ${str(intake.current_numbers)}`;
  const athleteAge = Number(intake.age || intake.age_years || 0);
  const youth = Number.isFinite(athleteAge) && athleteAge > 0 && athleteAge < 18;

  if (isHighConcurrencyHybrid(intake)) {
    const squat = String(intake.current_numbers || '').match(/back\s*squat\s*:\s*(\d+(?:\.\d+)?)\s*kg\s*(?:1\s*rm|1rm|max)?/i);
    out.push('MANUAL-ACCEPTANCE HYBRID RULE: future target numbers are never current capacity. Multi-set heavy strength prescriptions must be plausible from the supplied CURRENT benchmark and the requested RPE, especially with 5 external combat sessions. For repeated Back Squat work use conservative benchmark-based loading; as a ceiling guide, about <=88% current 1RM for triples, <=85% for fours, <=82% for fives, and lower when fatigue requires it. Progress only after the achieved RPE/bar speed supports the increase.');
    if (squat) out.push(`The current Back Squat 1RM is ${squat[1]} kg. Do not program repeated triples around 90-93% as though the future squat target were already achieved.`);
    if (/one.?arm\s*(?:pull|chin)|\boap\b/i.test(all)) out.push('Every One-Arm Pull-up and Assisted One-Arm Pull-up prescription must explicitly say per arm / each side in Reps or Notes so unilateral dose is unambiguous.');
    out.push('Do not place the substantive long run immediately before the primary heavy Back Squat day when another placement exists. Preserve the fixed strength-day calendar and move the run around it rather than accepting obvious lower-body interference.');
  }

  if (youth) {
    if (String(intake.gym_availability_mode || '').toLowerCase() === 'flexible' && !arr(intake.available_gym_days).length) {
      out.push('YOUTH FLEXIBLE-SCHEDULE HARD CONTRACT: do not invent Monday/Tuesday or any weekday. Label the two sessions Session A and Session B in every week.');
    }
    out.push('YOUTH SKILL-FIRST HARD CONTRACT: after the warm-up, primary bar-muscle-up/handstand skill practice comes before ring dips, rows, push-ups, pistol squats or other support strength. The introduction and TSV must agree that skills are trained fresh.');
    if (/handstand/i.test(all)) out.push('YOUTH HANDSTAND QUALITY CONTRACT: controlled kick-up practice should usually stay around 3-5 quality sets and <=20 planned attempts per session. Do not progress 5->6->7 sets. Progress entry control, successful independent-balance attempts, balance time, body line, assistance or wall dependence while wall-supported holds provide the measurable capacity progression.');
    const dip = all.match(/(?:about\s*)?(\d{1,2})\s*(?:good|clean|strict)?\s*ring\s*dips?/i);
    if (dip) out.push(`YOUTH CAPACITY CONTRACT: current ring-dip capacity is about ${dip[1]} good reps. That is a fresh ceiling, not a 3-set working prescription. Keep repeated ring-dip sets clearly submaximal (roughly <=70-75% of that ceiling at first) and progress quality/reps conservatively rather than prescribing 3 sets at the current max.`);
  }

  const tactical = /\b(?:tactical|military|special[- ]?operations|combat[- ]?ready|operator)\b/i.test(all) && /3\s*km|3k/i.test(all);
  if (tactical) {
    out.push('TACTICAL 3K FIVE-DAY CONVERGENCE CONTRACT: for the supplied 3K + 20 kg ruck + pull-up avatar with 3 requested strength sessions and an explicit five-calendar-day allowance, use the stable five-day architecture instead of rediscovering the schedule: Day 1 strength with squat + weighted pull-up + low-cost push plus easy Run/Zone 2; Day 2 3K-specific Run intervals; Day 3 deadlift + OHP + strict pull-up + trunk; Day 4 20 kg ruck/Backpack Carry; Day 5 unilateral/lower support + non-adjacent pull support plus easy aerobic Run. Keep three direct Run exposures, one ruck, and three genuine strength sessions across exactly five training days.');
    out.push('The 3K progression requirement must be satisfied by modifying the existing interval Run row: make its Load/Target or Notes explicitly event-specific (for example current-calibrated 3K interval pace). Do not add a fourth Run, a sixth training day, or extra conditioning just to satisfy progression.');
    out.push('Keep substantive pull-up priority exposures non-adjacent (for example Day 1 / Day 3 / Day 5), preserve the tolerated 18-20 km/week running baseline without abrupt impact increases, and keep every nominal 60-minute strength day inside the time budget by trimming support work before primary work.');
  }
  return out;
}

export function buildSpecialistRules(intake = {}) {
  const rules = [...gymnasticsRules(intake), ...streetLiftingRules(intake), ...manualAcceptanceRules(intake)];
  const roadmap = buildRoadmapPromptRules(intake);
  if (!rules.length && !roadmap) return '';
  return [
    ...(rules.length ? ['=== GOAL-SPECIFIC SPECIALIST RULES ===', ...rules.map(x => `* ${x}`)] : []),
    ...(roadmap ? [roadmap] : []),
  ].join('\n');
}

export { parseStreetGoal };
