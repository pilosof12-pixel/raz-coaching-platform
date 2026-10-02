// A retry that spends the same time the same way fails at the same second.
//
// Run #153 put two brand-new archetypes through the live API and delivered
// nothing at all. Both traces are identical:
//
//   T1:request_ceiling -> T2:request_ceiling:JOB_BUDGET_SPENT   1202s, 0 chars
//   T1:request_ceiling -> T2:request_ceiling:JOB_BUDGET_SPENT   1207s, 0 chars
//
// Two calls per avatar, each running the full 600s request ceiling at reasoning
// effort "high", each returning nothing, and the second one consuming the last
// of the 1200s job budget. Four doomed calls, two empty programs, and the cost
// of all of it billed as reasoning tokens.
//
// The reason the second call failed exactly like the first is that it WAS the
// first: the transient-retry path only changes the request when the failure was
// OPENAI_EMPTY_OUTPUT. An abort at the request ceiling takes neither branch, so
// the retry re-sends the same prompt at the same effort against the same
// ceiling. apply_empty_output_escalation.mjs already established the principle
// -- "repeating the identical request is not a reaction to one" -- and simply
// does not cover this failure.
//
// When a call is aborted at the ceiling the binding constraint is time, and the
// retry has exactly as little of it. So the retry steps reasoning effort down
// one rung instead: high -> medium -> low. A cheaper pass that returns a program
// beats a thorough one that returns nothing, and the deterministic repair chain
// is what carries quality afterwards.
//
// This does not touch the effort a first attempt uses. Production still starts
// at OPENAI_REASONING_EFFORT.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');
const before = s;

const MARK = 'REQUEST-CEILING-DEESCALATION';

const anchor = `      transientRetries++;
      attempt--; // this attempt judged nothing, so it does not count as one
      if (e?.code === "OPENAI_EMPTY_OUTPUT") {`;

const patched = `      transientRetries++;
      attempt--; // this attempt judged nothing, so it does not count as one
      if (aborted) {
        // ${MARK}: the ceiling is time, and the retry has exactly as little of
        // it. Re-sending at the same effort is the one thing guaranteed to fail
        // identically, which is what run #153 did twice on two avatars.
        const CEILING_LADDER = { high: "medium", medium: "low" };
        const currentEffort = String(engineOptions.reasoningEffort || reasoningEffortFor(intake));
        const nextEffort = CEILING_LADDER[currentEffort];
        if (nextEffort) {
          engineOptions = { ...engineOptions, reasoningEffort: nextEffort };
          console.warn(\`generateValidatedProgram: request ceiling at effort \${currentEffort}; retrying at \${nextEffort}\`);
        }
      }
      if (e?.code === "OPENAI_EMPTY_OUTPUT") {`;

if (!s.includes(MARK)) {
  if (!s.includes(anchor)) throw new Error('transient-retry anchor missing');
  s = s.replace(anchor, patched);
}

// The trace is how the acceptance artefact explains itself. Without the effort
// in it, a run that de-escalated and a run that did not look the same.
const traceOld = 'qaTrace.push(`T${transientRetries}:${aborted ? "request_ceiling" : "empty_output"}${e?.incompleteReason ? "(" + e.incompleteReason + ")" : ""}`);';
const traceNew = 'qaTrace.push(`T${transientRetries}:${aborted ? "request_ceiling" : "empty_output"}${e?.incompleteReason ? "(" + e.incompleteReason + ")" : ""}${engineOptions.reasoningEffort ? "@" + engineOptions.reasoningEffort : ""}`);';
if (!s.includes(traceNew)) {
  if (!s.includes(traceOld)) throw new Error('transient trace anchor missing');
  s = s.replace(traceOld, traceNew);
}

if (s !== before) fs.writeFileSync(target, s);
console.log('request-ceiling de-escalation applied');
