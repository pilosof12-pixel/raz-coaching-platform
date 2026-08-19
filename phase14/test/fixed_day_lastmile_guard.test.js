import test from 'node:test';
import assert from 'node:assert/strict';

import { patchFixedDayLastMileGuard, FIXED_DAY_GUARD_MARKER } from '../scripts/apply_fixed_day_lastmile_guard.mjs';

const oldBlock = `function x(){\n    if (availableDays.length === requestedDays && requestedDays > 0) {\n      const rawDay = String(cells[0] || '').trim();\n      if (rawDay) {\n        if (!dayMap.has(rawDay)) dayMap.set(rawDay, availableDays[dayMap.size] || rawDay);\n        cells[0] = dayMap.get(rawDay);\n      }\n    }\n}`;

test('patch preserves real weekdays and maps only placeholder/session labels', () => {
  const patched = patchFixedDayLastMileGuard(oldBlock);
  assert.match(patched, new RegExp(FIXED_DAY_GUARD_MARKER));
  assert.match(patched, /isRealWeekday/);
  assert.match(patched, /rawDay && !isRealWeekday/);
  assert.equal(patchFixedDayLastMileGuard(patched), patched);
});

test('guard logic preserves Mon Tue Wed Fri Sun while allowing Session placeholders to map', () => {
  const availableDays = ['Mon','Tue','Fri','Sun'];
  const requestedDays = 4;
  let dayMap = new Map();
  const mapDay = (raw) => {
    const rawDay = String(raw || '').trim();
    const isRealWeekday = /^(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)$/i.test(rawDay);
    if (availableDays.length === requestedDays && requestedDays > 0 && rawDay && !isRealWeekday) {
      if (!dayMap.has(rawDay)) dayMap.set(rawDay, availableDays[dayMap.size] || rawDay);
      return dayMap.get(rawDay);
    }
    return rawDay;
  };

  assert.deepEqual(['Mon','Tue','Wed','Fri','Sun'].map(mapDay), ['Mon','Tue','Wed','Fri','Sun']);
  dayMap = new Map();
  assert.deepEqual(['Session 1','Session 2','Session 3','Session 4'].map(mapDay), availableDays);
});
