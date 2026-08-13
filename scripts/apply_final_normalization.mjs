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

// A distance prefix such as "5 km Run" describes the event/dose, not a new
// exercise identity. Normalize only numeric distance + Run; do not generalize
// this to arbitrary sport labels or free-form exercise names.
if (!d.includes('RUN-EVENT-PREFIX-NORMALIZATION')) {
  const anchor = '  s = s.replace(/^\\[(?:COOL[- ]?DOWN|COOLDOWN)\\]\\s*(?:easy\\s+)?/i, ""); // COOLDOWN-PREFIX-NORMALIZATION';
  if (!d.includes(anchor)) throw new Error('cooldown normalization anchor missing');
  d = d.replace(anchor, anchor + '\n  s = s.replace(/^\\d+(?:\\.\\d+)?\\s*(?:km|k|m)\\s+(?=run\\b)/i, ""); // RUN-EVENT-PREFIX-NORMALIZATION');
}

if (!d.includes('["Jog/Walk", "Run"]')) {
  const anchor = '  ["Cooldown Jog/Walk", "Run"],';
  if (!d.includes(anchor)) throw new Error('run cooldown alias anchor missing');
  d = d.replace(anchor, anchor + '\n  ["Jog/Walk", "Run"],\n  ["Walk/Jog", "Run"],\n  ["Easy Jog/Walk", "Run"],\n  ["Easy Walk/Jog", "Run"], // STRUCTURAL-COOLDOWN-ALIASES');
}

// Run warm-up/cool-down describes the purpose of a canonical Run row. Keep this
// closed to the observed presentation variants so arbitrary suffixes are not
// accepted as exercise names.
if (!d.includes('RUN-PURPOSE-SUFFIX-ALIASES')) {
  const anchor = '  ["Easy Walk/Jog", "Run"], // STRUCTURAL-COOLDOWN-ALIASES';
  if (!d.includes(anchor)) throw new Error('structural cooldown alias anchor missing');
  d = d.replace(anchor, anchor + '\n  ["Run Cool-down", "Run"],\n  ["Run Cooldown", "Run"],\n  ["Run Warm-up", "Run"],\n  ["Run Warmup", "Run"], // RUN-PURPOSE-SUFFIX-ALIASES');
}

// Controlled leading descriptors are presentation/load descriptors, not new
// exercise inventions, when the exact base movement already exists canonically.
// Exact canonical weighted movements still win before this fallback.
if (!d.includes('LEADING-DESCRIPTOR-CANONICALIZATION')) {
  const dictAnchor = 'const NORM_DICT = new Set([...EXERCISE_DICTIONARY].map(norm));';
  if (!d.includes(dictAnchor)) throw new Error('normalized dictionary anchor missing');
  d = d.replace(dictAnchor, dictAnchor + '\nconst NORM_DICT_CANONICAL = new Map([...EXERCISE_DICTIONARY].map((name) => [norm(name), name])); // LEADING-DESCRIPTOR-CANONICALIZATION');
  const matchAnchor = '  if (NORM_ALIAS.has(n)) return { status: "alias", canonical: NORM_ALIAS.get(n) };\n  let toks = n.split(" ");';
  if (!d.includes(matchAnchor)) throw new Error('matchDictionary alias anchor missing');
  d = d.replace(matchAnchor, '  if (NORM_ALIAS.has(n)) return { status: "alias", canonical: NORM_ALIAS.get(n) };\n  for (const prefix of ["weighted "]) {\n    if (n.startsWith(prefix)) {\n      const base = n.slice(prefix.length).trim();\n      if (NORM_DICT_CANONICAL.has(base)) return { status: "alias", canonical: NORM_DICT_CANONICAL.get(base) };\n    }\n  }\n  let toks = n.split(" ");');
}

// If the retry loop reaches the hard-substitute stage, canonical aliases must
// still be repaired before true misses become [REVIEW].
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

// Current direct event-specific frequency stated by the athlete is an intake
// constraint, not an invented coaching dose. Do not silently reduce it while
// claiming to improve that event; if recovery requires a reduction, the output
// must explicitly explain the tradeoff rather than substituting cross-training.
const buildPath = fileURLToPath(new URL('../phase14/scripts/build_phase15_runtime.mjs', import.meta.url));
let b = fs.readFileSync(buildPath, 'utf8');
const b0 = b;
if (!b.includes('CURRENT-DIRECT-MODALITY-FREQUENCY')) {
  const anchor = '  "Use realistic current-performance anchors. Goal numbers are targets, not current capacities. Prefer low fatigue and specificity when sport load is high. Do not assign a high RPE to a load that is obviously too light for the athlete\'s current benchmark.",\\n';
  if (!b.includes(anchor)) throw new Error('compact provider current-performance anchor missing');
  b = b.replace(anchor, anchor + '  "CURRENT-DIRECT-MODALITY-FREQUENCY: when the intake explicitly states a current weekly frequency for the same named endurance modality the athlete wants to improve, do not silently reduce that direct modality frequency and replace it with cross-training. Preserve the stated direct frequency unless injury/recovery constraints require a deliberate reduction, in which case explain the tradeoff explicitly. Cross-training may supplement but not silently replace those current direct exposures.",\\n');
}
if (b !== b0) fs.writeFileSync(buildPath, b);
console.log(`${buildPath}: ${b === b0 ? 'already current' : 'direct modality frequency integrity added'}`);
