import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'engine', 'goal_progression_graph.js');
let src = fs.readFileSync(target, 'utf8');

const legacy = "const name = String(ex.exercise || ex.name || '').toLowerCase();";
const displayNameOnly = "const name = String(ex.display_name || ex.exercise || ex.name || '').toLowerCase();";
const current = "const name = String(ex.display_name || ex.raw_display_name || ex.exercise || ex.name || '').toLowerCase();";

if (src.includes(current)) {
  console.log('goal_progression_graph.js: ProgramModel display-name identity already current');
  process.exit(0);
}

const legacyCount = src.split(legacy).length - 1;
const displayNameOnlyCount = src.split(displayNameOnly).length - 1;
if (legacyCount + displayNameOnlyCount !== 1) {
  throw new Error(`goal_progression_graph.js: expected one supported exercise-name anchor, found legacy=${legacyCount}, display-name-only=${displayNameOnlyCount}`);
}

src = src.replace(displayNameOnlyCount === 1 ? displayNameOnly : legacy, current);
fs.writeFileSync(target, src);
console.log('goal_progression_graph.js: ProgramModel display-name identity fixed');
