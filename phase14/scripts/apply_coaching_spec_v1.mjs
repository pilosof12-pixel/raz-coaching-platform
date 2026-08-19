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

// Keep the frozen rules unchanged while making two implementation details converge:
// 1) a safe negative instruction such as "do not train to failure" must not be
//    mistaken for a failure prescription;
// 2) AH-01 repair feedback must name the concrete dose change required instead of
//    asking the model to infer which lower-priority family to stop progressing.
patch('engine/coaching_spec_v1_quality.js', [
  {
    label: 'youth negation-aware failure classifier',
    find: 'export function validateYouthCoachingSpecV1HardRules(program, intake = {}, suppliedModel = null) {\n',
    replace: `// COACH-SPEC-V1-YOUTH-NEGATION-AWARE\nfunction hasYouthFailureBasedPrescription(value) {\n  const raw = String(value || '');\n  // AMRAP is itself a maximal-effort prescription in this youth contract, so it\n  // remains a hard signal even if surrounding prose later says not to fail.\n  if (/\\bamrap\\b/i.test(raw)) return true;\n  const clauses = raw.split(/[.;\\n]/);\n  for (const clause of clauses) {\n    if (!/(?:to|until)\\s+failure|forced\\s+reps?|grinders?|grinding/i.test(clause)) continue;\n    const negated = /\\b(?:do\\s+not|don't|never|avoid|no|without|stop(?:\\s+well)?\\s+before|stay\\s+short\\s+of|leave[^.;\\n]{0,30}in\\s+reserve)\\b/i.test(clause);\n    if (!negated) return true;\n  }\n  return false;\n}\n\nexport function validateYouthCoachingSpecV1HardRules(program, intake = {}, suppliedModel = null) {\n`,
    already: 'COACH-SPEC-V1-YOUTH-NEGATION-AWARE',
  },
  {
    label: 'youth failure matcher',
    find: "    if (/to failure|amrap|forced rep|grind(?:er|ing)?|until failure/i.test(`${notes} ${exercise?.dose?.reps_raw || ''}`)) {\n",
    replace: "    if (hasYouthFailureBasedPrescription(`${notes} ${exercise?.dose?.reps_raw || ''}`)) {\n",
    already: "if (hasYouthFailureBasedPrescription(`${notes} ${exercise?.dose?.reps_raw || ''}`))",
  },
  {
    label: 'advanced recovery repair convergence guidance',
    find: "      `Coaching Specification v1.0 AH-01: this high-concurrency athlete materially progresses ${families.join(', ')} across the same four-week block. Primary goals must own the recovery budget; secondary/maintenance qualities should be held, micro-dosed or progressed only when clearly low-cost. Repair the lowest-priority stressor first rather than progressing every stated quality at once.`,\n",
    replace: "      `Coaching Specification v1.0 AH-01: this high-concurrency athlete materially progresses ${families.join(', ')} across the same four-week block. Primary goals are ${goals(intake, 'primary') || 'unspecified'}; secondary goals are ${goals(intake, 'secondary') || 'none'}. PRESCRIPTIVE REPAIR: preserve primary-goal progression. Freeze at least one currently progressing secondary family by copying its Week 1 ACTUAL TSV dose into Weeks 2-3 (no increase in load, sets or reps). When Overhead Press is secondary, hold the strict OHP and complementary press dose at Week 1 levels before changing a primary family. Do not solve this with relabeling, justification text or low-cost wording. Change the actual dose so fewer than four families meet the material-progression detector, while preserving all other valid constraints.`,\n",
    already: 'PRESCRIPTIVE REPAIR: preserve primary-goal progression',
  },
  {
    label: 'advanced proactive secondary stability brief',
    find: "      'ADVANCED HYBRID: make goal hierarchy visible in the actual dose. Do not progress every stated quality simultaneously. Primary goals own freshness; secondary goals use minimum effective meaningful work; maintenance stays approximately stable unless explicit recovery headroom justifies development.',\n",
    replace: "      'ADVANCED HYBRID: make goal hierarchy visible in the actual dose. Do not progress every stated quality simultaneously. Primary goals own freshness; secondary goals use minimum effective meaningful work; maintenance stays approximately stable unless explicit recovery headroom justifies development.',\n      'When two primary families coexist with multiple secondary families under heavy sport load, proactively hold secondary pressing at its Week 1 actual dose through build weeks unless the primary recovery budget clearly permits more. Do not wait for a repair pass to remove four-family progression.',\n",
    already: 'proactively hold secondary pressing at its Week 1 actual dose',
  },
]);

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
