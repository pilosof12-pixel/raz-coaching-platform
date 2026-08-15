import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lockFinalPipelineSource } from '../scripts/final_pipeline_lock.mjs';

function fixture() {
  return [
    'import { EXERCISE_DICTIONARY } from "./engine/exercise_dictionary.js";',
    'const BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || (OPENAI_API_KEY ? 180000 : 210000));',
    'async function generateValidatedProgram(intake, onProgress = async () => {}) {',
    '  const MAX_ATTEMPTS = OPENAI_API_KEY ? 1 : 3;',
    '  const basePrompt = buildPrompt(intake);',
    '  const amendments = [];',
    '  const failCounts = Object.create(null);',
    '  let lastValid = null;',
    '  const deadline = Date.now() + BUILD_JOB_TIMEOUT_MS;',
    '',
    '  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {',
    '    const userContent = amendments.length',
    '      ? basePrompt + "\\n\\n" + amendments.join("\\n\\n")',
    '      : basePrompt;',
    '    const raw = await runEngineRaw(userContent);',
    '    let program = fixInvalidExerciseNames(raw); // step 1',
    '    try {',
    '      program = reformatWarmupCells(program);',
    '      validatePhase15FinalProgram(program, intake);',
    '      return program;',
    '    } catch (err) {',
    '      if (err && err.code && RETRIABLE_CODES.has(err.code)) {',
    '        lastValid = program;',
    '        failCounts[err.code] = (failCounts[err.code] || 0) + 1;',
    '        console.warn(',
    '          `generateValidatedProgram: ${err.code} on attempt ${attempt}/${MAX_ATTEMPTS} ` +',
    '            `(count=${failCounts[err.code]})`',
    '        );',
    '        await onProgress("refining", attempt, err.code);',
    '        if (failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) {',
    '          console.warn(`generateValidatedProgram: deterministic hard-substitute for ${err.code}`);',
    '          program = hardSubstitute(err.code, program, intake);',
    '          await onProgress("finalizing", attempt, `deterministic correction for ${err.code}`);',
    '          return reformatWarmupCells(program);',
    '        }',
    '        if (!amendments.includes(err.amendment)) amendments.push(err.amendment);',
    '        continue;',
    '      }',
    '      throw err;',
    '    }',
    '  }',
    '  if (lastValid) {',
    '    for (const code of Object.keys(failCounts)) lastValid = hardSubstitute(code, lastValid, intake);',
    '    await onProgress("finalizing", MAX_ATTEMPTS, "using last structurally valid program after deterministic corrections");',
    '    return reformatWarmupCells(lastValid);',
    '  }',
    '  throw new Error(',
    '    "The program generator returned an unusable result after multiple attempts. Please try again."',
    '  );',
    '}',
    'async function runBuildJob(jobId, token, intake) {',
    '  try {',
    '    const program = privacyScrub(await generateValidatedProgram(intake, progress), intake);',
    '    await progress("finalizing", 0, "saving program");',
    '  } catch (e) {}',
    '}',
  ].join('\n');
}

test('unbenchmarked variation load repair remains wired before coaching QA', () => {
  const out = lockFinalPipelineSource(fixture());
  assert.match(out, /repairUnbenchmarkedVariationLoads/);
  assert.match(out, /UNBENCHMARKED-VARIATION-REPAIR-WIRED/);
  assert.match(out, /repairUnbenchmarkedVariationLoads\(fixInvalidExerciseNames\(raw\), intake\)/);
});

test('all repairable validator failures use one grounded internal repair path', () => {
  const out = lockFinalPipelineSource(fixture());
  assert.match(out, /INTERNAL_QUALITY_REPAIR_ARCHITECTURE/);
  assert.match(out, /const MAX_ATTEMPTS = 4/);
  assert.match(out, /buildInternalQualityRepairPrompt/);
  assert.match(out, /buildDeterministicBrief\(intake\)/);
  assert.match(out, /phase15PromptRules\(intake\)/);
  assert.match(out, /buildPhase15SourceGrounding\(ENGINE, intake, EXERCISE_DICTIONARY\)/);
  assert.match(out, /RETRIABLE_CODES\.has\(err\.code\)/);
  assert.match(out, /PHASE15_QUALITY_VIOLATION/);
  assert.match(out, /repairCandidate = program/);
  assert.match(out, /repairFeedback = err\.amendment/);
});

test('repair prompt forbids review placeholders and unrelated conditioning substitutions', () => {
  const out = lockFinalPipelineSource(fixture());
  assert.match(out, /never emit \[REVIEW\]/i);
  assert.match(out, /Never use Burpee EMOM, Hill Sprints or unrelated conditioning as a generic substitute/i);
  assert.match(out, /preserv(?:e|es) the training intent/i);
});

test('hard-substitute delivery path is removed and exhaustion fails closed', () => {
  const out = lockFinalPipelineSource(fixture());
  const start = out.indexOf('async function generateValidatedProgram');
  const end = out.indexOf('async function runBuildJob');
  const generation = out.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(generation, /hardSubstitute\(/);
  assert.match(generation, /INTERNAL_QA_REPAIR_EXHAUSTED/);
  assert.match(generation, /No client-facing program was saved/);
});

test('the exact client-visible program is revalidated immediately before persistence', () => {
  const out = lockFinalPipelineSource(fixture());
  assert.match(out, /validatePhase15FinalProgram\(program, intake\); \/\/ SAVE-BOUNDARY-FINAL-QA/);
});

test('repair architecture has enough bounded wall-clock headroom', () => {
  const out = lockFinalPipelineSource(fixture());
  assert.match(out, /BUILD_JOB_TIMEOUT_MS = Number\(process\.env\.BUILD_JOB_TIMEOUT_MS \|\| 300000\)/);
});

test('production package builds through the single final pipeline lock', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['phase15:build'], /apply_endurance_semantic_guardrails\.mjs/);
  assert.match(pkg.scripts['phase15:build'], /build_phase15_runtime\.mjs/);
  assert.match(pkg.scripts['phase15:build'], /final_pipeline_lock\.mjs/);
  assert.doesNotMatch(pkg.scripts['phase15:build'], /apply_internal_repair_architecture\.mjs/);
  assert.doesNotMatch(pkg.scripts['phase15:build'], /postprocess_phase15_runtime\.mjs/);
});
