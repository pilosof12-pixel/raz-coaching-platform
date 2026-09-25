import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'server.phase15.js');
let src = fs.readFileSync(target, 'utf8');

// The repair the loop already had, and threw away.
//
// validateRepairableProgramBundle repairs the candidate and then throws if
// anything is still flagged. The throw used to carry only the flags, so the
// catch re-asked the model from the text it had already written and every
// repair made on the way was lost. Run #140 spent four calls and 466 seconds on
// V34_NOTE_UNDEFINED_LOAD_REFERENCE, and the program that shipped was the one
// the bundle had produced on the first attempt -- discarded three times, then
// recovered by the fallback after the loop gave up.
//
// The error now carries that program. Where it clears on its own, the build is
// finished and no further call is made. Where it does not, it is still a better
// starting point than the defect, so the next attempt edits the improvement.
//
// The bar for finishing early is the loop's own bar -- the full bundle, clean,
// plus the client-output check -- so this ships nothing the loop would not have
// shipped anyway. It just stops paying for the same answer four times.
const marker = 'REPAIRED-CANDIDATE-REUSE';
if (!src.includes(marker)) {
  const anchor = '        repairCandidate = requiresFreshCandidate ? null : program; // STRUCTURAL-ONLY-FRESH-CANDIDATE';
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Repaired-candidate anchor expected once, found ${count}`);

  const block = [
    '        // The bundle repaired this candidate before it threw. Try it as it',
    '        // stands: a deterministic chain that has already answered the flag',
    `        // does not need a model call to answer it again. // ${marker}`,
    '        const repairedByBundle = err && typeof err.repairedProgram === "string" ? err.repairedProgram : "";',
    '        if (repairedByBundle.trim() && !requiresFreshCandidate) {',
    '          try {',
    '            const settled = validateRepairableProgramBundle(repairedByBundle, intake, {',
    '              skipSkillCalibration: Boolean(OPENAI_API_KEY),',
    '            });',
    '            const finished = settled.program;',
    '            validateClientOutputCleanliness(finished);',
    '            await onProgress("finalizing", attempt, "deterministic repair converged without another model call");',
    `            qaTrace.push("A" + attempt + ":converged-without-regeneration"); // ${marker}`,
    '            lastQaTrace = qaTrace.slice();',
    '            return finished;',
    '          } catch (stillFlagged) {',
    '            // Not clean yet. The improvement is still worth more than the',
    '            // text the model wrote, so the next attempt starts from it.',
    '            void stillFlagged;',
    '          }',
    '          repairCandidate = repairedByBundle; // ' + marker,
    '          continue;',
    '        }',
    anchor,
  ].join('\n');

  src = src.replace(anchor, block);
  fs.writeFileSync(target, src);
  console.log('apply_repaired_candidate_reuse: applied');
} else {
  console.log('apply_repaired_candidate_reuse: already present');
}
