import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  contraindicated, forbiddenMovements, isDischarged,
  collectInjuryConstraintFlags, buildInjuryConstraintBrief,
} from '../engine/v84_injury_constraint.js';

const HARD = JSON.parse(fs.readFileSync(new URL('./fixtures/hard_avatars.json', import.meta.url), 'utf8'));
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const BASE = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');

test("what the athlete says they cannot do is read back out", () => {
  assert.match(contraindicated(HARD.masters_return).join(' '), /loaded spinal flexion under fatigue/i);
  assert.match(contraindicated(HARD.inseason_footballer).join(' '), /eccentric hamstring work the day before a match/i);
  assert.match(contraindicated(COMP.mma_fight_camp).join(' '), /heavy back squat/i);
});

test('a named exercise is extracted; a mechanism is not forced into one', () => {
  assert.deepEqual(forbiddenMovements(COMP.mma_fight_camp), ['back squat']);
  // "loaded spinal flexion" names a position, not an exercise, and inventing a
  // list from it would be guessing on the athlete's behalf.
  assert.deepEqual(forbiddenMovements(HARD.masters_return), []);
});

test('an athlete who has been discharged is trained, not treated', () => {
  assert.equal(isDischarged(HARD.masters_return), true);
  assert.equal(isDischarged(HARD.inseason_footballer), false);
  const brief = buildInjuryConstraintBrief(HARD.masters_return);
  assert.match(brief, /Train them\./);
  assert.match(brief, /Do not write a rehabilitation programme/);
  assert.match(brief, /goal movement is also the movement that injured them/);
});

test('the brief quotes the athlete rather than paraphrasing them', () => {
  const brief = buildInjuryConstraintBrief(HARD.masters_return);
  assert.ok(brief.includes(HARD.masters_return.pain.tolerated_movements),
    'the athlete\'s own words must survive into the brief intact');
});

test('a mechanism is honoured as a mechanism', () => {
  const brief = buildInjuryConstraintBrief(HARD.masters_return);
  assert.match(brief, /honour the mechanism/);
  const named = buildInjuryConstraintBrief(COMP.mma_fight_camp);
  assert.match(named, /Do not prescribe: back squat/);
});

test('an athlete with nothing to declare gets no brief', () => {
  assert.equal(buildInjuryConstraintBrief({}), '');
  assert.equal(buildInjuryConstraintBrief({ pain: {} }), '');
});

test('the collector finds a contraindicated movement when one is prescribed', () => {
  const withSquat = BASE.replace(/^(Mon\t)([^\t]+)/m, '$1Back Squat');
  const flags = collectInjuryConstraintFlags(withSquat, COMP.mma_fight_camp);
  assert.ok(flags.length > 0);
  assert.equal(flags[0].code, 'V84_CONTRAINDICATED_MOVEMENT_PRESCRIBED');
  assert.match(flags[0].detail, /outranks any programme logic/);
});

test('the collector is silent when there is nothing declared', () => {
  assert.equal(collectInjuryConstraintFlags(BASE, {}).length, 0);
  assert.equal(collectInjuryConstraintFlags(BASE, HARD.masters_return).length, 0);
});

// --- the repair that made it safe to wire ----------------------------------
//
// This rule was written, tested, and deliberately left out of the blocking
// bundle, because a code with no repair spends four attempts and then fails the
// build. The consequence was that the most specific safety information in the
// whole intake -- the athlete's own account of what reproduces their symptoms --
// was checked by nothing at all. A fight camp whose intake says "heavy back
// squat is not [comfortable]" could be handed a heavy back squat.

import { repairInjuryConstraint, toleratedMovements } from '../engine/v84_injury_constraint.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { classifyExercise } from '../engine/v38_movement_taxonomy.js';

