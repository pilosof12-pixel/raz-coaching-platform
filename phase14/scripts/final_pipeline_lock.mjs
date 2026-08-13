import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function lockFinalPipelineSource(input) {
  let s = String(input || '');

  function once(find, replace, label) {
    const count = s.split(find).length - 1;
    if (count !== 1) throw new Error(`Final pipeline lock anchor '${label}' expected once, found ${count}`);
    s = s.replace(find, replace);
  }

  // One model call remains the normal path. A second call is allowed only when
  // deterministic coaching QA rejects the first result and supplies a correction
  // amendment. This prevents a failed QA attempt from becoming a delivered plan.
  once(
    '  const MAX_ATTEMPTS = OPENAI_API_KEY ? 1 : 3;',
    '  const MAX_ATTEMPTS = OPENAI_API_KEY ? 2 : 3; // FINAL-QA-REGEN-BUDGET',
    'OpenAI attempt budget'
  );

  once(
    '      if (err && err.code && RETRIABLE_CODES.has(err.code)) {',
    '      if (err && err.code && (RETRIABLE_CODES.has(err.code) || err.code === "PHASE15_QUALITY_VIOLATION")) { // PHASE15-FINAL-QA-RETRIABLE',
    'Phase15 quality error routing'
  );

  const progressAnchor = '        await onProgress("refining", attempt, err.code);';
  const phase15Handling = [
    progressAnchor,
    '        if (err.code === "PHASE15_QUALITY_VIOLATION") {',
    '          // Final coaching QA is not a hard-substitution problem. Feed its',
    '          // source-aligned amendment back to the model once; if the final',
    '          // attempt still fails, reject the build rather than delivering it.',
    '          if (err.amendment && !amendments.includes(err.amendment)) amendments.push(err.amendment);',
    '          if (attempt < MAX_ATTEMPTS) continue;',
    '          throw err; // FINAL-QA-FAIL-CLOSED',
    '        }',
  ].join('\n');
  once(progressAnchor, phase15Handling, 'Phase15 fail-closed handling');

  // privacyScrub/last-mile normalization can change TSV cells after the in-loop
  // final QA. Revalidate the exact client-visible string immediately after the
  // scrub assignment. The real runtime may place timing/progress code after this
  // line, so deliberately anchor only on the unique assignment itself.
  const saveProgramAnchor = '    const program = privacyScrub(await generateValidatedProgram(intake, progress), intake);';
  once(
    saveProgramAnchor,
    saveProgramAnchor + '\n    validatePhase15FinalProgram(program, intake); // SAVE-BOUNDARY-FINAL-QA',
    'save-boundary final QA'
  );

  return s;
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`)) === selfPath) {
  const runtimePath = fileURLToPath(new URL('../server.phase15.js', import.meta.url));
  const before = fs.readFileSync(runtimePath, 'utf8');
  const after = lockFinalPipelineSource(before);
  fs.writeFileSync(runtimePath, after);
  console.log('Phase15 final pipeline locked: QA regeneration + fail-closed save boundary');
}
