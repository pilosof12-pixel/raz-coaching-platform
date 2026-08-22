// Movement taxonomy.
//
// Every structural rule in the coaching architecture needs one shared answer to
// "what kind of work is this row?". Without it, each validator invents its own
// name matching and they disagree. This module is that single vocabulary:
// exercise identity -> movement category, training role, and stress signature.
//
// Categories deliberately mirror the coaching brief's weekly-coverage list so a
// coverage report can be produced directly from them.

export const CATEGORY = {
  VERTICAL_PULL: 'vertical_pull',
  HORIZONTAL_PULL: 'horizontal_pull',
  VERTICAL_PUSH: 'vertical_push',
  HORIZONTAL_PUSH: 'horizontal_push',
  KNEE_DOMINANT: 'knee_dominant',
  HIP_DOMINANT: 'hip_dominant',
  UNILATERAL_LOWER: 'unilateral_lower',
  TRUNK: 'trunk',
  GPP: 'gpp',
  TISSUE_CAPACITY: 'tissue_capacity',
  SKILL: 'skill',
  ENDURANCE: 'endurance',
  LOADED_CARRY: 'loaded_carry',
  POWER: 'power',
  WARMUP: 'warmup',
  UNKNOWN: 'unknown',
};

export const ROLE = {
  PRIMARY: 'primary',            // the exposure the goal depends on
  SECONDARY: 'secondary',        // meaningful supporting compound work
  ACCESSORY: 'accessory',        // targeted assistance
  SKILL_PRACTICE: 'skill_practice',
  CONDITIONING: 'conditioning',
  WARMUP: 'warmup',
};

// Ordered most-specific first: the first match wins, so "Ring Hamstring Curl"
// resolves as hip-dominant rather than being caught by a generic "ring" rule.
const PATTERNS = [
  [/^\s*\[WARMUP\]/i, CATEGORY.WARMUP, ROLE.WARMUP],

  // Skill practice: the target skill itself, or a drill that exists only to build it.
  [/muscle[- ]?up transition|transition drill/i, CATEGORY.SKILL, ROLE.SKILL_PRACTICE],
  [/banded muscle[- ]?up|bar muscle[- ]?up|ring muscle[- ]?up|^muscle[- ]?up/i, CATEGORY.SKILL, ROLE.SKILL_PRACTICE],
  [/handstand kick[- ]?up|wall float|toe pull|heel pull|freestanding handstand/i, CATEGORY.SKILL, ROLE.SKILL_PRACTICE],
  [/handstand hold|wall handstand/i, CATEGORY.SKILL, ROLE.SKILL_PRACTICE],
  [/planche|front lever|back lever|human flag/i, CATEGORY.SKILL, ROLE.SKILL_PRACTICE],

  // Power.
  [/box jump|broad jump|jump squat|med ?ball|medicine ball|throw|slam|sprint|explosive/i, CATEGORY.POWER, ROLE.SECONDARY],

  // Vertical pulling.
  [/one[- ]?arm (?:pull|chin)[- ]?up/i, CATEGORY.VERTICAL_PULL, ROLE.PRIMARY],
  [/weighted (?:pull|chin)[- ]?up/i, CATEGORY.VERTICAL_PULL, ROLE.SECONDARY],
  [/lat pulldown|pulldown/i, CATEGORY.VERTICAL_PULL, ROLE.ACCESSORY],
  [/(?:pull|chin)[- ]?up/i, CATEGORY.VERTICAL_PULL, ROLE.SECONDARY],

  // Horizontal pulling.
  [/ring row|inverted row|barbell row|dumbbell row|seated row|cable row|face pull|\brow\b/i, CATEGORY.HORIZONTAL_PULL, ROLE.ACCESSORY],

  // Vertical pressing.
  [/overhead press|push press|shoulder press|z press|handstand push/i, CATEGORY.VERTICAL_PUSH, ROLE.SECONDARY],

  // Horizontal pressing.
  [/bench press|ring push[- ]?up|push[- ]?up|ring dip|\bdip\b|chest press|floor press/i, CATEGORY.HORIZONTAL_PUSH, ROLE.SECONDARY],

  // Lower body.
  [/pistol squat|bulgarian split squat|split squat|reverse lunge|forward lunge|walking lunge|step[- ]?up|single[- ]?leg/i, CATEGORY.UNILATERAL_LOWER, ROLE.ACCESSORY],
  [/romanian deadlift|\brdl\b|good morning|hip thrust|glute bridge|hamstring curl|nordic|back extension|deadlift/i, CATEGORY.HIP_DOMINANT, ROLE.SECONDARY],
  [/back squat|front squat|box squat|goblet squat|leg press|hack squat|\bsquat\b/i, CATEGORY.KNEE_DOMINANT, ROLE.PRIMARY],

  // Trunk.
  [/plank|pallof|hollow|dead ?bug|ab wheel|hanging leg raise|l[- ]?sit|anti[- ]?rotation|side bend|trunk/i, CATEGORY.TRUNK, ROLE.ACCESSORY],

  // Tissue capacity.
  [/calf raise|tibialis|toe raise|ankle|foot|wrist|forearm|neck isometric|neck|grip|scapular/i, CATEGORY.TISSUE_CAPACITY, ROLE.ACCESSORY],

  // Loaded carrying and GPP.
  [/backpack carry|ruck|loaded march|pack march|farmer|suitcase carry|sandbag carry|\bcarry\b/i, CATEGORY.LOADED_CARRY, ROLE.CONDITIONING],
  [/sled|prowler|battle rope|kettlebell swing|erg|assault bike|burpee/i, CATEGORY.GPP, ROLE.CONDITIONING],

  // Endurance.
  [/^\s*(?:run|running|jog|treadmill|bike|cycling|row erg|swim)\b/i, CATEGORY.ENDURANCE, ROLE.CONDITIONING],
];

