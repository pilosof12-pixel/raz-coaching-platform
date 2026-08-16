import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'server.phase15.js');
let src = fs.readFileSync(target, 'utf8');
let changed = false;

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
    '      const aggregateValidation = validateRepairableProgramBundle(program, intake); // AGGREGATE-REPAIR-VALIDATION-RUNTIME',
    '      program = aggregateValidation.program;',
  ].join('\n');
  src = src.slice(0, start) + replacement + '\n' + src.slice(end);
  changed = true;
}

const feedbackMarker = 'AGGREGATE-ROLE-PRESERVING-FEEDBACK';
if (!src.includes(feedbackMarker)) {
  const startAnchor = 'function buildRolePreservingRepairFeedback(err, intake) {';
  const endAnchor = '\n}\n\nasync function generateValidatedProgram';
  const start = src.indexOf(startAnchor);
  const end = src.indexOf(endAnchor, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Aggregate feedback anchors missing (start=${start}, end=${end})`);
  }
  const replacement = `function buildRolePreservingRepairFeedback(err, intake) {\n  // AGGREGATE-ROLE-PRESERVING-FEEDBACK\n  const flags = err?.code === "PHASE15_QUALITY_VIOLATION" && Array.isArray(err?.flags) && err.flags.length\n    ? err.flags\n    : [err];\n  const feedbackParts = flags\n    .map((flag) => String(flag?.amendment || flag?.message || flag?.code || '').trim())\n    .filter(Boolean);\n  let feedback = feedbackParts.length\n    ? feedbackParts.join("\\n\\n--- ALSO REPAIR AND PRESERVE ALL PRIOR ITEMS ---\\n\\n")\n    : String(err?.amendment || err?.message || err?.code || 'Unknown quality failure');\n\n  const unknown = flags\n    .filter((flag) => flag?.code === "EXERCISE_HALLUCINATION")\n    .flatMap((flag) => Array.isArray(flag?.details?.unknown) ? flag.details.unknown : [])\n    .map((u) => String(u?.exercise || ''))\n    .filter(Boolean);\n  if (unknown.length) feedback += "\\nREJECTED EXERCISE NAMES: " + [...new Set(unknown)].join(" | ") + ".";\n\n  const tacticalContext = JSON.stringify({\n    primary_goals: intake?.primary_goals,\n    secondary_goals: intake?.secondary_goals,\n    maintenance_goals: intake?.maintenance_goals,\n    notes: intake?.notes,\n    sport: intake?.sport,\n  });\n  if (unknown.length && /\\b(?:tactical|military|special[- ]?operations|selection prep|combat[- ]?ready|operator)\\b/i.test(tacticalContext)) {\n    feedback += "\\nTACTICAL ROLE-PRESERVING CANONICAL MENU: for low-cost pushing use exact Exercise names Push-up, Dip or Overhead Press; for trunk use Pallof Press, Side Plank, Dead Bug or Hanging Leg Raise; for unilateral support use Reverse Lunge or Bulgarian Split Squat; for posterior-chain knee flexion use Leg Curl, Lying Leg Curl, Seated Leg Curl or Nordic Hamstring Curl; for carries use Farmer Carry or Suitcase Carry; for direct loaded marching use Backpack Carry; for running use Run. Rest or Off days are omitted from TSV rows entirely. Keep load, pace, interval, tempo and execution qualifiers in Weight/Reps/Notes rather than inventing a new Exercise name. Preserve at least the required small weekly push and trunk floor while repairing names.";\n  }\n  return feedback;\n}`;
  src = src.slice(0, start) + replacement + src.slice(end);
  changed = true;
}

fs.writeFileSync(target, src);
console.log(`${target}: ${changed ? 'aggregate repair validation wired' : 'already current'}`);
