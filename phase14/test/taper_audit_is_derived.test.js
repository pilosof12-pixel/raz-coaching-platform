// The audit described a program that no longer existed.
//
// appendCompetitionBlocks wrote the taper audit once and then skipped if one
// was already present, so every repair that ran afterwards -- an MRV trim, a
// taper trim, an accessory cut -- silently invalidated it. The weightlifting
// block shipped an audit reading 69/69/69/50 against a week table that
// actually ran 69/63/58/49.
//
// A coach reviewing that program deducted for the contradiction, and was right
// to: the program said volume came down while its own audit said it did not.
// The defect was in our reporting, not in the training. Worse, the stale table
// also reported competition-lift share flat at 39% when the block actually
// climbs 39 -> 43 -> 47, so it hid the very specificity the block was built to
// produce.
//
// Same defect class as the camp schedule that disagreed with the week table: a
// view that is allowed to become an independent claim rather than being
// recomputed from what it describes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { appendCompetitionBlocks, auditWeek } from '../engine/v73_taper_audit.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const COMP = JSON.parse(read('competition_avatars.json'));

const LIFTER = {
  ...COMP.weightlifter_peak,
  competition_date: new Date(Date.now() + 8 * 7 * 86400000).toISOString().slice(0, 10),
  event_type: 'strength_meet',
  event_priority: 'A',
};

const auditRows = (program) => program.split('\n')
  .filter((l) => /^W\d\s/.test(l))
  .map((l) => l.trim().split(/\s{2,}/));

test('the audit reports the program it is attached to', () => {
  const delivered = read('run101_weightlifter_peak.txt');
  const stale = auditRows(delivered).map((r) => Number(r[2]));
  assert.deepEqual(stale, [69, 69, 69, 50], 'the delivered audit is the stale one this exists to fix');

  const refreshed = appendCompetitionBlocks(delivered, LIFTER);
  const shown = auditRows(refreshed).map((r) => Number(r[2]));
  const actual = [1, 2, 3, 4].map((w) => auditWeek(refreshed, w, LIFTER).sets);
  assert.deepEqual(shown, actual, 'every row must match the week it describes');
  assert.deepEqual(shown, [69, 63, 58, 49]);
});

test('refreshing does not duplicate the block', () => {
  const once = appendCompetitionBlocks(read('run101_weightlifter_peak.txt'), LIFTER);
  assert.equal((once.match(/TAPER AUDIT/g) || []).length, 1);
  assert.equal((once.match(/Across the block:/g) || []).length, 1);
  assert.equal(appendCompetitionBlocks(once, LIFTER), once, 'refresh is not idempotent');
});

test('a program with no audit still gets one', () => {
  const delivered = read('run101_weightlifter_peak.txt');
  const bare = delivered.slice(0, delivered.indexOf('TAPER AUDIT'));
  const built = appendCompetitionBlocks(bare, LIFTER);
  assert.match(built, /TAPER AUDIT/);
  assert.deepEqual(auditRows(built).map((r) => Number(r[2])), [69, 63, 58, 49]);
});

test('the content that follows the audit survives the refresh', () => {
  const delivered = read('run101_weightlifter_peak.txt');
  const withTail = `${delivered.replace(/\s*$/, '')}\n\nCLOSING NOTE\nTrain well.\n`;
  const refreshed = appendCompetitionBlocks(withTail, LIFTER);
  assert.match(refreshed, /CLOSING NOTE\nTrain well\./);
  assert.deepEqual(auditRows(refreshed).map((r) => Number(r[2])), [69, 63, 58, 49]);
});
