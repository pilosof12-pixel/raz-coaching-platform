// Run #156 lost tactical_3k in two seconds: "OpenAI compact build prompt
// exceeded 70000 characters." No model call, no program, a paid build slot spent
// on a throw -- and the assembled prompt was over by 663 characters.
//
// Measured across the six launch avatars: masters 53181, basketball 53811,
// triathlete 61580, youth 68623, hybrid 69378, tactical 70663. Three of six sat
// within 1400 characters of the same hard failure, so any authored rule added
// anywhere could delete a build.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const server = fs.readFileSync(path.join(root, '..', 'server.phase15.js'), 'utf8');

test('the prompt budget trims the retrieved excerpts before it throws', () => {
  const at = server.indexOf('OPENAI-COMPACT-PROMPT-BUDGET-TRIM');
  assert.ok(at > 0, 'the trim is not in the served file');
  // It has to run before the throw, or the throw wins and nothing is trimmed.
  const throwAt = server.indexOf('OpenAI compact build prompt exceeded 70000 characters');
  assert.ok(at < throwAt, 'the trim must precede the hard failure');
  // The throw survives: a prompt still over budget after trimming is a real
  // defect, not a rounding error.
  assert.ok(throwAt > 0, 'the hard limit must still exist');
});

test('only the excerpts are trimmed, and never to nothing', () => {
  const block = server.slice(server.indexOf('OPENAI-COMPACT-PROMPT-BUDGET-TRIM'));
  const body = block.slice(0, block.indexOf('console.log("OpenAI Phase15 prompt layout'));
  // The authored sections are what the engine is built on and are not candidates.
  assert.match(body, /CURATED COACHING SOURCE EXCERPTS/);
  for (const authored of ['DETERMINISTIC PROGRAM SKELETON', 'PHASE 15 QUALITY GATE', 'GOAL-SPECIFIC SPECIALIST RULES']) {
    assert.ok(!body.includes(authored), `${authored} must never be trimmed`);
  }
  // A grounding section cut to zero is a different prompt, not a smaller one.
  assert.match(body, /Math\.max\(2000,/);
  // And the athlete is told the excerpts were cut, not silently handed less.
  assert.match(body, /Excerpts truncated to fit the prompt budget/);
});

test('the trim reports what it dropped', () => {
  // Without the line, a build that quietly lost a third of its grounding reads
  // identical to one that did not.
  assert.match(server, /OpenAI prompt budget: trimmed/);
});

test('the real avatars sit inside the budget, and the tight ones are known', async () => {
  const A = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
  const H = JSON.parse(fs.readFileSync(new URL('./fixtures/hard_avatars.json', import.meta.url), 'utf8'));
  const V = JSON.parse(fs.readFileSync(new URL('./fixtures/launch_v2_avatars.json', import.meta.url), 'utf8'));
  const ENGINE = fs.readFileSync(new URL('../engine/engine_instructions.txt', import.meta.url), 'utf8');
  let DICT = null;
  try { DICT = (await import('../engine/exercise_dictionary.js')).EXERCISE_DICTIONARY; } catch { /* optional */ }
  const { buildDeterministicBrief } = await import('../engine/phase15_planner.js');
  const { buildPhase15SourceGrounding } = await import('../engine/phase15_source_router.js');
  const { buildSpecialistRules } = await import('../engine/phase15_specialist_rules.js');
  const { phase15PromptRules } = await import('../engine/phase15_program_qa.js');

  for (const [id, intake] of [
    ['masters_return', H.masters_return],
    ['youth_gymnastics', A.youth_gymnastics],
    ['tactical_3k', A.tactical_3k],
    ['advanced_hybrid', A.advanced_hybrid],
    ['sprint_triathlete', { ...V.sprint_triathlete, event_type: 'triathlon' }],
    ['inseason_basketball', V.inseason_basketball],
  ]) {
    const grounding = (buildPhase15SourceGrounding(ENGINE, intake, DICT) || '').length;
    const authored = JSON.stringify(intake).length
      + (buildDeterministicBrief(intake) || '').length
      + String(phase15PromptRules(intake) || '').length
      + String(buildSpecialistRules(intake) || '').length;
    // The authored half must fit on its own with room for real excerpts. If it
    // ever does not, trimming cannot save the build and the throw is correct.
    assert.ok(authored + 2000 < 70000,
      `${id}: authored sections are ${authored} chars, leaving no room for the 2000-char excerpt floor`);
    assert.ok(grounding > 0, `${id}: no source grounding at all`);
  }
});
