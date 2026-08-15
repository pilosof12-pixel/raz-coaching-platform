import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'engine', 'exercise_dictionary.js');
let src = fs.readFileSync(target, 'utf8');

const patches = [
  {
    needle: '"Handstand Hold", "Handstand Walk",',
    replacement: '"Handstand Hold", "Handstand Walk", "Controlled Handstand Kick-up",',
  },
  {
    needle: '"Strict Muscle-up", "Muscle-up", "Bar Muscle-up", "Ring Muscle-up",',
    replacement: '"Strict Muscle-up", "Muscle-up", "Bar Muscle-up", "Ring Muscle-up", "Bar Muscle-up Transition Drill",',
  },
];

for (const { needle, replacement } of patches) {
  if (src.includes(replacement)) continue;
  if (!src.includes(needle)) {
    throw new Error(`Youth skill dictionary patch anchor not found: ${needle}`);
  }
  src = src.replace(needle, replacement);
}

fs.writeFileSync(target, src);
console.log('Applied youth skill exercise dictionary patch.');
