import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'server.phase15.js');
let src = fs.readFileSync(target, 'utf8');
let changed = false;

// The readable Phase 15 builder historically reduced direct OpenAI generation
// to a single attempt as a cost guard. Production quality is fail-closed and the
// repair loop is part of the release architecture, so all providers now receive
// the same bounded multi-attempt opportunity to satisfy deterministic QA.
const attemptMarker = 'OPENAI-MULTI-ATTEMPT-REPAIR-BUDGET';
if (!src.includes(attemptMarker)) {
  const attemptPattern = /^\s*const MAX_ATTEMPTS\s*=\s*[^;\n]+;[^\n]*$/m;
  const found = src.match(attemptPattern)?.[0] || '';
  if (!found) throw new Error('Aggregate repair attempt-budget anchor missing');
  src = src.replace(attemptPattern, `  const MAX_ATTEMPTS = 4; // ${attemptMarker}`);
  changed = true;
}
if (!/const MAX_ATTEMPTS\s*=\s*4\s*;\s*\/\/\s*OPENAI-MULTI-ATTEMPT-REPAIR-BUDGET/.test(src)) {
  throw new Error('Aggregate repair final attempt budget is not four');
}

const importMarker = 'AGGREGATE-REPAIR-VALIDATION-WIRED';
if (!src.includes(importMarker)) {
  const anchor = 'import { validateClientOutputCleanliness } from "./engine/client_output_qa.js"; // CLIENT-OUTPUT-CLEANLINESS-WIRED';
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Aggregate repair import anchor expected once, found ${count}`);
  src = src.replace(
    anchor,
    `${anchor}\nimport { validateRepairableProgramBundle } from "./engine/repairable_validation_bundle.js"; // ${importMarker}`,
  );
  changed = true;
}

