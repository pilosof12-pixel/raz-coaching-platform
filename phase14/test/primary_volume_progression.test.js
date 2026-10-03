import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PRIMARY_VOLUME_STALLED,
  buildPrimaryVolumeProgressionBrief,
  collectPrimaryVolumeProgressionFlags,
  normalizePrimaryVolumeProgression,
} from '../engine/primary_volume_progression.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const HARD = JSON.parse(fs.readFileSync(new URL('./fixtures/hard_avatars.json', import.meta.url), 'utf8'));
const MASTERS = HARD.masters_return;
const read = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const DELIVERED = read('masters_return-program.txt');

const ergDose = (program, week) => {
  const body = program.match(new RegExp(`START_WEEK${week}_TSV[\\s\\S]*?END_WEEK${week}_TSV`))[0];
  return body.split('\n')
    .filter((l) => l.includes('\t') && /\tRowing Ergometer\t/.test(l) && !l.includes('[WARMUP]'))
    .map((l) => { const c = l.split('\t'); return `${c[3]}x${c[4]}`; });
};

test('a one-second pace change is not a progression in tolerance', () => {
  // Weeks 1 and 2 of the delivered block differ only by the target split:
  // 4 x 250 m at 2:16-2:18 becomes 4 x 250 m at 2:15-2:17. The dose is untouched.
  const flags = collectPrimaryVolumeProgressionFlags(DELIVERED, MASTERS);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, PRIMARY_VOLUME_STALLED);
  assert.deepEqual(flags[0].weeks, [1, 2]);
  assert.equal(flags[0].family, 'rowing');
});

test('blocks that already build rowing tolerance are left alone', () => {
  // Both earlier Masters runs progress volume properly; a gate that fires on
  // them would be charging good programs for the sin of a bad one.
  for (const f of ['run100_masters_return.txt', 'run101_masters_return.txt']) {
    assert.deepEqual(collectPrimaryVolumeProgressionFlags(read(f), MASTERS), [], f);
    assert.equal(normalizePrimaryVolumeProgression(read(f), MASTERS).repaired, false, f);
  }
});

test('the repair distributes the increase instead of leaving it all to Week 3', () => {
  const out = normalizePrimaryVolumeProgression(DELIVERED, MASTERS);
  assert.equal(out.repaired, true);
  // 250 -> 275 -> 300: the Week 3 jump the coach objected to, halved.
  assert.deepEqual(ergDose(out.program, 1), ['1x25 min', '4x250 m']);
  assert.deepEqual(ergDose(out.program, 2), ['1x25 min', '4x275 m']);
  assert.deepEqual(ergDose(out.program, 3), ['1x25 min', '1x12 min', '4x300 m']);
});

test('the repair never overtakes the week it is building toward', () => {
  const out = normalizePrimaryVolumeProgression(DELIVERED, MASTERS);
  const perRep = (week) => Number(ergDose(out.program, week).find((d) => /m$/.test(d)).match(/x(\d+)\s*m/)[1]);
  assert.ok(perRep(2) > 250, 'Week 2 must move');
  assert.ok(perRep(2) < perRep(3), 'Week 2 must stay under Week 3');
});

test('Week 4 is consolidation and is never touched', () => {
  const before = ergDose(DELIVERED, 4);
  const after = ergDose(normalizePrimaryVolumeProgression(DELIVERED, MASTERS).program, 4);
  assert.deepEqual(after, before);
});

test('a declaration does not exempt a PRIMARY goal from developing', () => {
  // It used to. The coach's P0 on run #166: the generator declared a primary
  // goal maintenance and the gates accepted the declaration, so the athlete's
  // hierarchy was rewritten without anyone choosing to. A primary goal moves;
  // only a secondary may be held by declaration.
  const held = DELIVERED.replace(
    /^/,
    'Rowing is held at a maintenance dose rather than developed this block: this block holds it at a maintenance dose rather than developing it.\n\n',
  );
  assert.deepEqual(collectPrimaryVolumeProgressionFlags(held, MASTERS), collectPrimaryVolumeProgressionFlags(DELIVERED, MASTERS));
});

