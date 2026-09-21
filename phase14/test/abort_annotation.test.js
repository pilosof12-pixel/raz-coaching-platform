// An AbortError cannot be annotated in place, and the build died trying.
//
// Run #128's Hyrox job failed after 1681 seconds with:
//
//   Cannot set property message of  which has only a getter
//
// and produced no program at all. The transient-retry handler appends the QA
// trace to the error's message before rethrowing, which works on an ordinary
// Error and throws a TypeError on a DOMException -- and an AbortError from
// controller.abort() is a DOMException whose message is a getter with no setter.
//
// The path only became reachable when the request ceiling dropped from 780s to
// 420s as a latency fix. Aborts went from rare to routine and a latent crash in
// the abort handler started firing, which is a fair description of what that
// change actually did: it did not create the bug, it removed the thing that was
// hiding it.
//
// The annotation is the whole point of the line -- it is how the trace reaches
// the operator -- so it is rebuilt onto a plain Error rather than dropped.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = fs.readFileSync(path.join(here, '..', 'server.phase15.js'), 'utf8');

// The production shape, lifted out so the behaviour is tested rather than the text.
function annotate(e, qaTrace) {
  e.qa_trace = qaTrace.slice();
  const annotated = `${e && e.message} QA trace: ${qaTrace.join(' -> ')}.`;
  try {
    e.message = annotated;
    throw e;
  } catch (cannotAnnotate) {
    if (cannotAnnotate === e) throw e;
    const wrapped = new Error(annotated);
    wrapped.code = e && e.code;
    wrapped.qa_trace = qaTrace.slice();
    wrapped.cause = e;
    throw wrapped;
  }
}

test('a getter-only AbortError still carries the trace out', () => {
  const trace = ['T1:request_ceiling', 'T2:request_ceiling:JOB_BUDGET_SPENT'];
  const abort = new DOMException('The operation was aborted.', 'AbortError');
  assert.throws(() => annotate(abort, trace), (thrown) => {
    assert.ok(thrown instanceof Error, 'nothing usable was thrown');
    assert.match(thrown.message, /QA trace: T1:request_ceiling/, 'the trace was lost');
    assert.deepEqual(thrown.qa_trace, trace);
    assert.equal(thrown.cause?.name, 'AbortError', 'the original error was discarded');
    return true;
  });
});

test('an ordinary Error is still annotated in place', () => {
  const trace = ['T1:empty_output'];
  const err = Object.assign(new Error('OpenAI returned no output_text content.'), { code: 'OPENAI_EMPTY_OUTPUT' });
  assert.throws(() => annotate(err, trace), (thrown) => {
    assert.equal(thrown, err, 'a writable error should not be wrapped');
    assert.match(thrown.message, /QA trace: T1:empty_output/);
    assert.equal(thrown.code, 'OPENAI_EMPTY_OUTPUT');
    return true;
  });
});

test('the runtime carries the guarded form, not the bare assignment', () => {
  assert.match(runtime, /cannotAnnotate/, 'the built runtime still annotates unguarded');
});
