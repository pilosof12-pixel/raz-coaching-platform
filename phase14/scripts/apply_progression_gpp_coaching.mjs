import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function patch(rel, transforms) {
  const p = path.join(root, rel);
  let src = fs.readFileSync(p, 'utf8');
  let changed = false;
  for (const t of transforms) {
    if (t.already && src.includes(t.already)) continue;
    const count = src.split(t.find).length - 1;
    if (count !== 1) throw new Error(`${rel} / ${t.label}: expected one anchor, found ${count}`);
    src = src.replace(t.find, t.replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(p, src);
  console.log(`${rel}: ${changed ? 'progression/GPP coaching applied' : 'already current'}`);
}

patch('engine/phase15_planner.js', [
  {
    label: 'progression/GPP brief import',
    find: "import { buildSpecialistRules } from './phase15_specialist_rules.js';\n",
    replace: "import { buildSpecialistRules } from './phase15_specialist_rules.js';\nimport { buildProgressionGppBrief } from './coaching_progression_gpp.js';\n",
    already: "import { buildProgressionGppBrief } from './coaching_progression_gpp.js';",
  },
  {
    label: 'build progression/GPP brief',
    find: "  const specialist = buildSpecialistRules(intake);\n  return [\n",
    replace: "  const specialist = buildSpecialistRules(intake);\n  const progressionGpp = buildProgressionGppBrief(intake);\n  return [\n",
    already: 'const progressionGpp = buildProgressionGppBrief(intake);',
  },
  {
    label: 'inject progression/GPP brief',
    find: "    specialist,\n    'Session skeleton:',",
    replace: "    specialist,\n    progressionGpp,\n    'Session skeleton:',",
    already: "    progressionGpp,\n    'Session skeleton:',",
  },
]);

patch('server.phase15.js', [
  {
    label: 'production semantic imports',
    find: 'import { validateDirectGoalExposureSemantic, validateSportDayCouplingSemantic, validateWeeklyVolumeBudgetSemantic } from "./engine/semantic_program_qa.js"; // PROGRAM-MODEL-SEMANTIC-QA-WIRED\n',
    replace: 'import { validateDirectGoalExposureSemantic, validateSportDayCouplingSemantic, validateWeeklyVolumeBudgetSemantic } from "./engine/semantic_program_qa.js"; // PROGRAM-MODEL-SEMANTIC-QA-WIRED\nimport { validateProgressionArchitectureSemantic, validateTacticalGppCoverageSemantic } from "./engine/coaching_progression_gpp.js"; // PROGRESSION-GPP-SEMANTIC-QA-WIRED\n',
    already: 'PROGRESSION-GPP-SEMANTIC-QA-WIRED',
  },
  {
    label: 'production progression/GPP validators',
    find: '      validateDirectGoalExposureSemantic(program, intake); // PROGRAM-MODEL-DIRECT-GOAL-EXPOSURE\n',
    replace: '      validateDirectGoalExposureSemantic(program, intake); // PROGRAM-MODEL-DIRECT-GOAL-EXPOSURE\n      validateProgressionArchitectureSemantic(program, intake); // FOUR-WEEK-PROGRESSION-SEMANTICS\n      validateTacticalGppCoverageSemantic(program, intake); // TACTICAL-GPP-PRIORITY-FLOOR\n',
    already: 'TACTICAL-GPP-PRIORITY-FLOOR',
  },
  {
    label: 'make new semantic failures repairable',
    find: '        err.code === "PHASE15_QUALITY_VIOLATION"\n',
    replace: '        err.code === "PHASE15_QUALITY_VIOLATION" ||\n        err.code === "PROGRESSION_ARCHITECTURE_MISSING" ||\n        err.code === "TACTICAL_GPP_COVERAGE_MISSING"\n',
    already: 'err.code === "PROGRESSION_ARCHITECTURE_MISSING"',
  },
]);

console.log('Progression architecture + tactical GPP production wiring complete.');
