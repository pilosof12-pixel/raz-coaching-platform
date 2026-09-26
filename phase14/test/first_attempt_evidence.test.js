// A build that fails on attempt 1 and passes on attempt 2 saves a program, so it
// leaves by the success path -- and the success path reported the QA trace but
// dropped lastRepairDetail, which is the part that names the offending row.
//
// Run #143 is the example: A1:EQUIPMENT_VIOLATION+NAMED_GOAL_DIRECT_EXPOSURE_MISSING
// +V35_SECONDARY_VOLUME_CREEP, and nothing about what tripped any of them. Every
// offline fixture is post-repair output, so the failing attempt is the one thing
// no fixture can reproduce, and the codes alone have sent me guessing at the row
// twice.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LIVE = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');
const lines = LIVE.split('\n');

test('the success path reports the evidence next to the trace', () => {
  assert.match(LIVE, /First failure evidence: \$\{String\(lastQaEvidence\)\.slice\(0, 600\)\}/,
    'the trace suffix must carry the rows behind the codes');
  // Same gate as the trace: diagnostics only, never a client program.
  const suffix = LIVE.slice(LIVE.indexOf('const qaTraceSuffix'), LIVE.indexOf('QA-TRACE-DIAGNOSTICS-DETAIL'));
  assert.match(suffix, /intake && intake\.qa_diagnostics === true/,
    'evidence must stay behind the diagnostics gate');
});

test('the evidence is recorded wherever the trace is recorded', () => {
  const traceWrites = LIVE.split('lastQaTrace = qaTrace.slice();').length - 1;
  const evidenceWrites = LIVE.split('lastQaEvidence = lastRepairDetail').length - 1;
  assert.ok(traceWrites >= 1, 'no trace write sites found');
  assert.equal(evidenceWrites, traceWrites,
    'an exit that records the trace but not the evidence reports codes with no rows again');
});

test('every evidence write can actually see lastRepairDetail', () => {
  // lastRepairDetail is local to generateValidatedProgram. A write site outside it
  // is a ReferenceError on a live build, and node --check will not catch it: the
  // syntax is fine, the scope is not.
  const start = lines.findIndex((l) => l.includes('async function generateValidatedProgram')) + 1;
  assert.ok(start > 0, 'generateValidatedProgram not found');
  const end = lines.findIndex((l, i) => i >= start && /^(?:async )?function /.test(l)) + 1;
  assert.ok(end > start, 'end of generateValidatedProgram not found');

  const declared = lines.findIndex((l) => l.includes('let lastRepairDetail')) + 1;
  assert.ok(declared > start && declared < end, 'lastRepairDetail must be local to the generator');

  const sites = lines
    .map((l, i) => (l.includes('lastQaEvidence = lastRepairDetail') ? i + 1 : 0))
    .filter(Boolean);
  assert.ok(sites.length >= 1, 'no evidence write sites found');
  for (const line of sites) {
    assert.ok(line > declared && line < end,
      `evidence write at line ${line} is outside generateValidatedProgram (${start}..${end})`);
  }
});
