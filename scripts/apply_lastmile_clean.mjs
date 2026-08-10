import fs from 'node:fs';

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const originalBuilder = b;

const plannerImport = 'import { buildDeterministicBrief } from "./engine/phase15_planner.js";';
if (!b.includes('phase15_source_router.js')) {
  if (!b.includes(plannerImport)) throw new Error('source-router import anchor missing');
  b = b.replace(
    plannerImport,
    plannerImport + '\\nimport { buildPhase15SourceGrounding } from "./engine/phase15_source_router.js";\\nimport { EXERCISE_DICTIONARY } from "./engine/exercise_dictionary.js";'
  );
}

const devAnchor = '  "You are the RAZ Performance coaching model inside a deterministic programming system.",\\n';
if (!b.includes('SOURCE-GROUNDING HARD CONTRACT')) {
  if (!b.includes(devAnchor)) throw new Error('developer source-contract anchor missing');
  b = b.replace(
    devAnchor,
    devAnchor +
    '  "SOURCE-GROUNDING HARD CONTRACT: programming policy must come from the DETERMINISTIC PROGRAM SKELETON, PHASE 15 QUALITY GATE, GOAL-SPECIFIC SPECIALIST RULES, and CURATED COACHING SOURCE EXCERPTS supplied for this athlete. Do not use generic model memory to invent training principles, progressions, set-volume policy, conditioning policy, recovery policy or exercise variations that are absent from those authored sources.",\\n' +
    '  "EXERCISE CLOSED SET: every Exercise-column value must be an exact canonical name from CANONICAL EXERCISE CATALOG, except the permitted [WARMUP] prefix. Do not paraphrase, pluralize, qualify or rename exercises. Known aliases are normalized by the deterministic server and are not permission to emit free-form synonyms.",\\n'
  );
}

const qualityAnchor = '  const quality = phase15PromptRules(intake);\\n  return [';
if (!b.includes('buildPhase15SourceGrounding(ENGINE, intake, EXERCISE_DICTIONARY)')) {
  if (!b.includes(qualityAnchor)) throw new Error('compact source-grounding anchor missing');
  b = b.replace(
    qualityAnchor,
    '  const quality = phase15PromptRules(intake);\\n  const sourceGrounding = buildPhase15SourceGrounding(ENGINE, intake, EXERCISE_DICTIONARY);\\n  return ['
  );
}

const arrayAnchor = '    quality,\\n    "",\\n    "=== COMPACT OUTPUT CONTRACT ===",';
if (!b.includes('    sourceGrounding,\\n')) {
  if (!b.includes(arrayAnchor)) throw new Error('compact source block anchor missing');
  b = b.replace(
    arrayAnchor,
    '    quality,\\n    "",\\n    sourceGrounding,\\n    "",\\n    "=== COMPACT OUTPUT CONTRACT ===",'
  );
}

b = b.replaceAll('deterministic-skeleton-v5.2.8-warrior-delivery', 'deterministic-skeleton-v5.2.9-source-grounded');
b = b.replaceAll('raz-phase15-warrior-v5-2-8', 'raz-phase15-source-grounded-v5-2-9');

if (b !== originalBuilder) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== originalBuilder ? 'wired curated source grounding + closed exercise set' : 'already current'}`);
