import fs from 'node:fs';

// Triggered after the workflow exists so the one-shot source patch is applied.
function patchFile(path, transforms) {
  let s = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const [find, replace, label] of transforms) {
    if (s.includes(replace)) continue;
    const count = s.split(find).length - 1;
    if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
    s = s.replace(find, replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, s);
  console.log(`${path}: ${changed ? 'patched' : 'already current'}`);
}

patchFile('phase14/engine/exercise_dictionary.js', [
  [
    '  "Arnold Press", "Dumbbell Row", "One-Arm Dumbbell Row",\n',
    '  "Arnold Press", "Dumbbell Row", "One-Arm Dumbbell Row", "Chest-Supported Row",\n',
    'dictionary chest-supported row'
  ],
  [
    '  ["DB Shoulder Press", "Dumbbell Shoulder Press"],\n',
    '  ["DB Shoulder Press", "Dumbbell Shoulder Press"],\n  ["Chest Supported Row", "Chest-Supported Row"],\n  ["Chest Supported DB Row", "Chest-Supported Row"],\n  ["Chest-Supported DB Row", "Chest-Supported Row"],\n  ["Dumbbell Hammer Curl", "Hammer Curl"],\n',
    'avatar aliases'
  ],
  [
    '  ["Dumbbell Row", ["dumbbells"]], ["One-Arm Dumbbell Row", ["dumbbells"]],\n',
    '  ["Dumbbell Row", ["dumbbells"]], ["One-Arm Dumbbell Row", ["dumbbells"]],\n  ["Chest-Supported Row", ["dumbbells", "bench"]],\n',
    'chest-supported equipment'
  ]
]);

patchFile('phase14/scripts/build_phase15_runtime.mjs', [
  [
    '    [/\\tBroad Jump\\t/gi, "\\tBox Jump\\t"],\n',
    '    [/\\tBroad Jump\\t/gi, "\\tBox Jump\\t"],\n    [/\\tCopenhagen Plank\\t/gi, "\\tSide Plank\\t"],\n    [/\\tChest Supported Row\\t/gi, "\\tChest-Supported Row\\t"],\n    [/\\tChest-Supported DB Row\\t/gi, "\\tChest-Supported Row\\t"],\n    [/\\tDumbbell Hammer Curl\\t/gi, "\\tHammer Curl\\t"],\n',
    'OpenAI canonical row normalization'
  ]
]);
