// Two live builds died the same way: a code that reaches the blocking validation
// bundle with no deterministic repair able to answer it. The generator cannot
// talk its way out of one, so all four attempts are spent re-rolling and the
// build fails with no program saved and the client charged for nothing.
//
// audit_repair_coverage.mjs only checks codes already observed blocking a live
// run -- by definition, after a customer has hit them. This works forward
// instead: every code emitted by a module wired into the blocking bundle, and
// whether any repair module answers it.
//
// The check is structural, not behavioural. It finds codes nothing answers at
// all; it cannot see a repair that covers only some paths into a code, which is
// how the reps-cell progression claim slipped through with its code "covered".
import fs from 'node:fs';
import path from 'node:path';

const engineDir = 'engine';
const bundle = fs.readFileSync(path.join(engineDir, 'repairable_validation_bundle.js'), 'utf8');

// Modules the blocking bundle pulls in: a code they emit can fail a build.
const blocking = [...bundle.matchAll(/from\s+'\.\/([a-z0-9_]+)\.js'/gi)].map((m) => `${m[1]}.js`);
const present = blocking.filter((f) => fs.existsSync(path.join(engineDir, f)));

const codes = new Map();
for (const f of present) {
  const src = fs.readFileSync(path.join(engineDir, f), 'utf8');
  for (const m of src.matchAll(/code:\s*['"`]([A-Z][A-Z0-9_]{4,})['"`]/g)) {
    if (!codes.has(m[1])) codes.set(m[1], new Set());
    codes.get(m[1]).add(f);
  }
}

const all = fs.readdirSync(engineDir).filter((f) => f.endsWith('.js'));
const repairFiles = all.filter((f) => /repair|trim|normalizer|hold|restore|cleanup|governor|protection|enrichment|coherence/i.test(f));
const repairSrc = repairFiles.map((f) => fs.readFileSync(path.join(engineDir, f), 'utf8')).join('\n');

// A module that both raises a code and exports its own repair answers it even
// when no shared repair file names the code.
const selfRepairing = new Set();
for (const f of present) {
  const src = fs.readFileSync(path.join(engineDir, f), 'utf8');
  if (!/export function (?:repair|append)[A-Z]/.test(src)) continue;
  for (const m of src.matchAll(/code:\s*['"`]([A-Z][A-Z0-9_]{4,})['"`]/g)) selfRepairing.add(m[1]);
}

const rows = [...codes.entries()].map(([code, from]) => ({
  code,
  from: [...from].join(', '),
  named: repairSrc.includes(code),
  self: selfRepairing.has(code),
})).sort((a, b) => a.code.localeCompare(b.code));

const gaps = rows.filter((r) => !r.named && !r.self);
const w = Math.max(...rows.map((r) => r.code.length));

console.log(`${present.length} modules wired into the blocking bundle`);
console.log(`${rows.length} codes can reach it\n`);
console.log('CODE'.padEnd(w), 'NAMED', 'SELF', ' RAISED IN');
console.log('-'.repeat(w + 34));
for (const r of rows) {
  console.log(r.code.padEnd(w), (r.named ? ' yes ' : '  NO '), (r.self ? ' yes' : '  NO'), ' ', r.from);
}
console.log(`\n${gaps.length} of ${rows.length} blocking codes are answered by no repair at all:\n`);
for (const r of gaps) console.log(' ', r.code.padEnd(w), r.from);
console.log('\nEach is a candidate build-killer. Confirm by hand whether the generator');
console.log('can clear it unaided before deciding it is safe.');
