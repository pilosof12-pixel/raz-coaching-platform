import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function patch(rel, transforms, { optional = false } = {}) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    if (optional) return console.log(`${rel}: optional target absent`);
    throw new Error(`${rel}: target missing`);
  }
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
  console.log(`${rel}: ${changed ? 'Coaching Spec v1.0 applied' : 'already current'}`);
}

patch('engine/repairable_validation_bundle.js', [
  {
    label: 'coaching spec import',
    find: "import {\n  validateYouthManualAcceptanceSemantic,\n  validateAdvancedHybridManualAcceptanceSemantic,\n} from './manual_acceptance_quality.js';\n",
    replace: "import {\n  validateYouthManualAcceptanceSemantic,\n  validateAdvancedHybridManualAcceptanceSemantic,\n} from './manual_acceptance_quality.js';\nimport {\n  validateAdvancedHybridCoachingSpecV1,\n  validateYouthCoachingSpecV1HardRules,\n  validateTactical3KCoachingSpecV1,\n} from './coaching_spec_v1_quality.js'; // COACHING-SPEC-V1-HARD-RULES\n",
    already: 'COACHING-SPEC-V1-HARD-RULES',
  },
  {
    // IMPORTANT: anchor to one stable validator line, not adjacency between two
    // validators. Earlier phase15:build patches legitimately insert validators in
    // this list before Coaching Spec v1 runs in production.
    label: 'coaching spec semantic checks',
    find: "    () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, model),\n",
    replace: "    () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, model),\n    () => validateAdvancedHybridCoachingSpecV1(candidate, intake, model),\n    () => validateYouthCoachingSpecV1HardRules(candidate, intake, model),\n    () => validateTactical3KCoachingSpecV1(candidate, intake, model),\n",
    already: '() => validateAdvancedHybridCoachingSpecV1(candidate, intake, model),',
  },
  {
    label: 'coaching spec final-boundary checks',
    find: "  runRepairable(flags, () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, finalModel));\n",
    replace: "  runRepairable(flags, () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, finalModel));\n  runRepairable(flags, () => validateAdvancedHybridCoachingSpecV1(candidate, intake, finalModel));\n  runRepairable(flags, () => validateYouthCoachingSpecV1HardRules(candidate, intake, finalModel));\n  runRepairable(flags, () => validateTactical3KCoachingSpecV1(candidate, intake, finalModel));\n",
    already: 'validateTactical3KCoachingSpecV1(candidate, intake, finalModel)',
  },
]);

const plannerPath = path.join(root, 'engine/phase15_planner.js');
if (fs.existsSync(plannerPath)) {
  const planner = fs.readFileSync(plannerPath, 'utf8');
  if (planner.includes("import { buildAdvancedHybridConcurrencyBrief } from './advanced_hybrid_concurrency.js';")) {
    patch('engine/phase15_planner.js', [
      {
        label: 'coaching spec planner import',
        find: "import { buildAdvancedHybridConcurrencyBrief } from './advanced_hybrid_concurrency.js';\n",
        replace: "import { buildAdvancedHybridConcurrencyBrief } from './advanced_hybrid_concurrency.js';\nimport { buildCoachingSpecV1Brief } from './coaching_spec_v1_quality.js'; // COACHING-SPEC-V1-BRIEF\n",
        already: 'COACHING-SPEC-V1-BRIEF',
      },
      {
        // Same rule as the validator bundle: do not depend on the following line
        // remaining adjacent after earlier production patches run.
        label: 'coaching spec planner build',
        find: "  const advancedHybridConcurrency = buildAdvancedHybridConcurrencyBrief(intake);\n",
        replace: "  const advancedHybridConcurrency = buildAdvancedHybridConcurrencyBrief(intake);\n  const coachingSpecV1 = buildCoachingSpecV1Brief(intake);\n",
        already: 'const coachingSpecV1 = buildCoachingSpecV1Brief(intake);',
      },
      {
        label: 'coaching spec planner inject',
        find: "    advancedHybridConcurrency,\n",
        replace: "    advancedHybridConcurrency,\n    coachingSpecV1,\n",
        already: '    coachingSpecV1,',
      },
    ]);
  } else {
    console.log('engine/phase15_planner.js: progression/GPP brief not yet installed; prompt injection deferred to phase15:build order');
  }
}

console.log('Frozen Coaching Specification v1.0 hard-rule and prompt wiring complete.');
