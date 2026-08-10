import fs from 'node:fs';

const serverPath = 'phase14/server.js';
let s = fs.readFileSync(serverPath, 'utf8');
const originalServer = s;

const aliasRepair = `    if (/\\[REVIEW\\].*Ring Leg Curl|^Ring Leg Curl$/i.test(ex)) {
      cells[1] = 'Ring Hamstring Curl';
      cells[7] = 'Keep hips extended and control the eccentric. Adjust body position to stay 1-2 reps in reserve.';
      ex = cells[1];
    }
    if (/\\[REVIEW\\].*Rings Push-up|^Rings Push-up$/i.test(ex)) {
      cells[1] = 'Ring Push-up';
      cells[7] = 'Keep the rings stable, body rigid and shoulders controlled. Progress range or loading only while reps stay clean.';
      ex = cells[1];
    }
`;
const aliasAnchor = "    if (/\\[REVIEW\\].*Short Sprint|^Short Sprint$/i.test(ex)) {";
if (!s.includes("Keep hips extended and control the eccentric")) {
  const idx = s.indexOf(aliasAnchor);
  if (idx < 0) throw new Error('alias anchor missing');
  s = s.slice(0, idx) + aliasRepair + s.slice(idx);
}

if (s !== originalServer) fs.writeFileSync(serverPath, s);
console.log(`${serverPath}: ${s !== originalServer ? 'patched final ring aliases' : 'already current'}`);

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const originalBuilder = b;

b = b.replace(
  "Use Sprint, not Short Sprint. Use Chin-up or Pull-up instead of Ring Chin-up.",
  "Use Sprint, not Short Sprint. Use Chin-up or Pull-up instead of Ring Chin-up. Use Ring Hamstring Curl, not Ring Leg Curl. Use Ring Push-up, not Rings Push-up."
);
b = b.replaceAll('deterministic-skeleton-v5.2.6-warrior-certified', 'deterministic-skeleton-v5.2.7-warrior-client');
b = b.replaceAll('raz-phase15-warrior-v5-2-6', 'raz-phase15-warrior-v5-2-7');
if (b !== originalBuilder) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== originalBuilder ? 'upgraded to v5.2.7 Warrior client rules' : 'already current'}`);
