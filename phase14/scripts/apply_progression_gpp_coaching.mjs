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
    replace: "import { buildSpecialistRules } from './phase15_specialist_rules.js';\nimport { buildProgressionGppBrief } from './coaching_progression_gpp.js';\nimport { buildAcceptanceQualityBrief } from './coaching_acceptance_quality.js';\nimport { buildConsolidationQualityBrief } from './coaching_consolidation_quality.js';\n",
    already: "import { buildConsolidationQualityBrief } from './coaching_consolidation_quality.js';",
  },
  {
    label: 'tactical 3K/GPP quality brief import',
    find: "import { buildConsolidationQualityBrief } from './coaching_consolidation_quality.js';\n",
    replace: "import { buildConsolidationQualityBrief } from './coaching_consolidation_quality.js';\nimport { buildTactical3KGppQualityBrief } from './tactical_3k_gpp_quality.js';\n",
    already: "import { buildTactical3KGppQualityBrief } from './tactical_3k_gpp_quality.js';",
  },
  {
    label: 'high-concurrency hybrid brief import',
    find: "import { buildTactical3KGppQualityBrief } from './tactical_3k_gpp_quality.js';\n",
    replace: "import { buildTactical3KGppQualityBrief } from './tactical_3k_gpp_quality.js';\nimport { buildAdvancedHybridConcurrencyBrief } from './advanced_hybrid_concurrency.js';\n",
    already: "import { buildAdvancedHybridConcurrencyBrief } from './advanced_hybrid_concurrency.js';",
  },
  {
    label: 'build progression/GPP brief',
    find: "  const specialist = buildSpecialistRules(intake);\n  return [\n",
    replace: "  const specialist = buildSpecialistRules(intake);\n  const progressionGpp = buildProgressionGppBrief(intake);\n  const acceptanceQuality = buildAcceptanceQualityBrief(intake);\n  const consolidationQuality = buildConsolidationQualityBrief(intake);\n  return [\n",
    already: 'const consolidationQuality = buildConsolidationQualityBrief(intake);',
  },
  {
    label: 'build tactical 3K/GPP quality brief',
    find: "  const consolidationQuality = buildConsolidationQualityBrief(intake);\n  return [\n",
    replace: "  const consolidationQuality = buildConsolidationQualityBrief(intake);\n  const tactical3KGppQuality = buildTactical3KGppQualityBrief(intake);\n  return [\n",
    already: 'const tactical3KGppQuality = buildTactical3KGppQualityBrief(intake);',
  },
  {
    label: 'build high-concurrency hybrid brief',
    find: "  const tactical3KGppQuality = buildTactical3KGppQualityBrief(intake);\n  return [\n",
    replace: "  const tactical3KGppQuality = buildTactical3KGppQualityBrief(intake);\n  const advancedHybridConcurrency = buildAdvancedHybridConcurrencyBrief(intake);\n  return [\n",
    already: 'const advancedHybridConcurrency = buildAdvancedHybridConcurrencyBrief(intake);',
  },
  {
    label: 'inject progression/GPP brief',
    find: "    specialist,\n    'Session skeleton:',",
    replace: "    specialist,\n    progressionGpp,\n    acceptanceQuality,\n    consolidationQuality,\n    'Session skeleton:',",
    already: "    progressionGpp,\n    acceptanceQuality,\n    consolidationQuality,",
  },
  {
    label: 'inject tactical 3K/GPP quality brief',
    find: "    consolidationQuality,\n    'Session skeleton:',",
    replace: "    consolidationQuality,\n    tactical3KGppQuality,\n    'Session skeleton:',",
    // Must remain idempotent after the hybrid line is inserted between this
    // brief and Session skeleton.
    already: "    tactical3KGppQuality,",
  },
  {
    label: 'inject high-concurrency hybrid brief',
    find: "    tactical3KGppQuality,\n    'Session skeleton:',",
    replace: "    tactical3KGppQuality,\n    advancedHybridConcurrency,\n    'Session skeleton:',",
    already: "    advancedHybridConcurrency,",
  },
]);

