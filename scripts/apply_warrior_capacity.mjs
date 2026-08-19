import fs from 'node:fs';

const path='phase14/engine/phase15_planner.js';
let s=fs.readFileSync(path,'utf8');
const before=s;

if (!s.includes('WARRIOR-CAPACITY-SOURCE-ROUTE')) {
  const zoneAnchor=`  const zone2Goal = /zone\\s*2|aerobic|day.to.day energy|conditioning/i.test(\`${'${secondary} ${maintenance} ${notes}'}\`);`;
  if (!s.includes(zoneAnchor)) throw new Error('zone2 anchor missing');
  s=s.replace(zoneAnchor, zoneAnchor+`\n  // WARRIOR-CAPACITY-SOURCE-ROUTE: preserve the previously validated park-only Warrior\n  // solution from the authored GPP/conditioning knowledge. This is intentionally NOT a\n  // universal "work capacity = Zone 2" rule; it only activates for the Warrior/Batman\n  // athletic-hypertrophy profile in an outdoor-park environment with no named modality.\n  const warriorCapacityGoal = /(?:warrior|batman)/i.test(\`${'${primary} ${secondary} ${notes}'}\`)\n    && /(?:work capacity|body composition|fat loss|lose fat)/i.test(\`${'${primary} ${secondary} ${notes}'}\`)\n    && String(intake.training_location || '').toLowerCase() === 'outdoor_park';`);

  const afterZone=`  if (zone2Goal) {\n    required.push('Two meaningful low-fatigue Zone 2 exposures using canonical Zone-2 Bike or Zone-2 Row, roughly 20-35 minutes each. A 10-12 minute mini-dose does not satisfy this aerobic-base goal.');\n    forbidden.push('Unrequested hard intervals, threshold, VO2, AMRAP, sprints or hard running when combat sport already supplies high-intensity conditioning.');\n  }`;
  if (!s.includes(afterZone)) throw new Error('zone2 block anchor missing');
  s=s.replace(afterZone, afterZone+`\n  if (warriorCapacityGoal && !zone2Goal) {\n    required.push('WARRIOR CAPACITY SOURCE RULE: authored advanced-GPP/conditioning logic requires a small aerobic-base dose alongside the two mandatory park strength sessions. Use two 25-30 minute Zone-2 Run exposures as brisk walking/easy jogging at conversational RPE 4-5. They may be separated from lifting. Keep them low fatigue; do not replace them with random AMRAPs or hard circuits.');\n  }`);

  const labelAnchor=`  if (zone2Goal) labels.push('ZONE2_A','ZONE2_B');`;
  if (!s.includes(labelAnchor)) throw new Error('zone2 labels anchor missing');
  s=s.replace(labelAnchor, `  if (zone2Goal || warriorCapacityGoal) labels.push('ZONE2_A','ZONE2_B');`);
}

if (s!==before) fs.writeFileSync(path,s);
console.log(`${path}: ${s===before?'already current':'Warrior capacity route restored'}`);
