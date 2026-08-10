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

s = s.replace(
  "  const hasBoxOrBench = /\\bbox\\b|\\bbench\\b/.test(equipmentText);",
  "  const explicitNoBox = /\\bno\\s+(?:plyo\\s+)?box\\b/.test(equipmentText);\n  const explicitNoBench = /\\bno\\s+bench\\b/.test(equipmentText);\n  const hasBoxOrBench = (/\\bbox\\b/.test(equipmentText) && !explicitNoBox) || (/\\bbench\\b/.test(equipmentText) && !explicitNoBench);"
);

const stepRepair = `    if (parkOnly && !hasBoxOrBench && /^Step-up$/i.test(ex)) {
      cells[1] = 'Reverse Lunge';
      cells[7] = 'Ground-based unilateral leg work. Use a controlled 3-second eccentric and add belt load only if the setup stays stable.';
      ex = cells[1];
    }
`;
const stepAnchor = "    if (parkOnly && !hasBoxOrBench && /^Box Jump$/i.test(ex)) {";
if (!s.includes("Ground-based unilateral leg work")) {
  const idx = s.indexOf(stepAnchor);
  if (idx < 0) throw new Error('step-up repair anchor missing');
  s = s.slice(0, idx) + stepRepair + s.slice(idx);
}

if (s !== originalServer) fs.writeFileSync(serverPath, s);
console.log(`${serverPath}: ${s !== originalServer ? 'patched park negation and ground-only leg substitutions' : 'already current'}`);

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const originalBuilder = b;

const qualityRule = '  "WARRIOR / ATHLETIC HYPERTROPHY RULE: for a park-only client whose goal combines hypertrophy, strength and athleticism, the two mandatory sessions must carry the progression. Across those two days include at least 6 meaningful lower-body strength/hypertrophy sets total, with challenging unilateral knee-dominant work plus posterior-chain work. Use the available belt load, tempo, pauses and ROM to make limited external load productive. Power work must be neural/quality focused, not conditioning: Broad Jumps use full resets; short acceleration sprints use roughly 90-95% quality effort with about 2-3 minutes full recovery and stop before speed drops. The optional third day may add easy volume but must not be required for progression.",\\n';
if (!b.includes('WARRIOR / ATHLETIC HYPERTROPHY RULE')) {
  const anchor = '  "CALENDAR HARD STOP: when available_gym_days is supplied, every week must use exactly those days. If the intake identifies mandatory versus optional sessions, preserve that hierarchy; the optional day must remain dispensable without breaking progression.",\\n';
  if (!b.includes(anchor)) throw new Error('Warrior quality-rule anchor missing');
  b = b.replace(anchor, anchor + qualityRule);
}

b = b.replaceAll('deterministic-skeleton-v5.2.5-warrior-final', 'deterministic-skeleton-v5.2.6-warrior-certified');
b = b.replaceAll('raz-phase15-warrior-v5-2-5', 'raz-phase15-warrior-v5-2-6');
if (b !== originalBuilder) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== originalBuilder ? 'upgraded to v5.2.6 Warrior certification rules' : 'already current'}`);
