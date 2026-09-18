// What would the coach find in everything we have already delivered?
//
// Until now the only way to know was to send him a program and wait. The
// encoded half of his standard reproduces fifteen of the eighteen findings he
// made on the three he scored, so it is worth pointing at the rest of the
// corpus -- which costs nothing and needs no credits.
//
// This reports findings and severity, NOT a score. A score needs dimension
// scores, and turning a finding into a dimension score is the judgement step
// this deliberately does not fake. Severity is the sum of his own deduction
// table for what was found, which says how much is wrong, not what it rates.
//
//   node scripts/grade_delivered.mjs            summary
//   node scripts/grade_delivered.mjs --detail   every finding

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gradeProgram } from '../engine/coach_rules.js';
import * as SOURCE from '../engine/source_generator_rules.js';
import { collectClaimIntegrityFlags } from '../engine/v93_claim_integrity.js';
import { collectSportStateFlags } from '../engine/v78_sport_taper.js';
import { DEDUCTIONS, selectProgramType } from '../engine/coach_standard.js';
import { CORPUS, readFixture } from './corpus.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = readFixture;
const detail = process.argv.includes('--detail');

// Which deduction each rule corresponds to, so severity is his arithmetic and
// not ours.
const COST = {
  BENCHMARK_UNEXPOSED: 'BENCHMARKED_MOVEMENT_UNEXPOSED',
  INTENSIFICATION_BAND_NOT_REACHED: 'PROGRESSION_SHORT_OF_REQUIRED_INTENSITY',
  GOAL_SPEED_NOT_APPROACHED: 'PROGRESSION_SHORT_OF_REQUIRED_INTENSITY',
  STATED_PROGRESSION_ABSENT: 'TOLERATED_BASELINE_NOT_REBUILT',
  GOAL_DISTANCE_BELOW_TOLERANCE: 'GOAL_DISTANCE_REDUCED_DESPITE_TOLERANCE',
  CONSECUTIVE_TRAINING_DAYS: 'AVOIDABLE_CONSECUTIVE_DAY_CLUSTERING',
  CONSECUTIVE_LOWER_LEG_DAYS: 'AVOIDABLE_CONSECUTIVE_DAY_CLUSTERING',
  CONTINGENCY_CREATES_ADJACENT_DUPLICATE: 'CONTINGENCY_CREATES_DUPLICATE',
  SPORT_STATE_MISDESCRIBED: 'TEXT_CONTRADICTS_TABLE',
  UNSUPPORTED_ATHLETE_FACT: 'UNSUPPORTED_ATHLETE_FACT',
  IMPROVEMENT_GOAL_FLAT: 'IMPROVEMENT_GOAL_UNCHANGED_ALL_BLOCK',
  PRIMARY_LOAD_UNANCHORED: 'LOADING_PRESCRIPTION_UNANCHORED',
  TRAINING_DAYS_VS_INTAKE: 'INTAKE_INTERPRETATION_UNSTATED',
  DAY_MINUS_ONE_STACKED: 'REDUNDANT_COMPETITION_WEEK_EXPOSURE',
  SPORT_SCHEDULE_CHANGED_SILENTLY: 'SPORT_SCHEDULE_SILENTLY_CHANGED',
};

const seenFile = new Set();
const results = [];

for (const [file, intake, scored] of CORPUS) {
  if (seenFile.has(file)) continue;
  seenFile.add(file);
  let program;
  try { program = fx(file); } catch { continue; }
  if (!/START_WEEK1_TSV/i.test(program)) continue;

  // The source Generator Rules live in their own module to avoid an import
  // cycle, so the grader composes both.
  const sourceRules = [SOURCE.neckAxialLockout, SOURCE.tendonPainOverride, SOURCE.headImpactLockout,
    SOURCE.recoveryDayLock, SOURCE.pullingVolumeCap, SOURCE.overheadPressCutoff,
    SOURCE.competitionWeekIntensityCap, SOURCE.footworkPlyoInterlock,
    SOURCE.speedSessionPlyoLockout, SOURCE.speedSessionSeparation,
    SOURCE.mileageTier, SOURCE.wrestlingLowBackLoad];
  const raw = [
    ...gradeProgram(program, intake),
    ...sourceRules.flatMap((fn) => { try { return fn(program, intake); } catch { return []; } }),
    ...collectClaimIntegrityFlags(program, intake).map((f) => ({ rule: 'STATED_PROGRESSION_ABSENT', movement: f.subject, detail: f.detail })),
    ...collectSportStateFlags(program, intake).map((f) => ({ rule: 'SPORT_STATE_MISDESCRIBED', movement: f.day, detail: f.detail })),
  ];
  // One issue, not one per week: a rule firing on four weeks is one finding.
  const distinct = new Map();
  for (const f of raw) {
    const key = `${f.rule}|${f.movement || ''}`;
    if (!distinct.has(key)) distinct.set(key, f);
  }
  const findings = [...distinct.values()];
  // One defect, however many movements carry it. The coach was explicit that a
  // flat, unanchored primary progression is 0.50 for the block and not 0.50 per
  // lift, so these two are charged once each however many rows show them.
  const ONCE = new Set(['IMPROVEMENT_GOAL_FLAT', 'PRIMARY_LOAD_UNANCHORED']);
  const charged = new Set();
  let severity = 0;
  for (const f of findings) {
    const key = ONCE.has(f.rule) ? `${f.rule}|${f.tier || ''}` : `${f.rule}|${f.movement || ''}`;
    if (charged.has(key)) continue;
    charged.add(key);
    severity += f.cost ?? DEDUCTIONS[COST[f.rule]]?.typical ?? 0;
  }
  results.push({ file, type: selectProgramType(intake), scored, findings, severity });
}

results.sort((a, b) => b.severity - a.severity);

console.log('\nGRADED OFFLINE AGAINST THE COACH\'S STANDARD');
console.log('severity is the sum of his deduction table for what was found. It is not a score.\n');
console.log(`  ${'severity'.padStart(8)}  ${'found'.padStart(5)}  ${'coach'.padStart(5)}  program`);
for (const r of results) {
  console.log(`  ${r.severity.toFixed(2).padStart(8)}  ${String(r.findings.length).padStart(5)}  ${(r.scored == null ? '-' : r.scored.toFixed(1)).padStart(5)}  ${r.file}`);
  if (detail) for (const f of r.findings) console.log(`              [${f.rule}] ${String(f.detail).slice(0, 150)}`);
}

const byRule = new Map();
for (const r of results) for (const f of r.findings) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);
console.log('\nMOST COMMON DEFECTS ACROSS THE CORPUS');
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${rule}`);
}
console.log(`\n${results.length} programs, ${[...byRule.values()].reduce((a, b) => a + b, 0)} findings.\n`);
