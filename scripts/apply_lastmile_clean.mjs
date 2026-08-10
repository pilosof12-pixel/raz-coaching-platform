import fs from 'node:fs';

const serverPath = 'phase14/server.js';
let s = fs.readFileSync(serverPath, 'utf8');
const marker = `    if (!hasAdvancedTuckPlanche && /^Straddle Planche$/i.test(ex)) continue;`;
const approved = `    if (/\\[REVIEW\\].*Ring Push-up|^Ring Push-up$/i.test(ex)) {
      cells[1] = 'Ring Push-up';
      cells[7] = 'Keep the rings stable, body rigid, and stop 1-2 reps before form breaks.';
      ex = cells[1];
    }
    if (/\\[REVIEW\\].*Ring Hamstring Curl|^Ring Hamstring Curl$/i.test(ex)) {
      cells[1] = 'Ring Hamstring Curl';
      cells[7] = 'Keep hips extended and curl the heels toward you under control; shorten the lever if needed.';
      ex = cells[1];
    }
    if (/\\[REVIEW\\].*Pistol Squat to Box or Bench|^Pistol Squat to Box or Bench$/i.test(ex)) {
      cells[1] = 'Pistol Squat to Box or Bench';
      cells[7] = 'Use a controlled box/bench height that allows stable single-leg mechanics; lower the target over time.';
      ex = cells[1];
    }
`;
if (!s.includes(approved)) {
  const n = s.split(marker).length - 1;
  if (n !== 1) throw new Error(`warrior approved-review anchor expected once, found ${n}`);
  s = s.replace(marker, approved + marker);
  fs.writeFileSync(serverPath, s);
  console.log('phase14/server.js: added approved Warrior review repairs');
} else {
  console.log('phase14/server.js: Warrior review repairs already current');
}

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const before = b;
b = b.replaceAll('deterministic-skeleton-v5.2-benchmark-anchored', 'deterministic-skeleton-v5.2.1-warrior-approved');
b = b.replaceAll('raz-phase15-benchmark-v5-2', 'raz-phase15-warrior-v5-2-1');
if (b !== before) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== before ? 'upgraded live marker' : 'already on v5.2.1'}`);
