// A day cell is not always a bare weekday.
//
// The dual-event block was rejected with "expected 4 strength/skill-strength
// days, found 6 (monday, tuesday, wednesday, thursday, fri sport only, sun
// sport only)" on all four attempts. Two faults in one line: an annotated label
// became a day of its own rather than being read as Friday, and a day the model
// had explicitly marked sport-only still counted as a strength session. The
// rule's own message asks for those days to be kept in the calendar and not
// counted, and nothing was reading the annotation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDay, dayLabelExcludesStrength } from '../engine/program_model.js';

test('an annotated day label still names its weekday', () => {
  assert.equal(normalizeDay('fri sport only'), 'friday');
  assert.equal(normalizeDay('Sun - sport only'), 'sunday');
  assert.equal(normalizeDay('Wed (run only)'), 'wednesday');
  assert.equal(normalizeDay('Mon conditioning only'), 'monday');
});

test('a bare weekday is unaffected', () => {
  assert.equal(normalizeDay('Fri'), 'friday');
  assert.equal(normalizeDay('Thursday'), 'thursday');
  assert.equal(normalizeDay('Tue'), 'tuesday');
});

test('the annotation marks the day as not a strength session', () => {
  assert.equal(dayLabelExcludesStrength('fri sport only'), true);
  assert.equal(dayLabelExcludesStrength('Wed (run only)'), true);
  assert.equal(dayLabelExcludesStrength('Sat ruck only'), true);
  assert.equal(dayLabelExcludesStrength('Fri'), false);
  assert.equal(dayLabelExcludesStrength('Tue'), false);
});

test('an unreadable label is left alone rather than guessed at', () => {
  assert.equal(normalizeDay('block A'), 'block a');
  assert.equal(normalizeDay(''), 'unknown');
});
