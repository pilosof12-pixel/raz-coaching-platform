// Zero-to-advanced coaching roadmap layer.
//
// Existing skill_progressions.js remains the source of verified gymnastics rung
// names/doses. This module adds the layer that a simple ordered ladder cannot
// express: mandatory components, athlete-state routing, advancement/regression
// logic, and concurrent-goal constraints. It is intentionally data-driven so
// production prompts and semantic QA can share the same coaching contract.

import { RetriableValidationError } from './exercise_dictionary.js';
import { parseProgramModel } from './program_model.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function text(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

export const GOAL_PROGRESSION_GRAPHS = Object.freeze({
  handstand: {
    family: 'handstand',
    endpoint: 'Reliable freestanding handstand with repeatable entries, line control and useful hold capacity',
    stages: [
      'inversion confidence and wrist/shoulder tolerance',
      'wall-supported line and static capacity',
      'controlled kick-up / entry practice',
      'brief independent balance',
      'repeatable freestanding balance',
      'longer holds, shape changes and advanced hand-balancing as appropriate',
    ],
    components: [
      { id: 'position_capacity', required_until: 'repeatable_freestanding', description: 'Wall-supported static handstand exposure for confidence, shoulder endurance and body-line awareness.' },
      { id: 'entry_balance', required_until: 'reliable_entry', description: 'Direct kick-up/entry and independent balance practice while fresh.' },
      { id: 'wrist_shoulder_prep', description: 'Low-fatigue wrist/scapular/shoulder preparation appropriate to the athlete.' },
    ],
    advance: 'Advance when entries and line are repeatable with improving independent balance; do not replace quality with more failed attempts.',
    regress: 'Regress assistance/ROM/difficulty when line breaks, repeated misses accumulate, pain appears, or the athlete cannot reproduce the current rung.',
  },
  hspu: {
    family: 'hspu',
    endpoint: 'Clean repeatable freestanding handstand push-ups through controlled full ROM',
    stages: [
      'pike pressing and overhead shoulder tolerance',
      'elevated pike pressing',
      'wall-supported partial ROM HSPU',
      'full wall HSPU with improved line',
      'deficit wall HSPU / increased ROM',
      'freestanding eccentric control',
      'clean freestanding HSPU',
    ],
    components: [
      { id: 'vertical_press_specificity', description: 'Direct HSPU-pattern pressing at the athlete’s demonstrated rung rather than generic shoulder work.' },
      { id: 'handstand_position', description: 'Enough inversion line and balance capacity to express pressing strength safely and efficiently.' },
      { id: 'rom_control', description: 'Progressive ROM and eccentric control before forcing harder freestanding reps.' },
    ],
    advance: 'Advance ROM, balance demand or loading only after repeatable reps with a controlled head/hand position, stable shoulder elevation and no collapse through the trunk.',
    regress: 'Regress ROM or balance demand when reps become head-first, excessively arched, asymmetrical, painful or non-repeatable.',
  },
  hspu_90: {
    family: 'hspu_90',
    endpoint: 'Controlled 90-degree handstand push-up: descend from handstand toward the horizontal/planche-like bottom and return to handstand',
    stages: [
      'strong full-ROM wall HSPU',
      'clean freestanding HSPU',
      'deficit freestanding pressing strength',
      '90-degree eccentric / controlled lowering exposure',
      'assisted or partial-range 90-degree return',
      'full 90-degree HSPU single',
      'repeatable 90-degree HSPU reps',
    ],
    components: [
      { id: 'freestanding_press_strength', description: 'A genuine freestanding HSPU strength reserve; this goal must not be routed from ordinary wall pressing alone.' },
      { id: 'horizontal_transition_control', description: 'Specific controlled exposure to the transition toward the horizontal bottom position without inventing unsupported exercise names.' },
      { id: 'straight_arm_planche_support', description: 'Appropriate planche/lean support capacity when useful for the bottom-position mechanics and shoulder demand.' },
    ],
    advance: 'Advance the transition or return only after the athlete can control the eccentric and maintain shoulder/scapular position; the full skill is earned by control, not by accumulating failed attempts.',
    regress: 'Return to a shorter ROM, stronger assistance or prerequisite pressing when the transition collapses, the athlete cannot reverse the bottom, or wrist/shoulder symptoms rise.',
  },
  press_to_handstand: {
    family: 'press_to_handstand',
    endpoint: 'Controlled press to handstand from the floor with no jump, using the athlete-appropriate pike/straddle pathway',
    stages: [
      'wrist tolerance, shoulder elevation and basic compression',
      'standing/seated pike or straddle compression strength',
      'elevated or feet-assisted press weight shift',
      'controlled press negative from handstand',
      'partial-range press with reduced foot assistance',
      'full straddle or pike press to handstand single',
      'repeatable press entries and more demanding shapes when appropriate',
    ],
    components: [
      { id: 'compression', description: 'Specific active pike/straddle compression and hip-flexion strength appropriate to the chosen press shape.' },
      { id: 'straight_arm_weight_shift', description: 'Straight-arm shoulder elevation and forward weight shift over the hands; pressing strength alone is not sufficient.' },
      { id: 'press_specific_entry', description: 'Direct press-specific negatives, assisted presses or partial presses rather than substituting kick-ups.' },
      { id: 'handstand_finish', description: 'Enough handstand line/balance capacity to finish and control the top position.' },
    ],
    advance: 'Reduce foot assistance or increase press ROM only when the athlete can keep elbows straight, maintain scapular elevation and move the hips over the hands without jumping.',
    regress: 'Increase elevation/assistance or return to compression and negative work when elbows bend, the feet jump, the hips cannot pass over the hands, or wrist/hamstring tolerance limits the shape.',
  },
  bar_muscle_up: {
    family: 'bar_muscle_up',
    endpoint: 'Clean repeatable bar muscle-up, then multiple reps or external load when appropriate',
    stages: ['basic strict pull/dip capacity', 'high/explosive pulling', 'bar-specific transition', 'assisted full skill', 'clean unassisted single', 'repeatable reps / weighted expression'],
    components: [
      { id: 'high_pull', description: 'High/explosive vertical pulling that raises the bar contact point.' },
      { id: 'transition', description: 'Bar-specific turnover/transition exposure rather than generic conditioning.' },
      { id: 'support_strength', description: 'Enough strict pulling and dip/support strength to tolerate the skill.' },
    ],
    advance: 'Reduce assistance or increase transition difficulty only after fast symmetrical reps; once a clean full skill exists, prioritize repeatability before unnecessary regressions.',
    regress: 'Return to more assistance or a lower transition rung when turnover becomes asymmetric, slow or painful.',
  },
  planche: {
    family: 'planche', endpoint: 'Full planche, then stronger/longer holds or dynamic planche strength',
    stages: ['straight-arm support and lean', 'tuck', 'advanced tuck', 'straddle', 'half-lay', 'full planche', 'advanced full-planche expression'],
    components: [
      { id: 'straight_arm_specificity', description: 'Direct straight-arm planche progression at the demonstrated rung.' },
      { id: 'wrist_scapular_tolerance', description: 'Wrist and protraction/scapular preparation without stealing quality.' },
      { id: 'dynamic_support', description: 'Appropriate pseudo-planche/planche pressing support when useful.' },
    ],
    advance: 'Advance leverage only after repeatable clean holds at the current rung; leverage quality outranks arbitrary volume.',
    regress: 'Regress leverage if elbows bend, scapular position is lost, pelvis/line collapses or connective-tissue symptoms rise.',
  },
  front_lever: {
    family: 'front_lever', endpoint: 'Full front lever, then stronger static/dynamic lever work',
    stages: ['hanging/scapular control', 'tuck', 'advanced tuck', 'single-leg', 'straddle', 'half-lay', 'full lever'],
    components: [
      { id: 'straight_arm_specificity', description: 'Direct front-lever isometric progression at the demonstrated rung.' },
      { id: 'scapular_strength', description: 'Scapular depression/retraction control appropriate to the rung.' },
      { id: 'dynamic_support', description: 'Lever raises/pulls when they improve the limiting quality without excessive fatigue.' },
    ],
    advance: 'Advance leverage after repeatable body-line holds with controlled scapular position.',
    regress: 'Regress when hips drop, elbows bend, shoulder position cannot be controlled or holds become non-repeatable.',
  },
  human_flag: {
    family: 'human_flag', endpoint: 'Full human flag with repeatable bilateral holds',
    stages: ['lateral trunk and vertical push/pull base', 'vertical/tuck flag', 'tuck', 'one-leg', 'straddle', 'full flag'],
    components: [
      { id: 'flag_specificity', description: 'Direct flag progression on a safe vertical apparatus.' },
      { id: 'lateral_trunk', description: 'Low-cost lateral trunk capacity.' },
      { id: 'bilateral_practice', description: 'Practice both sides unless injury or sport context dictates otherwise.' },
    ],
    advance: 'Advance body length only when shoulder stack and trunk line are controlled on both programmed sides.',
    regress: 'Regress leverage when shoulder position or lateral trunk control fails.',
  },
  one_arm_pull_up: {
    family: 'one_arm_pull_up', endpoint: 'Repeatable strict one-arm pull-ups, then additional reps/load if appropriate',
    stages: ['strong bilateral pull-up base', 'heavy weighted pulling', 'asymmetric/archer work', 'assisted unilateral work', 'eccentric/isometric/partial work', 'first strict rep', 'repeatable strict reps'],
    components: [
      { id: 'specific_unilateral', description: 'A direct unilateral exposure at the athlete’s demonstrated level.' },
      { id: 'bilateral_strength_reserve', description: 'Weighted bilateral pulling retained as strength reserve when recovery allows.' },
      { id: 'elbow_load_management', description: 'Volume and grip selected around elbow/forearm tolerance.' },
    ],
    advance: 'Demonstrated strict OAP ability overrides easier prerequisite ladders; progress reps/quality before adding unnecessary complexity.',
    regress: 'Regress assistance only when strict ROM or elbow/shoulder tolerance deteriorates, not because a generic benchmark parser missed an advanced result.',
  },
  iron_cross: {
    family: 'iron_cross', endpoint: 'Controlled full Iron Cross hold on rings',
    stages: ['ring support / shoulder preparation', 'straight-arm support capacity', 'assisted cross positions', 'cross eccentrics/partials', 'full cross'],
    components: [
      { id: 'ring_support', description: 'Stable ring support and straight-arm shoulder tolerance.' },
      { id: 'cross_specificity', description: 'Verified assisted/partial/eccentric cross work appropriate to demonstrated capacity.' },
      { id: 'connective_tissue_management', description: 'Conservative frequency and no forced progress through elbow/shoulder pain.' },
    ],
    advance: 'Reduce assistance or increase ROM only after repeatable pain-free positions.',
    regress: 'Immediately regress if elbow/shoulder tolerance or ring position deteriorates.',
  },
  weighted_pull: {
    family: 'weighted_pull', endpoint: 'Very high external-load pull-up/chin-up strength or fixed-load rep capacity, depending on the stated goal',
    stages: ['bodyweight proficiency', 'introductory loading', 'intermediate weighted strength', 'advanced heavy strength', 'elite max-strength or loaded-endurance expression'],
    components: [
      { id: 'anchor_lift', description: 'The exact weighted pull-up/chin-up remains the anchor movement.' },
      { id: 'goal_expression', description: 'Max-strength and fixed-load endurance use different loading structures.' },
      { id: 'joint_tolerance', description: 'Grip and weekly elbow-flexor dose respect demonstrated tolerance.' },
    ],
    advance: 'Use small load/repetition/density improvements anchored to current capacity; do not prescribe future target reps as current working reps.',
    regress: 'Reduce secondary volume before removing a tolerated priority anchor lift.',
  },
  weighted_dip: {
    family: 'weighted_dip', endpoint: 'Very high external-load dip strength or fixed-load rep capacity, depending on the stated goal',
    stages: ['bodyweight dip proficiency', 'introductory loading', 'intermediate weighted strength', 'advanced heavy strength', 'elite max-strength or loaded-endurance expression'],
    components: [
      { id: 'anchor_lift', description: 'Weighted dip remains the specific anchor movement.' },
      { id: 'goal_expression', description: 'Max strength and loaded endurance remain separate adaptations.' },
      { id: 'shoulder_sternum_tolerance', description: 'ROM/load selected around pain-free shoulder and sternum tolerance.' },
    ],
    advance: 'Progress from current clean performance with small load or rep changes.',
    regress: 'Reduce load/ROM/support volume if shoulder or sternum symptoms appear.',
  },
  powerlifting: {
    family: 'powerlifting', endpoint: 'Advanced squat/bench/deadlift strength with competition-specific peaking when relevant',
    stages: ['movement acquisition', 'repeatable technique', 'novice linear loading', 'intermediate volume/intensity organization', 'advanced specificity and fatigue management', 'peak/test/competition'],
    components: [
      { id: 'specific_lifts', description: 'Direct squat/bench/deadlift exposure according to the athlete’s actual goals.' },
      { id: 'technical_practice', description: 'Technique and ROM stay stable as load increases.' },
      { id: 'fatigue_structure', description: 'Heavy, volume and secondary work are organized rather than all trained maximally.' },
    ],
    advance: 'Advance loading structure when simple progression no longer works, not merely because the athlete calls themselves advanced.',
    regress: 'Reduce intensity/volume or use a simpler block when technique, recovery or pain no longer supports the current structure.',
  },
  running_3k: {
    family: 'running_3k', endpoint: 'Fast 3 km performance supported by sufficient aerobic capacity and repeatable race-specific speed',
    stages: ['run tolerance', 'aerobic base', 'threshold/critical-speed support', '3K-specific intervals', 'race-pace expression and taper'],
    components: [
      { id: 'aerobic_easy', description: 'Enough low-intensity running to support adaptation and recovery.' },
      { id: 'specific_quality', description: 'A repeatable 3K-specific quality exposure scaled to current performance.' },
      { id: 'impact_management', description: 'Running/ruck impact progression respects history and current tolerance.' },
    ],
    advance: 'Progress one main stress lever at a time: frequency, duration, interval volume or pace.',
    regress: 'Reduce impact/quality when pain, pace collapse or recovery markers indicate the current dose is not repeatable.',
  },
  marathon: {
    family: 'marathon', endpoint: 'Complete or race a full marathon with an adequate long-run and weekly-volume foundation',
    stages: ['consistent run tolerance', 'stable weekly frequency', 'aerobic-volume build', 'long-run development', 'marathon-specific block', 'taper and event'],
    components: [
      { id: 'easy_volume', description: 'Progressive easy running forms the bulk of the work.' },
      { id: 'long_run', description: 'A genuine long-run pathway develops over time; a token short jog is not marathon preparation.' },
      { id: 'durability', description: 'Weekly impact volume rises gradually enough for connective-tissue tolerance.' },
    ],
    advance: 'Build frequency/duration and long-run tolerance before aggressive marathon-specific pace work.',
    regress: 'Reduce volume or long-run progression when pain/recovery deteriorates; do not preserve mileage at the expense of the athlete’s higher-priority goal.',
  },
  combat_conditioning: {
    family: 'combat_conditioning', endpoint: 'Fight-specific repeatability across rounds with sufficient aerobic recovery, high-intensity repeatability and local work capacity',
    stages: ['general aerobic base', 'sport-session tolerance', 'repeat-effort conditioning', 'round-specific work:rest exposure', 'competition-specific taper/expression'],
    components: [
      { id: 'sport_load', description: 'Actual MMA/BJJ/striking sessions are counted as training stress, not ignored.' },
      { id: 'aerobic_support', description: 'Aerobic work supports between-exchange and between-session recovery.' },
      { id: 'fight_specific_repeatability', description: 'Conditioning reflects round duration/work-rest demands rather than arbitrary punishment circuits.' },
    ],
    advance: 'Increase specificity only after general repeatability and recovery are adequate.',
    regress: 'Trim extra conditioning first when combat practice quality or recovery deteriorates.',
  },
});

