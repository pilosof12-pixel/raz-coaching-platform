// A repair rewrites the weeks that are wrong, not the whole program.
// See engine/week_scoped_repair.js. Every candidate the model returns is
// spliced into the previous one and the whole program is validated again, so
// nothing here relaxes a rule; it only stops paying for weeks that were right.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');
const before = s;
const MARK = 'WEEK-SCOPED-REPAIR';

function swap(oldText, newText, label) {
  if (s.includes(newText)) return;
  if (!s.includes(oldText)) throw new Error(`${label} anchor missing`);
  s = s.replace(oldText, newText);
}

swap(
  'import { validateRepairableProgramBundle }',
  `import { weeksImplicatedBy, scopeRepairPrompt, spliceWeekBlocks } from "./engine/week_scoped_repair.js"; // ${MARK}\nimport { validateRepairableProgramBundle }`,
  'import',
);

swap(
  '  let repairCandidate = null;',
  `  let repairCandidate = null;\n  let repairWeeks = null; // ${MARK}: the weeks the next repair may rewrite, or null for all`,
  'state',
);

swap(
  `    const userContent = repairCandidate
      ? buildInternalQualityRepairPrompt(intake, repairCandidate, cumulativeRepairFeedback)`,
  `    const scopedWeeks = repairCandidate && Array.isArray(repairWeeks) && repairWeeks.length ? repairWeeks.slice() : null; // ${MARK}
    const userContent = repairCandidate
      ? (scopedWeeks
        ? scopeRepairPrompt(buildInternalQualityRepairPrompt(intake, repairCandidate, cumulativeRepairFeedback), scopedWeeks)
        : buildInternalQualityRepairPrompt(intake, repairCandidate, cumulativeRepairFeedback))`,
  'prompt',
);

swap(
  '    if (!isValidProgram(raw)) {',
  `    if (scopedWeeks) {
      // Put the returned weeks into the candidate; a reply that does not carry
      // every requested week is repaired in full on the next attempt. // ${MARK}
      const spliced = spliceWeekBlocks(repairCandidate, raw, scopedWeeks);
      if (spliced) {
        raw = spliced;
        qaTrace.push("S" + attempt + ":weeks" + scopedWeeks.join(""));
      } else {
        qaTrace.push("S" + attempt + ":splice-failed");
        repairWeeks = null;
      }
    }
    if (!isValidProgram(raw)) {`,
  'splice',
);

swap(
  `          } catch (stillFlagged) {
            // Not clean yet. The improvement is still worth more than the
            // text the model wrote, so the next attempt starts from it.
            void stillFlagged;
          }
          repairCandidate = repairedByBundle; // REPAIRED-CANDIDATE-REUSE`,
  `          } catch (stillFlagged) {
            // Not clean yet. The improvement is still worth more than the
            // text the model wrote, so the next attempt starts from it.
            repairWeeks = weeksImplicatedBy(stillFlagged?.flags); // ${MARK}
          }
          repairCandidate = repairedByBundle; // REPAIRED-CANDIDATE-REUSE`,
  'reuse',
);

swap(
  '        repairCandidate = requiresFreshCandidate ? null : program; // STRUCTURAL-ONLY-FRESH-CANDIDATE',
  `        repairCandidate = requiresFreshCandidate ? null : program; // STRUCTURAL-ONLY-FRESH-CANDIDATE
        repairWeeks = repairCandidate ? weeksImplicatedBy(err?.flags) : null; // ${MARK}`,
  'fresh',
);

if (s !== before) fs.writeFileSync(target, s);
console.log('week-scoped repair applied');
