import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lockFinalPipelineSource } from '../scripts/final_pipeline_lock.mjs';

function fixture() {
  return [
    'async function generateValidatedProgram(intake, onProgress = async () => {}) {',
    '  const MAX_ATTEMPTS = OPENAI_API_KEY ? 1 : 3;',
    '  const amendments = [];',
    '  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {',
    '    try { return program; } catch (err) {',
    '      if (err && err.code && RETRIABLE_CODES.has(err.code)) {',
    '        await onProgress("refining", attempt, err.code);',
    '        if (failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) return hardSubstitute(err.code, program, intake);',
    '        if (!amendments.includes(err.amendment)) amendments.push(err.amendment);',
    '        continue;',
    '      }',
    '      throw err;',
    '    }',
    '  }',
    '}',
    'async function runBuildJob(jobId, token, intake) {',
    '  try {',
    '    const program = privacyScrub(await generateValidatedProgram(intake, progress), intake);',
    '    await progress("finalizing", 0, "saving program");',
    '  } catch (e) {}',
    '}',
  ].join('\n');
}

test('Phase15 QA gets one correction attempt and fails closed instead of hard-substituting', () => {
  const out = lockFinalPipelineSource(fixture());
  assert.match(out, /OPENAI_API_KEY \? 2 : 3/);
  assert.match(out, /PHASE15_QUALITY_VIOLATION/);
  assert.match(out, /if \(attempt < MAX_ATTEMPTS\) continue/);
  assert.match(out, /FINAL-QA-FAIL-CLOSED/);
});

test('the exact client-visible program is revalidated immediately before persistence', () => {
  const out = lockFinalPipelineSource(fixture());
  assert.match(out, /validatePhase15FinalProgram\(program, intake\); \/\/ SAVE-BOUNDARY-FINAL-QA/);
});

test('production package applies the runtime patch once and then the final pipeline lock', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['phase15:build'], /build_phase15_runtime\.mjs/);
  assert.match(pkg.scripts['phase15:build'], /final_pipeline_lock\.mjs/);
  assert.doesNotMatch(pkg.scripts['phase15:build'], /postprocess_phase15_runtime\.mjs/);
});