const runtimeMarker = 'AGGREGATE-REPAIR-VALIDATION-RUNTIME';
if (!src.includes(runtimeMarker)) {
  const startAnchor = '      const dict = validateExercisesAgainstDictionary(program, intake); // step 2';
  const endAnchor = '      validateClientOutputCleanliness(program); // CLIENT-OUTPUT-CLEANLINESS-INLOOP';
  const start = src.indexOf(startAnchor);
  const end = src.indexOf(endAnchor, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Aggregate repair runtime anchors missing (start=${start}, end=${end})`);
  }
  const replacement = [
    '      const aggregateValidation = validateRepairableProgramBundle(program, intake, {',
    '        skipSkillCalibration: Boolean(OPENAI_API_KEY), // OPENAI-DIRECT-SKILL-CALIBRATION-GUARD',
    '      }); // AGGREGATE-REPAIR-VALIDATION-RUNTIME',
    '      program = aggregateValidation.program;',
  ].join('\n');
  src = src.slice(0, start) + replacement + '\n' + src.slice(end);
  changed = true;
}

const feedbackMarker = 'AGGREGATE-ROLE-PRESERVING-FEEDBACK';
const feedbackV2Marker = 'ADVANCED-HYBRID-NUMERIC-REPAIR-FEEDBACK';
const feedbackV3Marker = 'ADVANCED-HYBRID-BENCHMARK-REPAIR-FEEDBACK';
if (!src.includes(feedbackV3Marker)) {
  const startAnchor = 'function buildRolePreservingRepairFeedback(err, intake) {';
  const endAnchor = '\n}\n\nasync function generateValidatedProgram';
  const start = src.indexOf(startAnchor);
  const end = src.indexOf(endAnchor, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Aggregate feedback anchors missing (start=${start}, end=${end})`);
  }
  const replacement = `function buildRolePreservingRepairFeedback(err, intake) {\n  // ${feedbackMarker}\n  const flags = err?.code === "PHASE15_QUALITY_VIOLATION" && Array.isArray(err?.flags) && err.flags.length\n    ? err.flags\n    : [err];\n  const feedbackParts = flags\n    .map((flag) => String(flag?.amendment || flag?.message || flag?.code || '').trim())\n    .filter(Boolean);\n  let feedback = feedbackParts.length\n    ? feedbackParts.join("\\n\\n--- ALSO REPAIR AND PRESERVE ALL PRIOR ITEMS ---\\n\\n")\n    : String(err?.amendment || err?.message || err?.code || 'Unknown quality failure');\n\n  const hybridWeek4 = flags.find((flag) => flag?.code === "ADVANCED_HYBRID_WEEK4_NOT_CONSOLIDATING");\n  if (hybridWeek4) {\n    const d = hybridWeek4.details || {};\n    const setTarget = Number.isFinite(Number(d.setTarget)) ? Number(d.setTarget) : Math.max(1, Math.floor(Number(d.w3Sets || 1) * 0.85));\n    const runTarget = Number.isFinite(Number(d.runTarget)) ? Number(d.runTarget) : null;\n    feedback += "\\nADVANCED-HYBRID-NUMERIC-REPAIR-FEEDBACK: Repair Week 4 only. Keep Weeks 1-3 and the required exercise identities/calendar unchanged. Week 3 strength work sets=" + String(d.w3Sets ?? 'unknown') + ", Week 4 strength work sets=" + String(d.w4Sets ?? 'unknown') + ". Make Week 4 total strength work sets <= " + String(setTarget) + " and strictly below Week 3. Week 3 peak RPE=" + String(d.w3Rpe ?? 'unknown') + ", Week 4 peak RPE=" + String(d.w4Rpe ?? 'unknown') + "; Week 4 peak must not exceed Week 3. " + (d.w3Run != null ? ("Week 3 long run=" + String(d.w3Run) + " km and Week 4 long run=" + String(d.w4Run ?? 'unknown') + " km; make Week 4 long run strictly lower" + (runTarget != null ? (", approximately " + String(runTarget) + " km") : "") + ". ") : "") + "Do not replace removed sets with extra reps, harder effort, new exercises, intervals, finishers or conditioning. This is a measurable workload reduction, not a prose rewrite."; // ${feedbackV2Marker}\n  }\n\n  const hybridBenchmark = flags.find((flag) => flag?.code === "ADVANCED_HYBRID_BENCHMARK_LOADING");\n  if (hybridBenchmark) {\n    const benchmarkContext = String(intake?.current_numbers || (Array.isArray(intake?.performance_markers) ? intake.performance_markers.join(' | ') : intake?.performance_markers) || '').trim();\n    feedback += "\\nADVANCED-HYBRID-BENCHMARK-REPAIR-FEEDBACK: The intake supplied these current performance anchors: " + benchmarkContext + ". For the named direct benchmarked lift in the failure, replace RPE-selected load with a sensible numeric kg prescription or an explicit percentage anchored to that demonstrated result. The target goal is not the current capacity. Use submaximal work that is credible from the current benchmark, preserve the required sets/reps/RPE relationship, and do not invent a new max. Keep already-valid weeks and exercises unchanged unless the validator explicitly requires otherwise."; // ${feedbackV3Marker}\n  }\n\n  const unknown = flags\n    .filter((flag) => flag?.code === "EXERCISE_HALLUCINATION")\n    .flatMap((flag) => Array.isArray(flag?.details?.unknown) ? flag.details.unknown : [])\n    .map((u) => String(u?.exercise || ''))\n    .filter(Boolean);\n  if (unknown.length) feedback += "\\nREJECTED EXERCISE NAMES: " + [...new Set(unknown)].join(" | ") + ".";\n\n  const tacticalContext = JSON.stringify({\n    primary_goals: intake?.primary_goals,\n    secondary_goals: intake?.secondary_goals,\n    maintenance_goals: intake?.maintenance_goals,\n    notes: intake?.notes,\n    sport: intake?.sport,\n  });\n  if (unknown.length && /\\b(?:tactical|military|special[- ]?operations|selection prep|combat[- ]?ready|operator)\\b/i.test(tacticalContext)) {\n    feedback += "\\nTACTICAL ROLE-PRESERVING CANONICAL MENU: for low-cost pushing use exact Exercise names Push-up, Dip or Overhead Press; for trunk use Pallof Press, Side Plank, Dead Bug or Hanging Leg Raise; for unilateral support use Reverse Lunge or Bulgarian Split Squat; for posterior-chain knee flexion use Leg Curl, Lying Leg Curl, Seated Leg Curl or Nordic Hamstring Curl; for carries use Farmer Carry or Suitcase Carry; for direct loaded marching use Backpack Carry; for running use Run. Rest or Off days are omitted from TSV rows entirely. Keep load, pace, interval, tempo and execution qualifiers in Weight/Reps/Notes rather than inventing a new Exercise name. Preserve at least the required small weekly push and trunk floor while repairing names.";\n  }\n  return feedback;\n}`;
  const tailStart = end + '\n}\n'.length;
  src = src.slice(0, start) + replacement + src.slice(tailStart);
  changed = true;
}

const feedbackV4Marker = 'ADVANCED-HYBRID-SQUAT-SPECIFICITY-REPAIR';
if (!src.includes(feedbackV4Marker)) {
  const anchor = '  const unknown = flags\n    .filter((flag) => flag?.code === "EXERCISE_HALLUCINATION")';
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Hybrid squat repair feedback anchor expected once, found ${count}`);
  const block = `  const hybridSquat = flags.find((flag) => flag?.code === "ADVANCED_HYBRID_SQUAT_SPECIFICITY");\n  if (hybridSquat) {\n    const fixedDays = Array.isArray(intake?.available_gym_days) ? intake.available_gym_days.join(', ') : '';\n    feedback += "\\nADVANCED-HYBRID-SQUAT-SPECIFICITY-REPAIR: Restore TWO direct Back Squat work rows in EVERY week, on two separate fixed gym days. Use the exact Exercise name Back Squat for both. One is a compact heavy exposure and one is a lower-cost volume/specificity exposure. Keep both through Week 4 even while reducing Week 4 sets. Do not count warm-up squats, split squats, leg press, machines, accessories or notes as either exposure. Fixed gym days are: " + fixedDays + ". Preserve all other already-valid primary goal exposures and trim accessories first."; // ${feedbackV4Marker}\n  }\n\n`;
  src = src.replace(anchor, block + anchor);
  changed = true;
}

fs.writeFileSync(target, src);
console.log(`${target}: ${changed ? 'aggregate repair validation wired' : 'already current'}`);
