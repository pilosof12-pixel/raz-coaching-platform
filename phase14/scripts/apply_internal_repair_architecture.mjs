import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(here, '..', 'server.phase15.js');
let src = fs.readFileSync(runtimePath, 'utf8');

function replaceOnce(find, replace, label) {
  if (src.includes(replace)) return;
  const count = src.split(find).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  src = src.replace(find, replace);
}

const helperMarker = '// INTERNAL_QUALITY_REPAIR_ARCHITECTURE';
if (!src.includes(helperMarker)) {
  const anchor = 'async function generateValidatedProgram(intake, onProgress = async () => {}) {';
  const helper = `${helperMarker}\nfunction buildInternalQualityRepairPrompt(intake, candidateProgram, validatorFeedback) {\n  return [\n    'INTERNAL QUALITY REPAIR MODE. This candidate has NOT been approved for the client.',\n    'Repair ONLY the concrete validator defects below. Preserve every unaffected day, exercise, load, set, rep, rest period and coaching decision.',\n    'Do not redesign the block merely to make it different. Do not add filler conditioning. Do not remove a named-goal exposure to solve an unrelated problem.',\n    'EXERCISE-NAME RULE: if a movement is legitimate but the exact display name is not accepted, use the closest canonical exercise name from the supplied coaching system and preserve the intended execution detail in Notes. Never emit [REVIEW], contact-support text, placeholders or an invented exercise.',\n    'EQUIPMENT RULE: replace an unavailable movement only with a movement-family substitute that preserves the training intent. Never use Burpee EMOM, Hill Sprints or other conditioning as a generic substitute for an unavailable strength/skill movement.',\n    'Return the COMPLETE corrected client program, including all four START_WEEKn_TSV / END_WEEKn_TSV blocks. Return no repair commentary outside the normal client-facing program.',\n    '',\n    '=== CLIENT INTAKE ===',\n    JSON.stringify(intake, null, 2),\n    '',\n    '=== VALIDATOR FEEDBACK TO REPAIR ===',\n    String(validatorFeedback || 'Unknown quality failure'),\n    '',\n    '=== CURRENT CANDIDATE PROGRAM ===',\n    String(candidateProgram || ''),\n  ].join('\\n');\n}\n\n`;
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`repair helper anchor expected once, found ${count}`);
  src = src.replace(anchor, helper + anchor);
}

replaceOnce(
  '  const MAX_ATTEMPTS = 3;\n',
  '  const MAX_ATTEMPTS = 4;\n',
  'internal repair attempt budget'
);

replaceOnce(
  '  const failCounts = Object.create(null);\n  let lastValid = null;\n  const deadline = Date.now() + BUILD_JOB_TIMEOUT_MS;\n',
  '  const failCounts = Object.create(null);\n  let lastValid = null;\n  let repairCandidate = null;\n  let repairFeedback = "";\n  const deadline = Date.now() + BUILD_JOB_TIMEOUT_MS;\n',
  'repair candidate state'
);

replaceOnce(
  '    const userContent = amendments.length\n      ? basePrompt + "\\n\\n" + amendments.join("\\n\\n")\n      : basePrompt;\n',
  '    const userContent = repairCandidate\n      ? buildInternalQualityRepairPrompt(intake, repairCandidate, repairFeedback)\n      : (amendments.length ? basePrompt + "\\n\\n" + amendments.join("\\n\\n") : basePrompt);\n',
  'targeted repair prompt routing'
);

const oldCatch = `      if (err && err.code && RETRIABLE_CODES.has(err.code)) {\n        lastValid = program;\n        failCounts[err.code] = (failCounts[err.code] || 0) + 1;\n        console.warn(\n          \`generateValidatedProgram: \${err.code} on attempt \${attempt}/\${MAX_ATTEMPTS} \` +\n            \`(count=\${failCounts[err.code]})\`\n        );\n        await onProgress("refining", attempt, err.code);\n        if (failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) {\n          console.warn(\`generateValidatedProgram: deterministic hard-substitute for \${err.code}\`);\n          program = hardSubstitute(err.code, program, intake);\n          await onProgress("finalizing", attempt, \`deterministic correction for \${err.code}\`);\n          return reformatWarmupCells(program);\n        }\n        if (!amendments.includes(err.amendment)) amendments.push(err.amendment);\n        continue;\n      }\n      throw err;`;

const newCatch = `      const repairable = Boolean(err && (\n        (err.code && RETRIABLE_CODES.has(err.code)) ||\n        err.code === "PHASE15_QUALITY_VIOLATION"\n      ));\n      if (repairable) {\n        lastValid = program;\n        const repairCode = err.code || "INTERNAL_QUALITY_VIOLATION";\n        failCounts[repairCode] = (failCounts[repairCode] || 0) + 1;\n        console.warn(\n          \`generateValidatedProgram: internal repair requested for \${repairCode} on attempt \${attempt}/\${MAX_ATTEMPTS} \` +\n            \`(count=\${failCounts[repairCode]})\`\n        );\n        await onProgress("refining", attempt, \`internal repair: \${repairCode}\`);\n        repairCandidate = program;\n        repairFeedback = err.amendment || err.message || repairCode;\n        continue;\n      }\n      throw err;`;
replaceOnce(oldCatch, newCatch, 'remove hard-substitute downgrade');

const oldTail = `  if (lastValid) {\n    for (const code of Object.keys(failCounts)) lastValid = hardSubstitute(code, lastValid, intake);\n    await onProgress("finalizing", MAX_ATTEMPTS, "using last structurally valid program after deterministic corrections");\n    return reformatWarmupCells(lastValid);\n  }\n  throw new Error(\n    "The program generator returned an unusable result after multiple attempts. Please try again."\n  );`;
const newTail = `  if (lastValid) {\n    const err = new Error("Internal coaching QA could not repair the candidate program after multiple passes. No client-facing program was saved. Please retry the build.");\n    err.code = "INTERNAL_QA_REPAIR_EXHAUSTED";\n    throw err;\n  }\n  throw new Error(\n    "The program generator returned an unusable result after multiple attempts. Please try again."\n  );`;
replaceOnce(oldTail, newTail, 'fail privately after repair exhaustion');

// Extra repair attempts need enough wall-clock headroom. Paid usage is still only
// finalized after a successful saved build, so extending the job window does not
// change commercial consumption semantics.
src = src.replace(
  'const BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || (OPENAI_API_KEY ? 180000 : 210000));',
  'const BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || 300000);'
);

fs.writeFileSync(runtimePath, src);
console.log('Applied internal QA repair architecture: no client REVIEW fallback, no generic hard-substitute delivery.');
