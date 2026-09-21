// Does the production gate accept what the repair chain produces?
//
// The corpus ratchet measures the coach's severity after repair, which is
// quality. This measures something different and cheaper to ignore: whether
// validateRepairableProgramBundle -- the gate a live build must satisfy before
// it may ship -- accepts the repaired program at all.
//
// A program it refuses is a live build that regenerates. Run #132 is what that
// costs: four calls, an hour, and no program. Every unconverged fixture here is
// that failure waiting for an athlete to trigger it, so the number belongs in a
// test rather than in someone's head.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORPUS } from './corpus.mjs';
import { validateRepairableProgramBundle } from '../engine/repairable_validation_bundle.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

export function convergence() {
  const rows = [];
  for (const [file, intake] of CORPUS) {
    const program = fs.readFileSync(path.join(DIR, file), 'utf8');
    try {
      validateRepairableProgramBundle(program, intake);
      rows.push({ file, accepted: true, codes: [] });
    } catch (e) {
      const codes = [...new Set((e.flags || []).map((f) => f.code).filter(Boolean))].sort();
      rows.push({ file, accepted: false, codes });
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = convergence();
  const ok = rows.filter((r) => r.accepted).length;
  console.log(`accepted ${ok} of ${rows.length}`);
  for (const r of rows.filter((x) => !x.accepted)) console.log(`  ${r.file}  ${r.codes.join(',')}`);
}
