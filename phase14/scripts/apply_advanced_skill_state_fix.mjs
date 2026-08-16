import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const p = path.join(root, 'engine', 'skill_progressions.js');
let src = fs.readFileSync(p, 'utf8');
let changed = false;

const equipmentMarker = '// ADVANCED-SKILL-COMMERCIAL-GYM-EQUIPMENT';
if (!src.includes(equipmentMarker)) {
  const find = `function hasRequiredEquipment(skill, intake) {\n  const req = skill.required_equipment || [];\n  if (!req.length) return true;\n  const text = equipText(intake);\n  return req.some((tok) => hasEquipmentToken(tok, text));\n}`;
  const replace = `function hasRequiredEquipment(skill, intake) {\n  const req = skill.required_equipment || [];\n  if (!req.length) return true;\n  const text = equipText(intake);\n  // ADVANCED-SKILL-COMMERCIAL-GYM-EQUIPMENT\n  // The main equipment validator defines commercial_gym as the full roster.\n  // Skill calibration must use the same contract rather than separately gating\n  // a demonstrated advanced athlete for a pull-up bar or rings.\n  if (/commercial[_\\s-]?gym|full commercial gym/.test(text)) return true;\n  return req.some((tok) => hasEquipmentToken(tok, text));\n}`;
  const count = src.split(find).length - 1;
  if (count !== 1) throw new Error(`skill_progressions equipment anchor expected once, found ${count}`);
  src = src.replace(find, replace);
  changed = true;
}

const oapMarker = '// ADVANCED-SKILL-DIRECT-OAP-BENCHMARK';
if (!src.includes(oapMarker)) {
  const find = `    one_arm_pull_up: firstIntAfter(t, /(\\d+)\\s*one[-\\s]?arm\\s*pull/),`;
  const replace = `    // ADVANCED-SKILL-DIRECT-OAP-BENCHMARK\n    // Accept both \"2 one-arm pull-ups\" and natural intake phrasing such as\n    // \"One-Arm Pull-up: 2 strict reps each arm\". Demonstrated full-skill\n    // performance must route from the achieved state, not back to prerequisites.\n    one_arm_pull_up:\n      firstIntAfter(t, /one[-\\s]?arm\\s*(?:pull|chin)(?:[-\\s]?ups?)?[^0-9]{0,30}(\\d+)/) ||\n      firstIntAfter(t, /(\\d+)\\s*(?:strict\\s*)?one[-\\s]?arm\\s*(?:pull|chin)/),`;
  const count = src.split(find).length - 1;
  if (count !== 1) throw new Error(`skill_progressions OAP benchmark anchor expected once, found ${count}`);
  src = src.replace(find, replace);
  changed = true;
}

if (changed) fs.writeFileSync(p, src);
console.log(`skill_progressions.js: ${changed ? 'advanced skill-state calibration applied' : 'already current'}`);
