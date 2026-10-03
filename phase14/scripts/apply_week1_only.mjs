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
  `import { buildWeeksFromWeekOne, week1OnlySection, keepWeekOne } from "./engine/week_progression.js"; // ${MARK}\nimport { validateRepairableProgramBundle }`,
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
        engineBuiltWeeks = true;
      }
    }
    if (scopedWeeks) {
      // Put the returned weeks into the candidate;`,
  'build',
);

// A defect repeated in every week of an engine-built block was written in
// Week 1 and copied by the rules. Asking the model for the whole program again
// cost run #166's tactical build 32,000 output tokens; asking for Week 1 and
// rebuilding Weeks 2-4 from it answers the same defect. Once per build: if the
// rebuilt block still fails, the next repair is the full one.
swap(
  '  let repairWeeks = null; // WEEK-SCOPED-REPAIR: the weeks the next repair may rewrite, or null for all',
  `  let repairWeeks = null; // WEEK-SCOPED-REPAIR: the weeks the next repair may rewrite, or null for all
  let engineBuiltWeeks = false; // ${MARK}
  let rebuildFromWeekOne = false;
  let weekOneRepairUsed = false;`,
  'state',
);
swap(
  '        repairWeeks = repairCandidate ? weeksImplicatedBy(err?.flags) : null; // WEEK-SCOPED-REPAIR',
  `        repairWeeks = repairCandidate ? weeksImplicatedBy(err?.flags) : null; // WEEK-SCOPED-REPAIR
        if (repairCandidate && !repairWeeks && engineBuiltWeeks && !weekOneRepairUsed) { // ${MARK}
          repairWeeks = [1];
          rebuildFromWeekOne = true;
          weekOneRepairUsed = true;
        }`,
  'scope',
);
swap(
  '            repairWeeks = weeksImplicatedBy(stillFlagged?.flags); // WEEK-SCOPED-REPAIR',
  `            repairWeeks = weeksImplicatedBy(stillFlagged?.flags); // WEEK-SCOPED-REPAIR
            if (!repairWeeks && engineBuiltWeeks && !weekOneRepairUsed) { // ${MARK}
              repairWeeks = [1];
              rebuildFromWeekOne = true;
              weekOneRepairUsed = true;
            }`,
  'scope-reuse',
);
swap(
  `      if (spliced) {
        raw = spliced;
        qaTrace.push("S" + attempt + ":weeks" + scopedWeeks.join(""));`,
  `      if (spliced) {
        raw = spliced;
        qaTrace.push("S" + attempt + ":weeks" + scopedWeeks.join(""));
        if (rebuildFromWeekOne) { // ${MARK}
          const weekOne = keepWeekOne(raw);
          const rebuilt = weekOne ? buildWeeksFromWeekOne(weekOne, intake) : null;
          if (rebuilt && rebuilt.built) {
            raw = rebuilt.program;
            qaTrace.push("W:rebuilt-from-week1");
          }
          rebuildFromWeekOne = false;
        }`,
  'rebuild',
);

if (s !== before) fs.writeFileSync(target, s);
console.log('week-1-only applied');
