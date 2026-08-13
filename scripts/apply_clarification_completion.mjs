import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const p=fileURLToPath(new URL('../phase14/intake_clarification.js',import.meta.url));
let s=fs.readFileSync(p,'utf8');
const before=s;

if(!s.includes("id:'planche'")) {
  const anchor="  { id:'one_arm_pullup', goal:/\\b(?:one[- ]arm pull[- ]?up|oap)\\b/i, current:/\\b(?:one[- ]arm pull[- ]?up|oap)\\b/i, label:'one-arm pull-up' },";
  if(!s.includes(anchor)) throw new Error('movement anchor missing');
  s=s.replace(anchor,anchor+`\n  { id:'planche', goal:/\\bplanche\\b/i, current:/\\bplanche\\b/i, label:'planche progression / hold' },\n  { id:'front_lever', goal:/\\bfront lever\\b/i, current:/\\bfront lever\\b/i, label:'front lever progression / hold' },\n  { id:'handstand_pushup', goal:/\\b(?:handstand push[- ]?up|hspu)\\b/i, current:/\\b(?:handstand push[- ]?up|hspu)\\b/i, label:'handstand push-up progression' },\n  { id:'muscle_up', goal:/\\bmuscle[- ]?up\\b/i, current:/\\bmuscle[- ]?up\\b/i, label:'muscle-up' },`);
}

if(!s.includes('equipment_load_ceiling')) {
  const returnAnchor="  return out;\n}";
  const pos=s.lastIndexOf(returnAnchor);
  if(pos<0) throw new Error('clarification return anchor missing');
  const block=`  // Limited-equipment weighted goals need the actual load ceiling when it\n  // materially changes how progression can be written. Commercial/full gyms do\n  // not need this question; park/home/limited setups do when no numeric ceiling\n  // has been supplied.\n  const equipment=text([intake?.equipment,intake?.training_location,intake?.notes]).toLowerCase();\n  const limitedSetup=/(?:park|home|limited|minimal|rings|pull[- ]?up bar|weight(?:ed)? belt|plates? only|outdoor)/i.test(equipment) && !/(?:commercial gym|full gym|fully equipped)/i.test(equipment);\n  const weightedGoal=/\\b(?:weighted (?:chin|pull)[- ]?up|weighted dip|belt load|added load)\\b/i.test(goals);\n  const numericCeiling=/(?:up to|max(?:imum)?|ceiling|available)[^.!]{0,25}\\d+(?:\\.\\d+)?\\s*(?:kg|lb)|\\d+(?:\\.\\d+)?\\s*(?:kg|lb)[^.!]{0,25}(?:available|max|plates?|belt)/i.test(equipment);\n  if(limitedSetup && weightedGoal && !numericCeiling) {\n    addQuestion(out,intake,{\n      id:'equipment_load_ceiling',\n      prompt:'What is the maximum external load you can actually add with your current setup?',\n      help:'For example: weighted belt with up to 25 kg of plates. If there is no practical ceiling, say that.',\n    });\n  }\n\n`;
  s=s.slice(0,pos)+block+s.slice(pos);
}

if(s!==before) fs.writeFileSync(p,s);
console.log(`${p}: ${s===before?'already current':'adaptive clarification completion applied'}`);
