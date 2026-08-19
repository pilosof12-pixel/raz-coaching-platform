import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceRoutingTerms, isEnduranceRelevant, retrieveCuratedCoachingExcerpts, canonicalExerciseCatalog, buildPhase15SourceGrounding } from '../engine/phase15_source_router.js';
import { EXERCISE_DICTIONARY, EXERCISE_EQUIPMENT_REQUIREMENTS, normalizeEquipmentTokens } from '../engine/exercise_dictionary.js';

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

const annoyingHybrid = {
  primary_goals: ['Back squat 200 kg', 'Weighted chin-up +70 kg for 3 reps'],
  secondary_goals: ['Improve 5 km from 25:00 to 22:30'],
  current_numbers: ['Back squat 170x3', 'Weighted chin-up +55x3', '5K 25:00'],
  sport: 'MMA and BJJ',
  sport_schedule: ['Mon hard MMA', 'Wed moderate BJJ', 'Fri hard MMA', 'Sat moderate BJJ'],
  days_per_week: 4,
  notes: 'Strength and 5K both matter. Recovery is average.',
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

test('5K plus strength plus combat intake activates endurance cluster without crowding out RAZ base', () => {
  assert.equal(isEnduranceRelevant(annoyingHybrid), true);
  const terms = sourceRoutingTerms(annoyingHybrid);
  for (const wanted of ['running', 'event specific', 'concurrent training', 'combat']) assert.ok(terms.includes(wanted));
  const out = retrieveCuratedCoachingExcerpts(engine, annoyingHybrid);
  assert.match(out, /ENDURANCE CLUSTER SOURCE EXCERPT/);
  assert.match(out, /RAZ BASE SOURCE EXCERPT/);
  assert.match(out, /running|5K|event specific|economy|threshold/i);
  assert.match(out, /concurrent|combat|recovery|interference/i);
});

test('marathon, rowing and multisport language activates dedicated source routing', () => {
  for (const intake of [
    { primary_goals:['Marathon performance'] },
    { primary_goals:['Improve 2K rowing time'] },
    { primary_goals:['Ironman triathlon'] },
  ]) {
    assert.equal(isEnduranceRelevant(intake), true);
    const out = retrieveCuratedCoachingExcerpts(engine, intake);
    assert.match(out, /ENDURANCE CLUSTER SOURCE EXCERPT/);
  }
});

test('canonical catalog is closed-set from supplied dictionary', () => {
  const dict = new Set(Array.from({length: 60}, (_, i) => `Exercise ${i + 1}`).concat(['Reverse Lunge','Ring Push-up']));
  const out = canonicalExerciseCatalog(dict, { primary_goals: ['lower body strength'] });
  assert.match(out, /Reverse Lunge/);
  assert.match(out, /Ring Push-up/);
  assert.doesNotMatch(out, /Step Back Lunge/);
});

test('triathlon catalog exposes true event modalities instead of hiding them behind generic machines', () => {
  for (const name of ['Run','Bike','Swim','Rowing Ergometer']) assert.equal(EXERCISE_DICTIONARY.has(name), true);
  const out = canonicalExerciseCatalog(EXERCISE_DICTIONARY, {
    primary_goals:['Improve Olympic-distance triathlon swim bike run performance'],
    equipment:'Pool access, road bike, running routes',
  });
  assert.match(out, /\bRun\b/);
  assert.match(out, /\bBike\b/);
  assert.match(out, /\bSwim\b/);
});

test('event modality vocabulary keeps real equipment gates', () => {
  assert.deepEqual(EXERCISE_EQUIPMENT_REQUIREMENTS.get('Bike'), ['bike']);
  assert.deepEqual(EXERCISE_EQUIPMENT_REQUIREMENTS.get('Swim'), ['pool']);
  assert.deepEqual(EXERCISE_EQUIPMENT_REQUIREMENTS.get('Rowing Ergometer'), ['rower']);
  const tokens=normalizeEquipmentTokens('Pool access, road bike with power meter, Concept2 rower');
  for(const token of ['pool','bike','rower']) assert.equal(tokens.has(token),true);
});

test('grounding block contains sources and routed canonical catalog', () => {
  const dict = new Set(Array.from({length: 60}, (_, i) => `Exercise ${i + 1}`).concat(['Reverse Lunge','Ring Push-up']));
  const out = buildPhase15SourceGrounding(engine, warrior, dict);
  assert.match(out, /CURATED COACHING SOURCE EXCERPTS/);
  assert.match(out, /CANONICAL EXERCISE CATALOG/);
  assert.match(out, /Reverse Lunge/);
  assert.doesNotMatch(out, /Step Back Lunge/);
});
