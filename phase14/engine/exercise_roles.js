// One vocabulary for what an exercise IS in a session: skill, power, strength,
// accessory, conditioning. The intraday reorder used to know only strength,
// accessory and conditioning, so it put "primary strength" first and moved
// skill work behind it -- the opposite of the engine's own rule:
//
//   60c. Skill-first ordering check (HARD GATE): on every day that contains a
//   skill exposure (one-arm pull-up, archer/assisted OAP, muscle-up,
//   HSPU/handstand press, planche, front/back lever, press-to-handstand), the
//   skill row is the FIRST working exercise after the warm-up. The heavy
//   primary follows, accessories and conditioning come last.
//
// and its stated exception (engine_instructions line 535): when a barbell
// strength goal is primary and the skill is only maintenance or support, the
// skill does not have to lead. So a skill row leads when its family is one of
// the athlete's goals. "Pseudo Planche Push-up" on a squat-and-OAP athlete is
// pressing support, not planche practice, and is not promoted.
//
// Power (jumps, throws, explosive primers) follows skill and precedes heavy
// strength: "Power/throw/jump primers come after preparation and before heavy
// strength." The order is skill -> power -> strength -> hypertrophy/accessory
// -> conditioning -> mobility.

import { YOUTH_PRIMARY_SKILL_NAME, isYouthAthlete } from './youth_primary_skill.js';
import { primaryGoalModalityPattern } from './phase15_elite_guardrails.js';

export const SKILL_FAMILIES = [
  { key: 'one_arm_pull', name: /\b(?:assisted\s+)?one[- ]arm (?:pull|chin)|\barcher (?:pull|chin)/i, goal: /one[- ]?arm\s*(?:pull|chin)|\boap\b/i },
  { key: 'muscle_up', name: /muscle[- ]up|transition drill|hip-to-bar/i, goal: /muscle[- ]?up/i },
  { key: 'handstand', name: /handstand|\bhspu\b|kick[- ]up/i, goal: /handstand|\bhspu\b/i },
  { key: 'planche', name: /planche(?!\s+push)/i, goal: /planche/i },
  { key: 'front_lever', name: /front lever/i, goal: /front lever/i },
  { key: 'back_lever', name: /back lever/i, goal: /back lever/i },
  { key: 'human_flag', name: /human flag/i, goal: /human flag/i },
  // The competition lifts are the weightlifter's skill: technical, speed- and
  // freshness-bound, and the reason the session exists. A power primer that
  // jumped ahead of the snatch in meet week was this vocabulary missing them.
  { key: 'olympic_lift', name: /^\s*(?:power\s+|hang\s+|block\s+)?(?:snatch|clean and jerk|clean & jerk|clean|split jerk|jerk)\s*$/i, goal: /\bsnatch\b|clean\s*(?:and|&)\s*jerk|\bjerk\b/i },
];

export const POWER_NAME = /\b(?:box jump|broad jump|tuck jump|squat jump|split squat jump|trap bar jump|depth jump|pogo|bound(?:s|ing)?|medicine ball|med ball|explosive push-up|plyo(?:metric)? push-up|jump squat|hurdle hop)\b/i;

function goalText(intake = {}) {
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  return [...list(intake.primary_goals), ...list(intake.secondary_goals)].map(String).join(' | ');
}

export function skillFamilyOf(name = '') {
  return SKILL_FAMILIES.find((f) => f.name.test(String(name))) || null;
}

// Does this row lead the session, ahead of strength?
export function isLeadingSkill(name = '', intake = {}) {
  const n = String(name);
  if (isYouthAthlete(intake) && YOUTH_PRIMARY_SKILL_NAME.test(n)) return true;
  const family = skillFamilyOf(n);
  return Boolean(family && family.goal.test(goalText(intake)));
}

export function isPowerPrimer(name = '') {
  return POWER_NAME.test(String(name));
}

// Engine exercise-order rule 4: when an endurance modality is the PRIMARY
// goal, conditioning may lead. The masters rower's erg is the point of the
// session, not a finisher to move behind the hip thrusts.
export function isPrimaryGoalModality(name = '', intake = {}) {
  const re = primaryGoalModalityPattern(intake);
  return Boolean(re && re.test(String(name)));
}

// Accessories by name, because the name is reliable where the classifier's
// intensity reading is not: these are hypertrophy, isolation or trunk work and
// come after the session's lifting. Calf raises are left out on purpose -- the
// Achilles tendon hold is placed early -- and so is the Nordic curl, which is
// eccentric strength work.
export const ACCESSORY_NAME = /\b(?:(?<!nordic )(?:hamstring |leg |biceps? |hammer |preacher |cable |dumbbell |barbell |ring )?curl|lateral raise|front raise|rear delt|reverse fly|fly|flye|triceps?|pushdown|skull ?crusher|face pull|shrug|pallof|plank|dead bug|bird dog|crunch|sit-up|russian twist|v-up|flutter kick|side bend|hollow (?:body )?hold|neck)\b/i;

export function isAccessoryByName(name = '') {
  const n = String(name);
  return ACCESSORY_NAME.test(n) && !/nordic/i.test(n);
}
