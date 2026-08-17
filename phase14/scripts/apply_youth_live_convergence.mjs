import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function patchTextFile(rel, transforms) {
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
  console.log(`${rel}: ${changed ? 'Youth live convergence applied' : 'already current'}`);
}

// The compact developer contract already tells the model to use Ring Push-up and
// Ring Hamstring Curl for ring-equipped athletes. Make that contract internally
// consistent with the canonical dictionary rather than rejecting our own names.
patchTextFile('engine/exercise_dictionary.js', [
  {
    label: 'canonical ring push and hamstring curl',
    find: '  "Superman Hold", "Dead Bug", "Bird Dog", "Glute Bridge",\n  "Single-Leg Glute Bridge", "Box Jump", "Broad Jump", "Tuck Jump",',
    replace: '  "Superman Hold", "Dead Bug", "Bird Dog", "Glute Bridge",\n  "Single-Leg Glute Bridge", "Ring Push-up", "Ring Hamstring Curl", "Box Jump", "Broad Jump", "Tuck Jump",',
    already: '"Single-Leg Glute Bridge", "Ring Push-up", "Ring Hamstring Curl", "Box Jump"',
  },
  {
    label: 'wall-facing handstand aliases',
    find: '  ["Wall HSPU", "Back-to-Wall Handstand Push-Up"],',
    replace: '  ["Wall-Facing Handstand Hold", "Wall Handstand Hold"],\n  ["Wall Facing Handstand Hold", "Wall Handstand Hold"],\n  ["Wall HSPU", "Back-to-Wall Handstand Push-Up"],',
    already: '["Wall-Facing Handstand Hold", "Wall Handstand Hold"]',
  },
  {
    label: 'ring exercise equipment requirements',
    find: '  ["Ring Dip", ["rings"]], ["Ring Row", ["rings"]], ["Ring Muscle-up", ["rings"]],\n  ["Ring Support Hold", ["rings"]],',
    replace: '  ["Ring Dip", ["rings"]], ["Ring Row", ["rings"]], ["Ring Muscle-up", ["rings"]],\n  ["Ring Support Hold", ["rings"]], ["Ring Push-up", ["rings"]], ["Ring Hamstring Curl", ["rings"]],',
    already: '["Ring Push-up", ["rings"]], ["Ring Hamstring Curl", ["rings"]]',
  },
]);

// Install explicit Youth constraints into the generated production prompt. These
// restate existing deterministic validators so the first candidate is less likely
// to need repair; they do not relax any final QA gate.
patchTextFile('server.phase15.js', [
  {
    label: 'initial Youth convergence contract',
    find: '    "Week 4 is not automatically a deload. Consolidate or trim only when justified by the athlete constraints.",',
    replace: '    "YOUTH KNOWN-CAPACITY PULL-UP RULE: when a youth intake supplies a strict pull-up maximum, repeated working sets must remain comfortably below that fresh max. For a 12-rep max, ordinary 3+ set submaximal work should normally live around 6-8 clean reps per set rather than repeated 10-12 rep sets. Progress quality, a small amount of volume, assistance, tempo or a verified skill-support variation without turning the benchmark max into the work-set target.",\n    "YOUTH PRIMARY-SKILL-FIRST RULE: when the youth primary goals are bar muscle-up and/or freestanding handstand, every session containing those skills must place the primary skill rows immediately after the warm-up and before ring dips, rows, pull-ups, pistol squats or other support strength. Skill quality is evaluated while fresh, not after fatigue-producing foundation work.",\n    "YOUTH QUALITY-PROGRESSION RULE: progress primary gymnastics skills by a measurable skill-quality variable rather than simply adding sets. For handstand use successful entry percentage, independent balance time, body-line standard or reduced wall dependence while keeping controlled kick-ups around 3-5 quality sets and no more than roughly 20 planned attempts. For bar muscle-up use transition height/quality, less band assistance, cleaner high-pull height or stricter transition execution. Weeks 1-3 must visibly progress at least one such quality variable for each primary skill.",\n    "YOUTH HANDSTAND COMPONENT RULE: for a youth seeking a first freestanding handstand who still relies on the wall, preserve BOTH Wall Handstand Hold for position/static capacity and Controlled Handstand Kick-up for fresh entry/independent-balance practice. Do not delete wall-supported capacity merely because kick-ups are present, and do not replace balance practice with longer wall holds.",\n    "YOUTH WEEK-4 RETENTION RULE: consolidation reduces fatigue, not earned capability. Reduce sets or attempts first while retaining the best clean Week-2/3 rep, assistance, balance, entry, ROM or execution standard. Explicitly reference retaining/matching the best Week-3 skill quality when volume is reduced.",\n    "Week 4 is not automatically a deload. Consolidate or trim only when justified by the athlete constraints.",',
    already: 'YOUTH PRIMARY-SKILL-FIRST RULE:',
  },
]);