const KNEE = {
  age: 28, language: 'en', experience: 'advanced', days_per_week: 2,
  available_gym_days: ['Tue', 'Fri'], training_location: 'commercial_gym',
  equipment: 'Full commercial gym, plus sled, kettlebells and a trap bar.',
  primary_goals: ['Hold my strength through camp'],
  current_numbers: 'Trap Bar Deadlift: 190 kg x 3\nWeighted Pull-up: +35 kg x 3',
  injuries: 'Chronic right knee soreness after heavy squatting.',
  pain: {
    active: true, description: 'Right knee ache after heavy bilateral squatting',
    tolerated_movements: 'Trap bar deadlift, split squats, sled pushes, hip thrusts and all upper body are comfortable. Heavy back squat is not.',
  },
  qa_diagnostics: true,
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const r = (d, n, note = 'Work set.') => [d, n, '120 kg', '3', '5', '3 min', '7', note, ''].join('\t');
const w = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

test('the intake names both halves of the answer', () => {
  assert.deepEqual(forbiddenMovements(KNEE), ['back squat']);
  const ok = toleratedMovements(KNEE);
  assert.ok(ok.includes('hip thrust'));
  assert.ok(ok.includes('split squat'));
  assert.ok(!ok.includes('back squat'), 'the refused movement is not offered back as a substitute');
});

test('a contraindicated movement is replaced from the athlete\'s own list', () => {
  const p = w(1, [r('Tue', 'Back Squat', 'Heavy triple.'), r('Tue', 'Pull-up')]);
  assert.equal(collectInjuryConstraintFlags(p, KNEE).length, 1);
  const fixed = repairInjuryConstraint(p, KNEE);
  assert.deepEqual(collectInjuryConstraintFlags(fixed, KNEE), [], 'the repair must answer its own flag');
  const swapped = fixed.split('\n').filter((l) => l.includes('\t')).slice(1).map((l) => l.split('\t')[1])[0];
  assert.ok(/Trap Bar Deadlift|Barbell Hip Thrust|Bulgarian Split Squat/.test(swapped), swapped);
  // The legs still get loaded: a knee that cannot squat does not become an
  // upper-body day.
  assert.ok(['knee_dominant', 'hip_dominant', 'unilateral_lower'].includes(classifyExercise(swapped).category));
  assert.match(fixed, /you told us you do not tolerate/);
  assert.equal(repairInjuryConstraint(fixed, KNEE), fixed, 'repair is not idempotent');
});

test('with nothing tolerated to swap in, the program is left alone rather than refused', () => {
  // The original reason this rule was never wired. It still holds: a gate that
  // cannot be answered must not refuse the build.
  const noList = { ...KNEE, pain: { ...KNEE.pain, tolerated_movements: 'Heavy back squat is not comfortable.' } };
  const p = w(1, [r('Tue', 'Back Squat')]);
  assert.deepEqual(toleratedMovements(noList), []);
  assert.equal(repairInjuryConstraint(p, noList), p);
});

test('an athlete with no stated constraint is untouched', () => {
  const p = w(1, [r('Tue', 'Back Squat')]);
  assert.equal(repairInjuryConstraint(p, { pain: {} }), p);
});

test('the full bundle removes it and never refuses the build over it', () => {
  const session = (d) => [
    r(d, 'Back Squat', 'Heavy triple.'), r(d, 'Pull-up', 'Pulling.'),
    r(d, 'Bench Press', 'Pressing.'), r(d, 'Pallof Press', 'Trunk.'),
  ];
  const program = [1, 2, 3, 4].map((n) => w(n, [...session('Tue'), ...session('Fri')])).join('\n\n');
  const res = collectRepairableValidationFailures(program, KNEE, { skipSkillCalibration: true });
  const prescribed = res.program.split('\n').filter((l) => l.includes('\t')).map((l) => l.split('\t')[1]);
  assert.ok(!prescribed.includes('Back Squat'), 'the movement they cannot tolerate must not ship');
  assert.ok(!(res.flags || []).some((f) => f.code === 'V84_CONTRAINDICATED_MOVEMENT_PRESCRIBED'),
    'and it must not become a blocking flag either');
});
