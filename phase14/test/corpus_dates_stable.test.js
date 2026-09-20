// A static fixture must grade the same on every weekday.
//
// The corpus pairs fixed program texts with intakes whose competition_date is
// relative to now, because block week is derived from the hours remaining to the
// event. The helper used to step forward w*7 days and then on to the next
// Saturday, landing anywhere in w*7 .. w*7+6 -- 28 to 34 days for w=4, or 4.00
// to 4.86 weeks. Past 28 days the event falls outside a four-week block, so
// every competition-week and taper rule reads a different week.
//
// The corpus moved from 24.56 severity to 25.36 and from 17 clean programs to 10
// between 19 and 20 September, with no change to any program or any rule. It was
// the weekday.

import test from 'node:test';
import assert from 'node:assert/strict';

import { saturday } from '../scripts/corpus.mjs';

const DAY = 86400000;
const offsetDays = (w, now) => Math.round((Date.parse(`${saturday(w, now)}T00:00:00Z`) - now) / DAY);

test('the event lands inside week w from every possible start day', () => {
  for (const w of [3, 4, 8]) {
    const lo = w * 7 - 6;
    const hi = w * 7;
    for (let i = 0; i < 70; i++) {
      const now = Date.UTC(2026, 0, 1) + i * DAY;
      const off = offsetDays(w, now);
      assert.ok(off >= lo && off <= hi,
        `saturday(${w}) at day ${i} is ${off} days out, outside ${lo}..${hi}`);
    }
  }
});

test('it is always a Saturday', () => {
  for (let i = 0; i < 70; i++) {
    const now = Date.UTC(2026, 0, 1) + i * DAY;
    const d = new Date(`${saturday(4, now)}T00:00:00Z`);
    assert.equal(d.getUTCDay(), 6, `${saturday(4, now)} is not a Saturday`);
  }
});

test('the offset never jumps by more than the weekday quantisation allows', () => {
  // The band is seven days wide because Saturdays are seven days apart. What it
  // must never do is straddle the week boundary the engine cares about: for a
  // four-week block that boundary is 28 days, and the top of the band is 28.
  assert.equal(4 * 7, 28);
  for (let i = 0; i < 70; i++) {
    const now = Date.UTC(2026, 0, 1) + i * DAY;
    assert.ok(offsetDays(4, now) <= 28, 'week-4 event slipped into week 5');
  }
});
