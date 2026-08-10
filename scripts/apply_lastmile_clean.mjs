import fs from 'node:fs';

const serverPath = 'phase14/server.js';
let s = fs.readFileSync(serverPath, 'utf8');
const originalServer = s;

const aliasRepair = `    if (/\\[REVIEW\\].*Step Back Lunge|^Step Back Lunge$/i.test(ex)) {
      cells[1] = 'Reverse Lunge';
      cells[7] = 'Use a controlled step-back lunge with stable knee tracking. Add belt/plate load only while balance and range stay clean.';
      ex = cells[1];
    }
`;
const aliasAnchor = "    if (/\\[REVIEW\\].*Ring Leg Curl|^Ring Leg Curl$/i.test(ex)) {";
if (!s.includes("Use a controlled step-back lunge")) {
  const idx = s.indexOf(aliasAnchor);
  if (idx < 0) throw new Error('step-back alias anchor missing');
  s = s.slice(0, idx) + aliasRepair + s.slice(idx);
}

if (s !== originalServer) fs.writeFileSync(serverPath, s);
console.log(`${serverPath}: ${s !== originalServer ? 'patched Step Back Lunge alias' : 'already current'}`);

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const originalBuilder = b;
b = b.replace(
  "Use Ring Hamstring Curl, not Ring Leg Curl. Use Ring Push-up, not Rings Push-up.",
  "Use Ring Hamstring Curl, not Ring Leg Curl. Use Ring Push-up, not Rings Push-up. Use Reverse Lunge, not Step Back Lunge."
);
b = b.replaceAll('deterministic-skeleton-v5.2.7-warrior-client', 'deterministic-skeleton-v5.2.8-warrior-delivery');
b = b.replaceAll('raz-phase15-warrior-v5-2-7', 'raz-phase15-warrior-v5-2-8');
if (b !== originalBuilder) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== originalBuilder ? 'upgraded to v5.2.8 Warrior delivery rules' : 'already current'}`);
