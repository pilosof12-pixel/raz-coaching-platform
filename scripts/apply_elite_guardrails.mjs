import fs from 'node:fs';

const path='phase14/engine/phase15_program_qa.js';
let q=fs.readFileSync(path,'utf8');
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
  q=q.replace(anchor, anchor+'\n\n  // Avatar-agnostic elite quality floor. These run before specialized checks so a\n  // new sport/goal combination cannot silently fall through a benchmark-specific rule.\n  flags.push(...goalDoseFlags(raw, intake, parsed));\n  flags.push(...unbenchmarkedVariationLoadFlags(intake, parsed));\n  flags.push(...strengthSessionAccountingFlags(raw, intake, parsed)); // ELITE-GUARDRAILS-FINAL-QA-WIRED');
}

if (q!==before) fs.writeFileSync(path,q);
console.log(`${path}: ${q===before?'already current':'elite guardrails wired'}`);
