import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'server.phase15.js');
let src = fs.readFileSync(target, 'utf8');

// An answer the dictionary already held, that the loop paid the model for anyway.
//
// hardSubstitute has carried a converging deterministic fix for EQUIPMENT_VIOLATION,
// EXERCISE_HALLUCINATION, UNILATERAL_UNDERSTIMULATION, WEEKLY_MRV_EXCEEDED and the
// rest since long before Phase 15. On the legacy path it fired once a code had
// failed twice. On this path it never fired at all: final_pipeline_lock replaces
// the whole catch block and drops it, so every retriable refusal -- including one
// the dictionary could answer outright -- went back to the model.
//
// Run #143 is the bill. Attempt 1 was refused for EQUIPMENT_VIOLATION, the loop
// spent a second call, attempt 2 passed, and the build came in at 316 seconds
// against a 300-second bar. A single medium-effort call is about 260 seconds, so
// the budget buys one call; the second is the whole overrun.
//
// This is not a weaker gate. The substituted program is put through
// runQualityChain -- the identical steps 2 through 11, the same chain that just
// refused it, phase15 final QA included -- and then the client-output check. It is
// returned only if all of that passes for real. Anything still flagged, including
// a different code the substitution exposed, falls through to the model exactly as
// before, and the row is restored first so the next attempt starts from the text
// the model wrote rather than a half-normalized hybrid.
//
// It sits after the bundle-reuse block on purpose. The bundle's repaired program
// preserves more of the model's own work, so it stays the first thing tried; this
// catches the refusals the bundle never sees, which is why EQUIPMENT_VIOLATION
// reached a second call at all -- it is thrown at step 4, not by the bundle.
const marker = 'DETERMINISTIC-SUBSTITUTION-FIRST';
if (!src.includes(marker)) {
  const anchor = '        repairCandidate = requiresFreshCandidate ? null : program; // STRUCTURAL-ONLY-FRESH-CANDIDATE';
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Deterministic-substitution anchor expected once, found ${count}`);

  const block = [
    '        // A fix the dictionary already knows does not need a model call to',
    `        // find it again. Re-validated in full before it is accepted. // ${marker}`,
    '        const programBeforeSubstitution = program;',
    '        let substituted = "";',
    '        try {',
    '          const candidate = hardSubstitute(repairCode, program, intake);',
    '          if (typeof candidate === "string" && candidate.trim() && candidate !== program) substituted = candidate;',
    '        } catch (noSubstitution) {',
    '          void noSubstitution;',
    '        }',
    '        if (substituted) {',
    '          try {',
    '            const finished = runQualityChain(substituted);',
    '            validateClientOutputCleanliness(finished);',
    '            await onProgress("finalizing", attempt, "deterministic substitution converged without another model call");',
    `            qaTrace.push("A" + attempt + ":substituted-without-regeneration"); // ${marker}`,
    '            lastQaTrace = qaTrace.slice();',
    '            return finished;',
    '          } catch (stillFlagged) {',
    '            // runQualityChain normalizes `program` as it goes, so put the',
    '            // model\'s own text back before handing this to the next attempt.',
    '            program = programBeforeSubstitution;',
    `            void stillFlagged; // ${marker}`,
    '          }',
    '        }',
    anchor,
  ].join('\n');

  src = src.replace(anchor, block);
  fs.writeFileSync(target, src);
  console.log('apply_deterministic_substitution_first: applied');
} else {
  console.log('apply_deterministic_substitution_first: already present');
}
