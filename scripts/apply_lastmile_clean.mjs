import fs from 'node:fs';

function patchFile(path, transforms) {
  let s = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const [find, replace, label] of transforms) {
    if (s.includes(replace)) continue;
    const n = s.split(find).length - 1;
    if (n !== 1) throw new Error(`${path} ${label}: expected one anchor, found ${n}`);
    s = s.replace(find, replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, s);
  console.log(`${path}: ${changed ? 'patched' : 'already current'}`);
}

patchFile('phase14/server.js', [
  [
    "    const err = new Error('Final client QA blocked unresolved review/support text.');",
    "    const leaked = cleaned.split('\\n').filter((line) => /\\[REVIEW\\]|contact\\s+support|could not be safely generated/i.test(line)).slice(0, 5).join(' || ');\n    const err = new Error('Final client QA blocked unresolved review/support text: ' + leaked);",
    'diagnostic blocked review rows'
  ]
]);

patchFile('phase14/scripts/build_phase15_runtime.mjs', [
  [
    '  "Use realistic current-performance anchors. Goal numbers are targets, not current capacities. Prefer low fatigue and specificity when sport load is high. Do not assign a high RPE to a load that is obviously too light for the athlete\'s current benchmark.",\\n',
    '  "Use realistic current-performance anchors. Goal numbers are targets, not current capacities. Prefer low fatigue and specificity when sport load is high. Do not assign a high RPE to a load that is obviously too light for the athlete\'s current benchmark.",\\n  "WEIGHTED CALISTHENICS BENCHMARK ANCHOR: when a current weighted pull-up, chin-up or dip benchmark is supplied at the same rep count as a programmed set, the prescription must reconcile with that demonstrated added load. RPE 8-8.5 work should normally use at least about 90% of the demonstrated added load; if you intentionally use a substantially lighter maintenance load, lower the stated RPE to match rather than pretending the lighter load is RPE 8.",\\n',
    'weighted calisthenics benchmark developer rule'
  ],
  [
    '    "If a loaded lift has no current benchmark, use RPE-selected load rather than making up kilograms.",\\n',
    '    "If a loaded lift has no current benchmark, use RPE-selected load rather than making up kilograms.",\\n    "If a weighted pull-up, chin-up or dip benchmark exists at the programmed rep count, keep the programmed added load and RPE consistent with that demonstrated performance; do not rebuild toward a load the athlete already owns.",\\n',
    'weighted calisthenics compact rule'
  ]
]);

{
  const path = 'phase14/scripts/build_phase15_runtime.mjs';
  let s = fs.readFileSync(path, 'utf8');
  const before = s;
  s = s.replaceAll('deterministic-skeleton-v5-quality', 'deterministic-skeleton-v5.1-client-clean');
  s = s.replaceAll('raz-phase15-quality-v5', 'raz-phase15-client-clean-v5-1');
  s = s.replaceAll('deterministic-skeleton-v5.1-client-clean', 'deterministic-skeleton-v5.2-benchmark-anchored');
  s = s.replaceAll('raz-phase15-client-clean-v5-1', 'raz-phase15-benchmark-v5-2');
  if (s !== before) fs.writeFileSync(path, s);
  console.log(`${path}: ${s !== before ? 'patched' : 'already current'}`);
}

console.log('diagnostic + benchmark-anchor patch applied');
