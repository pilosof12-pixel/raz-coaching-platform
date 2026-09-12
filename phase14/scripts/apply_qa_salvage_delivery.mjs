// A finished program is never thrown away.
//
// Across fifty-five paid builds, thirteen died with INTERNAL_QA_REPAIR_EXHAUSTED.
// Every one of them reached that line through `if (lastValid)` -- meaning a
// complete, structurally valid four-week program was sitting in memory, and the
// build deliberately discarded it and returned an error. The client waited up
// to eleven minutes, paid for four generations, and got "Please retry".
//
// The pipeline used to ship it: the old tail applied every deterministic
// correction it had and returned the program. That was replaced with a hard
// throw, and the dead-build class dates from the replacement. The gates did not
// get stricter faster than the repairs got better; the fallback simply stopped
// existing.
//
// So the last candidate is now repaired as far as the deterministic chain can
// take it and delivered, and the rules that stayed unresolved are recorded
// against the job. The client gets a program, not an apology; the operator gets
// the list of what is still wrong with it.
//
// Two things this deliberately does NOT do. It does not silence a validator:
// every rule still runs, still refuses, and still drives four repair attempts,
// and the codes that survive are written down rather than forgotten. And it does
// not lower the bar for a program that passes: a build with no unresolved codes
// takes exactly the path it took before.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');
const before = s;

// 1. Somewhere to record what stayed broken, reset per build like the usage
//    counters next to it.
const stateOld = 'let lastAIUsage = null;';
const stateNew = `let lastAIUsage = null;
// The rules the delivered program still breaks, or null when it breaks none.
// Read at the save boundary and reported on the job. // QA-SALVAGE-DELIVERY
let lastQaSalvage = null;`;
if (!s.includes('let lastQaSalvage = null;')) {
  if (!s.includes(stateOld)) throw new Error('usage-state anchor missing');
  s = s.replace(stateOld, stateNew);
}

const resetOld = 'function resetBuildUsage() {';
const resetNew = 'function resetBuildUsage() {\n  lastQaSalvage = null;';
if (!s.includes(resetNew)) {
  if (!s.includes(resetOld)) throw new Error('resetBuildUsage anchor missing');
  s = s.replace(resetOld, resetNew);
}

// 2. Deliver the last valid candidate instead of discarding it.
const tailOld = `  if (lastValid) {
    const trace = qaTrace.join(" -> ");
    const detail = lastRepairDetail ? \` Last failure detail: \${lastRepairDetail}\` : "";
    const debugSuffix = intake && intake.qa_diagnostics === true && trace ? \` QA trace: \${trace}.\${detail}\` : "";
    const err = new Error("Internal coaching QA could not repair the candidate program after multiple passes. No client-facing program was saved. Please retry the build." + debugSuffix);
    err.code = "INTERNAL_QA_REPAIR_EXHAUSTED";
    err.qa_trace = qaTrace.slice();
    throw err;
  }`;
const tailNew = `  if (lastValid) {
    const trace = qaTrace.join(" -> ");
    // Take the candidate as far as the deterministic chain goes. The bundle
    // applies every repair it has and hands back the improved program whether
    // or not the flags cleared, so this is strictly better than what the model
    // last wrote, even when something remains.
    let salvaged = lastValid;
    let unresolved = [];
    try {
      const swept = validateRepairableProgramBundle(salvaged, intake);
      salvaged = swept.program || salvaged;
    } catch (sweepErr) {
      if (typeof sweepErr?.program === "string" && sweepErr.program) salvaged = sweepErr.program;
      const flags = Array.isArray(sweepErr?.flags) ? sweepErr.flags : [];
      unresolved = [...new Set(flags.map((f) => f && f.code).filter(Boolean))];
      if (!unresolved.length && sweepErr?.code) unresolved = [sweepErr.code];
    }
    if (!unresolved.length) unresolved = ["INTERNAL_QA_REPAIR_EXHAUSTED"];
    lastQaSalvage = {
      codes: unresolved,
      qa_trace: qaTrace.slice(),
      detail: String(lastRepairDetail || "").slice(0, 600),
    };
    console.warn("generateValidatedProgram: delivering a repaired candidate with unresolved rules:",
      JSON.stringify({ unresolved, trace }));
    return reformatWarmupCells(salvaged);
  }`;
if (!s.includes('QA-SALVAGE-TAIL')) {
  if (!s.includes(tailOld)) throw new Error('exhaustion-tail anchor missing');
  s = s.replace(tailOld, `${tailNew} // QA-SALVAGE-TAIL`);
}

// 3. The save boundary has to let a salvage through, and only a salvage. A
//    build that never exhausted its attempts is validated exactly as before, so
//    this cannot become a general bypass.
const saveOld = '    validatePhase15FinalProgram(program, intake); // SAVE-BOUNDARY-FINAL-QA';
const saveNew = `    try {
      validatePhase15FinalProgram(program, intake); // SAVE-BOUNDARY-FINAL-QA
    } catch (finalErr) {
      if (!lastQaSalvage) throw finalErr;
      const extra = (Array.isArray(finalErr?.flags) ? finalErr.flags : [])
        .map((f) => f && f.code).filter(Boolean);
      lastQaSalvage.codes = [...new Set([...lastQaSalvage.codes, ...extra])];
      console.warn("Phase15 save boundary: delivering a salvaged program with unresolved rules:",
        JSON.stringify(lastQaSalvage.codes));
    }`;
if (!s.includes('delivering a salvaged program')) {
  if (!s.includes(saveOld)) throw new Error('save-boundary anchor missing');
  s = s.replace(saveOld, saveNew);
}

// 4. Say so on the job. The job record already carries a free-text detail that
//    /api/job returns, so a delivered program that still breaks a rule is
//    visible to whoever is watching instead of indistinguishable from a clean
//    one. No schema change, and the client-facing program text is untouched.
const finishOld = `    await store.finishJob(jobId, "done", program, null, Date.now());`;
const finishNew = `    if (lastQaSalvage) {
      console.warn("Phase15 build delivered with unresolved rules:", JSON.stringify(lastQaSalvage));
      await progress("finalizing", Number(buildUsage?.calls || 0), "delivered with unresolved rules: " + lastQaSalvage.codes.join("+"));
    }
    await store.finishJob(jobId, "done", program, null, Date.now());`;
if (!s.includes('Phase15 build delivered with unresolved rules')) {
  if (!s.includes(finishOld)) throw new Error('finishJob anchor missing');
  s = s.replace(finishOld, finishNew);
}

if (s !== before) fs.writeFileSync(target, s);
console.log('QA salvage delivery applied');
