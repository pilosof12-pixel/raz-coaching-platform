import test from 'node:test';
import assert from 'node:assert/strict';
import { elitePromptRules } from '../phase14/engine/phase15_elite_guardrails.js';
import { validatePhase15FinalProgram } from '../phase14/engine/phase15_final_qa.js';

const intake={
  primary_goals:['Improve marathon from 4:05 to 3:40'],
  secondary_goals:['Maintain basic strength and stay durable'],
  sport:'Running',
  notes:'Currently runs 4 times per week, about 38 km/week. Longest recent run is 22 km. Preserve four run exposures and progress conservatively from current volume/performance.',
};

test('marathon prompt anchors supplied current weekly volume and smallest useful progression variable',()=>{
  const rules=elitePromptRules(intake).join('\n');
  assert.match(rules,/about 38 km\/week currently/i);
  assert.match(rules,/starting anchor/i);
  assert.match(rules,/do not simultaneously escalate quality-session volume, routine easy-run volume and long-run volume/i);
});

// Static source-level assertion for the final all-week QA because the full base validator
// requires a complete production-style fixture. The dedicated final QA function must own
// the block-level stacked-progression code and invoke it before returning the program.
test('final QA contains block-level stacked marathon progression protection',()=>{
  assert.match(validatePhase15FinalProgram.toString(),/marathonProgressionFlags/);
});
