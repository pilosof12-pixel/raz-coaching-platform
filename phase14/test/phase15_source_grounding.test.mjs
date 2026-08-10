import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceRoutingTerms, retrieveCuratedCoachingExcerpts, canonicalExerciseCatalog, buildPhase15SourceGrounding } from '../engine/phase15_source_router.js';

const pad = 'General authored coaching reference about recovery and programming. '.repeat(900);
const engine = '# EXPANDED KNOWLEDGE LAYER (v10.9)\n\n' +
  'ARTICLE N8 WEIGHTED CALISTHENICS\nWeighted pull-up and weighted dip programming should preserve movement specificity, current-load anchors, repeatable submaximal work and clean progression.\n\n' +
  'POWER AND PLYOMETRIC COACHING\nExplosive work should prioritize jump and sprint quality, full recovery, low fatigue and termination before velocity loss.\n\n' +
  'HYPERTROPHY AND VOLUME\nMuscle growth uses sufficient training volume, proximity to failure, recoverable weekly set exposure and progressive overload.\n\n' + pad;

const warrior = {
  primary_goals: ['hypertrophy', 'weighted calisthenics', 'athletic power', 'lower body strength'],
  equipment: 'rings, pull-up bar, dip bars',
  training_location: 'outdoor_park',
  notes: 'Batman warrior style with jumps and sprints',
};

test('source router expands relevant Warrior terms', () => {
  const terms = sourceRoutingTerms(warrior);
  for (const wanted of ['hypertrophy', 'weighted calisthenics', 'power', 'plyometric', 'rings']) assert.ok(terms.includes(wanted));
});

test('source router retrieves authored relevant excerpts', () => {
  const out = retrieveCuratedCoachingExcerpts(engine, warrior, { maxChars: 8000, maxChunks: 5 });
  assert.match(out, /WEIGHTED CALISTHENICS/i);
  assert.match(out, /POWER AND PLYOMETRIC/i);
  assert.match(out, /HYPERTROPHY AND VOLUME/i);
});

test('canonical catalog is closed-set from supplied dictionary', () => {
  const dict = new Set(Array.from({length: 60}, (_, i) => `Exercise ${i + 1}`).concat(['Reverse Lunge','Ring Push-up']));
  const out = canonicalExerciseCatalog(dict, { primary_goals: ['lower body strength'] });
  assert.match(out, /Reverse Lunge/);
  assert.match(out, /Ring Push-up/);
  assert.doesNotMatch(out, /Step Back Lunge/);
});

test('grounding block contains sources and routed canonical catalog', () => {
  const dict = new Set(Array.from({length: 60}, (_, i) => `Exercise ${i + 1}`).concat(['Reverse Lunge','Ring Push-up']));
  const out = buildPhase15SourceGrounding(engine, warrior, dict);
  assert.match(out, /CURATED COACHING SOURCE EXCERPTS/);
  assert.match(out, /CANONICAL EXERCISE CATALOG/);
  // warrior now explicitly contains a lower-body goal, so lunge-family routing
  // should include the canonical Reverse Lunge without inventing an alias.
  assert.match(out, /Reverse Lunge/);
  assert.doesNotMatch(out, /Step Back Lunge/);
});
