import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vocab = fs.readFileSync(new URL('../scripts/apply_tactical_endurance_vocabulary.mjs', import.meta.url), 'utf8');
const diagnostics = fs.readFileSync(new URL('../scripts/apply_live_qa_diagnostics.mjs', import.meta.url), 'utf8');

test('production build applies bounded Tactical endurance identity normalization after compositional vocabulary', () => {
  const build = pkg.scripts['phase15:build'];
  const general = build.indexOf('apply_compositional_exercise_vocabulary.mjs');
  const endurance = build.indexOf('apply_tactical_endurance_vocabulary.mjs');
  assert.ok(general >= 0, 'general compositional vocabulary missing from build');
  assert.ok(endurance > general, 'Tactical endurance vocabulary must run after general composition');
  assert.match(vocab, /ENDURANCE-EXECUTION-COMPOSITION/);
  assert.match(vocab, /canonical: 'Run'/);
  assert.match(vocab, /canonical: 'Backpack Carry'/);
  assert.match(vocab, /ENDURANCE-CANONICAL-ALIAS-HOOK/);
  assert.doesNotMatch(vocab, /fuzzy/i);
});

test('QA-only hallucination diagnostics expose rejected names without changing normal client errors', () => {
  const build = pkg.scripts['phase15:build'];
  assert.match(build, /apply_live_qa_diagnostics\.mjs/);
  assert.match(diagnostics, /intake\.qa_diagnostics === true/);
  assert.match(diagnostics, /repairCode === "EXERCISE_HALLUCINATION"/);
  assert.match(diagnostics, /err\?\.details\?\.unknown/);
  assert.match(diagnostics, /slice\(0, 6\)/);
  assert.match(diagnostics, /QA-DIAGNOSTIC-UNKNOWN-NAMES/);
});