export function roadmapFamilyForGoal(goal) {
  const s = String(goal || '').toLowerCase();
  if (/one[-\s]?arm\s*(pull|chin)|\boap\b/.test(s)) return 'one_arm_pull_up';
  if (/iron\s*cross/.test(s)) return 'iron_cross';
  if (/front\s*lever/.test(s)) return 'front_lever';
  if (/human\s*flag|\bflag\b/.test(s)) return 'human_flag';
  if (/planche/.test(s)) return 'planche';
  if (/bar\s*muscle[-\s]?up/.test(s)) return 'bar_muscle_up';
  if (/(?:90\s*(?:°|º|degree|deg)|90[-\s]?degree)[^|,;]{0,35}(?:hspu|hand\s*stand\s*push)|(?:hspu|hand\s*stand\s*push)[^|,;]{0,35}90\s*(?:°|º|degree|deg)/.test(s)) return 'hspu_90';
  if (/press\s+(?:to|into)\s+hand\s*stand|hand\s*stand\s+press|press[-\s]?handstand/.test(s)) return 'press_to_handstand';
  if (/\bhspu\b|hand\s*stand\s*push[-\s]?up/.test(s)) return 'hspu';
  if (/freestanding\s*handstand|handstand\s*balance|unsupported\s*handstand|\bhandstand\b/.test(s) && !/push[-\s]?up|hspu|walk|press/.test(s)) return 'handstand';
  if (/weighted\s*(pull[-\s]?up|chin[-\s]?up)/.test(s)) return 'weighted_pull';
  if (/weighted\s*dip|dip[^|,;]{0,30}\+\s*\d+\s*kg/.test(s)) return 'weighted_dip';
  if (/powerlift|squat.*bench.*deadlift|bench.*squat.*deadlift/.test(s)) return 'powerlifting';
  if (/marathon|42\.?(?:195)?\s*km/.test(s)) return 'marathon';
  if (/\b3\s*k(?:m)?\b|\b3\s*km\b/.test(s)) return 'running_3k';
  if (/mma|mixed martial|fight conditioning|combat conditioning|boxing conditioning|kickboxing conditioning/.test(s)) return 'combat_conditioning';
  return null;
}

