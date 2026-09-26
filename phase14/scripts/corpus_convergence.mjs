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
// Pinned, because the number moves with the calendar and not with the engine.
//
// The corpus pairs static program text with intakes whose competition_date is a
// fixed offset from now, so as real days pass the event slides against a block
// that cannot slide with it, and every competition-week and taper rule reads a
// different week. Measured on three consecutive days with no code change at
// all: 25 of 26, then 26, then 22.
//
// So this fixes the clock and measures the engine. The variation is a property
// of how the fixtures are built -- corpus_dates_stable.test.js has the same
// finding for severity, where a weekday cost seven clean programs -- and it is
// worth its own repair, but it is not what a convergence ratchet should be
// reporting.
//
// The date is the one this measurement was first taken on. Override with
// CORPUS_NOW to see how the corpus behaves on another day.
if (!process.env.CORPUS_NOW) process.env.CORPUS_NOW = '2026-09-23T12:00:00Z';

// Dynamic, because a static import is hoisted above the line that pins the
// clock and the corpus would be built before the pin existed. The first version
// of this file set the variable and imported statically, and reported the
// unpinned number while claiming to be pinned.
const { CORPUS, CORPUS_NOW } = await import('./corpus.mjs');
const { validateRepairableProgramBundle } = await import('../engine/repairable_validation_bundle.js');

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

// Pinning CORPUS_NOW fixes the dates the fixture intakes are BUILT with. It does
// not fix the clock the rules are EVALUATED against: a rule signed
// `(program, intake, now = Date.now())` reads the real clock whatever the corpus
// was built for, so the fixtures' competition dates sat at the pinned day while
// V79 measured the distance to them from today. The gap widens every real day,
// which is the drift the header above records -- 25, then 26, then 22 -- and it
// is the script reporting an unpinned number while saying it is pinned, which is
// the exact failure the dynamic import below was added to avoid.
//
// Frozen around the measurement and restored afterwards, rather than at import:
// this module is imported by the ratchet test, and a permanently frozen clock
// would follow it into whatever else that process runs.
function withPinnedClock(fn) {
  if (!CORPUS_NOW) return fn();
  const real = Date.now;
  Date.now = () => CORPUS_NOW;
  try { return fn(); } finally { Date.now = real; }
}

export function convergence() {
  return withPinnedClock(() => {
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
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = convergence();
  const ok = rows.filter((r) => r.accepted).length;
  console.log(`accepted ${ok} of ${rows.length}`);
  for (const r of rows.filter((x) => !x.accepted)) console.log(`  ${r.file}  ${r.codes.join(',')}`);
}
