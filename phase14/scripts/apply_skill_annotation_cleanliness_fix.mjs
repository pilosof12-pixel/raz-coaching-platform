import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const p = path.join(root, 'engine', 'exercise_dictionary.js');
let src = fs.readFileSync(p, 'utf8');
let changed = false;

const marker = '// SKILL-ANNOTATIONS-INTERNAL-ONLY';

const gatedReview = '        const note = `[REVIEW] ${family} gated — ${selection.reason}`;';
const gatedClean = '        const note = `${family} gated — ${selection.reason}`;';
if (src.includes(gatedReview)) {
  src = src.replace(gatedReview, gatedClean);
  changed = true;
}

const freqReview = '        const note = `[REVIEW] Frequency below skill-family recommendation (${actual}x/week vs recommended ${recommended}x/week)`;';
const freqClean = '        const note = `Frequency below skill-family recommendation (${actual}x/week vs recommended ${recommended}x/week)`;';
if (src.includes(freqReview)) {
  src = src.replace(freqReview, freqClean);
  changed = true;
}

// Older runtimes wrote these internal advisories into the client Notes cell.
// V34 may already have removed the mutation lines before this build patch runs.
const mutation = '        out = annotateFamilyRow(out, family, maxPrescribed, note, isHebrew);\n';
let removed = 0;
while (src.includes(mutation) && removed < 2) {
  src = src.replace(mutation, '');
  removed += 1;
  changed = true;
}

if (!src.includes(marker)) {
  const anchor = '      // Gated but nothing over-prescribed: leave a non-fatal note if any row exists.\n';
  const alreadyCleanAnchor = '      // Gated but nothing over-prescribed: keep the coaching signal as structured\n';
  if (src.includes(anchor)) {
    src = src.replace(anchor, `      ${marker}\n      // Gated but nothing over-prescribed: keep the coaching signal as structured QA metadata only.\n`);
    changed = true;
  } else if (src.includes(alreadyCleanAnchor)) {
    src = src.replace(alreadyCleanAnchor, `      ${marker}\n${alreadyCleanAnchor}`);
    changed = true;
  } else {
    throw new Error('skill annotation cleanliness anchor missing');
  }
}

if (/\[REVIEW\]\s*(?:Frequency below skill-family recommendation|\$\{family\} gated)/.test(src)) {
  throw new Error('skill annotation cleanliness left a client review marker behind');
}
if (src.includes('out = annotateFamilyRow(out, family, maxPrescribed, note, isHebrew);')) {
  throw new Error('skill annotation cleanliness left a client-note mutation behind');
}

if (changed) fs.writeFileSync(p, src);
console.log(`exercise_dictionary.js: ${changed ? 'skill annotations kept internal' : 'already current'}`);
