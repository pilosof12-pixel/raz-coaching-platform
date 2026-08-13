import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js', import.meta.url));
let e=fs.readFileSync(elitePath,'utf8');
const e0=e;

// Meaningful interval dose must account for sets x duration. A 4 x 8 min run or
// 3 x 10 min bike session is not a token 8/10-minute exposure.
if (!e.includes('MEANINGFUL-INTERVAL-SETS-DURATION')) {
  const old="    const mins=[...dose.matchAll(/(\\d+(?:\\.\\d+)?)\\s*(?:min|minutes?)\\b/gi)].map(m=>Number(m[1]));\n    const meaningful=mins.some(x=>x>=15)||/\\b\\d+(?:\\.\\d+)?\\s*(?:km|m)\\b/i.test(dose)||/\\b\\d+\\s*(?:x|×)\\s*\\d+(?:\\.\\d+)?\\s*(?:m|km|min|minutes?)\\b/i.test(dose);";
  const neu="    const mins=[...dose.matchAll(/(\\d+(?:\\.\\d+)?)\\s*(?:min|minutes?)\\b/gi)].map(m=>Number(m[1]));\n    const setCount=Math.max(1,Number(row.cells[parsed.idx.sets]||1)||1);\n    const meaningful=mins.some(x=>x>=15||x*setCount>=15)||/\\b\\d+(?:\\.\\d+)?\\s*(?:km|m)\\b/i.test(dose)||/\\b\\d+\\s*(?:x|×)\\s*\\d+(?:\\.\\d+)?\\s*(?:m|km|min|minutes?)\\b/i.test(dose); // MEANINGFUL-INTERVAL-SETS-DURATION";
  if(!e.includes(old)) throw new Error('elite meaningful-dose anchor missing');
  e=e.replace(old,neu);
}

// Rowing splits such as 1:46/500m are event-specific external targets.
if (!e.includes('ROWING-500M-SPLIT-PROGRESSION')) {
  const old="  return /(?:\\b(?:interval|threshold|critical speed|critical power|race pace|goal pace|target pace|2k pace|3k pace|5k pace|10k pace|marathon pace|split target|stroke rate|cadence|power target|pace target)\\b|\\b\\d+(?::\\d+)?\\s*\\/\\s*km\\b|\\b\\d+(?:\\.\\d+)?\\s*(?:km\\/h|kph|watts?|w)\\b|\\bprogress(?:ion|ively)?\\b)/i.test(s);";
  const neu="  return /(?:\\b(?:interval|threshold|critical speed|critical power|race pace|goal pace|target pace|2k pace|3k pace|5k pace|10k pace|marathon pace|split target|stroke rate|cadence|power target|pace target)\\b|\\b\\d+:\\d+(?:-\\d+:\\d+)?\\s*\\/\\s*500m\\b|\\b\\d+(?::\\d+)?\\s*\\/\\s*km\\b|\\b\\d+(?:\\.\\d+)?\\s*(?:km\\/h|kph|watts?|w)\\b|\\bprogress(?:ion|ively)?\\b)/i.test(s); // ROWING-500M-SPLIT-PROGRESSION";
  if(!e.includes(old)) throw new Error('event progression regex anchor missing');
  e=e.replace(old,neu);
}

