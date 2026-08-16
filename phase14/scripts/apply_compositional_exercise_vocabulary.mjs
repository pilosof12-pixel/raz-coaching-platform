import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'engine', 'exercise_dictionary.js');
let src = fs.readFileSync(target, 'utf8');

function replaceOnce(needle, replacement, label) {
  if (src.includes(replacement)) return;
  // A later controlled vocabulary layer may strengthen this exact hook while
  // preserving the original composition call. Treat that as already applied so
  // repeated production builds remain idempotent.
  if (label === 'matchDictionary composition hook' && src.includes('ENDURANCE-CANONICAL-ALIAS-HOOK')) return;
  if (!src.includes(needle)) throw new Error(`Compositional vocabulary patch anchor not found (${label})`);
  src = src.replace(needle, replacement);
}

// Small set of genuinely new movement bases. Variations around them are handled
// compositionally below instead of requiring an ever-growing flat dictionary.
replaceOnce(
  '"Handstand Hold", "Handstand Walk",',
  '"Handstand Hold", "Handstand Walk", "Controlled Handstand Kick-up",',
  'handstand base'
);
replaceOnce(
  '"Strict Muscle-up", "Muscle-up", "Bar Muscle-up", "Ring Muscle-up",',
  '"Strict Muscle-up", "Muscle-up", "Bar Muscle-up", "Ring Muscle-up", "Bar Muscle-up Transition Drill",',
  'muscle-up transition base'
);
replaceOnce(
  '"Human Flag Hold",\n  // --- Muscle-up family ---',
  '"Human Flag Hold", "Iron Cross", "Maltese",\n  // --- Muscle-up family ---',
  'rings skill bases'
);
replaceOnce(
  '"Bodyweight Squat", "Air Squat", "Assisted Squat", "Assisted Pistol Squat",',
  '"Bodyweight Squat", "Air Squat", "Assisted Squat", "Assisted Pistol Squat", "Belt Squat",',
  'belt squat base'
);

const compositionBlock = `// COMPOSITIONAL-EXERCISE-VOCABULARY\n// Accept only controlled combinations of known movement families and known\n// assistance/loading/control modifiers. This prevents false [REVIEW] failures\n// without degrading the zero-hallucination gate into fuzzy matching.\nconst COMPOSED_TRAILING_MODIFIERS = new Set([\n  "eccentric", "negative", "isometric", "iso", "hold", "partial", "tempo", "paused", "pause"\n]);\nconst BELT_SQUAT_VARIANT_BASES = new Set([\n  "squat", "split squat", "bulgarian split squat", "reverse lunge", "forward lunge",\n  "lateral lunge", "walking lunge", "step up", "pistol squat"\n]);\nconst ASSISTED_GYMNASTICS_BASES = new Set([\n  "iron cross", "maltese", "planche", "front lever", "handstand",\n  "bar muscle up transition drill", "bar muscle up", "ring muscle up"\n]);\nconst CONTROL_PREFIX_BASES = new Set([\n  "back squat", "front squat", "bench press", "overhead press", "romanian deadlift",\n  "split squat", "bulgarian split squat", "pistol squat", "pull up", "chin up",\n  "dip", "ring dip", "push up", "ring row", "iron cross", "maltese",\n  "planche", "front lever", "handstand", "bar muscle up transition drill"\n]);\nconst STRICT_PREFIX_BASE_REQUIREMENTS = new Map([\n  ["pull up", ["pull_up_bar"]],\n  ["chin up", ["pull_up_bar"]],\n  ["muscle up", ["pull_up_bar"]],\n  ["bar muscle up", ["pull_up_bar"]],\n  ["toes to bar", ["pull_up_bar"]],\n  ["hanging leg raise", ["pull_up_bar"]],\n  ["dip", ["dip_bars"]],\n  ["ring dip", ["rings"]],\n  ["ring row", ["rings"]],\n  ["ring muscle up", ["rings"]],\n  ["push up", []],\n]);\n\nfunction stripComposedTrailingModifiers(n) {\n  const removed = [];\n  let toks = String(n || "").split(" ").filter(Boolean);\n  while (toks.length > 1 && COMPOSED_TRAILING_MODIFIERS.has(toks[toks.length - 1])) {\n    removed.unshift(toks.pop());\n  }\n  return { base: toks.join(" "), modifiers: removed };\n}\n\nexport function matchComposedExercise(core) {\n  let n = norm(core);\n  if (!n) return null;\n\n  // "Strict" is normal coaching vocabulary for bounded bodyweight/gymnastics\n  // families. It does not create a new movement family, and it inherits the\n  // apparatus requirements of the underlying movement.\n  const strict = n.match(/^strict\\s+(.+)$/);\n  if (strict) {\n    const inner = stripComposedTrailingModifiers(strict[1]).base;\n    if (STRICT_PREFIX_BASE_REQUIREMENTS.has(inner)) {\n      return { kind: "strict", requirements: STRICT_PREFIX_BASE_REQUIREMENTS.get(inner) };\n    }\n  }\n\n  // Leading control descriptors are common coach vocabulary (e.g. Tempo Pull-up).\n  // They are accepted only for a deliberately bounded family set.\n  const lead = n.match(/^(tempo|paused|pause|eccentric|negative|isometric|iso)\\s+(.+)$/);\n  if (lead) {\n    const inner = stripComposedTrailingModifiers(lead[2]).base;\n    if (CONTROL_PREFIX_BASES.has(inner)) return { kind: "control", requirements: null };\n    // Allow a control modifier wrapping a valid belt-squat composition.\n    n = lead[2];\n  }\n\n  const stripped = stripComposedTrailingModifiers(n);\n  const bare = stripped.base;\n\n  // Belt-squat machine variants: Belt Split Squat, Belt Squat Reverse Lunge, etc.\n  let beltBase = null;\n  if (bare.startsWith("belt squat ")) beltBase = bare.slice("belt squat ".length).trim();\n  else if (bare.startsWith("belt ")) beltBase = bare.slice("belt ".length).trim();\n  if (beltBase && BELT_SQUAT_VARIANT_BASES.has(beltBase)) {\n    return { kind: "belt_squat", requirements: ["machine"] };\n  }\n\n  // Assistance can change the implementation of a skill without creating a new\n  // movement family. Only these assistance modes and skill bases are accepted.\n  const assisted = bare.match(/^(box|band|partner|foot|low bar) assisted\\s+(.+)$/);\n  if (assisted && ASSISTED_GYMNASTICS_BASES.has(assisted[2])) {\n    const base = assisted[2];\n    const req = [];\n    if (/iron cross|maltese|ring muscle up/.test(base)) req.push("rings");\n    if (/bar muscle up/.test(base)) req.push("pull_up_bar");\n    if (assisted[1] === "band") req.push("bands");\n    return { kind: "assisted_gymnastics", requirements: req };\n  }\n\n  return null;\n}\n\n`;

