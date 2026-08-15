import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plannerPath = path.join(here, '..', 'engine', 'phase15_planner.js');
const qaPath = path.join(here, '..', 'engine', 'phase15_elite_guardrails.js');

function patchPlanner(src) {
  const goalAnchor = "  const strictOhpGoal = /overhead press|\\bohp\\b/i.test(secondary);";
  const goalPatch = [
    "  const namedSkillGoals = `${primary} ${secondary}`;",
    "  const barMuscleUpGoal = /bar muscle.?up/i.test(namedSkillGoals);",
    "  const freestandingHandstandGoal = /freestanding handstand|handstand balance/i.test(namedSkillGoals) && !/handstand push|\\bhspu\\b/i.test(namedSkillGoals);",
    "  if (barMuscleUpGoal) {",
    "    required.push('BAR MUSCLE-UP DIRECT-SKILL RULE: a named bar muscle-up goal requires direct bar-specific skill practice every week. Pull-ups, dips and ring muscle-ups are support work and do not replace target-skill exposure.');",
    "    required.push('BAR_MUSCLE_UP_DIRECT: if the athlete does not yet own a bar muscle-up, use Bar Muscle-up Transition Drill as a direct target-skill row, with assistance only when needed for clean mechanics. Do not omit the target pattern while training prerequisites.');",
    "  }",
    "  if (freestandingHandstandGoal) {",
    "    required.push('FREESTANDING HANDSTAND DIRECT-SKILL RULE: a named freestanding handstand goal requires direct balance-specific practice every week. General pressing or wall strength work is support, not a replacement for balance practice.');",
    "    required.push('HANDSTAND_DIRECT: for an athlete without reliable unsupported balance, use Controlled Handstand Kick-up as the direct skill row and dose it as high-quality practice rather than fatigue work.');",
    "  }",
    "",
    goalAnchor,
  ].join('\n');
  if (!src.includes('BAR MUSCLE-UP DIRECT-SKILL RULE')) {
    if (!src.includes(goalAnchor)) throw new Error('Named-skill planner goal anchor not found');
    src = src.replace(goalAnchor, goalPatch);
  }

  const labelAnchor = "  if (strictOhpGoal) labels.push('OHP_DIRECT','OHP_SECONDARY_VARIATION');";
  const labelPatch = [
    "  if (barMuscleUpGoal) labels.push(...(days.length >= 2 ? ['BAR_MUSCLE_UP_DIRECT','BAR_MUSCLE_UP_DIRECT'] : ['BAR_MUSCLE_UP_DIRECT']));",
    "  if (freestandingHandstandGoal) labels.push(...(days.length >= 2 ? ['HANDSTAND_DIRECT','HANDSTAND_DIRECT'] : ['HANDSTAND_DIRECT']));",
    labelAnchor,
  ].join('\n');
  if (!src.includes("days.length >= 2 ? ['BAR_MUSCLE_UP_DIRECT'")) {
    if (!src.includes(labelAnchor)) throw new Error('Named-skill planner label anchor not found');
    src = src.replace(labelAnchor, labelPatch);
  }
  return src;
}

function patchQa(src) {
  const genericMuscleUp = "    ['muscle_up',/muscle.?up/i,/muscle.?up/i],";
  const specificSkillFamilies = [
    "    ['bar_muscle_up',/bar muscle.?up/i,/(bar muscle.?up|bar muscle.?up transition drill)/i],",
    genericMuscleUp,
    "    ['handstand',/(freestanding handstand|handstand balance)/i,/(controlled handstand kick.?up|freestanding handstand|handstand balance)/i],",
  ].join('\n');
  if (!src.includes("['bar_muscle_up'")) {
    if (!src.includes(genericMuscleUp)) throw new Error('Named-skill QA muscle-up anchor not found');
    src = src.replace(genericMuscleUp, specificSkillFamilies);
  }
  return src;
}

const plannerBefore = fs.readFileSync(plannerPath, 'utf8');
const qaBefore = fs.readFileSync(qaPath, 'utf8');
const plannerAfter = patchPlanner(plannerBefore);
const qaAfter = patchQa(qaBefore);
fs.writeFileSync(plannerPath, plannerAfter);
fs.writeFileSync(qaPath, qaAfter);
console.log('Applied named gymnastics skill goal direct-exposure fix.');
