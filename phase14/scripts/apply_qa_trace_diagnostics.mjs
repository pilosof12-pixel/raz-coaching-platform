// Why did this build call the model three times?
//
// Run #119 took three model calls and 638 seconds. The record it left was the
// number three. Whether those were quality regenerations, aborted requests that
// hit the 780-second ceiling, or empty outputs retried, the evidence did not
// say -- and the difference matters, because each has a different fix and I had
// already predicted the wrong number once by guessing.
//
// The trace exists. generateValidatedProgram builds qaTrace as it goes, with an
// entry per QA regeneration naming the rule that refused (A2:V34_...), and an
// entry per transient retry naming the reason (T1:request_ceiling). It is
// attached to errors and read on the salvage path, and then discarded on every
// build that succeeds -- which is every build worth diagnosing when the question
// is why a successful build was slow.
//
// So it is now carried out of the generator and appended to the final progress
// detail, and ONLY when the intake asks for diagnostics. The acceptance runs set
// qa_diagnostics: true and already record that detail in result.json, so the
// next live run answers the question without a workflow change. A client build
// sets no such flag and its detail is byte-identical to what it was.
//
// This adds no gate, changes no prescription, and cannot alter a delivered
// program: it only writes down what already happened.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');
const before = s;

// 1. Somewhere to keep it, reset per build beside the salvage record.
const stateOld = 'let lastQaSalvage = null;';
const stateNew = `let lastQaSalvage = null;
// The attempt-by-attempt trace of the build that just ran, or null. Written on
// every exit from generateValidatedProgram, read only when the intake asked for
// diagnostics. // QA-TRACE-DIAGNOSTICS
let lastQaTrace = null;`;
if (!s.includes('let lastQaTrace = null;')) {
  if (!s.includes(stateOld)) throw new Error('salvage-state anchor missing (apply qa salvage delivery first)');
  s = s.replace(stateOld, stateNew);
}

const resetOld = '  lastQaSalvage = null;';
const resetNew = '  lastQaSalvage = null;\n  lastQaTrace = null;';
if (!s.includes(resetNew)) {
  if (!s.includes(resetOld)) throw new Error('resetBuildUsage anchor missing');
  s = s.replace(resetOld, resetNew);
}

// 2. Record it on the way out of the generator. The success path is the one
//    that used to throw the trace away.
const successOld = `      await onProgress("finalizing", attempt, "quality checks passed including Phase 15 v5");
      return program;`;
const successNew = `      await onProgress("finalizing", attempt, "quality checks passed including Phase 15 v5");
      lastQaTrace = qaTrace.slice(); // QA-TRACE-DIAGNOSTICS-SUCCESS
      return program;`;
if (!s.includes('QA-TRACE-DIAGNOSTICS-SUCCESS')) {
  if (!s.includes(successOld)) throw new Error('success-return anchor missing');
  s = s.replace(successOld, successNew);
}

// The deterministic note-repair fast path returns without reaching the line
// above, and it is precisely a path that avoided a regeneration -- exactly what
// a latency question wants to see.
const fastOld = `              await onProgress("finalizing", attempt, "objective wording mismatch repaired without changing prescription");
              return repairedProgram;`;
const fastNew = `              await onProgress("finalizing", attempt, "objective wording mismatch repaired without changing prescription");
              lastQaTrace = qaTrace.slice(); // QA-TRACE-DIAGNOSTICS-FASTPATH
              return repairedProgram;`;
if (!s.includes('QA-TRACE-DIAGNOSTICS-FASTPATH')) {
  if (!s.includes(fastOld)) throw new Error('fast-path-return anchor missing');
  s = s.replace(fastOld, fastNew);
}

const salvageOld = '    return reformatWarmupCells(salvaged);';
const salvageNew = '    lastQaTrace = qaTrace.slice(); // QA-TRACE-DIAGNOSTICS-SALVAGE\n    return reformatWarmupCells(salvaged);';
if (!s.includes('QA-TRACE-DIAGNOSTICS-SALVAGE')) {
  if (!s.includes(salvageOld)) throw new Error('salvage-return anchor missing');
  s = s.replace(salvageOld, salvageNew);
}

// 3. Say it, for a diagnostic intake only.
const progressOld = '    await progress("finalizing", Number(buildUsage?.calls || 0), `saving program after ${Number(buildUsage?.calls || 0)} model call(s)`);';
const progressNew = `    const qaTraceSuffix = intake && intake.qa_diagnostics === true && Array.isArray(lastQaTrace) && lastQaTrace.length
      ? \` QA trace: \${lastQaTrace.join(" -> ")}.\`
      : ""; // QA-TRACE-DIAGNOSTICS-DETAIL
    await progress("finalizing", Number(buildUsage?.calls || 0), \`saving program after \${Number(buildUsage?.calls || 0)} model call(s)\${qaTraceSuffix}\`);`;
if (!s.includes('QA-TRACE-DIAGNOSTICS-DETAIL')) {
  if (!s.includes(progressOld)) throw new Error('save-progress anchor missing');
  s = s.replace(progressOld, progressNew);
}

// Say why a build is regenerating, while it is regenerating.
//
// The trace was only ever emitted on the way out -- on a saved program or a
// salvage. A build that is killed, times out, or is still running reports
// "regenerating after quality check" and nothing else, so the two QA rejections
// the calisthenics athlete hit on run #137 left no record of what they were.
// The information existed in qaTrace the whole time; it just never reached the
// poller until the end, and that build never had an end.
//
// Gated on qa_diagnostics like the rest of the trace output, so a real client
// never sees internal codes.
{
  const genOld = '    await onProgress("generating", attempt, attempt === 1 ? "initial generation" : "regenerating after quality check");';
  const genNew = `    const qaSoFar = intake && intake.qa_diagnostics === true && qaTrace.length
      ? \` [\${qaTrace.join(" -> ")}]\`
      : "";
    await onProgress("generating", attempt, attempt === 1 ? "initial generation" : \`regenerating after quality check\${qaSoFar}\`); // QA-TRACE-ON-REGENERATION`;
  if (!s.includes('QA-TRACE-ON-REGENERATION')) {
    if (!s.includes(genOld)) throw new Error('regeneration progress anchor missing');
    s = s.replace(genOld, genNew);
  }
}

// 4. The salvage path writes a LATER detail than the one above, so on exactly
//    the builds worth diagnosing -- the slow ones that exhausted their attempts
//    -- it overwrote the trace and result.json lost it. Run #122 spent five
//    model calls and the trace never reached the evidence; the cause was only
//    recoverable because the unresolved rule happened to name it.
const salvageDetailOld = 'await progress("finalizing", Number(buildUsage?.calls || 0), "delivered with unresolved rules: " + lastQaSalvage.codes.join("+"));';
const salvageDetailNew = 'await progress("finalizing", Number(buildUsage?.calls || 0), "delivered with unresolved rules: " + lastQaSalvage.codes.join("+") + qaTraceSuffix);';
if (!s.includes(salvageDetailNew)) {
  if (!s.includes(salvageDetailOld)) throw new Error('salvage-detail anchor missing (apply qa salvage delivery first)');
  s = s.replace(salvageDetailOld, salvageDetailNew);
}

if (s !== before) fs.writeFileSync(target, s);
console.log('QA trace diagnostics applied');
