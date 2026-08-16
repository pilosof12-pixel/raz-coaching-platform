import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const p = path.join(root, 'engine', 'exercise_dictionary.js');
let src = fs.readFileSync(p, 'utf8');
let changed = false;

const gatedOld = `      // Gated but nothing over-prescribed: leave a non-fatal note if any row exists.\n      if (maxPrescribed >= 0) {\n        const note = \`[REVIEW] \${family} gated — \${selection.reason}\`;\n        out = annotateFamilyRow(out, family, maxPrescribed, note, isHebrew);\n        annotations.push({ family, type: "gated", note });\n      }`;
const gatedNew = `      // Gated but nothing over-prescribed: keep the coaching signal as structured\n      // QA metadata only. Internal review markers must never enter client output.\n      if (maxPrescribed >= 0) {\n        const note = \`\${family} gated — \${selection.reason}\`;\n        annotations.push({ family, type: "gated", note });\n      }`;
if (src.includes(gatedOld)) {
  src = src.replace(gatedOld, gatedNew);
  changed = true;
}

const freqOld = `      if (actual > 0 && actual < recommended) {\n        const note = \`[REVIEW] Frequency below skill-family recommendation (\${actual}x/week vs recommended \${recommended}x/week)\`;\n        out = annotateFamilyRow(out, family, maxPrescribed, note, isHebrew);\n        annotations.push({ family, type: "frequency", actual, recommended, note });\n      }`;
const freqNew = `      if (actual > 0 && actual < recommended) {\n        const note = \`Frequency below skill-family recommendation (\${actual}x/week vs recommended \${recommended}x/week)\`;\n        annotations.push({ family, type: "frequency", actual, recommended, note });\n      }`;
if (src.includes(freqOld)) {
  src = src.replace(freqOld, freqNew);
  changed = true;
}

if (!src.includes('Internal review markers must never enter client output.')) {
  throw new Error('skill annotation cleanliness patch did not apply');
}

if (changed) fs.writeFileSync(p, src);
console.log(`exercise_dictionary.js: ${changed ? 'skill annotations kept internal' : 'already current'}`);
