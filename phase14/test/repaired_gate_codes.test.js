// The proof, named.
//
// Every repair in this session was demonstrated: the fixture raises the rule,
// the repair runs, the rule is satisfied. But the assertions named the rule's
// collector, not its code, and the code appeared only in the comment above.
// The ledger read those comments and counted eleven gates as proven on the
// strength of prose -- evidence inferred from something that is not evidence,
// which is the one mistake this whole exercise exists to stop making.
//
// So each of them is asserted here by code, through the validator that would
// actually refuse the build. Comments are stripped before the ledger matches
// now, so this file is the proof and the comments are only commentary.
//
// Four are missing from it, and their absence is the point. For
// ADVANCED_HYBRID_RUN_BASELINE_EXCEEDED, ADVANCED_HYBRID_MARATHON_SUBORDINATION,
// COACH_SPEC_V1_YG_SKILL_REST_TOO_SHORT and
// COACH_SPEC_V1_YG_HANDSTAND_BALANCE_SPECIFICITY_MISSING I could not build a
// program that makes the validator refuse -- they read a parsed program model
// with conditions a minimal fixture does not meet. Their repairs are
// demonstrated in their own suites; what is not demonstrated is that the gate
// would have refused without them. They stay in the registry as unproven,
// because a repair that answers a refusal nobody has seen is an assumption.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';
import { validateAdvancedHybridCoachingSpecV1, validateYouthCoachingSpecV1HardRules } from '../engine/coaching_spec_v1_quality.js';
import { validateAdvancedHybridManualAcceptanceSemantic } from '../engine/manual_acceptance_quality.js';
import { validatePhase15Program } from '../engine/phase15_program_qa.js';
import { collectTimelineIntegrityFlags } from '../engine/v91_timeline_integrity.js';
import { collectPainToleranceFlags } from '../engine/pain_tolerance.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const r = (d, n, w, s, reps, rest, rpe, note) => [d, n, w, String(s), reps, rest, String(rpe), note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

// Whatever a validator refuses with, as a list of codes.
function codesFrom(fn) {
  try { const v = fn(); return Array.isArray(v) ? v.map((f) => f.code).filter(Boolean) : []; }
  catch (e) {
    if (Array.isArray(e?.flags) && e.flags.length) return e.flags.map((f) => f.code).filter(Boolean);
    return e?.code ? [e.code] : ['THREW'];
  }
}

// The bundle is what production runs, so it is what has to clear the code.
const afterBundle = (program, intake) => {
  try {
    const res = collectRepairableValidationFailures(program, intake, { skipSkillCalibration: true });
    return (res.flags || []).map((f) => f.code);
  } catch (e) { return [e?.code || 'THREW']; }
};

const HYBRID = {
  ...CORE.advanced_hybrid,
  current_numbers: 'Back Squat: 205 kg 1RM\nRunning: 1 session a week, about 20 km total, longest recent run about 20 km',
  clarification_answers: { running_current_exposure: 'Currently 1 run per week, about 20 km total, longest recent run about 20 km.' },
};



test('COACH_SPEC_V1_AH_UNCONDITIONAL_MAJOR_LIFT_PROGRESSION is raised and then cleared', () => {
  const p = [1, 2, 3, 4].map((n) => wk(n, [
    r('Mon', 'Back Squat', `${145 + n * 5} kg`, 3, '5', '3 min', 8, 'Top set of five.'),
  ])).join('\n\n');
  assert.ok(codesFrom(() => validateAdvancedHybridCoachingSpecV1(p, HYBRID))
    .includes('COACH_SPEC_V1_AH_UNCONDITIONAL_MAJOR_LIFT_PROGRESSION'), 'the fixture must raise it');
  assert.ok(!afterBundle(p, HYBRID).includes('COACH_SPEC_V1_AH_UNCONDITIONAL_MAJOR_LIFT_PROGRESSION'));
});

