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
  const check = "    () => validateGoalComponentCoverageSemantic(candidate, intake, model),\n";
  if (!src.includes(check)) {
    const anchor = "    () => validateProgressionArchitectureSemantic(candidate, intake, model),\n";
    if (!src.includes(anchor)) throw new Error('repairable bundle semantic anchor missing');
    src = src.replace(anchor, anchor + check);
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

patch('engine/phase15_planner.js', (src) => {
  if (!src.includes('HANDSTAND STATIC CAPACITY:')) {
    const anchor = "    if (noReliableHandstandBalance) required.push('HANDSTAND BALANCE PROGRESSION: use wall-facing/back-to-wall work only as alignment support. Progress toward independent balance with controlled kick-up attempts, toe-pulls or brief assisted balance. Count kick-ups as attempts, usually 1-2 per mini-set, rather than fatigue reps. Do not make longer wall holds the main progression metric.');\n";
    if (!src.includes(anchor)) throw new Error('handstand planner anchor missing');
    src = src.replace(anchor, anchor + "    if (noReliableHandstandBalance) required.push('HANDSTAND STATIC CAPACITY: alongside independent balance practice, include a substantive wall-facing or appropriate wall-supported static handstand exposure in most weeks for line awareness, inversion confidence and shoulder endurance. This is required skill-capacity work, not merely a warm-up. Progress position quality before chasing longer fatigue holds.');\n");
  }
  return src;
});

patch('test/fixtures/golden_programs.js', (src) => {
  if (src.includes("'Wall-Facing Handstand Hold'")) return src;
  const monAnchor = "    ['Mon', 'Controlled Handstand Kick-up', 'BW', kickA, '2 attempts', '60s', 'N/A', week === 4\n      ? 'Use the best Week 3 entry pattern. Match or improve the best clean unsupported balance quality/time with fewer total attempts; stop before misses accumulate.'\n      : 'Primary handstand balance practice while fresh. Progress successful entries and independent balance quality, not fatigue.', ''],\n";
  if (!src.includes(monAnchor)) throw new Error('Youth Monday kick-up fixture anchor missing');
  const wallRow = "    ['Mon', 'Wall-Facing Handstand Hold', 'BW', week === 4 ? '3' : '4', week === 1 ? '15-20 sec' : week === 2 ? '20-25 sec' : week === 3 ? '20-30 sec' : '20-25 sec', '60-90s', '6-7', week === 4 ? 'Consolidate the best line from Weeks 2-3 with lower total volume. Finish each hold before shoulder position or rib/pelvis control deteriorates.' : 'Substantive handstand position-capacity work: stacked shoulders, controlled ribs/pelvis and calm breathing. Build clean line and confidence without fatigue failure.', ''],\n";
  return src.replace(monAnchor, monAnchor + wallRow);
});

console.log('Goal-component release gate complete.');
