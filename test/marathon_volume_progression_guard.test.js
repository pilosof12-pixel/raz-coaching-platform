import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { elitePromptRules } from '../phase14/engine/phase15_elite_guardrails.js';
import { validatePhase15FinalProgram } from '../phase14/engine/phase15_final_qa.js';

const intake={
  primary_goals:['Improve marathon from 4:05 to 3:40'],
  secondary_goals:['Maintain basic strength and stay durable'],
  sport:'Running',
  notes:'Currently runs 4 times per week, about 38 km/week. Longest recent run is 22 km. Preserve four run exposures and progress conservatively from current volume/performance.',
};

test('marathon prompt anchors supplied current weekly volume and one authored main progression variable',()=>{
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/about 38 km\/week currently/i);
  assert.match(rules,/starting anchor/i);
  assert.match(rules,/progress\/regress one main variable/i);
  assert.match(rules,/choose ONE main running-volume progression lever/i);
  assert.match(rules,/Hold the other two categories stable/i);
});

test('final QA owns one-main-variable marathon block protection',()=>{
  assert.match(validatePhase15FinalProgram.toString(),/marathonProgressionFlags/);
  const src=fs.readFileSync(new URL('../phase14/engine/phase15_final_qa.js',import.meta.url),'utf8');
  assert.match(src,/const increases=\[b\.quality>a\.quality,b\.easy>a\.easy,b\.long>a\.long\]\.filter\(Boolean\)\.length/);
  assert.match(src,/if\(increases>1\)/);
  assert.match(src,/progress\/regress one main variable according to adaptation and recovery/i);
});
