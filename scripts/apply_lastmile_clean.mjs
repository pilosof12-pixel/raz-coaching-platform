import fs from 'node:fs';

const serverPath = 'phase14/server.js';
let s = fs.readFileSync(serverPath, 'utf8');
const marker = `    if (!hasAdvancedTuckPlanche && /^Straddle Planche$/i.test(ex)) continue;`;
const knee = `    if (/\\[REVIEW\\].*Hanging Knee Raise|^Hanging Knee Raise$/i.test(ex)) {
      cells[1] = 'Hanging Knee Raise';
      cells[7] = 'Control the pelvis, avoid swinging, and raise the knees with the trunk braced.';
      ex = cells[1];
    }
`;
if (!s.includes(knee)) {
  const n = s.split(marker).length - 1;
  if (n !== 1) throw new Error(`Hanging Knee Raise repair anchor expected once, found ${n}`);
  s = s.replace(marker, knee + marker);
  fs.writeFileSync(serverPath, s);
  console.log('phase14/server.js: added Hanging Knee Raise repair');
} else {
  console.log('phase14/server.js: Hanging Knee Raise repair already current');
}

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const before = b;
b = b.replaceAll('deterministic-skeleton-v5.2.2-warrior-clean', 'deterministic-skeleton-v5.2.3-warrior-client');
b = b.replaceAll('raz-phase15-warrior-v5-2-2', 'raz-phase15-warrior-v5-2-3');
if (b !== before) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== before ? 'upgraded live marker' : 'already on v5.2.3'}`);
