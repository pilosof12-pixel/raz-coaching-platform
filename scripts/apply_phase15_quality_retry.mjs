import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dictPath=fileURLToPath(new URL('../phase14/engine/exercise_dictionary.js',import.meta.url));
let d=fs.readFileSync(dictPath,'utf8');
const db=d;
if(!d.includes('"PHASE15_QUALITY_VIOLATION"')) {
  const anchor='  "SKILL_PREREQ_VIOLATION", "SKILL_UNDER_PROGRAMMED",\n]);';
  if(!d.includes(anchor)) throw new Error('RETRIABLE_CODES anchor missing');
  d=d.replace(anchor,'  "SKILL_PREREQ_VIOLATION", "SKILL_UNDER_PROGRAMMED", "PHASE15_QUALITY_VIOLATION",\n]);');
}
if(d!==db) fs.writeFileSync(dictPath,d);

const serverPath=fileURLToPath(new URL('../phase14/server.js',import.meta.url));
let s=fs.readFileSync(serverPath,'utf8');
const sb=s;
if(!s.includes('PHASE15-QUALITY-REGEN-PATH')) {
  const anchor=`        await onProgress("refining", attempt, err.code);\n        if (failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) {`;
  if(!s.includes(anchor)) throw new Error('validator retry anchor missing');
  const replacement=`        await onProgress("refining", attempt, err.code);\n        // Phase 15 coaching-quality failures must be corrected by another\n        // source-grounded model pass. Do NOT route them through hardSubstitute:\n        // changing training dose/progression deterministically would make the\n        // validator a second unsourced coach.\n        if (err.code === "PHASE15_QUALITY_VIOLATION") { // PHASE15-QUALITY-REGEN-PATH\n          if (!amendments.includes(err.amendment)) amendments.push(err.amendment);\n          if (attempt === MAX_ATTEMPTS) throw err;\n          continue;\n        }\n        if (failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) {`;
  s=s.replace(anchor,replacement);
}
if(s!==sb) fs.writeFileSync(serverPath,s);

const buildPath=fileURLToPath(new URL('../phase14/scripts/build_phase15_runtime.mjs',import.meta.url));
let b=fs.readFileSync(buildPath,'utf8');
const bb=b;
b=b.replace("'  const MAX_ATTEMPTS = OPENAI_API_KEY ? 1 : 3;'","'  const MAX_ATTEMPTS = OPENAI_API_KEY ? 2 : 3;'");
if(!b.includes("OPENAI_API_KEY ? 2 : 3")) throw new Error('OpenAI correction-attempt patch failed');
if(b!==bb) fs.writeFileSync(buildPath,b);

console.log('Phase 15 source-grounded correction retry path applied');
