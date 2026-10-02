import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeYouthSessionQuality } from '../engine/youth_session_quality_normalizer.js';
import { validateYouthSessionQualitySemantic, youthSessionQualityAnalysis } from '../engine/youth_session_quality.js';

const intake = {
  age: 13,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
  current_numbers: 'Ring muscle-up achieved. Cannot perform a bar muscle-up yet. Wall-facing handstand 15 sec; controlled kick-ups improving, but no reliable unsupported balance yet.',
  clarification_answers: {
    benchmark_bar_muscle_up: 'Cannot perform a bar muscle-up yet.',
    benchmark_handstand: 'No reliable unsupported balance time yet.',
  },
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function week(rows) {
  return `START_WEEK1_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK1_TSV`;
}
function row(day, exercise, weight='BW', sets='3', reps='2', notes='') {
  return [day, exercise, weight, sets, reps, '90s', '6', notes, ''].join('\t');
}

test('Notes cannot turn a generic Pull-up into direct bar-muscle-up exposure', () => {
  const bad = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Wall Handstand Hold','BW','3','20 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Pull-up','Light band assist','4','1','Bar muscle-up transition drill; practice a clean close turnover into support.'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  assert.throws(
    () => validateYouthSessionQualitySemantic(bad, intake),
    (error) => error?.code === 'YOUTH_PRIMARY_SKILL_SESSION_COVERAGE_MISSING',
  );
});

test('session-quality normalizer relabels contradictory transition row and clears direct coverage', () => {
  const bad = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Wall Handstand Hold','BW','3','20 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Pull-up','Light band assist','4','1','Bar muscle-up transition drill; use enough help for a clean close turnover.'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  const fixed = normalizeYouthSessionQuality(bad, intake);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /Session B\tBar Muscle-up Transition Drill\tLight band assist/);
  assert.doesNotThrow(() => validateYouthSessionQualitySemantic(fixed.program, intake));
});

test('missing bar transition is inserted in each active Youth acquisition session', () => {
  const bad = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Wall Handstand Hold','BW','3','20 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Ring Dip','BW','3','3'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  const fixed = normalizeYouthSessionQuality(bad, intake);
  assert.equal(fixed.repaired, true);
  const sessionBTransitions = fixed.program.split('\n').filter((line) => line.startsWith('Session B\tBar Muscle-up Transition Drill\t'));
  assert.equal(sessionBTransitions.length, 1);
  assert.doesNotThrow(() => validateYouthSessionQualitySemantic(fixed.program, intake));
});

test('duplicate static handstand capacity is removed when an explicit wall hold already exists', () => {
  const bad = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Wall Handstand Hold','BW','3','20 sec'),
    row('Session A','Handstand Hold','BW','3','25 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  assert.equal(youthSessionQualityAnalysis(bad, intake).violations.some((v) => v.type === 'redundant_handstand_capacity'), true);
  const fixed = normalizeYouthSessionQuality(bad, intake);
  assert.equal(fixed.repaired, true);
  const sessionAHolds = fixed.program.split('\n').filter((line) => /^Session A\t.*Handstand.*Hold\t/.test(line));
  assert.equal(sessionAHolds.length, 1);
  assert.match(sessionAHolds[0], /Wall Handstand Hold/);
  assert.doesNotThrow(() => validateYouthSessionQualitySemantic(fixed.program, intake));
});

test('duplicate mislabeled and canonical transition rows collapse to one direct skill row', () => {
  const bad = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Pull-up','Light band assist','4','1','Bar muscle-up transition drill; keep turnover fast.'),
    row('Session A','Wall Handstand Hold','BW','3','20 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  const fixed = normalizeYouthSessionQuality(bad, intake);
  const sessionATransitions = fixed.program.split('\n').filter((line) => line.startsWith('Session A\tBar Muscle-up Transition Drill\t'));
  assert.equal(sessionATransitions.length, 1);
  assert.doesNotThrow(() => validateYouthSessionQualitySemantic(fixed.program, intake));
});

// YOUTH_REDUNDANT_HANDSTAND_CAPACITY aborted the youth gymnast's first attempt
// in run #158. The repair for it existed and was wired, but it declined unless
// one of the stacked holds named a wall, so two generic holds in a session left
// a blocking gate with nothing to answer it and the model was asked to rewrite
// the whole block. The code was also invisible to the gate-repair ledger: this
// validator picks between two codes with a ternary and throws the variable, so
// no literal was ever there for the audit to find.

test('two stacked holds are deduplicated even when neither names a wall', () => {
  const bad = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Handstand Hold','BW','2','15 sec'),
    row('Session A','Tuck Handstand Hold','BW','3','25 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  assert.throws(
    () => validateYouthSessionQualitySemantic(bad, intake),
    (error) => error?.code === 'YOUTH_REDUNDANT_HANDSTAND_CAPACITY',
    'the gate refuses the stacked session before the repair',
  );

  const fixed = normalizeYouthSessionQuality(bad, intake);
  assert.equal(fixed.repaired, true);
  assert.doesNotThrow(
    () => validateYouthSessionQualitySemantic(fixed.program, intake),
    'the gate that aborted run #158 now passes without the model being asked again',
  );
  // The larger dose survives: 3 x 25 sec rather than 2 x 15 sec.
  assert.match(fixed.program, /Session A\tTuck Handstand Hold/);
  assert.ok(!/Session A\tHandstand Hold/.test(fixed.program), 'the smaller duplicate is the one dropped');
});

test('an explicit wall-supported capacity row is still preferred', () => {
  const bad = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Wall Handstand Hold','BW','2','15 sec'),
    row('Session A','Tuck Handstand Hold','BW','3','25 sec'),
  ]);
  const fixed = normalizeYouthSessionQuality(bad, intake);
  assert.match(fixed.program, /Session A\tWall Handstand Hold/);
  assert.ok(!/Tuck Handstand Hold/.test(fixed.program));
  assert.doesNotThrow(() => validateYouthSessionQualitySemantic(fixed.program, intake));
});

// Clearing one half of a validator by breaking the other half is not a repair.
test('the only independent-balance row is never the one dropped', () => {
  const bad = week([
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Wall Handstand Hold','BW','4','30 sec'),
    row('Session A','Freestanding Handstand Hold','BW','2','5 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  const fixed = normalizeYouthSessionQuality(bad, intake);
  assert.match(
    fixed.program,
    /Session A\tFreestanding Handstand Hold/,
    'kept even though the wall row carries the larger dose, because it is the session\'s only independent-balance exposure',
  );
  assert.doesNotThrow(() => validateYouthSessionQualitySemantic(fixed.program, intake));
});

test('a compliant single-hold session is left alone', () => {
  const good = week([
    row('Session A','Controlled Handstand Kick-up'),
    row('Session A','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session A','Wall Handstand Hold','BW','3','20 sec'),
    row('Session B','Controlled Handstand Kick-up'),
    row('Session B','Bar Muscle-up Transition Drill','BW + moderate band'),
    row('Session B','Handstand Hold','BW','3','20 sec'),
  ]);
  assert.doesNotThrow(() => validateYouthSessionQualitySemantic(good, intake));
  const out = normalizeYouthSessionQuality(good, intake);
  assert.equal(out.repaired, false);
  assert.equal(out.program, good);
});
