import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');

// The offending row, on a build that succeeded.
//
// lastRepairDetail already carries the flag text and up to three offending rows,
// lifted out of the candidate before it is thrown away. It reaches the client
// only when the loop is exhausted, because that is the path apply_qa_salvage_delivery
// wired it into. A build that fails on attempt 1 and passes on attempt 2 saves a
// program, so it takes the success path and the evidence is dropped.
//
// That is why run #143 reported A1:EQUIPMENT_VIOLATION+... and nothing about what
// tripped it. Every offline fixture is post-repair output, so the failing attempt
// is the one thing no fixture can show, and the codes alone have now sent me
// guessing at the row twice -- once wrongly.
//
// Diagnostics only: the suffix is gated on intake.qa_diagnostics === true, the
// same gate the trace already uses, so nothing reaches a client program.
const marker = 'FIRST-ATTEMPT-EVIDENCE';
if (!s.includes(marker)) {
  // 1. Somewhere to keep it, beside the trace it explains.
  const stateAnchor = 'let lastQaTrace = null;';
  if (!s.includes(stateAnchor)) throw new Error('lastQaTrace state anchor missing (apply qa trace diagnostics first)');
  s = s.replace(stateAnchor, `${stateAnchor}
// The flag text and offending rows behind the first entry in that trace, or "".
// ${marker}
let lastQaEvidence = "";`);

  const resetAnchor = '  lastQaTrace = null;';
  if (!s.includes(resetAnchor)) throw new Error('lastQaTrace reset anchor missing');
  s = s.replace(resetAnchor, `${resetAnchor}\n  lastQaEvidence = "";`);

  // 2. Record it on every exit that records the trace, whichever patch wrote that
  //    exit -- success, salvage, or a deterministic convergence.
  const writeAnchor = 'lastQaTrace = qaTrace.slice();';
  const writes = s.split(writeAnchor).length - 1;
  if (writes < 1) throw new Error('no lastQaTrace write sites found');
  s = s.replaceAll(writeAnchor, `${writeAnchor} lastQaEvidence = lastRepairDetail || lastQaEvidence; // ${marker}`);

  // 3. Say it, next to the trace.
  const suffixOld = `      ? \` QA trace: \${lastQaTrace.join(" -> ")}.\`
      : ""; // QA-TRACE-DIAGNOSTICS-DETAIL`;
  if (!s.includes(suffixOld)) throw new Error('QA trace suffix anchor missing');
  s = s.replace(suffixOld, `      ? \` QA trace: \${lastQaTrace.join(" -> ")}.\${lastQaEvidence ? \` First failure evidence: \${String(lastQaEvidence).slice(0, 600)}\` : ""}\`
      : ""; // QA-TRACE-DIAGNOSTICS-DETAIL // ${marker}`);

  fs.writeFileSync(target, s);
  console.log(`apply_first_attempt_evidence: applied (${writes} trace write site(s))`);
} else {
  console.log('apply_first_attempt_evidence: already present');
}
