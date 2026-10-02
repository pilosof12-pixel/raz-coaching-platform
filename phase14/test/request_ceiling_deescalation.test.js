// Run #153 delivered nothing for two avatars with identical traces:
//
//   T1:request_ceiling -> T2:request_ceiling:JOB_BUDGET_SPENT   1202s, 0 chars
//   T1:request_ceiling -> T2:request_ceiling:JOB_BUDGET_SPENT   1207s, 0 chars
//
// Two 600-second calls each at reasoning effort "high", both empty, the second
// consuming the last of the job budget. The second failed exactly like the first
// because it was the same request: the transient-retry path only varied the
// request for OPENAI_EMPTY_OUTPUT, and an abort at the ceiling took no branch.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const server = fs.readFileSync(path.join(root, '..', 'server.phase15.js'), 'utf8');

test('an abort at the request ceiling lowers reasoning effort for the retry', () => {
  const at = server.indexOf('REQUEST-CEILING-DEESCALATION');
  assert.ok(at > 0, 'the de-escalation is not in the served file');

  // It must hang off the aborted branch. Sitting inside the empty-output branch
  // is exactly the bug: a ceiling abort would take no branch at all.
  const block = server.slice(server.indexOf('transientRetries++;'), at);
  assert.match(block, /if \(aborted\) \{/, 'de-escalation must be gated on the abort, not on empty output');
  const emptyBranchAt = server.indexOf('if (e?.code === "OPENAI_EMPTY_OUTPUT")');
  assert.ok(at < emptyBranchAt, 'the abort branch must run before the empty-output branch');
});

test('the ladder steps down once and then stops', () => {
  // Lifted from the served file rather than restated, so the test cannot drift
  // from the thing it is checking.
  const src = server.slice(server.indexOf('const CEILING_LADDER'));
  const ladderSrc = src.slice(0, src.indexOf('\n') + 1);
  const CEILING_LADDER = new Function(`${ladderSrc} return CEILING_LADDER;`)();

  assert.equal(CEILING_LADDER.high, 'medium');
  assert.equal(CEILING_LADDER.medium, 'low');
  // Nothing below low: a fourth doomed call is not cheaper than three.
  assert.equal(CEILING_LADDER.low, undefined);

  // And the walk terminates rather than cycling.
  let effort = 'high';
  const seen = [effort];
  while (CEILING_LADDER[effort]) {
    effort = CEILING_LADDER[effort];
    assert.ok(!seen.includes(effort), 'the ladder must not cycle');
    seen.push(effort);
  }
  assert.deepEqual(seen, ['high', 'medium', 'low']);
});

test('a first attempt is untouched, so production still starts where it is configured', () => {
  // The fix changes retries only. The effort a build opens with still comes from
  // OPENAI_REASONING_EFFORT via reasoningEffortFor.
  // What this test is for is that the de-escalation fix changed retries only.
  // It used to pin the literal "high" to say so, which made it fail when the
  // default moved for reasons that have nothing to do with this fix. The intent
  // is that the opening effort comes from configuration and is overridable
  // without a deploy, so that is what is asserted.
  assert.match(server, /const OPENAI_REASONING_EFFORT = process\.env\.OPENAI_REASONING_EFFORT \|\| "(?:low|medium|high)"/);
  assert.match(server, /function reasoningEffortFor\(intake\)/,
    'the first attempt must still resolve its effort through reasoningEffortFor');
  assert.match(server, /engineOptions\.reasoningEffort \|\| reasoningEffortFor\(intake\)/,
    'the retry must read the effort actually in force, not a hardcoded default');
});

test('the trace records which effort the retry ran at', () => {
  // Without it, a run that de-escalated and a run that did not read the same in
  // the acceptance artefact -- which is how #153 took a cancelled six-avatar run
  // to diagnose.
  assert.match(server, /engineOptions\.reasoningEffort \? "@" \+ engineOptions\.reasoningEffort : ""/);
});
