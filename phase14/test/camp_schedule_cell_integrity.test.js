// The calendar's way of saying "nothing that day" is a dash, and the prose
// cleaner ate it.
//
// dehyphenateProse rewrites " - " to ", " because a spaced hyphen in a sentence
// is almost always a clause break. In a pipe table it is not prose: it is a
// cell. The delivered fight camp showed "FIGHT DAY |, |" on the Sunday after
// the fight -- the one row of that program a fighter would look at first.
//
// Found by reading the program the service actually delivered, not by any
// validator. Nothing checks the calendar's punctuation.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The function is defined in server.js, which is not a module, so it is
// evaluated here rather than imported.
const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = src.indexOf('function prose(l)');
const end = src.indexOf('\n}\n', src.indexOf('function dehyphenateProse')) + 3;
assert.ok(start > 0 && end > start, 'dehyphenateProse must still be findable');
// eslint-disable-next-line no-new-func
const dehyphenateProse = new Function(`${src.slice(start, end)}; return dehyphenateProse;`)();

test('an empty day in the camp calendar stays a dash', () => {
  const row = 'W4 | D-5 MMA technical | D-4 MMA moderate + gym | D-3 MMA technical | D-2 MMA moderate | D-1 MMA technical + gym | FIGHT DAY | - | 0 of 3';
  assert.equal(dehyphenateProse(row), row);
});

test('a dash used as a clause break in a sentence is still cleaned', () => {
  assert.equal(dehyphenateProse('Squat heavy - it builds the base.'), 'Squat heavy, it builds the base.');
  assert.equal(dehyphenateProse('Rest fully — this is a speed exposure.'), 'Rest fully, this is a speed exposure.');
});

test('prose inside a table cell is still cleaned', () => {
  assert.equal(
    dehyphenateProse('| Mon | Push hard - then rest | - |'),
    '| Mon | Push hard, then rest | - |',
  );
});

test('a rep range keeps its hyphen wherever it sits', () => {
  assert.equal(dehyphenateProse('3 sets of 8-12 reps'), '3 sets of 8-12 reps');
  assert.equal(dehyphenateProse('| Tue | Back Squat | 8-12 | 60-90 sec |'), '| Tue | Back Squat | 8-12 | 60-90 sec |');
});

test('a markdown separator row is untouched', () => {
  assert.equal(dehyphenateProse('|---|:--:|---|'), '|---|:--:|---|');
});