if (!src.includes('// COMPOSITIONAL-EXERCISE-VOCABULARY')) {
  const anchor = '// v20 FIX A: tokens that appear inside parentheses purely as equipment';
  if (!src.includes(anchor)) throw new Error('Compositional vocabulary insertion anchor not found');
  src = src.replace(anchor, compositionBlock + anchor);
}

const matchNeedle = `  let toks = n.split(" ");\n  while (toks.length > 1 && MODIFIER_SET.has(toks[toks.length - 1])) {\n    toks = toks.slice(0, -1);\n    const nn = toks.join(" ");\n    if (NORM_DICT.has(nn)) return { status: "hit" };\n    if (NORM_ALIAS.has(nn)) return { status: "hit" }; // accept base, keep bridge descriptor\n  }\n  return { status: "miss" };`;
const matchReplacement = `  let toks = n.split(" ");\n  while (toks.length > 1 && MODIFIER_SET.has(toks[toks.length - 1])) {\n    toks = toks.slice(0, -1);\n    const nn = toks.join(" ");\n    if (NORM_DICT.has(nn)) return { status: "hit" };\n    if (NORM_ALIAS.has(nn)) return { status: "hit" }; // accept base, keep bridge descriptor\n  }\n  const composed = matchComposedExercise(n);\n  if (composed) return { status: "hit", composed: true, requirements: composed.requirements || [] };\n  return { status: "miss" };`;
replaceOnce(matchNeedle, matchReplacement, 'matchDictionary composition hook');

// Preserve equipment enforcement for composed names instead of treating every
// accepted variant as bodyweight/no-gear merely because it lacks a flat map row.
replaceOnce(
  '    const req = EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonical) ||\n      EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonicalFromNorm(core));',
  '    const req = EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonical) ||\n      EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonicalFromNorm(core)) ||\n      (m.composed ? m.requirements : null);',
  'equipment validator composition metadata'
);
replaceOnce(
  '    const req = EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonical);',
  '    const req = EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonical) || (m.composed ? m.requirements : null);',
  'equipment hard-substitution composition metadata'
);

// New canonical bases keep their minimum apparatus requirements.
replaceOnce(
  '["Ring Support Hold", ["rings"]],',
  '["Ring Support Hold", ["rings"]], ["Iron Cross", ["rings"]], ["Maltese", ["rings"]],\n  ["Bar Muscle-up Transition Drill", ["pull_up_bar"]],',
  'gymnastics base equipment'
);
replaceOnce(
  '["Smith Machine Squat", ["smith_machine"]], ["GHD Raise", ["ghd"]],',
  '["Smith Machine Squat", ["smith_machine"]], ["Belt Squat", ["machine"]], ["GHD Raise", ["ghd"]],',
  'belt squat equipment'
);

fs.writeFileSync(target, src);
console.log('Applied controlled compositional exercise vocabulary patch.');
