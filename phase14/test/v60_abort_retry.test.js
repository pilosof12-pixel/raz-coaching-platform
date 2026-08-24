import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The classification is inline in generateValidatedProgram, so lift the actual
// shipped expressions out of the source and exercise them, rather than
// re-implementing them here and testing the copy.
function loadClassifier(file) {
  const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const aborted = src.match(/const aborted = (.+);\n/);
  const retriable = src.match(/const retriable = (.+);\n/);
  assert.ok(aborted && retriable, `retry classification not found in ${file}`);
  return new Function('e', 'MAX_ATTEMPTS', 'attempt',
    `const aborted = ${aborted[1]};
     const retriable = ${retriable[1]};
     return { aborted, retriable, wouldRetry: retriable && attempt < MAX_ATTEMPTS };`);
}

const FILES = ['../server.js', '../server.phase15.js'];

// Run #79 lost both avatars to this exact error at 422s, on attempt 1, with
// nineteen minutes of build budget left unspent.
const RUN79 = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

for (const file of FILES) {
  const label = file.replace('../', '');

  test(`${label}: the run #79 abort is retriable`, () => {
    const classify = loadClassifier(file);
    const r = classify(RUN79, 4, 1);
    assert.equal(r.aborted, true);
    assert.equal(r.retriable, true);
    assert.equal(r.wouldRetry, true, 'the build must not end here');
  });

  test(`${label}: an abort identified only by message is still caught`, () => {
    const classify = loadClassifier(file);
    assert.equal(classify(new Error('This operation was aborted [QA:20]'), 4, 1).retriable, true);
  });

  test(`${label}: empty output stays retriable`, () => {
    const classify = loadClassifier(file);
    const e = Object.assign(new Error('no output'), { code: 'OPENAI_EMPTY_OUTPUT' });
    assert.equal(classify(e, 4, 1).retriable, true);
  });

  // A bad request fails identically every time; retrying spends money for nothing.
  test(`${label}: a genuine error is not retried`, () => {
    const classify = loadClassifier(file);
    assert.equal(classify(new Error('OpenAI HTTP 400'), 4, 1).retriable, false);
    assert.equal(classify(new Error('prompt exceeded 45000 characters'), 4, 1).retriable, false);
  });

  test(`${label}: the last attempt still surfaces the failure`, () => {
    const classify = loadClassifier(file);
    assert.equal(classify(RUN79, 4, 4).wouldRetry, false);
  });
}

// The budget must actually allow the retry the classification now permits.
test('two full-length attempts fit inside the build deadline', () => {
  const built = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');
  const req = Number(built.match(/AI_REQUEST_TIMEOUT_MS \|\| \(OPENAI_API_KEY \? (\d+)/)[1]);
  const build = Number(built.match(/BUILD_JOB_TIMEOUT_MS \|\| \(OPENAI_API_KEY \? (\d+)/)[1]);
  assert.ok(build >= req * 2, `build budget ${build}ms must hold two ${req}ms attempts`);
});
