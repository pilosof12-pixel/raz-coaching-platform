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

fs.writeFileSync(target, src);
console.log(`${target}: ${changed ? 'aggregate repair validation wired' : 'already current'}`);
