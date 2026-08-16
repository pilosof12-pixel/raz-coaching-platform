import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'engine', 'exercise_dictionary.js');
let src = fs.readFileSync(target, 'utf8');
let changed = false;

function replaceOnce(find, replace, label, already = '') {
  if (already && src.includes(already)) return;
  const count = src.split(find).length - 1;
  if (count !== 1) throw new Error(`Tactical endurance vocabulary anchor '${label}' expected once, found ${count}`);
  src = src.replace(find, replace);
  changed = true;
}

// Execution labels are not new exercise identities. Keep the vocabulary gate
// strict, but normalize a deliberately small set of common endurance labels to
// the canonical movement that the structured ProgramModel already understands.
const composedAnchor = `export function matchComposedExercise(core) {\n  let n = norm(core);\n  if (!n) return null;\n`;
const enduranceBlock = `${composedAnchor}\n  // ENDURANCE-EXECUTION-COMPOSITION\n  // Pace/domain qualifiers belong in load, reps and Notes, not in Exercise identity.\n  const runLabels = new Set([\n    'easy run', 'long run', 'aerobic run', 'recovery run', 'steady run',\n    'tempo run', 'threshold run', 'interval run', 'run intervals',\n    'repeat run', 'run repeats', 'progression run'\n  ]);\n  if (runLabels.has(n)) {\n    return { kind: 'endurance_run_label', canonical: 'Run', requirements: [] };\n  }\n  const ruckLabels = new Set([\n    'ruck', 'rucking', 'ruck march', 'loaded ruck', 'loaded march',\n    'pack march', 'ruck walk', 'weighted ruck'\n  ]);\n  if (ruckLabels.has(n)) {\n    return { kind: 'ruck_label', canonical: 'Backpack Carry', requirements: ['backpack'] };\n  }\n`;
replaceOnce(
  composedAnchor,
  enduranceBlock,
  'controlled endurance composition',
  '// ENDURANCE-EXECUTION-COMPOSITION'
);

const oldHook = `  const composed = matchComposedExercise(n);\n  if (composed) return { status: "hit", composed: true, requirements: composed.requirements || [] };\n  return { status: "miss" };`;
const newHook = `  const composed = matchComposedExercise(n);\n  if (composed?.canonical) {\n    return { status: "alias", canonical: composed.canonical, composed: true, requirements: composed.requirements || [] }; // ENDURANCE-CANONICAL-ALIAS-HOOK\n  }\n  if (composed) return { status: "hit", composed: true, requirements: composed.requirements || [] };\n  return { status: "miss" };`;
replaceOnce(
  oldHook,
  newHook,
  'canonical composed alias hook',
  'ENDURANCE-CANONICAL-ALIAS-HOOK'
);

if (changed) fs.writeFileSync(target, src);
console.log(`${target}: ${changed ? 'Tactical endurance identity normalization applied' : 'already current'}`);