// Aggregate repair rewrites the feedback helper before this stage. Its replacement
// joins the helper and generateValidatedProgram with a single newline, so anchor
// that exact generated shape rather than the pre-aggregate two-newline source.
patchTextFile('server.phase15.js', [
  {
    label: 'Youth surgical repair feedback',
    find: '  return feedback;\n}\nasync function generateValidatedProgram',
    replace: `  const repairContext = String(feedback || '');
  const youthAge = Number(intake?.age || intake?.age_years || 0);
  const youth = Number.isFinite(youthAge) && youthAge > 0 && youthAge < 18;
  if (youth && /(?:PULL_UP_DOSE_EXCEEDS_KNOWN_CAPACITY|KNOWN-CAPACITY PULL-UP)/i.test(repairContext)) {
    const evidence = [intake?.current_numbers, intake?.performance_markers, intake?.clarification_answers].map((v) => typeof v === 'string' ? v : JSON.stringify(v || '')).join(' ');
    const m = evidence.match(/(?:strict\\s+pull[- ]?ups?\\s*:?\\s*|about\\s+)(\\d{1,2})\\s*(?:strict\\s*)?pull[- ]?ups?|(?:strict\\s+pull[- ]?ups?[^\\d]{0,12})(\\d{1,2})/i);
    const knownMax = m ? Number(m[1] || m[2]) : null;
    const safeUpper = Number.isFinite(knownMax) ? Math.max(3, Math.floor(knownMax * 0.70)) : null;
    feedback += '\\nYOUTH-PULL-UP-SURGICAL-REPAIR: Preserve the pull-up goal and bar-muscle-up support role, but reduce repeated bodyweight work-set reps rather than deleting the exercise. ' + (safeUpper ? ('The supplied strict maximum is about ' + knownMax + ' reps, so cap ordinary 3+ set submaximal work at about ' + safeUpper + ' clean reps per set in this candidate. ') : '') + 'Use a small progression in clean reps/sets or a verified high-pull/transition variable across Weeks 1-3. Never program repeated sets at or near the fresh max while calling them RPE 7-8.';
  }
  if (youth && /YOUTH_PRIMARY_SKILL_NOT_FRESH/i.test(repairContext)) {
    feedback += '\\nYOUTH-SKILL-FIRST-SURGICAL-REPAIR: Reorder rows rather than adding work. In every Session A/Session B that contains a primary bar-muscle-up or handstand skill, keep the warm-up first and then place ALL primary skill rows immediately after it, before Ring Dip, Ring Row, Pull-up, Pistol Squat or any other fatigue-producing support exercise. Do not merely change Notes; physically move the skill rows so the TSV order is warm-up -> primary skills -> foundation strength -> accessories. Preserve the existing exercises and total session dose unless another validator requires a dose change.';
  }
  if (youth && /YOUTH_PROGRESSION_QUALITY_MISSING/i.test(repairContext)) {
    feedback += '\\nYOUTH-QUALITY-PROGRESSION-SURGICAL-REPAIR: Preserve the existing two-session architecture and do not solve progression by adding more and more sets. Across Weeks 1-3 give each primary skill a visible measurable QUALITY progression. For Controlled Handstand Kick-up, keep about 3-5 quality sets and <=20 planned attempts/session while progressing successful-entry standard and/or independent balance target (for example cleaner 1s -> 2s -> 3s balance or a higher success criterion). For Wall Handstand Hold, progress body line/control or a modest hold target without replacing kick-up practice. For bar muscle-up preparation, progress high-pull height/quality, transition cleanliness or reduce band assistance while preserving strict technique. Week 4 must reduce fatigue while retaining the best Week-3 quality standard. Do not use set-count inflation as the main progression lever.';
  }
  if (youth && /GOAL_COMPONENT_COVERAGE_MISSING/i.test(repairContext)) {
    feedback += '\\nYOUTH-HANDSTAND-COMPONENT-SURGICAL-REPAIR: If the goal is first freestanding handstand and the athlete has wall holds but no reliable unsupported balance, preserve one meaningful Wall Handstand Hold exposure for static position capacity AND Controlled Handstand Kick-up for fresh entry/balance practice. Use those exact canonical Exercise names. Do not remove either component while repairing unrelated rows.';
  }
  if (youth && /YOUTH_CONSOLIDATION_RESET_TO_BASELINE/i.test(repairContext)) {
    feedback += '\\nYOUTH-WEEK4-SURGICAL-REPAIR: Do not copy Week 1 back into Week 4 after Weeks 2-3 progressed. Reduce fatigue by cutting sets/attempts first, while retaining at least an intermediate-to-Week-3 clean rep, assistance, balance, ROM or execution standard. For handstand/skill rows, explicitly say retain or match the best clean Week-3 entry/balance/quality while using fewer attempts. Preserve every unrelated Week-4 row.';
  }
  return feedback;
}\nasync function generateValidatedProgram`,
    already: 'YOUTH-SKILL-FIRST-SURGICAL-REPAIR:',
  },
]);

console.log('Youth live convergence policy complete.');