export function roadmapsForIntake(intake = {}) {
  const out = [];
  const seen = new Set();
  for (const [key, tier] of [['primary_goals', 'primary'], ['secondary_goals', 'secondary'], ['maintenance_goals', 'maintenance']]) {
    for (const raw of arr(intake[key])) {
      const family = roadmapFamilyForGoal(raw);
      if (!family || seen.has(`${family}:${tier}`)) continue;
      seen.add(`${family}:${tier}`);
      out.push({ tier, raw: String(raw), graph: GOAL_PROGRESSION_GRAPHS[family] });
    }
  }
  return out;
}

export function buildRoadmapPromptRules(intake = {}) {
  const maps = roadmapsForIntake(intake);
  if (!maps.length) return '';
  const lines = ['=== ZERO-TO-ADVANCED GOAL ROADMAP ==='];
  for (const item of maps) {
    const g = item.graph;
    lines.push(`* ${item.tier.toUpperCase()} ${g.family}: endpoint=${g.endpoint}`);
    lines.push(`  stages: ${g.stages.join(' -> ')}`);
    lines.push(`  mandatory components: ${g.components.map((c) => `${c.id}: ${c.description}`).join(' | ')}`);
    lines.push(`  advancement: ${g.advance}`);
    lines.push(`  regression: ${g.regress}`);
  }
  lines.push('* Route from demonstrated current ability. Do not force the athlete back to an easier rung when direct performance proves a higher state.');
  lines.push('* A four-week block must train the required components of the current state; mentioning the goal in Notes does not satisfy component coverage.');
  lines.push('* Concurrent lower-priority goals receive a genuine pathway but may not steal the freshness/recovery budget required by the primary goal.');
  return lines.join('\n');
}

