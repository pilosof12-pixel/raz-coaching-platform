import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PRIMARY_VOLUME_STALLED,
  buildPrimaryVolumeProgressionBrief,
  collectPrimaryVolumeProgressionFlags,
  normalizePrimaryVolumeProgression,
} from '../engine/primary_volume_progression.js';

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

test('a declared hold is a coaching decision, not a stall', () => {
  const held = DELIVERED.replace(
    /^/,
    'Rowing is held at a maintenance dose rather than developed this block: this block holds it at a maintenance dose rather than developing it.\n\n',
  );
  assert.deepEqual(collectPrimaryVolumeProgressionFlags(held, MASTERS), []);
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
