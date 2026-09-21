// Reasoning effort is the biggest single lever on generation time.
//
// Run #132 lost both avatars to it: three consecutive calls at effort "high"
// each ran past the 600s ceiling and returned nothing, the Hyrox athlete
// producing zero characters in thirty minutes. Whether "medium" costs enough
// quality to matter is measurable, but until now it could only be moved by
// redeploying -- so measuring it meant changing it for every athlete at once
// and hoping the comparison held.
//
// A QA intake may now name its own effort, so one avatar can be timed and
// scored against the standing configuration in a single cheap run.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = fs.readFileSync(path.join(root, '..', 'server.phase15.js'), 'utf8');

// Exercise the real function rather than asserting on its source text.
const loadChooser = () => {
  const body = runtime.slice(
    runtime.indexOf('function reasoningEffortFor(intake)'),
    runtime.indexOf('function reasoningEffortFor(intake)') + 420,
  );
  const end = body.indexOf('\n}') + 2;
  // eslint-disable-next-line no-new-func
  return new Function(
    'OPENAI_REASONING_EFFORT', 'ALLOWED_REASONING_EFFORTS',
    `${body.slice(0, end)}; return reasoningEffortFor;`,
  )('high', new Set(['low', 'medium', 'high']));
};

test('a QA intake may name its own effort', () => {
  const choose = loadChooser();
  assert.equal(choose({ qa_diagnostics: true, qa_reasoning_effort: 'medium' }), 'medium');
  assert.equal(choose({ qa_diagnostics: true, qa_reasoning_effort: 'LOW' }), 'low');
});

test('an ordinary intake cannot change it', () => {
  const choose = loadChooser();
  assert.equal(choose({ qa_reasoning_effort: 'low' }), 'high');
  assert.equal(choose({ qa_diagnostics: false, qa_reasoning_effort: 'low' }), 'high');
  assert.equal(choose({ qa_diagnostics: 'true', qa_reasoning_effort: 'low' }), 'high',
    'the gate is the boolean, not a truthy string');
});

test('an unusable value falls back rather than failing a paid call', () => {
  const choose = loadChooser();
  for (const bad of ['maximum', '', null, undefined, 'high ', 42]) {
    assert.equal(choose({ qa_diagnostics: true, qa_reasoning_effort: bad }), 'high', String(bad));
  }
});

test('no intake at all is the standing configuration', () => {
  const choose = loadChooser();
  assert.equal(choose(null), 'high');
  assert.equal(choose(undefined), 'high');
});

test('the override reaches the request through the escalation seam', () => {
  // runEngineRaw already had a per-call reasoning override for empty-output
  // escalation. Patching the request body directly instead broke that patch's
  // anchor and took the whole build chain down, so the QA override hangs off
  // the same seam rather than competing with it: an explicit engineOptions
  // effort still wins, and the intake is consulted only beneath it.
  assert.match(
    runtime,
    /const effectiveReasoningEffort = String\(engineOptions\?\.reasoningEffort \|\| reasoningEffortFor\(extractOpenAIIntake\(userContent\)\)\)/,
  );
  assert.match(runtime, /reasoning:\s*\{\s*effort:\s*effectiveReasoningEffort\s*\}/);
  assert.match(runtime, /reasoning_effort:\s*effectiveReasoningEffort/,
    'a run timed at medium must not be recorded as high');
});