test('ADVANCED_HYBRID_DENSE_72H_PRIMARY_WINDOW is raised and then cleared', () => {
  const p = [1, 2, 3, 4].map((n) => wk(n, [
    r('Sat', 'Run', '-', 1, '20 km', '-', 5, 'Long aerobic run.'),
    r('Sun', 'Bulgarian Split Squat', '40 kg', 4, '8', '2 min', 8, 'Hard unilateral work.'),
    r('Mon', 'Back Squat', '170 kg', 3, '3', '3 min', 9, 'Heavy triple.'),
  ])).join('\n\n');
  assert.ok(codesFrom(() => validateAdvancedHybridManualAcceptanceSemantic(p, HYBRID))
    .includes('ADVANCED_HYBRID_DENSE_72H_PRIMARY_WINDOW'), 'the fixture must raise it');
  assert.ok(!afterBundle(p, HYBRID).includes('ADVANCED_HYBRID_DENSE_72H_PRIMARY_WINDOW'));
});

const YOUTH = {
  ...CORE.youth_gymnastics,
  current_numbers: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. No reliable unsupported balance yet.',
};



test('PAIN_TOLERANCE_NOT_ACKNOWLEDGED is raised and then cleared', () => {
  const BACK = {
    age: 41, language: 'en', experience: 'intermediate', days_per_week: 2,
    available_gym_days: ['Tue', 'Fri'], training_location: 'commercial_gym',
    equipment: 'Full commercial gym.', primary_goals: ['Get back to lifting without flare-ups'],
    current_numbers: 'Back Squat: 100 kg x 5', qa_diagnostics: true,
    pain: { active: true, description: 'Sciatica down the right leg after heavy hinging', severity: '4/10' },
  };
  const p = [1, 2, 3, 4].map((n) => wk(n, [
    r('Fri', 'Romanian Deadlift', 'RPE-selected load', 3, '8', '2 min', 7, 'Three sets of eight, controlled.'),
    r('Fri', 'Chest-Supported Row', 'RPE-selected load', 3, '10', '2 min', 7, 'Pulling.'),
  ])).join('\n\n');
  assert.ok(codesFrom(() => validatePhase15Program(p, BACK)).includes('PAIN_TOLERANCE_NOT_ACKNOWLEDGED'),
    'the fixture must raise it');
  assert.ok(!afterBundle(p, BACK).includes('PAIN_TOLERANCE_NOT_ACKNOWLEDGED'));
  assert.deepEqual(collectPainToleranceFlags(p, BACK).map((f) => f.code), [],
    'and this one is a tolerance gate, not a refusal');
});

test('V91_TIMELINE_VIEWS_DISAGREE is raised and then cleared', () => {
  const COMP = JSON.parse(read('competition_avatars.json'));
  const onSaturday = (w) => {
    const d = new Date(Date.now() + w * 7 * 86400000);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
    return d.toISOString().slice(0, 10);
  };
  const FIGHTER = { ...COMP.mma_fight_camp, competition_date: onSaturday(4), event_type: 'combat', event_priority: 'A' };
  // A camp schedule that shows gym on Tue and Fri against a week table that
  // trains on neither.
  const base = [1, 2, 3, 4].map((n) => wk(n, [
    r('Wed', 'Trap Bar Deadlift', 'RPE-selected', 2, '3', '2 min', 7, 'Strength.'),
  ])).join('\n\n');
  const schedule = ['CAMP SCHEDULE', '', '| Mon | Tue | Wed | Thu | Fri | Sat | Sun |',
    'W4 | D-5 MMA | D-4 MMA + gym | D-3 MMA | D-2 MMA | D-1 MMA + gym | FIGHT DAY | - |'].join('\n');
  const p = `${schedule}\n\n${base}`;
  assert.ok(collectTimelineIntegrityFlags(p, FIGHTER).map((f) => f.code).includes('V91_TIMELINE_VIEWS_DISAGREE'),
    'the fixture must raise it');
  assert.ok(!afterBundle(p, FIGHTER).includes('V91_TIMELINE_VIEWS_DISAGREE'));
});
