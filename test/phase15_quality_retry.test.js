import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RETRIABLE_CODES } from '../phase14/engine/exercise_dictionary.js';

test('Phase 15 coaching quality errors are retriable',()=>{
  assert.equal(RETRIABLE_CODES.has('PHASE15_QUALITY_VIOLATION'),true);
});

test('quality retry uses source-grounded regeneration and never deterministic hard substitution',()=>{
  const s=fs.readFileSync(new URL('../phase14/server.js',import.meta.url),'utf8');
  assert.match(s,/PHASE15-QUALITY-REGEN-PATH/);
  assert.match(s,/if \(err\.code === "PHASE15_QUALITY_VIOLATION"\)/);
  assert.match(s,/if \(!amendments\.includes\(err\.amendment\)\) amendments\.push\(err\.amendment\)/);
  assert.match(s,/if \(attempt === MAX_ATTEMPTS\) throw err/);
});

test('OpenAI path permits one correction generation after an initial quality miss',()=>{
  const s=fs.readFileSync(new URL('../phase14/scripts/build_phase15_runtime.mjs',import.meta.url),'utf8');
  assert.match(s,/OPENAI_API_KEY \? 2 : 3/);
});
