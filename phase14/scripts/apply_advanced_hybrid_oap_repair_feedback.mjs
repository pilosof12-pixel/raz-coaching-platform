import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MARKER = 'ADVANCED-HYBRID-OAP-REPAIR-VOLUME-LOCK';
const runtimePath = fileURLToPath(new URL('../server.phase15.js', import.meta.url));
let source = fs.readFileSync(runtimePath, 'utf8');

if (!source.includes(MARKER)) {
  const anchor = 'Do not replace removed sets with extra reps, harder effort, new exercises, intervals, finishers or conditioning. This is a measurable workload reduction, not a prose rewrite.';
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Advanced Hybrid OAP repair feedback anchor expected once, found ${count}`);
  const replacement = 'STRICT OAP VOLUME LOCK: preserve Week 4 direct strict One-Arm Pull-up set count at or below Week 3. Never move sets removed from accessories, bilateral pulling, pressing or lower-body work into extra strict OAP attempts. Reduce fatigue around the primary skill while retaining its best earned quality. Do not replace removed sets with extra reps, harder effort, new exercises, intervals, finishers or conditioning. This is a measurable workload reduction, not a prose rewrite. [ADVANCED-HYBRID-OAP-REPAIR-VOLUME-LOCK]';
  source = source.replace(anchor, replacement);
  fs.writeFileSync(runtimePath, source);
  console.log('Advanced Hybrid OAP repair feedback volume lock applied.');
} else {
  console.log('Advanced Hybrid OAP repair feedback volume lock already current.');
}