// Pain-sensitive specificity: if the intake says the aggravating feature is deep/
// high-volume squatting and explicitly says box squat is tolerated, a box squat
// may preserve the squat-strength target without forcing the provocative feature.
if (!e.includes('PAIN-SENSITIVE-SQUAT-SUBSTITUTION')) {
  const anchor="function explicitMovementAvoidance(intake,label) {\n  const s=JSON.stringify({pain:intake.pain,injuries:intake.injuries,limitations:intake.limitations,notes:intake.notes}).toLowerCase();\n  const name=label.toLowerCase().replace(/[- ]/g,'[- ]?');\n  return new RegExp(`(?:avoid|cannot|can't|not tolerated|do not|painful)[^.!]{0,60}${name}|${name}[^.!]{0,60}(?:aggravat|painful|not tolerated|avoid|cannot|can't)`, 'i').test(s);\n}\n";
  if(!e.includes(anchor)) throw new Error('movement avoidance anchor missing');
  const helper=anchor+"\nfunction painSensitiveCloseVariation(intake,label,parsed=null) {\n  if (label!=='Back Squat') return false;\n  const s=JSON.stringify({pain:intake.pain,injuries:intake.injuries,limitations:intake.limitations,notes:intake.notes}).toLowerCase();\n  const mechanism=/(deep|depth|below parallel|high[- ]?volume|lumbar flexion|butt wink|range of motion|\\brom\\b)/i.test(s);\n  const boxTolerated=/(?:box squat[^.!]{0,70}(?:tolerat|comfortable|pain.?free)|(?:tolerat|comfortable|pain.?free)[^.!]{0,70}box squat)/i.test(s);\n  if(!(mechanism&&boxTolerated)) return false;\n  if(!parsed) return true;\n  const ex=parsed.idx.exercise;\n  return parsed.rows.some(row=>!/^\\s*\\[WARMUP\\]/i.test(String(row.cells[ex]||''))&&/^Box Squat(?: to Parallel)?$/i.test(String(row.cells[ex]||'').trim()));\n} // PAIN-SENSITIVE-SQUAT-SUBSTITUTION\n";
  e=e.replace(anchor,helper);
  e=e.replace("    if(!def.goal.test(primary)||explicitMovementAvoidance(intake,def.label)) continue;","    if(!def.goal.test(primary)||explicitMovementAvoidance(intake,def.label)) continue;\n    const closePainVariation=painSensitiveCloseVariation(intake,def.label,parsed);");
  e=e.replace("    if(!present) flags.push({","    if(!present && !closePainVariation) flags.push({");
  const promptOld="  for(const def of EXACT_PRIMARY_LIFTS) if(def.goal.test(primary)&&!explicitMovementAvoidance(intake,def.label)) rules.push(`PRIMARY-MOVEMENT INTEGRITY: ${def.label} is named in a primary goal and is not explicitly prohibited by the intake. Keep direct ${def.label} exposure. Related variations may support it but cannot silently replace it.`);";
  const promptNew="  for(const def of EXACT_PRIMARY_LIFTS) {\n    if(!def.goal.test(primary)||explicitMovementAvoidance(intake,def.label)) continue;\n    if(painSensitiveCloseVariation(intake,def.label)) rules.push(`PAIN-SENSITIVE SPECIFICITY: ${def.label} is the target, but the intake identifies an aggravating squat feature and explicitly tolerates a close box-squat variation. Preserve the squat-strength target with the closest tolerated source-supported variation rather than forcing the provocative feature.`);\n    else rules.push(`PRIMARY-MOVEMENT INTEGRITY: ${def.label} is named in a primary goal and is not explicitly prohibited by the intake. Keep direct ${def.label} exposure. Related variations may support it but cannot silently replace it.`);\n  }";
  if(!e.includes(promptOld)) throw new Error('primary movement prompt anchor missing');
  e=e.replace(promptOld,promptNew);
}

if(e!==e0) fs.writeFileSync(elitePath,e);
console.log(`${elitePath}: ${e===e0?'already current':'endurance acceptance logic patched'}`);

const qaPath=fileURLToPath(new URL('../phase14/engine/phase15_program_qa.js', import.meta.url));
let q=fs.readFileSync(qaPath,'utf8');
const q0=q;
if (!q.includes('MEANINGFUL-SPECIFIC-SETS-DURATION')) {
  const h="  const e = parsed.idx.exercise, notes = parsed.idx.notes, reps = parsed.idx.reps, weight = parsed.idx.weight;";
  if(!q.includes(h)) throw new Error('program QA modality index anchor missing');
  q=q.replace(h,"  const e = parsed.idx.exercise, notes = parsed.idx.notes, reps = parsed.idx.reps, weight = parsed.idx.weight, sets = parsed.idx.sets;");
  const old="    const minuteValues = [...dose.matchAll(/(\\d+(?:\\.\\d+)?)\\s*(?:min|minutes?)\\b/gi)].map(m => Number(m[1]));\n    const continuousEnough = minuteValues.some(n => n >= 15);";
  const neu="    const minuteValues = [...dose.matchAll(/(\\d+(?:\\.\\d+)?)\\s*(?:min|minutes?)\\b/gi)].map(m => Number(m[1]));\n    const setCount = Math.max(1, Number(sets >= 0 ? row.cells[sets] || 1 : 1) || 1);\n    const continuousEnough = minuteValues.some(n => n >= 15 || n * setCount >= 15); // MEANINGFUL-SPECIFIC-SETS-DURATION";
  if(!q.includes(old)) throw new Error('program QA meaningful-dose anchor missing');
  q=q.replace(old,neu);
}
if(q!==q0) fs.writeFileSync(qaPath,q);
console.log(`${qaPath}: ${q===q0?'already current':'set-duration specificity patched'}`);

const dictPath=fileURLToPath(new URL('../phase14/engine/exercise_dictionary.js', import.meta.url));
let d=fs.readFileSync(dictPath,'utf8');
const d0=d;
if (!d.includes('ENDURANCE-LIVE-ALIAS-SET')) {
  const anchor='  ["Dumbbell Hammer Curl", "Hammer Curl"],';
  if(!d.includes(anchor)) throw new Error('dictionary alias anchor missing');
  d=d.replace(anchor, anchor+'\n  ["Zone-2 Rower", "Zone-2 Row"],\n  ["Bicep Curl", "Dumbbell Curl"],\n  ["Bicep Curl (Dumbbell)", "Dumbbell Curl"],\n  ["Passive Hang", "Dead Hang"],\n  ["Swimming", "Swim"],\n  ["Cycling", "Bike"],\n  ["Running", "Run"], // ENDURANCE-LIVE-ALIAS-SET');
}
if(d!==d0) fs.writeFileSync(dictPath,d);
console.log(`${dictPath}: ${d===d0?'already current':'live aliases added'}`);
