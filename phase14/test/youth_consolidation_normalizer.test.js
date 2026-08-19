import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeYouthWeek4Consolidation } from '../engine/youth_consolidation_normalizer.js';
import { youthConsolidationRetentionAnalysis } from '../engine/coaching_consolidation_quality.js';
import { YOUTH_GYMNASTICS_INTAKE } from './fixtures/golden_programs.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function block(exercise, weeks) {
  return weeks.map((p, index) => {
    const week = index + 1;
    const row = ['Session A', exercise, p.weight || 'BW', p.sets, p.reps, '90s', '7', p.notes || '', ''].join('\t');
    return `START_WEEK${week}_TSV\n${HEADER}\n${row}\nEND_WEEK${week}_TSV`;
  }).join('\n\n');
}

test('deterministic Youth consolidation retains Week 3 reps while lowering set cost', () => {
  const bad = block('Strict Ring Dip', [
    { sets: '3', reps: '5' },
    { sets: '3', reps: '6' },
    { sets: '3', reps: '7' },
    { sets: '3', reps: '5', notes: 'Consolidation week.' },
  ]);
  assert.equal(youthConsolidationRetentionAnalysis(bad, YOUTH_GYMNASTICS_INTAKE).violations.length, 1);
  const fixed = normalizeYouthWeek4Consolidation(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /Session A\tStrict Ring Dip\tBW\t2\t7\t90s/);
  assert.match(fixed.program, /retain the best clean Week 3 performance standard/i);
  assert.deepEqual(youthConsolidationRetentionAnalysis(fixed.program, YOUTH_GYMNASTICS_INTAKE).violations, []);
});

test('deterministic Youth consolidation keeps the earned Week 3 band with lower volume', () => {
  const bad = block('Band-Assisted Bar Muscle-up Transition Drill', [
    { weight: 'BW + moderate band', sets: '4', reps: '2' },
    { weight: 'BW + lighter band', sets: '4', reps: '2' },
    { weight: 'BW + lightest band', sets: '4', reps: '2' },
    { weight: 'BW + moderate band', sets: '3', reps: '2', notes: 'Consolidation week.' },
  ]);
  const fixed = normalizeYouthWeek4Consolidation(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*BW \+ lightest band\t3\t2/);
  assert.deepEqual(youthConsolidationRetentionAnalysis(fixed.program, YOUTH_GYMNASTICS_INTAKE).violations, []);
});

test('volume-only handstand reset is repaired with explicit Week 3 quality retention, not extra attempts', () => {
  const bad = block('Controlled Handstand Kick-up', [
    { sets: '4', reps: '2 attempts', notes: 'Clean entries.' },
    { sets: '5', reps: '2 attempts', notes: 'Clean entries.' },
    { sets: '6', reps: '2 attempts', notes: 'Clean entries.' },
    { sets: '4', reps: '2 attempts', notes: 'Consolidation week.' },
  ]);
  const fixed = normalizeYouthWeek4Consolidation(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*Controlled Handstand Kick-up\tBW\t4\t2 attempts/);
  assert.match(fixed.program, /best clean Week 3 entry and balance quality/i);
  assert.deepEqual(youthConsolidationRetentionAnalysis(fixed.program, YOUTH_GYMNASTICS_INTAKE).violations, []);
});

test('ambiguous duplicate Week 3 rows are not guessed at and remain fail-closed', () => {
  let bad = block('Strict Ring Dip', [
    { sets: '3', reps: '5' },
    { sets: '3', reps: '6' },
    { sets: '3', reps: '7' },
    { sets: '3', reps: '5', notes: 'Consolidation week.' },
  ]);
  bad = bad.replace(
    'Session A\tStrict Ring Dip\tBW\t3\t7\t90s\t7\t\t\nEND_WEEK3_TSV',
    'Session A\tStrict Ring Dip\tBW\t3\t7\t90s\t7\t\t\nSession B\tStrict Ring Dip\tBW\t2\t6\t90s\t7\t\t\nEND_WEEK3_TSV',
  );
  const fixed = normalizeYouthWeek4Consolidation(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(fixed.repaired, false);
  assert.equal(fixed.program, bad);
  assert.ok(youthConsolidationRetentionAnalysis(fixed.program, YOUTH_GYMNASTICS_INTAKE).violations.length > 0);
});

test('shared production bundle wires Youth Week 4 consolidation before semantic validation', () => {
  const src = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(src, /normalizeYouthWeek4Consolidation/);
  assert.match(src, /type: 'youth_week4_consolidation'/);
});
