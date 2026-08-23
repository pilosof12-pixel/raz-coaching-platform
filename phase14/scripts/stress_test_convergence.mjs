// One-shot QA / stress test: can the engine repeatedly turn a damaged program
// into a releasable one, without asking the model to try again?
//
// Every live failure this project has had took the same shape. A defect reached
// the QA chain, no deterministic repair existed for it, and the only remedy was
// regeneration -- which costs an attempt, three minutes and a paid API call, and
// frequently produced the same defect again until the attempt budget ran out.
//
// So the question that predicts live behaviour is not "is this program good?"
// but "when this defect appears, does the engine fix it or does it ask again?".
// That question can be answered offline, for free, and repeatably.
//
// Each coach-reviewed program is damaged in the exact ways live runs have failed,
// then put through the real repair and validation bundle. A perturbation that
// converges would have cost nothing live; one that does not would have cost an
// attempt.
//
//   node scripts/stress_test_convergence.mjs          full report
//   node scripts/stress_test_convergence.mjs --quiet  verdict only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';
import { collectRecoveryBudgetFlags } from '../engine/v42_recovery_budget.js';
import { collectProgressionDisciplineFlags } from '../engine/v42_progression_discipline.js';
import { collectGovernanceFlags } from '../engine/v43_coaching_governance.js';
import { collectAllV34ConsistencyFlags } from '../engine/v34_prescription_consistency.js';
import { collectCoachingStandardFlags } from '../engine/v35_coaching_standards.js';
import { collectLanguageAccuracyFlags } from '../engine/v46_language_accuracy.js';
import { collectSpecGapFlags } from '../engine/v49_spec_gap_rules.js';
import { scoreProgram, formatScorecard } from '../engine/v39_coaching_rubric.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = (n) => fs.readFileSync(path.join(root, '..', 'test', 'fixtures', `${n}-program.txt`), 'utf8');
const quiet = process.argv.includes('--quiet');

