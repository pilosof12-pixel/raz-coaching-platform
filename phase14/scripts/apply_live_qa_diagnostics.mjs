import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'server.phase15.js');
let src = fs.readFileSync(target, 'utf8');

if (src.includes('QA-DIAGNOSTIC-UNKNOWN-NAMES')) {
  console.log(`${target}: QA diagnostic detail already current`);
  process.exit(0);
}

const anchor = '        qaTrace.push(`A${attempt}:${repairLabel}`);';
const count = src.split(anchor).length - 1;
if (count !== 1) throw new Error(`QA diagnostic trace anchor expected once, found ${count}`);

const replacement = `        const qaHallucinationSource = repairCode === "EXERCISE_HALLUCINATION"\n          ? err\n          : (Array.isArray(err?.flags) ? err.flags.find((flag) => flag?.code === "EXERCISE_HALLUCINATION") : null);\n        const qaUnknownNames = intake && intake.qa_diagnostics === true && Array.isArray(qaHallucinationSource?.details?.unknown)\n          ? qaHallucinationSource.details.unknown\n              .map((u) => String(u?.exercise || '').replace(/[\\r\\n\\[\\]|]+/g, ' ').trim().slice(0, 60))\n              .filter(Boolean)\n              .slice(0, 6)\n          : [];\n        const qaUnknownSuffix = qaUnknownNames.length ? '[' + qaUnknownNames.join('|') + ']' : '';\n        qaTrace.push(\`A\${attempt}:\${repairLabel}\${qaUnknownSuffix}\`); // QA-DIAGNOSTIC-UNKNOWN-NAMES`;

src = src.replace(anchor, replacement);
fs.writeFileSync(target, src);
console.log(`${target}: QA-only rejected exercise-name diagnostics wired`);
