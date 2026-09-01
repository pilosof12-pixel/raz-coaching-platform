import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { collectProgressionLanguageFlags } from '../engine/v34_prescription_consistency.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const LIFTER = { ...COMP.weightlifter_peak, competition_date: '2026-10-26' };
const FLAT = fs.readFileSync(new URL('./fixtures/run92_weightlifter_flat.txt', import.meta.url), 'utf8');

// Monday's Snatch is a flat 5 x 2 in every week of this fixture, so any claim
// of a reduction against Week 1 is false by construction.
function patch(column, claim) {
  let week = 0;
  let done = false;
  return FLAT.split('\n').map((line) => {
    const m = line.match(/^START_WEEK(\d)_TSV/);
    if (m) week = Number(m[1]);
    if (week === 2 && /^Mon\tSnatch\t/.test(line) && !done) {
      const cells = line.split('\t');
      done = true;
      cells[column] = `${cells[column]} ${claim}`;
      return cells.join('\t');
    }
    return line;
  }).join('\n');
}
const NOTES = 7;
const REPS = 4;
const CLAIMS = ['Lower the volume this week.', 'Cut the sets this week.', 'Fewer total reps this week.'];

const snatchFlags = (p) => collectProgressionLanguageFlags(p, LIFTER).filter((f) => /snatch/i.test(f.exercise));
const repaired = (p) => {
  const r = repairDeterministicContradictions(p, LIFTER);
  return typeof r === 'string' ? r : (r.program || r.text);
};
const repsCell = (p) => (p.split('\n').filter((l) => /^Mon\tSnatch\t/.test(l))[1] || '').split('\t')[REPS];

test('a false reduction claim is detected wherever it is written', () => {
  for (const claim of CLAIMS) {
    for (const column of [NOTES, REPS]) {
      assert.equal(snatchFlags(patch(column, claim)).length, 1, `${claim} in column ${column} went undetected`);
    }
  }
});

test('a claim in the reps cell is repaired, not only one in the note', () => {
  // The detector reads note, load cell and reps cell; only the first two were
  // ever repaired. A claim in the reps cell was therefore found on every pass
  // and answered on none -- a HARD code with no reachable repair, which spends
  // all four attempts and fails the build. This is the shape of the defect
  // that killed the weightlifter in live run #95.
  for (const claim of CLAIMS) {
    const before = patch(REPS, claim);
    assert.equal(snatchFlags(before).length, 1);
    assert.equal(snatchFlags(repaired(before)).length, 0, `${claim} in the reps cell was not repaired`);
  }
});

test('the repair leaves the rep dose intact and the cell clean', () => {
  for (const claim of CLAIMS) {
    const out = repaired(patch(REPS, claim));
    assert.equal(repsCell(out), '2', 'the reps cell must carry the dose, not prose');
  }
});

test('repairing a reps-cell claim is idempotent', () => {
  for (const claim of CLAIMS) {
    const once = repaired(patch(REPS, claim));
    assert.equal(repaired(once), once, `${claim} repair is not idempotent`);
  }
});

test('a truthful program is left alone', () => {
  assert.equal(snatchFlags(FLAT).length, 0);
});
