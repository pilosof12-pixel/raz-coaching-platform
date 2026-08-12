import fs from 'node:fs';
import { patchPhase15RuntimeSource } from '../engine/phase15_runtime_patches.js';

const runtimePath = new URL('../server.phase15.js', import.meta.url);
const before = fs.readFileSync(runtimePath, 'utf8');
const after = patchPhase15RuntimeSource(before);
if (after === before) throw new Error('Phase 15 postprocess produced no changes');
fs.writeFileSync(runtimePath, after);
console.log('Phase 15 source-aligned runtime patches applied');