const INTAKES = {
  advanced_hybrid: {
    age: 30, language: 'en',
    primary_goals: ['220kg back squat', '4 One arm pullups'],
    secondary_goals: ['100kg overhead press', 'Marathon'],
    maintenance_goals: ['Maintain muscle mass'],
    goal_priority_model: 'tiered_equal_primary', experience: 'advanced',
    days_per_week: 4, gym_availability_mode: 'limited',
    available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'], training_location: 'commercial_gym',
    sport: 'MMA', sport_sessions_per_week: 5,
    sport_schedule: [
      { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
      { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
      { day: 'Sat', intensity: 'moderate' },
    ],
    current_numbers: ['Back Squat: 205 kg 1RM', 'One-Arm Pull-up: 2 strict reps each arm',
      'Overhead Press: 80 kg x 4', 'Weighted Chin-up: +80 kg 1RM'].join('\n'),
    notes: 'Running: 1 session a week, about 20 km total.',
    injuries: 'None reported', recovery_rating: 'Good',
  },
  youth_gymnastics: {
    age: 13, language: 'en', experience: 'intermediate',
    primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
    secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
    days_per_week: 2, session_length: '60 min', gym_availability_mode: 'flexible',
    available_gym_days: [], training_location: 'home_gym',
    equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
    injuries: 'None reported', sport_schedule: [], recovery_rating: 'Good',
  },
  tactical_3k: {
    age: 27, language: 'en', experience: 'advanced',
    primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
    secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
    maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic'],
    days_per_week: 3, session_duration_minutes: 60, gym_availability_mode: 'flexible',
    available_gym_days: [], training_location: 'commercial_gym',
    current_numbers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min', 'Back Squat: 140 kg x 5',
      'Deadlift: 180 kg x 3', 'Overhead Press: 65 kg x 5', 'Weighted Pull-up: +30 kg x 5',
      'Strict Pull-ups: 14 reps'].join('\n'),
    notes: 'Currently runs 3 sessions per week, about 18-20 km/week. Recent 400 m repeats are around 1:42-1:45.',
    injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
    sport_schedule: [], recovery_rating: 'Good',
  },
};

// Each perturbation reproduces a defect that has actually failed a live run.
// `applies` keeps a perturbation off avatars where it is meaningless.
const PERTURBATIONS = [
  {
    id: 'false-reduction-claim', seen: 'run #63 Youth, four attempts',
    apply: (p) => p.replace(/\t([^\t]*?)\t\n/, '\tHold the same dose with slightly less total work.\t\n'),
  },
  {
    id: 'unverifiable-load-reference', seen: 'runs #66 and #69 Hybrid, attempt 1',
    apply: (p) => p.replace(/(\n[A-Za-z][^\t]*\t[^\t]+\t[^\t]*\t\d+\t[^\t]*\t[^\t]*\t[^\t]*\t)([^\t]+)/,
      (m, head, note) => `${head}${note} Build toward your +99 kg standard from the last block.`),
  },
  {
    id: 'heavy-ramp-stripped', seen: 'run #67 Hybrid, four attempts',
    apply: (p) => p.replace(/Ramp [^;\t]*?work sets\./g, 'General prep.'),
  },
  {
    id: 'narrative-overclaims-build', seen: 'run #65 Hybrid, four attempts',
    apply: (p) => `The long run builds steadily across the block.\n\n${p}`,
  },
  {
    id: 'miscounted-session-claim', seen: 'coach review, language QA',
    apply: (p) => `You have nine structured sessions each week.\n\n${p}`,
  },
  {
    id: 'skill-ceiling-stripped', seen: 'coach review, item 11',
    applies: ['youth_gymnastics'],
    apply: (p) => p.replace(/ceiling, not a quota[^\t]*/g, 'Complete all prescribed attempts.')
                   .replace(/stop earlier if[^\t.]*\./gi, ''),
  },
  {
    id: 'assisted-exposure-removed', seen: 'runs #66 and #69 Hybrid, four attempts each',
    applies: ['advanced_hybrid'],
    apply: (p) => p.split('\n').filter((l) => !/\tAssisted One-Arm Pull-up\t/.test(l)).join('\n'),
  },
  {
    id: 'optional-finisher-added', seen: 'AH extra-conditioning gate',
    applies: ['advanced_hybrid'],
    apply: (p) => p.replace('END_WEEK1_TSV', 'Sun\tSprint Intervals\tBodyweight\t6\t100 m\t2 min\t9\tFinisher.\t\nEND_WEEK1_TSV'),
  },
  {
    id: 'run-above-demonstrated-baseline', seen: 'AH run-baseline gate',
    applies: ['advanced_hybrid'],
    apply: (p) => p.replace(/\tRun\tN\/A\t1\t\d+(\.\d+)? km\t/, '\tRun\tN/A\t1\t34 km\t'),
  },
  {
    id: 'pull-stacked-on-adjacent-day', seen: 'run #74 Hybrid, four attempts',
    applies: ['advanced_hybrid'],
    apply: (p) => p.replace(/(Tue\tCable Row\t[^\n]*\n)/,
      '$1Tue\tLat Pulldown\tRPE-selected load\t3\t10\t90 sec\t7\tUpper-back volume.\t\n'),
  },
  {
    id: 'maintenance-lift-drifts-up', seen: 'coach review, item 13',
    applies: ['tactical_3k'],
    apply: (p) => p.replace(/(START_WEEK2_TSV[\s\S]*?)(\t)(\d+)( kg\t)/, (m, a, t, kg, u) => `${a}${t}${Number(kg) + 25}${u}`),
  },
];

function allFindings(program, intake, id) {
  return [
    ...auditProgramStructure(program, intake),
    ...collectRecoveryBudgetFlags(program, intake),
    ...collectProgressionDisciplineFlags(program, intake),
    ...collectGovernanceFlags(program, intake),
    ...collectAllV34ConsistencyFlags(program, intake),
    ...collectCoachingStandardFlags(program, intake),
    ...collectLanguageAccuracyFlags(program, intake),
    ...collectSpecGapFlags(program, intake),
  ];
}

function releasable(program, intake) {
  try {
    const r = collectRepairableValidationFailures(program, intake, { skipSkillCalibration: true });
    return { ok: Boolean(r.ok), codes: (r.flags || []).map((f) => f.code).filter(Boolean) };
  } catch (e) {
    return { ok: false, codes: [e?.code || 'THROWN'] };
  }
}

const results = [];
for (const [id, intake] of Object.entries(INTAKES)) {
  const base = fixture(id);
  const cases = [{ id: 'undamaged', apply: (p) => p, seen: 'control' },
    ...PERTURBATIONS.filter((x) => !x.applies || x.applies.includes(id))];

  for (const perturbation of cases) {
    const damaged = perturbation.apply(base);
    const changed = damaged !== base;
    const repaired = repairDeterministicContradictions(damaged, intake);
    const verdict = releasable(repaired.program, intake);
    const findings = allFindings(repaired.program, intake, id);
    const score = scoreProgram(findings, { intake, program: repaired.program });
    results.push({
      avatar: id,
      perturbation: perturbation.id,
      seen: perturbation.seen,
      applied: changed || perturbation.id === 'undamaged',
      converged: verdict.ok,
      residual: verdict.codes,
      overall: score.overall,
      meets9: Boolean(score.meetsNinePlus),
    });
  }
}

// --- report ------------------------------------------------------------------

if (!quiet) {
  for (const avatar of Object.keys(INTAKES)) {
    const rows = results.filter((r) => r.avatar === avatar);
    console.log(`\n${avatar.toUpperCase()}`);
    for (const r of rows) {
      const state = !r.applied ? 'n/a  ' : r.converged ? 'PASS ' : 'ASKS ';
      const detail = r.converged ? `rubric ${r.overall}${r.meets9 ? ' 9+' : ''}` : r.residual.slice(0, 2).join(', ');
      console.log(`  ${state} ${r.perturbation.padEnd(34)} ${detail}`);
    }
  }
}

const applied = results.filter((r) => r.applied);
const per = (a) => {
  const rows = applied.filter((r) => r.avatar === a);
  const converged = rows.filter((r) => r.converged);
  return {
    total: rows.length,
    converged: converged.length,
    rate: rows.length ? Math.round((converged.length / rows.length) * 100) : 0,
    nine: converged.filter((r) => r.meets9).length,
  };
};

const youth = per('youth_gymnastics');
const tactical = per('tactical_3k');
const hybrid = per('advanced_hybrid');

console.log('\n--- convergence: defects repaired without asking the model again ---');
for (const [name, s] of [['youth_gymnastics', youth], ['tactical_3k', tactical], ['advanced_hybrid', hybrid]]) {
  console.log(`  ${name.padEnd(20)} ${s.converged}/${s.total} (${s.rate}%)   rubric 9+: ${s.nine}/${s.converged}`);
}

// Acceptance criteria, stated so the verdict is not a matter of opinion.
//   Youth and Tactical: every defect repaired, and every repaired program at 9+
//     on the engine's own rubric. These two are expected to hold a standard.
//   Hybrid: must reach a releasable program. Its rating is the coach's to give;
//     the bar here is that it stops failing to produce anything at all.
const checks = [
  ['Youth converges on every defect', youth.converged === youth.total],
  ['Youth holds 9+ on every converged program', youth.nine === youth.converged && youth.converged > 0],
  ['Tactical converges on every defect', tactical.converged === tactical.total],
  ['Tactical holds 9+ on every converged program', tactical.nine === tactical.converged && tactical.converged > 0],
  ['Hybrid produces a releasable program', hybrid.converged > 0],
  ['Hybrid converges on every defect', hybrid.converged === hybrid.total],
];

console.log('\n--- acceptance ---');
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
}
const required = checks.slice(0, 5); // the last is aspirational, reported not enforced
const requiredFailed = required.filter(([, ok]) => !ok).length;
console.log(`\nVERDICT: ${requiredFailed === 0 ? 'PASS' : 'FAIL'} (${required.length - requiredFailed}/${required.length} required checks)`);
process.exitCode = requiredFailed === 0 ? 0 : 1;
