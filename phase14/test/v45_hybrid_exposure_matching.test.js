import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';
import { parseProgramModel } from '../engine/program_model.js';

// Live run #66 lost Advanced Hybrid to four attempts on ADVANCED_HYBRID_OAP_SPECIFICITY.
// The rule asks whether two KINDS of work are present -- strict one-arm pulling
// and a second assistance/volume exposure -- but matched a single exact display
// name for each. The exercise dictionary sanctions several names that deliver
// the same exposure, so a program could satisfy the coaching intent and still be
// rejected, and no rewording of that program could ever pass. Three runs, three
// different Hybrid failures; this was the third.

const root = path.dirname(fileURLToPath(import.meta.url));
const HYBRID = {
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
  current_numbers: [
    'Back Squat: 205 kg 1RM', 'One-Arm Pull-up: 2 strict reps each arm',
    'Overhead Press: 80 kg x 4', 'Weighted Chin-up: +80 kg 1RM',
  ].join('\n'),
  injuries: 'None reported',
};

const goldenPath = path.join(root, 'fixtures', 'advanced_hybrid-program.txt');
const golden = fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf8') : null;

const codeFor = (program) => {
  try {
    validateAdvancedHybridQualitySemantic(program, HYBRID, parseProgramModel(program, HYBRID));
    return null;
  } catch (e) { return e.code; }
};

test('[H1] the coach-reviewed live program still passes unchanged', { skip: !golden }, () => {
  assert.equal(codeFor(golden), null);
});

test('[H2] every strict one-arm name the dictionary defines counts as strict work', { skip: !golden }, () => {
  for (const name of ['Weighted One-Arm Pull-up', 'One-Arm Chin-up']) {
    const swapped = golden.replace(/\tOne-Arm Pull-up\t/g, `\t${name}\t`);
    assert.equal(codeFor(swapped), null, `${name} is strict unilateral work`);
  }
});

test('[H3] every assisted variant counts as the second exposure', { skip: !golden }, () => {
  for (const name of ['Band-Assisted One-Arm Pull-Up', 'Band-Assisted One-Arm Pull-up Eccentric']) {
    const swapped = golden.replace(/\tAssisted One-Arm Pull-up\t/g, `\t${name}\t`);
    assert.equal(codeFor(swapped), null, `${name} is an assistance exposure`);
  }
});

test('[H4] a strict overhead press goal accepts the barbell names, not dumbbells', { skip: !golden }, () => {
  assert.equal(codeFor(golden.replace(/\tOverhead Press\t/g, '\tStanding Barbell Overhead Press\t')), null);
  // A dumbbell press is a different exposure and must not satisfy a barbell goal.
  assert.equal(codeFor(golden.replace(/\tOverhead Press\t/g, '\tDumbbell Overhead Press\t')), 'ADVANCED_HYBRID_OHP_ARCHITECTURE');
});