test('a primary strength goal is not judged on volume', () => {
  // Load is how a squat goal progresses; this gate has no business there.
  const lifter = { ...MASTERS, sport: 'Powerlifting', primary_goals: ['Squat 180 kg'] };
  assert.deepEqual(collectPrimaryVolumeProgressionFlags(DELIVERED, lifter), []);
  assert.equal(buildPrimaryVolumeProgressionBrief(lifter), '');
});

test('the brief states the rule before the model writes the block', () => {
  const brief = buildPrimaryVolumeProgressionBrief(MASTERS);
  assert.match(brief, /must increase from Week 1 to Week 2/i);
  assert.match(brief, /only the target pace or split is not a progression/i);
  // The brief assembler renders bullets; a bare paragraph breaks every avatar.
  for (const line of brief.split('\n')) {
    assert.ok(line.startsWith('*') || line.startsWith('  '), `unbulleted brief line: "${line.slice(0, 40)}"`);
  }
});

test('the repair converges and is idempotent', () => {
  const once = normalizePrimaryVolumeProgression(DELIVERED, MASTERS);
  assert.deepEqual(collectPrimaryVolumeProgressionFlags(once.program, MASTERS), []);
  const twice = normalizePrimaryVolumeProgression(once.program, MASTERS);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the production chain applies it', () => {
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizePrimaryVolumeProgression\(candidate, intake\)/);
  const brief = fs.readFileSync(new URL('../engine/coach_standard_brief.js', import.meta.url), 'utf8');
  assert.match(brief, /buildPrimaryVolumeProgressionBrief\(intake\)/);
});

test('a repair that changes the dose does not leave the note describing the old one', () => {
  // The engine's output contract: "For any row that CHANGED from the prior week,
  // the Notes cell states the change in plain language." This repair changed the
  // row and left the sentence, so the Masters block read "Same total work,
  // slightly faster split only" above 4 x 275 m where Week 1 had 4 x 250 m --
  // 1000 m against 1100 m, which is TEXT_CONTRADICTS_TABLE introduced by the fix.
  const out = normalizePrimaryVolumeProgression(DELIVERED, MASTERS);
  const parsed = parseWeek(out.program, 2);
  const row = parsed.rows.find((c) => /Rowing Ergometer/.test(String(c[parsed.exercise])) && /m\s*$/.test(String(c[parsed.reps])));
  const note = String(row[parsed.notes]);

  assert.doesNotMatch(note, /same\s+(?:total\s+)?(?:work|volume|distance)/i, 'the false claim must be gone');
  assert.doesNotMatch(note, /(?:split|pace)\s+only/i);
  assert.match(note, /250 m to 275 m/, 'the note states the change it made');
  // The coaching in the note survives: this is a reconciliation, not a rewrite.
  assert.match(note, /RPE|posture|Week 1/i, 'the original coaching must not be discarded');
});

test('a note with no claim about the dose simply gains the change', () => {
  const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const row = (reps) => `Mon\tRowing Ergometer\t2:10 /500m\t4\t${reps}\t2:00\t7\tKeep the stroke rate at 24 spm.\t`;
  const flat = [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, H, row('250 m'), `END_WEEK${w}_TSV`].join('\n')).join('\n\n');
  const out = normalizePrimaryVolumeProgression(flat, MASTERS);
  assert.equal(out.repaired, true);
  const parsed = parseWeek(out.program, 2);
  const note = String(parsed.rows.find((c) => /Rowing Ergometer/.test(String(c[parsed.exercise])))[parsed.notes]);
  assert.match(note, /steps from 250 m to 275 m/i);
  assert.match(note, /24 spm/, 'and the stroke rate the endurance source asks for is kept');
});
