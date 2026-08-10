import fs from 'node:fs';

function replaceOnce(s, find, replace, label) {
  if (s.includes(replace)) return s;
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error(`${label}: expected one anchor, found ${n}`);
  return s.replace(find, replace);
}

const serverPath = 'phase14/server.js';
let s = fs.readFileSync(serverPath, 'utf8');
const originalServer = s;

s = replaceOnce(
  s,
  "  const hasSingleLegFrontLever = /single[- ]leg front lever/.test(benchmark);\n  const out = [];",
  "  const hasSingleLegFrontLever = /single[- ]leg front lever/.test(benchmark);\n  const location = String(intake?.training_location || '').toLowerCase();\n  const equipmentText = JSON.stringify(intake?.equipment || '').toLowerCase();\n  const parkOnly = /outdoor|park/.test(location);\n  const hasBoxOrBench = /\\bbox\\b|\\bbench\\b/.test(equipmentText);\n  const hasBike = /bike|airbike|assault|echo/.test(equipmentText);\n  const hasRower = /rower|rowing machine|concept ?2/.test(equipmentText);\n  const availableDays = Array.isArray(intake?.available_gym_days) ? intake.available_gym_days.map((d) => String(d || '').trim()).filter(Boolean) : [];\n  const requestedDays = Number(intake?.days_per_week || 0);\n  let dayMap = new Map();\n  const out = [];",
  'park-only flags'
);

s = replaceOnce(
  s,
  "  for (const line of String(tsv).split('\\n')) {\n    if (!line.includes('\\t')) { out.push(line); continue; }",
  "  for (const line of String(tsv).split('\\n')) {\n    if (!line.includes('\\t')) {\n      if (/START_WEEK\\d+_TSV/.test(line)) dayMap = new Map();\n      out.push(line); continue;\n    }",
  'week-aware day map'
);

s = replaceOnce(
  s,
  "    if (cells.length !== 9 || /^Day$/i.test(cells[0])) { out.push(line); continue; }\n    let ex = String(cells[1] || '').trim();",
  "    if (cells.length !== 9 || /^Day$/i.test(cells[0])) { out.push(line); continue; }\n    if (availableDays.length === requestedDays && requestedDays > 0) {\n      const rawDay = String(cells[0] || '').trim();\n      if (rawDay) {\n        if (!dayMap.has(rawDay)) dayMap.set(rawDay, availableDays[dayMap.size] || rawDay);\n        cells[0] = dayMap.get(rawDay);\n      }\n    }\n    let ex = String(cells[1] || '').trim();",
  'available-day enforcement'
);

const parkRepairs = `    if (parkOnly && !hasBoxOrBench && /^Box Jump$/i.test(ex)) {
      cells[1] = 'Broad Jump';
      cells[7] = 'Maximum-quality horizontal jump. Reset fully between reps and stop as soon as distance or landing quality drops.';
      ex = cells[1];
    }
    if (parkOnly && !hasBike && /^Zone-2 Bike$/i.test(ex)) {
      cells[1] = 'Zone-2 Run';
      cells[7] = 'Use a brisk walk or very easy jog that keeps breathing conversational; do not turn this into intervals.';
      ex = cells[1];
    }
    if (parkOnly && !hasRower && /^Zone-2 Row$/i.test(ex)) {
      cells[1] = 'Zone-2 Run';
      cells[7] = 'Use a brisk walk or very easy jog that keeps breathing conversational; do not turn this into intervals.';
      ex = cells[1];
    }
`;
const parkAnchor = "    if (!hasAdvancedTuckPlanche && /^Straddle Planche$/i.test(ex)) continue;";
if (!s.includes("Maximum-quality horizontal jump")) {
  const n = s.split(parkAnchor).length - 1;
  if (n !== 1) throw new Error(`park repair anchor expected once, found ${n}`);
  s = s.replace(parkAnchor, parkRepairs + parkAnchor);
}

if (s !== originalServer) fs.writeFileSync(serverPath, s);
console.log(`${serverPath}: ${s !== originalServer ? 'patched park-only output rules' : 'already current'}`);

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const originalBuilder = b;

b = b.replace(
  '  "CANONICAL NAMES FOR THIS PATH: use Overhead Press or Standing Barbell Overhead Press, not \'Strict overhead press\'. Use Dumbbell Shoulder Press, not \'Dumbbell Overhead Press\'. Use Dumbbell Bench Press, not \'Dumbbell Floor Press\'. Use Side Plank instead of Copenhagen Plank on this verified client path. Use Zone-2 Bike or Zone-2 Row, not \'Stationary bike Zone 2\'. For explosive primers use Box Jump on this verified path. Use One-Arm Pull-up and Assisted One-Arm Pull-up exactly for advanced OAP work.",\\n',
  '  "CANONICAL NAMES FOR THIS PATH: use Overhead Press or Standing Barbell Overhead Press, not \'Strict overhead press\'. Use Dumbbell Shoulder Press, not \'Dumbbell Overhead Press\'. Use Dumbbell Bench Press, not \'Dumbbell Floor Press\'. Use Side Plank instead of Copenhagen Plank on this verified client path. Use One-Arm Pull-up and Assisted One-Arm Pull-up exactly for advanced OAP work.",\\n  "PARK-ONLY HARD STOP: when training_location is an outdoor/calisthenics park, use ONLY equipment explicitly listed in the intake. Never prescribe Box Jump without an explicit box/bench, and never prescribe Bike/Row/Rower conditioning without that machine. Use Broad Jump, Split Squat Jump or short maximal Sprint work for power, and use Zone-2 Run with brisk walking/easy jogging for aerobic work when no machine exists.",\\n  "CALENDAR HARD STOP: when available_gym_days is supplied, every week must use exactly those days. If the intake identifies mandatory versus optional sessions, preserve that hierarchy; the optional day must remain dispensable without breaking progression.",\\n'
);

b = b.replace(
  '    "Exactly the requested number of gym days must appear in every week block.",\\n',
  '    "Exactly the requested number of gym days must appear in every week block.",\\n    "If available_gym_days is supplied, use those exact days and preserve any mandatory/optional hierarchy stated in the intake.",\\n    "For outdoor-park clients, do not invent a box, bench, bike, rower, cable or machine. Use only listed bars/rings/loading plus ground-based jumps, sprints and walking/easy running as appropriate.",\\n'
);

b = b.replaceAll('deterministic-skeleton-v5.2.3-warrior-client', 'deterministic-skeleton-v5.2.4-warrior-park');
b = b.replaceAll('raz-phase15-warrior-v5-2-3', 'raz-phase15-warrior-v5-2-4');
if (b !== originalBuilder) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== originalBuilder ? 'upgraded to v5.2.4 park rules' : 'already current'}`);
