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

const helper = `function phase15LastMileTsv(tsv, intake) {
  if (!tsv) return tsv;
  const benchmark = JSON.stringify(intake?.current_numbers || intake?.performance_markers || intake?.current_strength || '').toLowerCase();
  const hasAdvancedTuckPlanche = /advanced tuck planche/.test(benchmark);
  const hasAdvancedTuckFrontLever = /advanced tuck front lever/.test(benchmark);
  const hasSingleLegFrontLever = /single[- ]leg front lever/.test(benchmark);
  const out = [];
  for (const line of String(tsv).split('\\n')) {
    if (!line.includes('\\t')) { out.push(line); continue; }
    const cells = line.split('\\t');
    if (cells.length !== 9 || /^Day$/i.test(cells[0])) { out.push(line); continue; }
    let ex = String(cells[1] || '').trim();
    if (/\\[REVIEW\\].*Paused Back Squat|^Paused Back Squat$/i.test(ex)) {
      cells[1] = 'Pause Squat';
      cells[7] = 'Controlled 1-2 second pause, crisp bar speed, keep the prescribed RPE honest.';
      ex = cells[1];
    }
    if (/\\[REVIEW\\].*Copenhagen Plank|^Copenhagen Plank$/i.test(ex)) {
      cells[1] = 'Side Plank';
      cells[7] = 'Brace hard and keep hips stacked; stop before position degrades.';
      ex = cells[1];
    }
    if (!hasAdvancedTuckPlanche && /^Straddle Planche$/i.test(ex)) continue;
    if (hasAdvancedTuckFrontLever && !hasSingleLegFrontLever && /^Straddle Front Lever$/i.test(ex)) {
      cells[1] = 'Single-Leg Front Lever';
      cells[7] = 'Next-rung bridge. Alternate lead leg and stop before body line degrades.';
      ex = cells[1];
    }
    out.push(cells.join('\\t'));
  }
  const cleaned = out.join('\\n');
  if (/\\[REVIEW\\]|contact\\s+support|could not be safely generated/i.test(cleaned)) {
    const err = new Error('Final client QA blocked unresolved review/support text.');
    err.code = 'UNRESOLVED_CLIENT_REVIEW';
    throw err;
  }
  return cleaned;
}

function privacyScrub(text, intake) {`;

patchFile('phase14/server.js', [
  [
    'function privacyScrub(text, intake) {',
    helper,
    'insert last-mile TSV sanitizer'
  ],
  [
    '  if (tsv) tsv = scrubForbiddenWords(fixInvalidExerciseNames(tsv));',
    '  if (tsv) tsv = phase15LastMileTsv(scrubForbiddenWords(fixInvalidExerciseNames(tsv)), intake);',
    'wire last-mile sanitizer'
  ]
]);

patchFile('phase14/scripts/build_phase15_runtime.mjs', [
  ['deterministic-skeleton-v5-quality', 'deterministic-skeleton-v5.1-client-clean', 'execution path marker'],
  ['raz-phase15-quality-v5', 'raz-phase15-client-clean-v5-1', 'cache key marker']
]);

console.log('last-mile client-clean patch applied');
