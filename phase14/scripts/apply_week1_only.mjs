// The model writes Week 1; the engine builds Weeks 2-4 (engine/week_progression.js).
// A block that ends in its competition keeps the full model-written block.
// Whatever is built goes through the same structural check and quality chain.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');
const before = s;
const MARK = 'WEEK1-ONLY';

function swap(oldText, newText, label) {
  if (s.includes(newText)) return;
  if (!s.includes(oldText)) throw new Error(`${label} anchor missing`);
  s = s.replace(oldText, newText);
}

swap(
  'import { validateRepairableProgramBundle }',
  `import { buildWeeksFromWeekOne, week1OnlySection } from "./engine/week_progression.js"; // ${MARK}\nimport { validateRepairableProgramBundle }`,
  'import',
);

swap(
  '  ].join("\\n") + qaCorrectionsFrom(src); // QA-CORRECTIONS-SURVIVE-COMPACTION',
  `  ].join("\\n") + week1OnlySection(intake) + qaCorrectionsFrom(src); // QA-CORRECTIONS-SURVIVE-COMPACTION ${MARK}`,
  'compact',
);

swap(
  '    if (scopedWeeks) {\n      // Put the returned weeks into the candidate;',
  `    if (!scopedWeeks && typeof raw === "string" && /START_WEEK1_TSV/i.test(raw) && !/START_WEEK2_TSV/i.test(raw)) {
      // The model wrote Week 1; the rules write Weeks 2-4. // ${MARK}
      const built = buildWeeksFromWeekOne(raw, intake);
      if (built.built) {
        raw = built.program;
        qaTrace.push("W:engine-weeks-2-4");
      }
    }
    if (scopedWeeks) {
      // Put the returned weeks into the candidate;`,
  'build',
);

if (s !== before) fs.writeFileSync(target, s);
console.log('week-1-only applied');
