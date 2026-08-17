import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeYouthPrimarySkillOrder } from '../engine/youth_skill_order_normalizer.js';
import { validateYouthManualAcceptanceSemantic } from '../engine/manual_acceptance_quality.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const intake = {
  age: 13,
  gym_availability_mode: 'flexible',
  available_gym_days: [],
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  current_numbers: 'About 12 strict pull-ups and 6 good ring dips. Wall-facing handstand about 15 seconds.',
};

function fourWeeks() {
  return [1, 2, 3, 4].map((week) => [
    `START_WEEK${week}_TSV`,
    HEADER,
    'Session A\t[WARMUP] Scapular Pull-up\tBodyweight\t2\t5\t45s\tN/A\tWarm-up\t',
    'Session A\tRing Row\tBodyweight\t3\t6\t60s\t7\tSupport\t',
    'Session A\tBar Muscle-up Transition Drill\tModerate band\t3\t2\t120s\tN/A\tClean turnover\t',
    'Session A\tRing Dip\tBodyweight\t3\t3\t90s\t7\tSubmaximal support\t',
    'Session B\t[WARMUP] Wrist Prep\tBodyweight\t2\t30 sec\t30s\tN/A\tWarm-up\t',
    'Session B\tPistol Squat\tBodyweight\t3\t4/side\t90s\t7\tSupport\t',
    'Session B\tControlled Handstand Kick-up\tBodyweight\t4\t3 attempts\t90s\tN/A\tQuality entries\t',
    `END_WEEK${week}_TSV`,
  ].join('\n')).join('\n\n');
}

function dataRows(program) {
  return String(program).split('\n').filter((line) => line.includes('\t') && !line.startsWith('Day\t'));
}

function dosesByExercise(program) {
  return dataRows(program).map((line) => {
    const cells = line.split('\t');
    return [cells[1], cells[2], cells[3], cells[4], cells[5], cells[6], cells[7]].join('|');
  }).sort();
}

test('deterministic youth skill-order repair changes order only and clears freshness failure', () => {
  const before = fourWeeks();
  assert.throws(
    () => validateYouthManualAcceptanceSemantic(before, intake),
    (err) => err?.code === 'YOUTH_PRIMARY_SKILL_NOT_FRESH',
  );

  const normalized = normalizeYouthPrimarySkillOrder(before, intake);
  assert.equal(normalized.reordered, true);
  assert.ok(normalized.moves.length >= 8);
  assert.deepEqual(dosesByExercise(normalized.program), dosesByExercise(before), 'exercise identity and dose must be byte-equivalent apart from row order');
  assert.doesNotThrow(() => validateYouthManualAcceptanceSemantic(normalized.program, intake));

  for (const week of [1, 2, 3, 4]) {
    const block = normalized.program.match(new RegExp(`START_WEEK${week}_TSV\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`))?.[1] || '';
    const rows = block.split('\n');
    const a = rows.filter((line) => line.startsWith('Session A\t'));
    const b = rows.filter((line) => line.startsWith('Session B\t'));
    assert.match(a[0], /\[WARMUP\]/);
    assert.match(a[1], /Bar Muscle-up Transition Drill/);
    assert.match(b[0], /\[WARMUP\]/);
    assert.match(b[1], /Controlled Handstand Kick-up/);
  }
});
