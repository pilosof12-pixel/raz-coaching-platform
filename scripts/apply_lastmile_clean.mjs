import fs from 'node:fs';

const serverPath = 'phase14/server.js';
let s = fs.readFileSync(serverPath, 'utf8');
const marker = `    if (!hasAdvancedTuckPlanche && /^Straddle Planche$/i.test(ex)) continue;`;
const rollout = `    if (/\\[REVIEW\\].*Ring Rollout|^Ring Rollout$/i.test(ex)) {
      cells[1] = 'Ring Rollout';
      cells[7] = 'Brace hard, keep ribs down, and only extend as far as you can control without lumbar extension.';
      ex = cells[1];
    }
`;
if (!s.includes(rollout)) {
  const n = s.split(marker).length - 1;
  if (n !== 1) throw new Error(`Ring Rollout repair anchor expected once, found ${n}`);
  s = s.replace(marker, rollout + marker);
  fs.writeFileSync(serverPath, s);
  console.log('phase14/server.js: added Ring Rollout repair');
} else {
  console.log('phase14/server.js: Ring Rollout repair already current');
}

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const before = b;
b = b.replaceAll('deterministic-skeleton-v5.2.1-warrior-approved', 'deterministic-skeleton-v5.2.2-warrior-clean');
b = b.replaceAll('raz-phase15-warrior-v5-2-1', 'raz-phase15-warrior-v5-2-2');
if (b !== before) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== before ? 'upgraded live marker' : 'already on v5.2.2'}`);
