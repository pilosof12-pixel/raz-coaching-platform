import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function patch(rel, transform) {
  const p = path.join(root, rel);
  let src = fs.readFileSync(p, 'utf8');
  const next = transform(src);
  if (next === src) console.log(`${rel}: already current`);
  else {
    fs.writeFileSync(p, next);
    console.log(`${rel}: goal-component release gate applied`);
  }
}

patch('engine/repairable_validation_bundle.js', (src) => {
  if (!src.includes("validateGoalComponentCoverageSemantic")) {
    const anchor = "import { validateYouthConsolidationRetentionSemantic } from './coaching_consolidation_quality.js';\n";
    if (!src.includes(anchor)) throw new Error('repairable bundle import anchor missing');
    src = src.replace(anchor, anchor + "import { validateGoalComponentCoverageSemantic } from './goal_progression_graph.js';\n");
  }
  if (!src.includes("validateAdvancedHybridQualitySemantic")) {
    const anchor = "import { validateGoalComponentCoverageSemantic } from './goal_progression_graph.js';\n";
    if (!src.includes(anchor)) throw new Error('advanced hybrid import anchor missing');
    src = src.replace(anchor, anchor + "import { validateAdvancedHybridQualitySemantic } from './advanced_hybrid_quality.js';\n");
  }
  const goalCheck = "    () => validateGoalComponentCoverageSemantic(candidate, intake, model),\n";
  if (!src.includes(goalCheck)) {
    const anchor = "    () => validateProgressionArchitectureSemantic(candidate, intake, model),\n";
    if (!src.includes(anchor)) throw new Error('repairable bundle semantic anchor missing');
    src = src.replace(anchor, anchor + goalCheck);
  }
  const hybridCheck = "    () => validateAdvancedHybridQualitySemantic(candidate, intake, model),\n";
  if (!src.includes(hybridCheck)) {
    const anchor = "    () => validateGoalComponentCoverageSemantic(candidate, intake, model),\n";
    if (!src.includes(anchor)) throw new Error('advanced hybrid semantic anchor missing');
    src = src.replace(anchor, anchor + hybridCheck);
  }
  return src;
});

patch('engine/exercise_dictionary.js', (src) => {
  if (!src.includes('"GOAL_COMPONENT_COVERAGE_MISSING"')) {
    const anchor = '  "SKILL_PREREQ_VIOLATION", "SKILL_UNDER_PROGRAMMED",\n]);';
    if (!src.includes(anchor)) throw new Error('retriable code anchor missing');
    src = src.replace(anchor, '  "SKILL_PREREQ_VIOLATION", "SKILL_UNDER_PROGRAMMED", "GOAL_COMPONENT_COVERAGE_MISSING",\n]);');
  }
  return src;
});

patch('engine/client_output_qa.js', (src) => {
  if (!src.includes('GOAL_COMPONENT_COVERAGE_MISSING')) {
    const anchor = 'TARGET_MODALITY_EXPOSURE_REDUCED|PHASE15_QUALITY_VIOLATION)';
    if (!src.includes(anchor)) throw new Error('client-output validator code anchor missing');
    src = src.replace(anchor, 'TARGET_MODALITY_EXPOSURE_REDUCED|GOAL_COMPONENT_COVERAGE_MISSING|PHASE15_QUALITY_VIOLATION)');
  }
  return src;
});

// Keep the Youth golden fixture aligned with the same coaching constraints the
// production validators already enforce. This mutates test data only; it does not
// relax or alter any client-facing validator or generation rule.
patch('test/fixtures/golden_programs.js', (src) => {
  const youthMarker = 'export const YOUTH_GYMNASTICS_INTAKE = {';
  const youthIndex = src.indexOf(youthMarker);
  if (youthIndex < 0) throw new Error('Youth golden fixture marker missing');

  const head = src.slice(0, youthIndex);
  let youth = src.slice(youthIndex);

  if (!youth.includes("'Wall Handstand Hold'")) {
    const monAnchor = "    ['Mon', 'Controlled Handstand Kick-up', 'BW', kickA, '2 attempts', '60s', 'N/A', week === 4\n      ? 'Use the best Week 3 entry pattern. Match or improve the best clean unsupported balance quality/time with fewer total attempts; stop before misses accumulate.'\n      : 'Primary handstand balance practice while fresh. Progress successful entries and independent balance quality, not fatigue.', ''],\n";
    if (!youth.includes(monAnchor)) throw new Error('Youth Monday kick-up fixture anchor missing');
    const wallRow = "    ['Mon', 'Wall Handstand Hold', 'BW', week === 4 ? '3' : '4', week === 1 ? '15-20 sec' : week === 2 ? '20-25 sec' : week === 3 ? '20-30 sec' : '20-25 sec', '60-90s', '6-7', week === 4 ? 'Use a wall-facing setup when appropriate. Consolidate the best line from Weeks 2-3 with lower total volume and stop before shoulder position or rib/pelvis control deteriorates.' : 'Use a wall-facing setup when appropriate. Substantive handstand position-capacity work: stacked shoulders, controlled ribs/pelvis and calm breathing. Build clean line and confidence without fatigue failure.', ''],\n";
    youth = youth.replace(monAnchor, monAnchor + wallRow);
  }

  youth = youth
    .replace("const kickA = ['4', '5', '6', '4'][week - 1];", "const kickA = ['4', '5', '5', '4'][week - 1];")
    .replace("const kickB = ['5', '5', '6', '4'][week - 1];", "const kickB = ['5', '5', '5', '4'][week - 1];")
    .replace("const ring = ['5', '6', '7', '6-7'][week - 1];", "const ring = ['3', '4', '4', '4'][week - 1];")
    .replaceAll("    ['Mon',", "    ['Session A',")
    .replaceAll("    ['Thu',", "    ['Session B',");

  return head + youth;
});

console.log('Goal-component release gate complete.');
