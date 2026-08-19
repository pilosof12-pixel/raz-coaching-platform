import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const target = path.join(root, 'engine', 'coaching_spec_v1_convergence_normalizer.js');
let src = fs.readFileSync(target, 'utf8');

function replaceOnce(label, find, replace, already) {
  if (already && src.includes(already)) {
    console.log(`${label}: already current`);
    return;
  }
  const count = src.split(find).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  src = src.replace(find, replace);
  console.log(`${label}: applied`);
}

replaceOnce(
  'Youth visible primary progression helpers',
  "function isPowerName(name) { return /explosive hip-to-bar|box jump|broad jump|sprint/i.test(String(name || '')); }\n\nexport function normalizeYouthSkillAcquisitionQuality",
  `function isPowerName(name) { return /explosive hip-to-bar|box jump|broad jump|sprint/i.test(String(name || '')); }\n\n// YOUTH-V32-VISIBLE-PRIMARY-PROGRESSION\n// The youth progression validators deliberately ignore Notes-only changes. For\n// acquisition goals, make one safe prescription variable visibly develop across\n// Weeks 1-3, then consolidate in Week 4. Attempt numbers remain ceilings and\n// assistance only decreases when the previous rung was technically clean.\nfunction youthVisibleProgressionTargets(week) {\n  return {\n    handstand: {\n      1: { sets: '3', reps: '2', cue: 'Six high-quality entries is a ceiling, not a quota; stop earlier if balance quality deteriorates.' },\n      2: { sets: '4', reps: '2', cue: 'Up to eight high-quality entries only if Week 1 stayed crisp; otherwise repeat the prior ceiling.' },\n      3: { sets: '4', reps: '3', cue: 'Up to twelve high-quality entries only if control remains stable; stop before fatigue-driven misses.' },\n      4: { sets: '3', reps: '2', cue: 'Consolidation week: reduce attempt exposure and retain only high-quality independent balance practice.' },\n    }[week],\n    transition: {\n      1: 'Moderate band assistance for a smooth, repeatable bar turnover',\n      2: 'Slightly lighter band assistance if every Week 1 turnover was clean',\n      3: 'Lightest band assistance that still preserves a clean bar turnover',\n      4: 'Moderate band assistance for crisp consolidation singles',\n    }[week],\n  };\n}\nfunction isHandstandBalanceAcquisitionRow(name) {\n  return /controlled handstand kick[- ]?up|freestanding handstand|wall float|toe pull|heel pull/i.test(String(name || ''));\n}\nfunction applyYouthVisiblePrimaryProgression(parsed, week, intake, repairs) {\n  const primary = lower(goals(intake, 'primary'));\n  const target = youthVisibleProgressionTargets(week);\n  let changed = false;\n  parsed.rows.forEach((cells, row) => {\n    const name = String(cells[parsed.exercise] || '').trim();\n    if (/freestanding handstand|unsupported handstand|handstand balance/i.test(primary) && isHandstandBalanceAcquisitionRow(name)) {\n      const before = { sets: cells[parsed.sets], reps: cells[parsed.reps] };\n      cells[parsed.sets] = target.handstand.sets;\n      cells[parsed.reps] = target.handstand.reps;\n      if (Number.isInteger(parsed.notes)) {\n        const marker = week === 4 ? 'consolidation week' : (week === 1 ? 'six high-quality entries' : week === 2 ? 'up to eight high-quality entries' : 'up to twelve high-quality entries');\n        cells[parsed.notes] = addCue(cells[parsed.notes], target.handstand.cue, marker);\n      }\n      if (before.sets !== cells[parsed.sets] || before.reps !== cells[parsed.reps]) {\n        repairs.push({ type: 'youth_handstand_visible_progression', week, row, before, after: { sets: cells[parsed.sets], reps: cells[parsed.reps] } });\n        changed = true;\n      }\n    }\n    if (/bar muscle[- ]?up/i.test(primary) && isTransition(name) && Number.isInteger(parsed.load)) {\n      const before = cells[parsed.load];\n      cells[parsed.load] = target.transition;\n      if (before !== cells[parsed.load]) {\n        repairs.push({ type: 'youth_bar_transition_assistance_progression', week, row, before, after: cells[parsed.load] });\n        changed = true;\n      }\n    }\n  });\n  return changed;\n}\n\nexport function normalizeYouthSkillAcquisitionQuality`,
  'YOUTH-V32-VISIBLE-PRIMARY-PROGRESSION',
);

replaceOnce(
  'Youth visible progression call',
  "    });\n\n    if (needsFullBar) {",
  "    });\n\n    if (applyYouthVisiblePrimaryProgression(parsed, week, intake, repairs)) changed = true; // YOUTH-V32-VISIBLE-PROGRESSION-CALL\n\n    if (needsFullBar) {",
  'YOUTH-V32-VISIBLE-PROGRESSION-CALL',
);

fs.writeFileSync(target, src);
console.log('Youth v32 visible progression convergence applied.');
