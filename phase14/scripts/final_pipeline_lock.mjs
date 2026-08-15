import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function lockFinalPipelineSource(input) {
  let s = String(input || '');

  function once(find, replace, label) {
    const count = s.split(find).length - 1;
    if (count !== 1) throw new Error(`Final pipeline lock anchor '${label}' expected once, found ${count}`);
    s = s.replace(find, replace);
  }

  // Load-cell normalization is integrity/autoregulation, not coaching theory:
  // an exact kg may remain only when that exact variation has its own benchmark.
  once(
    'import { EXERCISE_DICTIONARY } from "./engine/exercise_dictionary.js";',
    'import { EXERCISE_DICTIONARY } from "./engine/exercise_dictionary.js";\nimport { repairUnbenchmarkedVariationLoads } from "./engine/phase15_elite_guardrails.js"; // UNBENCHMARKED-VARIATION-REPAIR-WIRED\nimport { validateSportDayCouplingSemantic } from "./engine/semantic_program_qa.js"; // PROGRAM-MODEL-SPORT-COUPLING-WIRED',
    'variation-load and semantic QA imports'
  );

  once(
    '    let program = fixInvalidExerciseNames(raw); // step 1',
    '    let program = repairUnbenchmarkedVariationLoads(fixInvalidExerciseNames(raw), intake); // step 1: DETERMINISTIC-UNBENCHMARKED-LOAD-REPAIR',
    'variation-load repair before QA'
  );

  // The V19 collision rule remains useful, but its old gym-day accounting treated
  // every non-rest endurance day as a strength session. Production now delegates
  // this call to the ProgramModel-backed semantic wrapper.
  once(
    'validateSportDayCoupling(program, intake);',
    'validateSportDayCouplingSemantic(program, intake); // PROGRAM-MODEL-STRENGTH-DAY-ACCOUNTING',
    'semantic sport-day coupling'
  );

  // -----------------------------------------------------------------------
  // INTERNAL QUALITY REPAIR ARCHITECTURE
  // -----------------------------------------------------------------------
  // A validator rejection is never converted to a client-facing placeholder.
  // Attempt 2 repairs the first candidate surgically. If that repair still fails,
  // attempt 3 regenerates cleanly from the original grounded brief plus every exact
  // validator amendment accumulated so far. Attempt 4 may then surgically repair
  // that fresh candidate. This avoids getting trapped editing one poisoned candidate
  // forever while still preserving correct work on the first repair pass.
  const generateAnchor = 'async function generateValidatedProgram(intake, onProgress = async () => {}) {';
  const repairHelper = `// INTERNAL_QUALITY_REPAIR_ARCHITECTURE\nfunction buildInternalQualityRepairPrompt(intake, candidateProgram, validatorFeedback) {\n  const skeleton = buildDeterministicBrief(intake);\n  const quality = phase15PromptRules(intake);\n  const sourceGrounding = buildPhase15SourceGrounding(ENGINE, intake, EXERCISE_DICTIONARY);\n  return [\n    'INTERNAL QUALITY REPAIR MODE. This candidate has NOT been approved for the client.',\n    'Repair ONLY the concrete validator defects below. Preserve every unaffected day, exercise, load, set, rep, rest period and coaching decision.',\n    'Do not redesign the block merely to make it different. Do not add filler conditioning. Do not remove a named-goal exposure to solve an unrelated problem.',\n    'EXERCISE-NAME RULE: if a movement is legitimate but the exact display name is not accepted, use the closest canonical exercise name from the authoritative catalog and preserve the intended execution detail in Notes.',\n    'EQUIPMENT RULE: replace an unavailable movement only with a movement-family substitute that preserves the training intent. Never use Burpee EMOM, Hill Sprints or unrelated conditioning as a generic substitute for an unavailable strength or skill movement.',\n    'CLIENT CLEANLINESS RULE: never emit [REVIEW], contact-support text, QA labels, placeholders or an invented exercise.',\n    'Return the COMPLETE corrected client program with all four START_WEEKn_TSV / END_WEEKn_TSV blocks. Return no repair commentary outside the normal client-facing deliverable.',\n    '',\n    '=== CLIENT INTAKE ===',\n    JSON.stringify(intake, null, 2),\n    '',\n    skeleton,\n    '',\n    quality,\n    '',\n    sourceGrounding,\n    '',\n    '=== VALIDATOR FEEDBACK TO REPAIR ===',\n    String(validatorFeedback || 'Unknown quality failure'),\n    '',\n    '=== CURRENT CANDIDATE PROGRAM ===',\n    String(candidateProgram || ''),\n  ].join('\\n');\n}\n\n`;
  once(generateAnchor, repairHelper + generateAnchor, 'internal repair helper');

  // Four total calls is a hard ceiling, not a normal target. One call remains the
  // happy path; additional calls happen only after deterministic QA rejects a
  // candidate. The job timeout below is expanded to accommodate the rare repair.
  once(
    '  const MAX_ATTEMPTS = OPENAI_API_KEY ? 1 : 3;',
    '  const MAX_ATTEMPTS = 4; // INTERNAL-QA-REPAIR-BUDGET',
    'internal repair attempt budget'
  );

  once(
    '  const failCounts = Object.create(null);\n  let lastValid = null;\n  const deadline = Date.now() + BUILD_JOB_TIMEOUT_MS;',
    '  const failCounts = Object.create(null);\n  let lastValid = null;\n  let repairCandidate = null;\n  let repairFeedback = "";\n  const qaTrace = [];\n  const deadline = Date.now() + BUILD_JOB_TIMEOUT_MS;',
    'internal repair state'
  );

  once(
    '    const userContent = amendments.length\n      ? basePrompt + "\\n\\n" + amendments.join("\\n\\n")\n      : basePrompt;',
    '    const userContent = repairCandidate\n      ? buildInternalQualityRepairPrompt(intake, repairCandidate, repairFeedback)\n      : (amendments.length ? basePrompt + "\\n\\n=== ACCUMULATED QA CORRECTIONS ===\\n" + amendments.join("\\n\\n") : basePrompt);',
    'targeted repair prompt routing'
  );

  const oldCatch = `      if (err && err.code && RETRIABLE_CODES.has(err.code)) {\n        lastValid = program;\n        failCounts[err.code] = (failCounts[err.code] || 0) + 1;\n        console.warn(\n          \`generateValidatedProgram: \${err.code} on attempt \${attempt}/\${MAX_ATTEMPTS} \` +\n            \`(count=\${failCounts[err.code]})\`\n        );\n        await onProgress("refining", attempt, err.code);\n        if (failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) {\n          console.warn(\`generateValidatedProgram: deterministic hard-substitute for \${err.code}\`);\n          program = hardSubstitute(err.code, program, intake);\n          await onProgress("finalizing", attempt, \`deterministic correction for \${err.code}\`);\n          return reformatWarmupCells(program);\n        }\n        if (!amendments.includes(err.amendment)) amendments.push(err.amendment);\n        continue;\n      }\n      throw err;`;
  const newCatch = `      const repairable = Boolean(err && (\n        (err.code && RETRIABLE_CODES.has(err.code)) ||\n        err.code === "PHASE15_QUALITY_VIOLATION"\n      ));\n      if (repairable) {\n        lastValid = program;\n        const repairCode = err.code || "INTERNAL_QUALITY_VIOLATION";\n        const specificCodes = Array.isArray(err.flags) && err.flags.length\n          ? err.flags.map((f) => f && f.code).filter(Boolean)\n          : [repairCode];\n        const repairLabel = specificCodes.length ? specificCodes.join("+") : repairCode;\n        qaTrace.push(\`A\${attempt}:\${repairLabel}\`);\n        failCounts[repairLabel] = (failCounts[repairLabel] || 0) + 1;\n        console.warn(\n          \`generateValidatedProgram: grounded internal repair for \${repairLabel} on attempt \${attempt}/\${MAX_ATTEMPTS} \` +\n            \`(count=\${failCounts[repairLabel]})\`\n        );\n        await onProgress("refining", attempt, \`internal repair: \${repairLabel}\`);\n        repairFeedback = err.amendment || err.message || repairLabel;\n        if (repairFeedback && !amendments.includes(repairFeedback)) amendments.push(repairFeedback);\n        // Attempt 2 is the first surgical edit. If that still fails, attempt 3\n        // starts clean from the original grounded brief plus every accumulated\n        // validator correction. Attempt 4 can surgically repair that fresh result.\n        repairCandidate = attempt === 2 ? null : program; // HYBRID-QA-FRESH-REGEN\n        continue;\n      }\n      throw err;`;
  once(oldCatch, newCatch, 'remove hard-substitute downgrade');

  const oldTail = `  if (lastValid) {\n    for (const code of Object.keys(failCounts)) lastValid = hardSubstitute(code, lastValid, intake);\n    await onProgress("finalizing", MAX_ATTEMPTS, "using last structurally valid program after deterministic corrections");\n    return reformatWarmupCells(lastValid);\n  }\n  throw new Error(\n    "The program generator returned an unusable result after multiple attempts. Please try again."\n  );`;
  const newTail = `  if (lastValid) {\n    const trace = qaTrace.join(" -> ");\n    const debugSuffix = intake && intake.qa_diagnostics === true && trace ? \` QA trace: \${trace}.\` : "";\n    const err = new Error("Internal coaching QA could not repair the candidate program after multiple passes. No client-facing program was saved. Please retry the build." + debugSuffix);\n    err.code = "INTERNAL_QA_REPAIR_EXHAUSTED";\n    err.qa_trace = qaTrace.slice();\n    throw err;\n  }\n  throw new Error(\n    "The program generator returned an unusable result after multiple attempts. Please try again."\n  );`;
  once(oldTail, newTail, 'repair exhaustion fails closed');

  // privacyScrub/last-mile normalization can change TSV cells after in-loop QA.
  // Revalidate the exact client-visible string immediately before persistence.
  const saveProgramAnchor = '    const program = privacyScrub(await generateValidatedProgram(intake, progress), intake);';
  once(
    saveProgramAnchor,
    saveProgramAnchor + '\n    validatePhase15FinalProgram(program, intake); // SAVE-BOUNDARY-FINAL-QA',
    'save-boundary final QA'
  );

  // Rare internal repair attempts need more wall-clock headroom. Paid usage is
  // still finalized only after successful persistence by server_secure.js.
  const timeoutOld = 'const BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || (OPENAI_API_KEY ? 180000 : 210000));';
  if (s.includes(timeoutOld)) {
    s = s.replace(timeoutOld, 'const BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || 300000); // INTERNAL-QA-REPAIR-TIMEOUT');
  }

  return s;
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`)) === selfPath) {
  const runtimePath = fileURLToPath(new URL('../server.phase15.js', import.meta.url));
  const before = fs.readFileSync(runtimePath, 'utf8');
  const after = lockFinalPipelineSource(before);
  fs.writeFileSync(runtimePath, after);
  console.log('Phase15 final pipeline locked: semantic ProgramModel QA + hybrid grounded repair + fail-closed save boundary');
}