test('[H5] the rule still rejects what it exists to reject', { skip: !golden }, () => {
  // Regressing an athlete who owns strict reps to prerequisite-only work.
  assert.equal(codeFor(golden.replace(/\tOne-Arm Pull-up\t/g, '\tOne-Arm Pull-up Eccentric\t')), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
  // Dropping the assistance/volume exposure entirely.
  const noAssisted = golden.split('\n').filter((l) => !/\tAssisted One-Arm Pull-up\t/.test(l)).join('\n');
  assert.equal(codeFor(noAssisted), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
});

test('[H6] bilateral pulling never substitutes for a unilateral exposure', { skip: !golden }, () => {
  assert.equal(codeFor(golden.replace(/\tOne-Arm Pull-up\t/g, '\tPull-up\t')), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
});

// --- the repair that ends the loop -------------------------------------------

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';

// Runs #66 and #69 each spent four attempts on ADVANCED_HYBRID_OAP_SPECIFICITY.
// Widening the matchers was correct but was not the cause: the dictionary holds
// no unilateral pulling name the matchers miss, so the exposure was simply
// absent. The planner brief already specifies this exposure and its dose, so the
// engine writes it rather than asking the model a fifth time.

const strippedGolden = golden && golden.split('\n').filter((l) => !/\tAssisted One-Arm Pull-up\t/.test(l)).join('\n');

test('[H7] a missing assistance exposure is written, not regenerated', { skip: !golden }, () => {
  assert.equal(codeFor(strippedGolden), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
  const repaired = repairDeterministicContradictions(strippedGolden, HYBRID);
  assert.equal(codeFor(repaired.program), null, 'one pass must clear the gate');
  assert.equal(repaired.repairs.filter((r) => r.type === 'v47_oap_assistance_added').length, 4, 'every week needs the exposure');
});

test('[H8] the exposure lands on one of the athlete\'s own gym days', { skip: !golden }, () => {
  // The first version picked the lightest day overall and landed on the running
  // day, inventing a strength session and trading one hard failure for
  // ADVANCED_HYBRID_CALENDAR_DRIFT.
  const repaired = repairDeterministicContradictions(strippedGolden, HYBRID);
  for (const r of repaired.repairs.filter((x) => x.type === 'v47_oap_assistance_added')) {
    assert.ok(HYBRID.available_gym_days.includes(r.day), `${r.day} is not a stated gym day`);
    assert.notEqual(r.day, r.strictDay, 'the microdose never doubles up on the strict day');
  }
});

test('[H12] placement avoids the day next to the strict exposure', { skip: !golden }, () => {
  // Two rules pull against each other here: one requires a second unilateral
  // exposure every week, the other forbids conflicting exposures on consecutive
  // days. Run #70 showed the model resolving that by placing the assistance
  // work next to the strict work and failing V38_CONSECUTIVE_CONFLICTING_EXPOSURE
  // four times. Choosing the day deliberately satisfies both.
  const repaired = repairDeterministicContradictions(strippedGolden, HYBRID);
  const gap = (a, b) => {
    const week = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const i = week.indexOf(a.slice(0, 3).toLowerCase());
    const j = week.indexOf(b.slice(0, 3).toLowerCase());
    return Math.min((j - i + 7) % 7, (i - j + 7) % 7);
  };
  for (const r of repaired.repairs.filter((x) => x.type === 'v47_oap_assistance_added')) {
    assert.ok(gap(r.strictDay, r.day) > 1, `${r.day} is adjacent to the strict day ${r.strictDay}`);
  }
  assert.deepEqual(auditProgramStructure(repaired.program, HYBRID).filter((f) => f.severity === 'hard'), []);
});

test('[H9] the repair introduces no structural failure', { skip: !golden }, () => {
  const before = auditProgramStructure(strippedGolden, HYBRID).filter((f) => f.severity === 'hard').length;
  const after = auditProgramStructure(repairDeterministicContradictions(strippedGolden, HYBRID).program, HYBRID)
    .filter((f) => f.severity === 'hard').length;
  assert.ok(after <= before);
});

test('[H10] a program that already has both exposures is untouched, and the repair is idempotent', { skip: !golden }, () => {
  const clean = repairDeterministicContradictions(golden, HYBRID);
  assert.equal(clean.repairs.filter((r) => r.type === 'v47_oap_assistance_added').length, 0);
  const once = repairDeterministicContradictions(strippedGolden, HYBRID);
  assert.equal(repairDeterministicContradictions(once.program, HYBRID).program, once.program);
});

test('[H11] a week with no strict work at all is left for regeneration', { skip: !golden }, () => {
  // Inserting a strict one-arm pull-up would be inventing training rather than
  // completing it, so that failure stays the model's to fix.
  const noStrict = golden.replace(/\tOne-Arm Pull-up\t/g, '\tOne-Arm Pull-up Eccentric\t');
  const repaired = repairDeterministicContradictions(noStrict, HYBRID);
  assert.equal(repaired.repairs.filter((r) => r.type === 'v47_oap_assistance_added').length, 0);
  assert.equal(codeFor(repaired.program), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
});

// --- the two rules that state their own remedy --------------------------------

// One says to remove optional intervals, sprints, finishers and metcons; the
// other says Week 1 running must not exceed what the athlete has demonstrated.
// Both are the coach's cut order applied to the lowest-priority stressor, and
// both were left to regeneration -- which had to rewrite an entire program to
// delete a finisher.

const HYBRID_RUN = { ...HYBRID, notes: 'Running: 1 session a week, about 20 km total.' };

test('[H12] an optional conditioning finisher is deleted, not regenerated', { skip: !golden }, () => {
  const withFinisher = golden.replace('END_WEEK1_TSV', 'Sun\tSprint Intervals\tBodyweight\t6\t100 m\t2 min\t9\tFinisher.\t\nEND_WEEK1_TSV');
  assert.equal(codeFor(withFinisher), 'ADVANCED_HYBRID_EXTRA_HARD_CONDITIONING');
  const repaired = repairDeterministicContradictions(withFinisher, HYBRID_RUN);
  assert.equal(codeFor(repaired.program), null);
  assert.ok(repaired.repairs.some((r) => r.type === 'v49_optional_conditioning_removed'));
  assert.doesNotMatch(repaired.program, /Sprint Intervals/);
});

test('[H13] a movement is judged by its own name, never by its coaching note', { skip: !golden }, () => {
  // Prose may legitimately say "without intervals"; deleting a row for its note
  // would remove real training over a turn of phrase.
  const prose = golden.replace(/\tSubmaximal support\./, '\tSteady aerobic work without intervals or sprints.');
  const repaired = repairDeterministicContradictions(prose, HYBRID_RUN);
  assert.equal(repaired.repairs.filter((r) => r.type === 'v49_optional_conditioning_removed').length, 0);
});

test('[H14] Week 1 running is held at the demonstrated baseline', { skip: !golden }, () => {
  const over = golden.replace(/\tRun\tN\/A\t1\t16 km\t/, '\tRun\tN/A\t1\t26 km\t');
  const repaired = repairDeterministicContradictions(over, HYBRID_RUN);
  const held = repaired.repairs.find((r) => r.type === 'v49_run_held_at_baseline');
  assert.ok(held, 'building from above a demonstrated baseline is the jump an injury history warns about');
  assert.equal(held.from_km, 26);
  assert.equal(held.to_km, 20);
  assert.match(repaired.program, /\tRun\tN\/A\t1\t20 km\t/);
});

test('[H15] neither repair touches a program already inside its limits', { skip: !golden }, () => {
  const out = repairDeterministicContradictions(golden, HYBRID_RUN);
  assert.deepEqual(out.repairs.filter((r) => r.type.startsWith('v49_optional') || r.type.startsWith('v49_run')), []);
});

test('[H16] an athlete with no stated running volume is not second-guessed', { skip: !golden }, () => {
  const over = golden.replace(/\tRun\tN\/A\t1\t16 km\t/, '\tRun\tN/A\t1\t26 km\t');
  const noBaseline = repairDeterministicContradictions(over, { ...HYBRID, notes: '' });
  assert.equal(noBaseline.repairs.filter((r) => r.type === 'v49_run_held_at_baseline').length, 0);
});

// --- pulling stacked on consecutive days --------------------------------------

import { auditCircularScheduling, auditProgramStructure as auditStructure } from '../engine/v38_structural_audit.js';

// Live run #74 lost Hybrid to V38_CONSECUTIVE_CONFLICTING_EXPOSURE on all four
// attempts. This athlete trains Mon, Tue, Fri and Sun, so on a circular week
// three of the four possible pairs are adjacent, and the rule accumulates: one
// heavy vertical pull scores 3, but two light ones also reach 3. The
// coach-reviewed program is clean and sits exactly one accessory row from the
// edge, which is why the model kept landing on the wrong side of it.
const addPullAccessory = (p) => p.replace(/(Tue\tCable Row\t[^\n]*\n)/,
  '$1Tue\tLat Pulldown\tRPE-selected load\t3\t10\t90 sec\t7\tUpper-back volume.\t\n');

test('[H17] one accessory too many on the adjacent day is thinned, not regenerated', { skip: !golden }, () => {
  const clashing = addPullAccessory(golden);
  assert.equal(auditCircularScheduling(clashing, HYBRID).length, 1);
  const repaired = repairDeterministicContradictions(clashing, HYBRID);
  assert.equal(auditCircularScheduling(repaired.program, HYBRID).length, 0);
  const thinned = repaired.repairs.filter((r) => r.type === 'v50_consecutive_pull_thinned');
  assert.ok(thinned.length);
  assert.equal(thinned[0].exercise, 'Lat Pulldown');
});

test('[H18] the required One-Arm Pull-up exposures are never the ones removed', { skip: !golden }, () => {
  // Removing one to satisfy this rule would simply fail the other.
  const repaired = repairDeterministicContradictions(addPullAccessory(golden), HYBRID);
  assert.equal(codeFor(repaired.program), null, 'the Advanced Hybrid rules must still pass');
  assert.match(repaired.program, /\tOne-Arm Pull-up\t/);
  assert.match(repaired.program, /\tAssisted One-Arm Pull-up\t/);
});

test('[H19] the repair leaves the program structurally better, never worse', { skip: !golden }, () => {
  const clashing = addPullAccessory(golden);
  const before = auditStructure(clashing, HYBRID).filter((f) => f.severity === 'hard').length;
  const after = auditStructure(repairDeterministicContradictions(clashing, HYBRID).program, HYBRID)
    .filter((f) => f.severity === 'hard').length;
  assert.ok(after < before, `expected the clash to clear: ${before} -> ${after}`);
});

test('[H20] a program with no clash is untouched, and the repair is idempotent', { skip: !golden }, () => {
  assert.equal(repairDeterministicContradictions(golden, HYBRID).repairs
    .filter((r) => r.type === 'v50_consecutive_pull_thinned').length, 0);
  const once = repairDeterministicContradictions(addPullAccessory(golden), HYBRID);
  assert.equal(repairDeterministicContradictions(once.program, HYBRID).program, once.program);
});
