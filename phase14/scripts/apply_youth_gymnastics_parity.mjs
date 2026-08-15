import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function patchFile(rel, transforms) {
  const p = path.join(root, rel);
  let src = fs.readFileSync(p, 'utf8');
  let changed = false;
  for (const t of transforms) {
    if (t.already && src.includes(t.already)) continue;
    const count = src.split(t.find).length - 1;
    if (count !== 1) throw new Error(`${rel} / ${t.label}: expected one anchor, found ${count}`);
    src = src.replace(t.find, t.replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(p, src);
  console.log(`${rel}: ${changed ? 'Youth gymnastics parity applied' : 'already current'}`);
}

// The legacy dictionary contains more than one location-whitelist copy. Patch
// every home_gym block independently instead of relying on a globally unique
// "pull_up_bar, bands" text anchor. This stays deterministic: only the explicit
// home_gym block can be changed and rings are inserted at most once per block.
{
  const p = path.join(root, 'engine', 'exercise_dictionary.js');
  let src = fs.readFileSync(p, 'utf8');
  let changed = false;
  let homeBlocks = 0;
  src = src.replace(/\["home_gym",\s*new Set\(\[([\s\S]*?)\]\)\]/g, (block, inner) => {
    homeBlocks += 1;
    if (/"rings"/.test(inner)) return block;
    if (!/"pull_up_bar"/.test(inner)) throw new Error('home_gym whitelist block has no pull_up_bar anchor');
    changed = true;
    return block.replace('"pull_up_bar",', '"pull_up_bar", "rings",');
  });
  if (homeBlocks < 1) throw new Error('No home_gym whitelist block found');
  if (changed) fs.writeFileSync(p, src);
  console.log(`engine/exercise_dictionary.js home_gym rings: ${changed ? 'patched' : 'already current'} (${homeBlocks} block${homeBlocks===1?'':'s'})`);
}

patchFile('engine/exercise_dictionary.js', [
  {
    label: 'remove generic Burpee EMOM strength fallback',
    find: '    const sub = EQUIPMENT_SUBSTITUTIONS.get(canonical);\n    const replacement = sub ? (isOutdoor ? sub.outdoor : sub.default) : (isOutdoor ? "Hill Sprints" : "Burpee EMOM");\n',
    replace: '    const sub = EQUIPMENT_SUBSTITUTIONS.get(canonical);\n    // Never replace an unavailable strength/skill exercise with unrelated conditioning.\n    // If no movement-family substitution is explicitly approved, leave the row unchanged\n    // so the equipment validator/retry loop can request a coherent replacement.\n    if (!sub) return null;\n    const replacement = isOutdoor ? sub.outdoor : sub.default;\n',
    already: 'if (!sub) return null;\n    const replacement = isOutdoor ? sub.outdoor : sub.default;'
  }
]);

patchFile('engine/phase15_planner.js', [
  {
    label: 'named-skill evidence flags',
    find: "  const freestandingHandstandGoal = /freestanding handstand|handstand balance/i.test(namedSkillGoals) && !/handstand push|\\bhspu\\b/i.test(namedSkillGoals);\n",
    replace: "  const freestandingHandstandGoal = /freestanding handstand|handstand balance/i.test(namedSkillGoals) && !/handstand push|\\bhspu\\b/i.test(namedSkillGoals);\n  const namedSkillEvidence = JSON.stringify({current_numbers:intake.current_numbers,clarification_answers:intake.clarification_answers,notes:intake.notes});\n  const advancedBarMuscleUpBase = /ring muscle.?up/i.test(namedSkillEvidence) || /(?:8|9|1[0-9]|2[0-9])\\s*(?:strict\\s*)?pull.?ups?/i.test(namedSkillEvidence);\n  const noReliableHandstandBalance = /no reliable unsupported|cannot.*unsupported|no.*freestanding.*hold|0\\s*(?:s|sec).*freestanding/i.test(namedSkillEvidence);\n  const lowerAthleticGoal = /lower[- ]body athletic|athleticism|general strength/i.test(`${secondary} ${notes}`);\n  const pistolBaseline = /pistol squat/i.test(namedSkillEvidence);\n  const explicitAge = Number(intake.age || intake.age_years || 0);\n  const ageFromNotes = `${notes}`.match(/(?:athlete\\s+is|age\\s*[:=]?)\\s*(\\d{1,2})\\b/i);\n  const parsedAge = explicitAge > 0 ? explicitAge : (ageFromNotes ? Number(ageFromNotes[1]) : 0);\n  const youthAthlete = parsedAge > 0 && parsedAge < 18;\n",
    already: 'const advancedBarMuscleUpBase ='
  },
  {
    label: 'high-specificity bar muscle-up support',
    find: "    required.push('BAR_MUSCLE_UP_DIRECT: if the athlete does not yet own a bar muscle-up, use Bar Muscle-up Transition Drill as a direct target-skill row, with assistance only when needed for clean mechanics. Do not omit the target pattern while training prerequisites.');\n",
    replace: "    required.push('BAR_MUSCLE_UP_DIRECT: if the athlete does not yet own a bar muscle-up, use Bar Muscle-up Transition Drill as a direct target-skill row, with assistance only when needed for clean mechanics. Do not omit the target pattern while training prerequisites.');\n    if (advancedBarMuscleUpBase) {\n      required.push('BAR MUSCLE-UP HIGH-PULL SUPPORT: this athlete already has a strong base (8+ strict pull-ups and/or a ring muscle-up). Include at least one weekly explosive/high vertical-pull exposure such as Strict Chest-to-Bar Pull-up or Explosive Hip-to-Bar Pull-up, using low reps and full recovery. Generic chin-ups or easy pull-ups are support volume only and must not replace the high-pull stimulus.');\n      required.push('BAR MUSCLE-UP PRACTICE QUALITY: direct transition/muscle-up practice should use clean singles or doubles with enough assistance for a close-to-bar, symmetrical turnover. Do not prescribe fatigue sets of 3-5 failed/slow muscle-up reps.');\n      forbidden.push('Generic Chin-up as the main bar-muscle-up progression when the athlete already demonstrates a ring muscle-up / strong pull-up base.');\n    }\n",
    already: 'BAR MUSCLE-UP HIGH-PULL SUPPORT:'
  },
  {
    label: 'handstand balance semantics',
    find: "    required.push('HANDSTAND_DIRECT: for an athlete without reliable unsupported balance, use Controlled Handstand Kick-up as the direct skill row and dose it as high-quality practice rather than fatigue work.');\n",
    replace: "    required.push('HANDSTAND_DIRECT: for an athlete without reliable unsupported balance, use Controlled Handstand Kick-up as the direct skill row and dose it as high-quality practice rather than fatigue work.');\n    if (noReliableHandstandBalance) required.push('HANDSTAND BALANCE PROGRESSION: use wall-facing/back-to-wall work only as alignment support. Progress toward independent balance with controlled kick-up attempts, toe-pulls or brief assisted balance. Count kick-ups as attempts, usually 1-2 per mini-set, rather than fatigue reps. Do not make longer wall holds the main progression metric.');\n",
    already: 'HANDSTAND BALANCE PROGRESSION:'
  },
  {
    label: 'lower body athleticism and youth quality',
    find: "  const strictOhpGoal = /overhead press|\\bohp\\b/i.test(secondary);\n",
    replace: "  if (lowerAthleticGoal) {\n    if (pistolBaseline) required.push('LOWER-BODY ATHLETICISM: retain a meaningful Pistol Squat exposure at least weekly because the intake documents an established pistol baseline. With no external load available, progress control, reps, pauses or tempo rather than replacing it with high-rep filler.');\n    else required.push('LOWER-BODY ATHLETICISM: retain at least one meaningful unilateral lower-body strength exposure weekly using available equipment.');\n    required.push('ATHLETIC POWER: a small dose of Broad Jump or another appropriate low-volume jump may complement the unilateral strength work; full recovery and landing quality matter more than conditioning effect.');\n  }\n  if (youthAthlete) {\n    required.push('YOUTH QUALITY RULE: primary skills are practiced while fresh. Keep working sets submaximal, stop before technical breakdown and use repeatable successful reps/attempts rather than grinders or repeated failures.');\n    forbidden.push('High-fatigue conditioning filler that displaces the named skill/strength goals in a youth two-day program.');\n  }\n\n  const strictOhpGoal = /overhead press|\\bohp\\b/i.test(secondary);\n",
    already: 'YOUTH QUALITY RULE:'
  },
  {
    label: 'named skill support labels',
    find: "  if (barMuscleUpGoal) labels.push(...(days.length >= 2 ? ['BAR_MUSCLE_UP_DIRECT','BAR_MUSCLE_UP_DIRECT'] : ['BAR_MUSCLE_UP_DIRECT']));\n  if (freestandingHandstandGoal) labels.push(...(days.length >= 2 ? ['HANDSTAND_DIRECT','HANDSTAND_DIRECT'] : ['HANDSTAND_DIRECT']));\n",
    replace: "  if (barMuscleUpGoal) labels.push(...(days.length >= 2 ? ['BAR_MUSCLE_UP_DIRECT','BAR_MUSCLE_UP_DIRECT'] : ['BAR_MUSCLE_UP_DIRECT']));\n  if (barMuscleUpGoal && advancedBarMuscleUpBase) labels.push('BAR_MUSCLE_UP_HIGH_PULL');\n  if (freestandingHandstandGoal) labels.push(...(days.length >= 2 ? ['HANDSTAND_DIRECT','HANDSTAND_DIRECT'] : ['HANDSTAND_DIRECT']));\n  if (lowerAthleticGoal) labels.push('LOWER_ATHLETIC_STRENGTH');\n",
    already: "labels.push('BAR_MUSCLE_UP_HIGH_PULL')"
  }
]);

console.log('Youth gymnastics coaching parity patch complete.');
