import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const p=fileURLToPath(new URL('../phase14/engine/phase15_planner.js', import.meta.url));
let s=fs.readFileSync(p,'utf8');
const before=s;

const old=`  const zone2Goal = /zone\\s*2|aerobic|day.to.day energy|conditioning/i.test(\`${'${secondary} ${maintenance} ${notes}'}\`);\n  if (zone2Goal) {\n    required.push('Two meaningful low-fatigue Zone 2 exposures using canonical Zone-2 Bike or Zone-2 Row, roughly 20-35 minutes each. A 10-12 minute mini-dose does not satisfy this aerobic-base goal.');\n    forbidden.push('Unrequested hard intervals, threshold, VO2, AMRAP, sprints or hard running when combat sport already supplies high-intensity conditioning.');\n  }`;
const replacement=`  // Source-grounded aerobic-base routing. Do not infer a Zone-2 goal from a\n  // restriction sentence such as "avoid hard conditioning", and do not hard-code\n  // a universal two-session dose. The endurance knowledge layer owns frequency,\n  // duration and modality selection.\n  const zone2Goal = /zone\\s*2|aerobic(?:\\s+base)?|day.to.day energy/i.test(\`${'${secondary} ${maintenance}'}\`); // SOURCE-ROUTED-ZONE2-GOAL\n  if (zone2Goal) {\n    required.push('Explicit aerobic-base / Zone 2 goal: include meaningful low-intensity work, but choose frequency, duration and modality from the curated endurance sources and the athlete recovery budget rather than a universal fixed dose.');\n    forbidden.push('Unrequested hard intervals, threshold, VO2, AMRAP, sprints or hard running when combat sport already supplies high-intensity conditioning.');\n  }`;
if(s.includes(old)) s=s.replace(old,replacement);
else if(!s.includes('SOURCE-ROUTED-ZONE2-GOAL')) throw new Error('old Zone2 planner block not found');

const oldLabel=`  if (zone2Goal) labels.push('ZONE2_A','ZONE2_B');`;
const newLabel=`  if (zone2Goal) labels.push('AEROBIC_BASE_SOURCE_SELECTED'); // no universal frequency floor`;
if(s.includes(oldLabel)) s=s.replace(oldLabel,newLabel);
else if(!s.includes('AEROBIC_BASE_SOURCE_SELECTED')) throw new Error('Zone2 label block not found');

if(s!==before) fs.writeFileSync(p,s);
console.log(`${p}: ${s===before?'already current':'planner endurance cleanup applied'}`);

// Update old regression assertions that encoded the previous universal
// 2 x 20-35 minute Bike/Row rule. Those assertions are contrary to the
// source-grounding hard contract; test source-routing and low-fatigue intent instead.
const tp=fileURLToPath(new URL('../phase14/test/phase15_planner_regression.test.mjs', import.meta.url));
let t=fs.readFileSync(tp,'utf8');
const tb=t;
t=t.replace("  assert.match(brief, /20-35 minutes each/);\n  assert.match(brief, /10-12 minute mini-dose does not satisfy/);", "  assert.match(brief, /choose frequency, duration and modality from the curated endurance sources/i);\n  assert.doesNotMatch(brief, /20-35 minutes each|Two meaningful low-fatigue Zone 2 exposures/i);");
t=t.replace("  assert.match(brief, /Zone-2 Bike/);", "  assert.match(brief, /aerobic-base \\/ Zone 2 goal/i);");
// A prior one-off run briefly inserted this assertion. The brief correctly contains
// the instruction phrase "Never output [REVIEW]", so matching the literal token in
// the coach-only brief is expected; client-output leakage is tested elsewhere.
t=t.replace("  assert.doesNotMatch(brief, /\\[REVIEW\\]/);\n", "");
if(t!==tb) fs.writeFileSync(tp,t);
console.log(`${tp}: ${t===tb?'already current':'planner regression expectations updated'}`);
