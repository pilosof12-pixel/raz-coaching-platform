import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function patch(rel, transforms) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const t of transforms) {
    if (t.already && src.includes(t.already)) continue;
    const count = src.split(t.find).length - 1;
    if (count !== 1) throw new Error(`${rel} / ${t.label}: expected one anchor, found ${count}`);
    src = src.replace(t.find, t.replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(file, src);
  console.log(`${rel}: ${changed ? 'tactical launch quality applied' : 'already current'}`);
}

patch('engine/repairable_validation_bundle.js', [
  {
    label: 'tactical manual acceptance import',
    find: "} from './manual_acceptance_quality.js';\n",
    replace: "} from './manual_acceptance_quality.js';\nimport { validateTacticalManualAcceptanceSemantic } from './tactical_manual_acceptance.js'; // TACTICAL-MANUAL-ACCEPTANCE-WIRED\n",
    already: 'TACTICAL-MANUAL-ACCEPTANCE-WIRED',
  },
  {
    label: 'tactical manual acceptance runtime',
    find: '    () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, model),\n',
    replace: '    () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, model),\n    () => validateTacticalManualAcceptanceSemantic(candidate, intake, model), // TACTICAL-MANUAL-ACCEPTANCE-RUNTIME\n',
    already: 'TACTICAL-MANUAL-ACCEPTANCE-RUNTIME',
  },
]);

patch('engine/specific_warmup_enrichment.js', [
  {
    label: 'do not strength-ramp loaded marching',
    find: "export function rampText(exercise, load) {\n  const added = parseAddedKg(load);",
    replace: "export function rampText(exercise, load) {\n  // Loaded marching/carries are locomotion, not barbell lifts. A strength-style\n  // kg x reps ramp is nonsensical for a ruck and leaked into live QA.\n  if (/backpack\\s+carry|ruck|loaded\\s+march|farmer(?:'s)?\\s+carry|suitcase\\s+carry/i.test(String(exercise || ''))) return ''; // NO-RUCK-STRENGTH-RAMP\n  const added = parseAddedKg(load);",
    already: "farmer(?:'s)?\\s+carry|suitcase\\s+carry/i.test(String(exercise || ''))) return '';",
  },
]);

console.log('Tactical manual acceptance + ruck warm-up representation wiring complete.');
