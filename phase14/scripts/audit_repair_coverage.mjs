import fs from 'node:fs';
import path from 'node:path';

// Every code observed blocking a live run, with where it was seen.
const SEEN = [
  ['V34_PROGRESSION_LANGUAGE_MISMATCH', '#63 Youth x4'],
  ['WEEKLY_MRV_EXCEEDED', '#65 Hybrid x4, #87 Hybrid x4'],
  ['V35_NARRATIVE_PROGRESSION_CLAIM_UNSUPPORTED', '#65 Hybrid'],
  ['HEAVY_STRENGTH_RAMP_MISSING', '#67 Hybrid x4'],
  ['ADVANCED_HYBRID_OAP_SPECIFICITY', '#70 x4, #84 x3'],
  ['V38_CONSECUTIVE_CONFLICTING_EXPOSURE', '#74 Hybrid'],
  ['TACTICAL_GPP_COVERAGE_MISSING', '#78 Tactical A1'],
  ['V35_BLOCK_SPECIFICITY_OVERSTATED', '#78 Tactical x4'],
  ['EXERCISE_HALLUCINATION', '#84 Hybrid A1'],
  ['COACH_SPEC_V1_AH_ADJACENT_HIGH_STRESS_PULLING', '#84 Hybrid A1'],
  ['V34_NOTE_UNDEFINED_LOAD_REFERENCE', '#84 Hybrid A1'],
  ['TSV_WEEK_BLOCK_MISSING', '#84 Hybrid A1'],
  ['EVENT_PROGRESSING_SESSION_MISSING', '#84 A2, #87 A1'],
  ['ADVANCED_HYBRID_BENCHMARK_LOADING', '#87 Hybrid A1-A2'],
  ['ADVANCED_HYBRID_DENSE_72H_PRIMARY_WINDOW', '#87 Hybrid A1'],
  ['V35_SECONDARY_VOLUME_CREEP', '#87 Hybrid x4'],
  ['ADVANCED_HYBRID_WEEK4_NOT_CONSOLIDATING', '#87 Hybrid A3'],
];

const engineDir = 'engine';
const repairFiles = fs.readdirSync(engineDir)
  .filter((f) => /repair|trim|normalizer|hold|restore|cleanup|governor|protection/i.test(f))
  .map((f) => path.join(engineDir, f));
const repairSrc = repairFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const stress = fs.readFileSync('scripts/stress_test_convergence.mjs', 'utf8');

const rows = SEEN.map(([code, seen]) => {
  // A repair "covers" a code when a repair module names it, or when the module
  // that raises it also exports a repair for it.
  const named = repairSrc.includes(code);
  const stressed = stress.includes(code);
  return { code, seen, repair: named, stress: stressed };
});

const w = Math.max(...rows.map((r) => r.code.length));
console.log('CODE'.padEnd(w), 'REPAIR', 'STRESS', ' SEEN LIVE');
console.log('-'.repeat(w + 30));
for (const r of rows) {
  console.log(
    r.code.padEnd(w),
    (r.repair ? '  yes ' : '  NO  '),
    (r.stress ? ' yes  ' : ' NO   '),
    ' ' + r.seen,
  );
}
const noRepair = rows.filter((r) => !r.repair);
const noStress = rows.filter((r) => !r.stress);
console.log('\n%d of %d live-blocking codes have no deterministic repair', noRepair.length, rows.length);
if (noRepair.length) console.log('   ' + noRepair.map((r) => r.code).join('\n   '));
console.log('\n%d of %d are not covered by the stress test', noStress.length, rows.length);
if (noStress.length) console.log('   ' + noStress.map((r) => r.code).join('\n   '));
