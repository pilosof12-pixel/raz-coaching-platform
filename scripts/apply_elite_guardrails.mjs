import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resolve from this script, not process.cwd(), so the same patcher works both in
// repository-root CI and from Render where Root Directory is phase14/.
const qaPath=fileURLToPath(new URL('../phase14/engine/phase15_program_qa.js', import.meta.url));
let q=fs.readFileSync(qaPath,'utf8');
const before=q;

if (!q.includes('phase15_elite_guardrails.js')) {
  const anchor='} from "./phase15_quality_rules.js";';
  if (!q.includes(anchor)) throw new Error('quality-rules import anchor missing');
  q=q.replace(anchor, anchor+'\nimport {\n  elitePromptRules,\n  goalDoseFlags,\n  unbenchmarkedVariationLoadFlags,\n  strengthSessionAccountingFlags,\n  endurancePerformanceIntegrityFlags,\n  exactPrimaryMovementFlags,\n} from "./phase15_elite_guardrails.js";');
} else if (!q.includes('endurancePerformanceIntegrityFlags')) {
  const anchor='  strengthSessionAccountingFlags,\n} from "./phase15_elite_guardrails.js";';
  if (!q.includes(anchor)) throw new Error('elite import expansion anchor missing');
  q=q.replace(anchor,'  strengthSessionAccountingFlags,\n  endurancePerformanceIntegrityFlags,\n  exactPrimaryMovementFlags,\n} from "./phase15_elite_guardrails.js";');
}

if (!q.includes('ELITE-GUARDRAILS-PROMPT-WIRED')) {
  const anchor='  if (/squat/i.test(primary) && /(max|1\\s*rm|exceed|over\\s*\\d+)/i.test(primary) && /(?:x|×)\\s*(?:6|7|8|9|10|11|12)\\b|(?:6|7|8|9|10|11|12)\\s*reps?/i.test(primary)) {';
  if (!q.includes(anchor)) throw new Error('prompt anchor missing');
  q=q.replace(anchor, '  rules.push(...elitePromptRules(intake)); // ELITE-GUARDRAILS-PROMPT-WIRED\n'+anchor);
}

if (!q.includes('ELITE-GUARDRAILS-FINAL-QA-WIRED')) {
  const anchor='  const flags = [];';
  if (!q.includes(anchor)) throw new Error('validator anchor missing');
  q=q.replace(anchor, anchor+'\n\n  // Avatar-agnostic integrity floor. Coaching dose itself remains source-authored.\n  flags.push(...goalDoseFlags(raw, intake, parsed));\n  flags.push(...unbenchmarkedVariationLoadFlags(intake, parsed));\n  flags.push(...strengthSessionAccountingFlags(raw, intake, parsed)); // ELITE-GUARDRAILS-FINAL-QA-WIRED');
}

if (!q.includes('ENDURANCE-PRESERVATION-FINAL-QA-WIRED')) {
  const anchor='  flags.push(...strengthSessionAccountingFlags(raw, intake, parsed)); // ELITE-GUARDRAILS-FINAL-QA-WIRED';
  if (!q.includes(anchor)) throw new Error('expanded final-QA anchor missing');
  q=q.replace(anchor, anchor+'\n  flags.push(...endurancePerformanceIntegrityFlags(raw, intake, parsed)); // ENDURANCE-PRESERVATION-FINAL-QA-WIRED\n  flags.push(...exactPrimaryMovementFlags(raw, intake, parsed)); // EXACT-PRIMARY-MOVEMENT-FINAL-QA-WIRED');
}

if (q!==before) fs.writeFileSync(qaPath,q);
console.log(`${qaPath}: ${q===before?'already current':'elite guardrails wired'}`);

// Keep true lift variants distinct. Back Squat is not an exact benchmark for Box Squat,
// Front Squat is not Back Squat, Push Press is not strict OHP, etc.
const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js', import.meta.url));
let e=fs.readFileSync(elitePath,'utf8');
const eliteBefore=e;
const oldCanonical=`function canonicalLift(name='') {\n  return norm(name).replace(/\\[[^\\]]+\\]/g,'').replace(/\\b(to parallel|parallel|paused?|tempo|speed|box|front|high bar|low bar|deficit|block|rack|close grip|incline|dumbbell|barbell|strict)\\b/g,' ').replace(/\\s+/g,' ').trim();\n}`;
const legacyReplacement=`function canonicalLift(name='') {\n  return norm(name)\n    .replace(/\\[[^\\]]+\\]/g,'')\n    .replace(/[:].*$/,'')\n    .replace(/\\brdl\\b/g,'romanian deadlift')\n    .replace(/\\bohp\\b/g,'overhead press')\n    .replace(/[^a-z0-9+ -]+/g,' ')\n    .replace(/\\s+/g,' ')\n    .trim(); // EXACT-VARIATION-KEY: keep box/front/pause/ROM/push-press/etc distinct.\n}`;
if (e.includes(oldCanonical)) e=e.replace(oldCanonical,legacyReplacement);
if (!e.includes('EXACT-VARIATION-KEY')) throw new Error('elite exact-variation patch did not apply');
if (e!==eliteBefore) fs.writeFileSync(elitePath,e);
console.log(`${elitePath}: ${e===eliteBefore?'already current':'exact-variation matching fixed'}`);

// Event-specific endurance work needs canonical names that describe the actual
// modality, not a fake strength exercise or a warm-up. This is vocabulary only;
// workout dose and intensity still come from the authored endurance sources.
const dictPath=fileURLToPath(new URL('../phase14/engine/exercise_dictionary.js', import.meta.url));
let d=fs.readFileSync(dictPath,'utf8');
const dictBefore=d;
if (!d.includes('"Run", "Bike", "Swim", "Rowing Ergometer"')) {
  const anchor='  "Zone-2 Bike", "Zone-2 Row", "Zone-2 Run", "Assault Bike", "Airbike Intervals",';
  if (!d.includes(anchor)) throw new Error('conditioning dictionary anchor missing');
  d=d.replace(anchor, '  "Run", "Bike", "Swim", "Rowing Ergometer",\n'+anchor);
}
if (!d.includes('["Bike", ["bike"]]')) {
  const anchor='  ["Stationary Bike", ["bike"]], ["Elliptical", ["elliptical"]],';
  if (!d.includes(anchor)) throw new Error('conditioning equipment anchor missing');
  d=d.replace(anchor, '  ["Stationary Bike", ["bike"]], ["Elliptical", ["elliptical"]],\n  ["Bike", ["bike"]], ["Swim", ["pool"]], ["Rowing Ergometer", ["rower"]],');
}
if (!d.includes('add("pool")')) {
  const anchor='    if (/treadmill/.test(s)) add("treadmill");';
  if (!d.includes(anchor)) throw new Error('equipment-token pool anchor missing');
  d=d.replace(anchor, anchor+'\n    if (/\\bpool\\b|swimming pool|swim access/.test(s)) add("pool");');
}
if (!d.includes('ENDURANCE-MODALITY-CANONICAL-SET')) {
  d=d.replace('export const EXERCISE_DICTIONARY = new Set(DICTIONARY_LIST);','export const EXERCISE_DICTIONARY = new Set(DICTIONARY_LIST); // ENDURANCE-MODALITY-CANONICAL-SET');
}
if(d!==dictBefore) fs.writeFileSync(dictPath,d);
console.log(`${dictPath}: ${d===dictBefore?'already current':'endurance modality vocabulary added'}`);