function freestandingHandstandSeconds(intake = {}) {
  const src = `${text(intake.current_numbers)} ${text(intake.performance_markers)} ${text(intake.clarification_answers)} ${text(intake.notes)}`;
  const patterns = [
    /freestanding\s+handstand(?:\s+hold)?[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/i,
    /unsupported\s+handstand(?:\s+hold)?[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/i,
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m) return Number(m[1]);
  }
  return 0;
}

function handstandComponentAnalysis(model, intake) {
  const needsAcquisition = freestandingHandstandSeconds(intake) < 20;
  if (!needsAcquisition) return { applicable: false, reason: 'already_has_repeatable_freestanding_capacity' };

  const weeks = [];
  for (const week of model.weeks || []) {
    let wallStatic = 0;
    let entryBalance = 0;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.role === 'warm_up' || ex.modality === 'warm_up') continue;
        // ProgramModel's canonical exercise identity is display_name. Keep legacy
        // fallbacks for hand-built semantic fixtures, but never drop the visible
        // exercise name before checking wall/static and balance components.
        const name = String(ex.display_name || ex.raw_display_name || ex.exercise || ex.name || '').toLowerCase();
        const semanticHandstand = ex.base_movement === 'handstand' || /hand\s*stand|handstand|kick[- ]?up/.test(name);
        if (!semanticHandstand) continue;
        const isStatic = (ex.execution_modifiers || []).includes('isometric') || /\bhold\b/.test(name);
        if (/\bwall\b|belly[- ]to[- ]wall|chest[- ]to[- ]wall|back[- ]to[- ]wall/.test(name) && isStatic) wallStatic += 1;
        if (/kick[- ]?up|freestanding|unsupported|toe[- ]?pull|balance/.test(name)) entryBalance += 1;
      }
    }
    weeks.push({ week: week.week, wall_static: wallStatic, entry_balance: entryBalance });
  }
  return { applicable: true, weeks };
}

