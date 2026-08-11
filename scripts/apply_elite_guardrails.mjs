import fs from 'node:fs';

const qaPath='phase14/engine/phase15_program_qa.js';
let q=fs.readFileSync(qaPath,'utf8');
const before=q;

if (!q.includes('phase15_elite_guardrails.js')) {
  const anchor='} from "./phase15_quality_rules.js";';
  if (!q.includes(anchor)) throw new Error('quality-rules import anchor missing');
  q=q.replace(anchor, anchor+'\nimport {\n  elitePromptRules,\n  goalDoseFlags,\n  unbenchmarkedVariationLoadFlags,\n  strengthSessionAccountingFlags,\n} from "./phase15_elite_guardrails.js";');
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

if (q!==before) fs.writeFileSync(qaPath,q);
console.log(`${qaPath}: ${q===before?'already current':'elite guardrails wired'}`);

// Keep true lift variants distinct. Back Squat is not an exact benchmark for Box Squat,
// Front Squat is not Back Squat, Push Press is not strict OHP, etc. Family matching is
// only used to detect that a related benchmark exists; exact fixed-load permission needs
// the actual named variation.
const elitePath='phase14/engine/phase15_elite_guardrails.js';
let e=fs.readFileSync(elitePath,'utf8');
const eliteBefore=e;
const oldCanonical=`function canonicalLift(name='') {\n  return norm(name).replace(/\\[[^\\]]+\\]/g,'').replace(/\\b(to parallel|parallel|paused?|tempo|speed|box|front|high bar|low bar|deficit|block|rack|close grip|incline|dumbbell|barbell|strict)\\b/g,' ').replace(/\\s+/g,' ').trim();\n}`;
const newCanonical=`function canonicalLift(name='') {\n  return norm(name)\n    .replace(/\\[[^\\]]+\\]/g,'')\n    .replace(/[:].*$/,'')\n    .replace(/\\b(to parallel|parallel|paused?|tempo|speed)\\b/g,' ')\n    .replace(/[^a-z0-9+ -]+/g,' ')\n    .replace(/\\s+/g,' ')\n    .trim(); // EXACT-VARIATION-KEY: preserve box/front/high-bar/push-press/etc.\n}`;
if (e.includes(oldCanonical)) e=e.replace(oldCanonical,newCanonical);
if (!e.includes('EXACT-VARIATION-KEY')) throw new Error('elite exact-variation patch did not apply');
if (e!==eliteBefore) fs.writeFileSync(elitePath,e);
console.log(`${elitePath}: ${e===eliteBefore?'already current':'exact-variation matching fixed'}`);