patch('server.phase15.js', [
  {
    label: 'production semantic imports',
    find: 'import { validateDirectGoalExposureSemantic, validateSportDayCouplingSemantic, validateWeeklyVolumeBudgetSemantic } from "./engine/semantic_program_qa.js"; // PROGRAM-MODEL-SEMANTIC-QA-WIRED\n',
    replace: 'import { validateDirectGoalExposureSemantic, validateSportDayCouplingSemantic, validateWeeklyVolumeBudgetSemantic } from "./engine/semantic_program_qa.js"; // PROGRAM-MODEL-SEMANTIC-QA-WIRED\nimport { validateProgressionArchitectureSemantic, validateTacticalGppCoverageSemantic, validateTacticalScheduleArchitectureSemantic, validateKnownMaxPullUpDoseSemantic } from "./engine/coaching_progression_gpp.js"; // PROGRESSION-GPP-SEMANTIC-QA-WIRED\nimport { validateHardRunWarmupSemantic, validateYouthProgressionQualitySemantic } from "./engine/coaching_acceptance_quality.js"; // ACCEPTANCE-QUALITY-SEMANTIC-QA-WIRED\nimport { validateYouthConsolidationRetentionSemantic } from "./engine/coaching_consolidation_quality.js"; // CONSOLIDATION-RETENTION-SEMANTIC-QA-WIRED\n',
    already: 'CONSOLIDATION-RETENTION-SEMANTIC-QA-WIRED',
  },
  {
    label: 'tactical 3K/GPP quality imports',
    find: 'import { validateProgressionArchitectureSemantic, validateTacticalGppCoverageSemantic, validateTacticalScheduleArchitectureSemantic, validateKnownMaxPullUpDoseSemantic } from "./engine/coaching_progression_gpp.js"; // PROGRESSION-GPP-SEMANTIC-QA-WIRED\n',
    replace: 'import { validateProgressionArchitectureSemantic, validateTacticalGppCoverageSemantic, validateTacticalScheduleArchitectureSemantic, validateKnownMaxPullUpDoseSemantic } from "./engine/coaching_progression_gpp.js"; // PROGRESSION-GPP-SEMANTIC-QA-WIRED\nimport { validateTactical3KIntervalProgressionSemantic, validateTacticalStrengthCompletenessSemantic } from "./engine/tactical_3k_gpp_quality.js"; // TACTICAL-3K-GPP-QUALITY-WIRED\n',
    already: 'TACTICAL-3K-GPP-QUALITY-WIRED',
  },
  {
    label: 'production progression/GPP validators',
    find: 'validateDirectGoalExposureSemantic(program, intake);',
    replace: 'validateDirectGoalExposureSemantic(program, intake);\n      validateProgressionArchitectureSemantic(program, intake); // FOUR-WEEK-PROGRESSION-SEMANTICS\n      validateYouthProgressionQualitySemantic(program, intake); // YOUTH-VISIBLE-PROGRESSION-QUALITY\n      validateYouthConsolidationRetentionSemantic(program, intake); // YOUTH-WEEK4-CONSOLIDATION-RETENTION\n      validateTacticalScheduleArchitectureSemantic(program, intake); // TACTICAL-SCHEDULE-ARCHITECTURE\n      validateKnownMaxPullUpDoseSemantic(program, intake); // KNOWN-MAX-PULLUP-DOSE\n      validateTacticalGppCoverageSemantic(program, intake); // TACTICAL-GPP-PRIORITY-FLOOR\n      validateHardRunWarmupSemantic(program, intake); // HARD-RUN-SAME-DAY-WARMUP',
    already: 'YOUTH-WEEK4-CONSOLIDATION-RETENTION',
  },
  {
    label: 'production tactical 3K/GPP quality validators',
    find: '      validateTacticalGppCoverageSemantic(program, intake); // TACTICAL-GPP-PRIORITY-FLOOR\n      validateHardRunWarmupSemantic(program, intake); // HARD-RUN-SAME-DAY-WARMUP',
    replace: '      validateTacticalGppCoverageSemantic(program, intake); // TACTICAL-GPP-PRIORITY-FLOOR\n      validateTacticalStrengthCompletenessSemantic(program, intake); // TACTICAL-STRENGTH-COMPLETENESS\n      validateTactical3KIntervalProgressionSemantic(program, intake); // TACTICAL-3K-INTERVAL-PROGRESSION\n      validateHardRunWarmupSemantic(program, intake); // HARD-RUN-SAME-DAY-WARMUP',
    already: 'TACTICAL-3K-INTERVAL-PROGRESSION',
  },
  {
    label: 'make new semantic failures repairable',
    find: '        err.code === "PHASE15_QUALITY_VIOLATION"\n',
    replace: '        err.code === "PHASE15_QUALITY_VIOLATION" ||\n        err.code === "PROGRESSION_ARCHITECTURE_MISSING" ||\n        err.code === "YOUTH_PROGRESSION_QUALITY_MISSING" ||\n        err.code === "YOUTH_CONSOLIDATION_RESET_TO_BASELINE" ||\n        err.code === "TACTICAL_SCHEDULE_ARCHITECTURE_VIOLATION" ||\n        err.code === "PULL_UP_DOSE_EXCEEDS_KNOWN_CAPACITY" ||\n        err.code === "TACTICAL_GPP_COVERAGE_MISSING" ||\n        err.code === "HARD_RUN_WARMUP_MISSING"\n',
    already: 'err.code === "YOUTH_CONSOLIDATION_RESET_TO_BASELINE"',
  },
  {
    label: 'make tactical 3K/GPP quality failures repairable',
    find: '        err.code === "TACTICAL_GPP_COVERAGE_MISSING" ||\n        err.code === "HARD_RUN_WARMUP_MISSING"\n',
    replace: '        err.code === "TACTICAL_GPP_COVERAGE_MISSING" ||\n        err.code === "TACTICAL_STRENGTH_SESSION_TOO_THIN" ||\n        err.code === "TACTICAL_3K_INTERVAL_PROGRESSION_VIOLATION" ||\n        err.code === "HARD_RUN_WARMUP_MISSING"\n',
    already: 'err.code === "TACTICAL_3K_INTERVAL_PROGRESSION_VIOLATION"',
  },
]);

console.log('Progression architecture + youth progression/consolidation quality + tactical GPP/schedule/dose/3K quality + high-concurrency hybrid planning + warm-up production wiring complete.');
