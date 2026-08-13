import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function patchFile(path, transform) {
  const before=fs.readFileSync(path,'utf8');
  const after=transform(before);
  if(after!==before) fs.writeFileSync(path,after);
  console.log(`${path}: ${after===before?'already current':'patched'}`);
}

const buildPath=fileURLToPath(new URL('../phase14/scripts/build_phase15_runtime.mjs', import.meta.url));
patchFile(buildPath,(src)=>{
  let s=src;
  if(!s.includes('PRODUCTION-RUNTIME-PATCH-WIRED')) {
    const importAnchor='import fs from "node:fs";';
    if(!s.includes(importAnchor)) throw new Error('build runtime fs import anchor missing');
    s=s.replace(importAnchor,importAnchor+'\nimport { patchPhase15RuntimeSource } from "../engine/phase15_runtime_patches.js";');
    const writeAnchor='fs.writeFileSync(outPath, s);';
    if(!s.includes(writeAnchor)) throw new Error('build runtime write anchor missing');
    s=s.replace(writeAnchor,'s = patchPhase15RuntimeSource(s); // PRODUCTION-RUNTIME-PATCH-WIRED\n'+writeAnchor);
  }
  return s;
});

const dictPath=fileURLToPath(new URL('../phase14/engine/exercise_dictionary.js', import.meta.url));
patchFile(dictPath,(src)=>{
  let s=src;
  if(!s.includes('FINAL-LIVE-ALIAS-SET')) {
    const anchor='  ["Running", "Run"], // ENDURANCE-LIVE-ALIAS-SET';
    if(!s.includes(anchor)) throw new Error('endurance live alias anchor missing');
    s=s.replace(anchor,anchor+'\n  ["Run (Intervals)", "Run"],\n  ["Running Intervals", "Run"],\n  ["Cool-down Jog/Walk", "Run"],\n  ["Cooldown Jog/Walk", "Run"],\n  ["Dumbbell Reverse Lunge", "Reverse Lunge"], // FINAL-LIVE-ALIAS-SET');
  }
  return s;
});

const runtimePath=fileURLToPath(new URL('../phase14/engine/phase15_runtime_patches.js', import.meta.url));
patchFile(runtimePath,(src)=>{
  let s=src;
  if(!s.includes('ENDURANCE-TSV-FIELD-CONTRACT')) {
    const old="  const targetReplacement = 'Goal numbers are targets, not current capacities. ENDURANCE TARGET ANCHOR: a future goal pace, power or split is not automatically a sustainable current training intensity. Calibrate endurance sessions from supplied current performance plus the routed authored sources; use goal pace only in a dose the athlete can plausibly execute from current capacity.';";
    const neu="  const targetReplacement = 'Goal numbers are targets, not current capacities. ENDURANCE TARGET ANCHOR: a future goal pace, power or split is not automatically a sustainable current training intensity. Calibrate endurance sessions from supplied current performance plus the routed authored sources; use goal pace only in a dose the athlete can plausibly execute from current capacity. ENDURANCE-TSV-FIELD-CONTRACT: for interval rows, Sets is interval count, Reps is work distance or duration, Weight carries the external pace/power/split target when one is prescribed, Rest is actual between-interval recovery duration, Target RPE is internal effort only when useful, and Notes explains execution. Never put target pace or split in the Rest column. For continuous endurance rows, Reps is total duration/distance and Rest is N/A.';";
    if(!s.includes(old)) throw new Error('endurance target anchor missing');
    s=s.replace(old,neu);
  }
  return s;
});