export function validateGoalComponentCoverageSemantic(program, intake = {}, suppliedModel = null) {
  const goals = roadmapsForIntake(intake);
  const hasHandstandGoal = goals.some((g) => g.graph.family === 'handstand' && g.tier !== 'maintenance');
  const model = suppliedModel || parseProgramModel(program, intake);
  if (!hasHandstandGoal) return { ok: true, model, applicable: false };

  const hs = handstandComponentAnalysis(model, intake);
  if (!hs.applicable) return { ok: true, model, applicable: false, handstand: hs };

  const wallWeeks = hs.weeks.filter((w) => w.wall_static > 0).length;
  const balanceWeeks = hs.weeks.filter((w) => w.entry_balance > 0).length;
  const missing = [];
  if (wallWeeks < 3) missing.push(`wall-supported static handstand exposure appears in only ${wallWeeks}/4 weeks`);
  if (balanceWeeks < 3) missing.push(`direct entry/independent-balance exposure appears in only ${balanceWeeks}/4 weeks`);

  if (missing.length) {
    throw new RetriableValidationError(
      'GOAL_COMPONENT_COVERAGE_MISSING',
      'PRIOR ATTEMPT FAILED GOAL-COMPONENT COVERAGE. ' +
        `For a developing freestanding handstand, kick-ups/balance attempts and wall-supported static position work are complementary requirements, not substitutes. ${missing.join('; ')}. ` +
        'Preserve direct balance practice while adding a non-fatiguing but substantive wall-facing or appropriate wall-supported static handstand exposure for line, confidence and shoulder endurance. Do not count a warm-up-only mention as the required skill-capacity exposure.',
      { family: 'handstand', weeks: hs.weeks, missing },
    );
  }

  return { ok: true, model, applicable: true, handstand: hs };
}

export function roadmapCoverageSummary() {
  return Object.values(GOAL_PROGRESSION_GRAPHS).map((g) => ({
    family: g.family,
    stages: g.stages.length,
    components: g.components.map((c) => c.id),
    endpoint: g.endpoint,
  }));
}
