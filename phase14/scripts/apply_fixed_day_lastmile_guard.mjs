import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXED_DAY_GUARD_MARKER = 'FIXED-DAY-LASTMILE-PRESERVE-REAL-WEEKDAYS';

export function patchFixedDayLastMileGuard(input) {
  let src = String(input || '');
  if (src.includes(FIXED_DAY_GUARD_MARKER)) return src;

  const old = `    if (availableDays.length === requestedDays && requestedDays > 0) {\n      const rawDay = String(cells[0] || '').trim();\n      if (rawDay) {\n        if (!dayMap.has(rawDay)) dayMap.set(rawDay, availableDays[dayMap.size] || rawDay);\n        cells[0] = dayMap.get(rawDay);\n      }\n    }`;

  const replacement = `    if (availableDays.length === requestedDays && requestedDays > 0) {\n      const rawDay = String(cells[0] || '').trim();\n      // ${FIXED_DAY_GUARD_MARKER}: real weekday labels already carry calendar\n      // meaning. Do not remap a separate endurance/sport day merely because the\n      // intake also supplies fixed gym days. Only placeholder/session-style labels\n      // may be mapped onto available_gym_days.\n      const isRealWeekday = /^(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)$/i.test(rawDay);\n      if (rawDay && !isRealWeekday) {\n        if (!dayMap.has(rawDay)) dayMap.set(rawDay, availableDays[dayMap.size] || rawDay);\n        cells[0] = dayMap.get(rawDay);\n      }\n    }`;

  const count = src.split(old).length - 1;
  if (count !== 1) throw new Error(`fixed-day last-mile anchor expected once, found ${count}`);
  return src.replace(old, replacement);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  const target = fileURLToPath(new URL('../server.js', import.meta.url));
  const before = fs.readFileSync(target, 'utf8');
  const after = patchFixedDayLastMileGuard(before);
  fs.writeFileSync(target, after);
  console.log(`${target}: ${after === before ? 'already current' : 'fixed-day last-mile guard applied'}`);
}