export function classifyExercise(name) {
  const s = String(name || '').trim();
  if (!s) return { category: CATEGORY.UNKNOWN, role: ROLE.ACCESSORY };
  for (const [re, category, role] of PATTERNS) {
    if (re.test(s)) return { category, role };
  }
  return { category: CATEGORY.UNKNOWN, role: ROLE.ACCESSORY };
}

// Foundational strength is the plain, load-bearing work a skill cannot replace.
// A transition drill trains the skill; a ring row trains the pull.
export const FOUNDATIONAL_PULL = new Set([CATEGORY.VERTICAL_PULL, CATEGORY.HORIZONTAL_PULL]);
export const FOUNDATIONAL_PUSH = new Set([CATEGORY.VERTICAL_PUSH, CATEGORY.HORIZONTAL_PUSH]);

export function isFoundationalStrength(name) {
  const { category, role } = classifyExercise(name);
  if (role === ROLE.SKILL_PRACTICE) return false;
  return FOUNDATIONAL_PULL.has(category) || FOUNDATIONAL_PUSH.has(category);
}

// Which tissues and systems a row taxes, used by the circular weekly stress model.
export function stressSignature(name) {
  const { category } = classifyExercise(name);
  const sig = { axial: 0, lower: 0, upperPull: 0, upperPush: 0, neural: 0, impact: 0, elbow: 0 };
  switch (category) {
    case CATEGORY.KNEE_DOMINANT: sig.axial = 3; sig.lower = 3; sig.neural = 3; break;
    case CATEGORY.HIP_DOMINANT: sig.axial = 2; sig.lower = 3; sig.neural = 2; break;
    case CATEGORY.UNILATERAL_LOWER: sig.lower = 2; sig.neural = 1; break;
    case CATEGORY.VERTICAL_PULL: sig.upperPull = 3; sig.neural = 2; sig.elbow = 2; break;
    case CATEGORY.HORIZONTAL_PULL: sig.upperPull = 2; sig.elbow = 1; break;
    case CATEGORY.VERTICAL_PUSH: sig.upperPush = 3; sig.axial = 2; sig.neural = 2; break;
    case CATEGORY.HORIZONTAL_PUSH: sig.upperPush = 2; sig.elbow = 1; break;
    case CATEGORY.SKILL: sig.upperPull = 1; sig.upperPush = 1; sig.neural = 2; sig.elbow = 1; break;
    case CATEGORY.POWER: sig.neural = 3; sig.lower = 2; sig.impact = 2; break;
    case CATEGORY.ENDURANCE: sig.impact = 3; sig.lower = 2; break;
    case CATEGORY.LOADED_CARRY: sig.impact = 2; sig.lower = 2; sig.axial = 2; break;
    case CATEGORY.GPP: sig.lower = 1; sig.neural = 1; break;
    default: break;
  }
  return sig;
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A week is a continuous cycle: Sunday precedes Monday exactly as Monday
// precedes Tuesday. Every adjacency check must use this, never array order.
export function dayKey(day) {
  const d = String(day || '').trim().slice(0, 3).toLowerCase();
  return WEEKDAYS.includes(d) ? d : null;
}
export function nextDay(day) {
  const i = WEEKDAYS.indexOf(dayKey(day));
  return i < 0 ? null : WEEKDAYS[(i + 1) % 7];
}
export function previousDay(day) {
  const i = WEEKDAYS.indexOf(dayKey(day));
  return i < 0 ? null : WEEKDAYS[(i + 6) % 7];
}
// Circular separation in days between two weekdays, 0-6.
export function dayGap(from, to) {
  const a = WEEKDAYS.indexOf(dayKey(from));
  const b = WEEKDAYS.indexOf(dayKey(to));
  if (a < 0 || b < 0) return null;
  return (b - a + 7) % 7;
}
