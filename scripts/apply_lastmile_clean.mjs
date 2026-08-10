import fs from 'node:fs';

const path = 'phase14/server.js';
let s = fs.readFileSync(path, 'utf8');
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
  fs.writeFileSync(path, s);
  console.log('phase14/server.js: added approved Warrior review repairs');
} else {
  console.log('phase14/server.js: Warrior review repairs already current');
}
