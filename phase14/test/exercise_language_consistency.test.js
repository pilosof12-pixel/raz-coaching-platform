// One exercise language across the prompt, the catalog, the repairs and the
// gate. Each of these disagreements cost regenerations live:
//   - a rule named an exercise the athlete's catalog did not offer (the
//     weightlifter's Snatch and Clean and Jerk, the Hyrox racer's Sled Push and
//     Wall Ball, the basketball player's Wall Sit), so the model had to break
//     one instruction to obey the other;
//   - the engine's own vocabulary named exercises its hallucination gate
//     rejects (Incline Push-up).

import test from 'node:test';
import assert from 'node:assert/strict';

import { phase15PromptRules } from '../engine/phase15_program_qa.js';
import { buildDeterministicBrief } from '../engine/phase15_planner.js';
import { canonicalExerciseCatalog } from '../engine/phase15_source_router.js';
import { EXERCISE_DICTIONARY, validateExercisesAgainstDictionary } from '../engine/exercise_dictionary.js';
import { SKILL_PROGRESSIONS } from '../engine/skill_progressions.js';

const DICT = [...EXERCISE_DICTIONARY];
const byLength = DICT.slice().sort((a, b) => b.length - a.length);
function namesIn(text) {
  const found = [];
  let rest = String(text);
  for (const n of byLength) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(rest)) { found.push(n); rest = rest.replace(re, ' '); }
  }
  return found;
}

const ATHLETES = {
  weightlifter: { age: 26, language: 'en', experience: 'Advanced', primary_goals: ['Snatch 120 kg at the national qualifier', 'Clean and jerk 150 kg'], days_per_week: 5, sport: 'Olympic weightlifting', current_numbers: 'Snatch: 112 kg\nClean and jerk: 141 kg\nFront Squat: 165 kg x 1' },
  hyrox: { age: 34, language: 'en', experience: 'Intermediate', primary_goals: ['Hyrox Pro under 70 minutes'], days_per_week: 4, sport: 'Hyrox' },
  basketball: { age: 22, language: 'en', experience: 'Advanced', primary_goals: ['Keep vertical jump and strength in season'], days_per_week: 2, sport: 'Basketball', injuries: 'Patellar tendinopathy', pain: { active: true, description: 'patellar tendon ache' } },
  calisthenics: { age: 29, language: 'en', experience: 'Advanced', primary_goals: ['Strict muscle-up on rings for 5 clean reps', 'Weighted pull-up with 40 kg for 3'], secondary_goals: ['Hold a 10 second straddle planche', 'Freestanding handstand push-up'], days_per_week: 4 },
};

for (const [who, intake] of Object.entries(ATHLETES)) {
  test(`every exercise ${who}'s own rules name is in ${who}'s catalog`, () => {
    let rules = '';
    try { rules = `${buildDeterministicBrief(intake)}\n${phase15PromptRules(intake)}`; } catch { rules = phase15PromptRules(intake); }
    const catalog = new Set(canonicalExerciseCatalog(EXERCISE_DICTIONARY, intake, [rules]).split(' | '));
    const missing = namesIn(rules).filter((n) => !catalog.has(n));
    assert.deepEqual(missing, []);
  });
}

test('every exercise name the engine itself writes is one its gate accepts', () => {
  const written = new Set(['Incline Push-up', 'Knee Push-up', 'Wall Sit', 'Pike Push-up', 'Wall Handstand Push-up', 'Decline Push-up']);
  for (const family of SKILL_PROGRESSIONS.values()) {
    for (const rung of (Array.isArray(family) ? family : family?.rungs || [])) {
      const name = typeof rung === 'string' ? rung : rung?.name || rung?.exercise;
      if (name) written.add(String(name));
    }
  }
  const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const rejected = [];
  for (const name of written) {
    const p = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\nMon\t${name}\tBodyweight\t3\t5\t2 min\t7\tx\t\nEND_WEEK${w}_TSV`).join('\n\n');
    try { validateExercisesAgainstDictionary(p, { age: 28, language: 'en' }); } catch (e) { rejected.push(name); }
  }
  assert.deepEqual(rejected, []);
  assert.ok(written.size > 10);
});
