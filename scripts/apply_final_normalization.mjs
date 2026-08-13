import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dictPath = fileURLToPath(new URL('../phase14/engine/exercise_dictionary.js', import.meta.url));
let d = fs.readFileSync(dictPath, 'utf8');
const d0 = d;

// Cool-down labels describe row purpose, not exercise identity. Strip only this
// closed, high-confidence prefix before dictionary lookup; do not accept free-form labels.
if (!d.includes('COOLDOWN-PREFIX-NORMALIZATION')) {
  const anchor = '  s = s.replace(/^\\[(?:WARMUP|חימום)\\]\\s*/i, "");';
  if (!d.includes(anchor)) throw new Error('coreExerciseName warmup anchor missing');
  d = d.replace(anchor, anchor + '\n  s = s.replace(/^\\[(?:COOL[- ]?DOWN|COOLDOWN)\\]\\s*(?:easy\\s+)?/i, ""); // COOLDOWN-PREFIX-NORMALIZATION');
}

// Known run-cooldown wording resolves to the canonical Run row. This remains a
// closed alias set; it is not permission for arbitrary exercise synonyms.
if (!d.includes('["Jog/Walk", "Run"]')) {
  const anchor = '  ["Cooldown Jog/Walk", "Run"],';
  if (!d.includes(anchor)) throw new Error('run cooldown alias anchor missing');
  d = d.replace(anchor, anchor + '\n  ["Jog/Walk", "Run"],\n  ["Walk/Jog", "Run"],\n  ["Easy Jog/Walk", "Run"],\n  ["Easy Walk/Jog", "Run"], // STRUCTURAL-COOLDOWN-ALIASES');
}

// If the retry loop reaches the hard-substitute stage, canonical aliases must
// still be repaired before true misses become [REVIEW]. Previously alias fixes
// found during a throwing validation attempt could be lost with that attempt.
if (!d.includes('HARD-SUBSTITUTE-CANONICALIZES-ALIASES')) {
  const old = [
    '    const core = coreExerciseName(cell, isHebrew);',
    '    if (!core || matchDictionary(core).status !== "miss") return null;',
    '    cells[ctx.exIdx] = "[REVIEW] " + cell.trim();',
  ].join('\n');
  const replacement = [
    '    const core = coreExerciseName(cell, isHebrew);',
    '    if (!core) return null;',
    '    const matched = matchDictionary(core);',
    '    if (matched.status === "alias") {',
    '      cells[ctx.exIdx] = cell.replace(core, matched.canonical); // HARD-SUBSTITUTE-CANONICALIZES-ALIASES',
    '      return cells;',
    '    }',
    '    if (matched.status !== "miss") return null;',
    '    cells[ctx.exIdx] = "[REVIEW] " + cell.trim();',
  ].join('\n');
  const count = d.split(old).length - 1;
  if (count !== 1) throw new Error(`hardSubstituteHallucinations anchor expected once, found ${count}`);
  d = d.replace(old, replacement);
}

if (d !== d0) fs.writeFileSync(dictPath, d);
console.log(`${dictPath}: ${d === d0 ? 'already current' : 'structural normalization applied'}`);

// The model is never authoritative for internal QA metadata. Remove any marker
// it may emit before the server calculates its own validator result.
const serverPath = fileURLToPath(new URL('../phase14/server.js', import.meta.url));
let s = fs.readFileSync(serverPath, 'utf8');
const s0 = s;
if (!s.includes('SERVER-AUTHORITATIVE-FORMULA-MARKER')) {
  const anchor = 'function privacyScrub(text, intake) {\n  if (!text) return text;';
  if (!s.includes(anchor)) throw new Error('privacyScrub anchor missing');
  s = s.replace(anchor, anchor + '\n  text = text.replace(/<!--\\s*QA_FORMULA_VIOLATION_COUNT:\\s*\\d+\\s*-->/gi, ""); // SERVER-AUTHORITATIVE-FORMULA-MARKER');
}
if (s !== s0) fs.writeFileSync(serverPath, s);
console.log(`${serverPath}: ${s === s0 ? 'already current' : 'server-owned formula marker enforced'}`);
