// Spreading a clustered week without changing what is in it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairConsecutiveTrainingDays, spreadDays } from '../engine/consecutive_day_repair.js';
import { consecutiveTrainingDays, longestRunDays } from '../engine/coach_rules.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => fs.readFileSync(path.join(root, 'fixtures', f), 'utf8');
const json = (f) => JSON.parse(fx(f));
const C = json('competition_avatars.json');
const H = json('hard_avatars.json');
const saturday = (w) => {
  const d = new Date(Date.now() + w * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const LIFTER = { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet', event_priority: 'A' };

const weekDays = (program, w) => {
  const p = parseWeek(program, w);
  if (!p) return [];
  return [...new Set(p.rows.map((c) => String(c[p.day] || '').trim().toLowerCase()).filter(Boolean))];
};
const exercisesInOrder = (program, w) => {
  const p = parseWeek(program, w);
  return p ? p.rows.map((c) => String(c[p.exercise] || '').trim()) : [];
};

test('the solver breaks the run with the fewest moves', () => {
  assert.deepEqual([...spreadDays(['mon', 'tue', 'wed', 'thu', 'fri']).values()], ['mon', 'tue', 'wed', 'fri', 'sat']);
  assert.deepEqual([...spreadDays(['mon', 'tue', 'wed', 'thu']).values()], ['mon', 'tue', 'wed', 'fri']);
});

test('a week already inside the limit is not touched', () => {
  assert.equal(spreadDays(['mon', 'wed', 'fri']), null);
});

test('the solver respects the week wrap', () => {
  // Sat -> Sun -> Mon is three consecutive days, not two separate weekends.
  for (const set of [['mon', 'tue', 'wed', 'thu', 'fri'], ['mon', 'tue', 'wed', 'thu'], ['mon', 'wed', 'thu', 'fri', 'sat']]) {
    const out = [...spreadDays(set).values()];
    assert.ok(longestRunDays(new Set(out)).length <= 3, `${out.join(',')} still runs long`);
  }
});

test('the weightlifter stops training five days in a row', () => {
  const program = fx('run114_weightlifter_peak.txt');
  assert.equal(consecutiveTrainingDays(program, LIFTER).length, 4, 'fixture premise: every week is clustered');

  const r = repairConsecutiveTrainingDays(program, LIFTER);
  assert.equal(r.changed, true);
  assert.equal(consecutiveTrainingDays(r.program, LIFTER).length, 0);
  assert.deepEqual(weekDays(r.program, 1), ['mon', 'tue', 'wed', 'fri', 'sat']);
});

test('it moves days, never content: the sessions are the same sessions', () => {
  const program = fx('run114_weightlifter_peak.txt');
  const r = repairConsecutiveTrainingDays(program, LIFTER);
  for (let w = 1; w <= 4; w += 1) {
    assert.deepEqual(exercisesInOrder(r.program, w), exercisesInOrder(program, w), `week ${w} changed content`);
  }
});

test('the number of training days is unchanged', () => {
  const program = fx('run114_weightlifter_peak.txt');
  const r = repairConsecutiveTrainingDays(program, LIFTER);
  for (let w = 1; w <= 4; w += 1) {
    assert.equal(weekDays(r.program, w).length, weekDays(program, w).length, `week ${w} changed frequency`);
  }
});

test('a note that names a day is moved with the row', () => {
  // A row relabelled Friday was still saying "Thursday still sharpens the
  // lifts", which is the table and the text describing different weeks.
  const r = repairConsecutiveTrainingDays(fx('run114_weightlifter_peak.txt'), LIFTER);
  const p = parseWeek(r.program, 1);
  const stale = p.rows.filter((c) => /\bThursday\b/.test(String(c[p.notes] || '')));
  assert.equal(stale.length, 0, `stale Thursday reference: ${JSON.stringify(stale)}`);
});

test('the block summary is rewritten with the table', () => {
  const program = fx('run92_weightlifter_flat.txt');
  const head = (t) => t.slice(0, t.search(/START_WEEK1_TSV/i));
  assert.match(head(program), /\bFriday\b/, 'fixture premise: the summary names Friday');
  const r = repairConsecutiveTrainingDays(program, LIFTER);
  // Friday's session moved to Saturday, so the summary has to say Saturday.
  assert.match(head(r.program), /\bSaturday\b/);
  assert.doesNotMatch(head(r.program), /\bThursday\b/);
});

test('a chained rename does not carry a day two steps', () => {
  // thu -> fri and fri -> sat applied one after another would turn Thursday
  // into Saturday. It is one pass.
  const r = repairConsecutiveTrainingDays(fx('run92_weightlifter_flat.txt'), LIFTER);
  const head = r.program.slice(0, r.program.search(/START_WEEK1_TSV/i));
  assert.match(head, /\bFriday\b/, 'Thursday should have become Friday, not Saturday');
});

test('it converges', () => {
  const once = repairConsecutiveTrainingDays(fx('run114_weightlifter_peak.txt'), LIFTER);
  assert.equal(repairConsecutiveTrainingDays(once.program, LIFTER).changed, false);
});

test('an athlete without flexible availability is left alone', () => {
  // The footballer's week is built around fixed match and training days.
  const program = fx('run115_inseason_footballer.txt');
  const r = repairConsecutiveTrainingDays(program, H.inseason_footballer);
  assert.equal(r.changed, false);
  assert.equal(r.program, program);
});

test('the finding names the run, not the whole week', () => {
  // It used to report "4 days in a row (mon, wed, thu, fri, sat)" -- five days,
  // one of them not adjacent to the others.
  const flags = consecutiveTrainingDays(fx('tactical_3k-program.txt'), json('acceptance_intakes.json').tactical_3k);
  assert.ok(flags.length > 0);
  for (const f of flags) {
    assert.equal(f.streak.length, 4);
    assert.match(f.detail, /4 days in a row \(wed, thu, fri, sat\)/);
  }
});

test('a spread never puts two sessions of the same pattern side by side', () => {
  // Pulling Wednesday back to Tuesday put the tactical block's two pulling days
  // on consecutive days. The pull-stacking repair downstream then resolved that
  // by deleting the strict pull-up rows, and the block lost the 4x6 -> 4x7 ->
  // 4x8 progression its own summary promises.
  const intake = json('acceptance_intakes.json').tactical_3k;
  const program = fx('run84_tactical_3k.txt');
  const r = repairConsecutiveTrainingDays(program, intake);
  assert.equal(r.changed, true, 'the tactical week should still get spread');

  const pullDays = (t, w) => {
    const p = parseWeek(t, w);
    return p.rows.filter((c) => /pull-?up/i.test(String(c[p.exercise] || '')) && !/^\s*\[WARMUP\]/.test(String(c[p.exercise] || '')))
      .map((c) => String(c[p.day] || '').trim().toLowerCase());
  };
  const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const days = [...new Set(pullDays(r.program, 1))].map((d) => ORDER.indexOf(d)).sort((a, b) => a - b);
  for (let i = 1; i < days.length; i += 1) {
    assert.ok(days[i] - days[i - 1] > 1, `pulling days ended up adjacent: ${days.join(',')}`);
  }
});

test('the strict pull-up progression survives the spread', () => {
  const intake = json('acceptance_intakes.json').tactical_3k;
  const r = repairConsecutiveTrainingDays(fx('run84_tactical_3k.txt'), intake);
  const strictReps = [1, 2, 3, 4].map((w) => {
    const p = parseWeek(r.program, w);
    const row = p.rows.find((c) => /^pull-?up$/i.test(String(c[p.exercise] || '').trim()));
    return row ? `${row[p.sets]}x${row[p.reps]}` : null;
  });
  assert.deepEqual(strictReps, ['4x6', '4x7', '4x8', '3x8']);
});
