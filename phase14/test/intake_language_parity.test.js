// The engine reads the athlete's own words, and it only reads them in English.
//
// Run #144 delivered a Hebrew lifter a four-week block containing no squat, no
// bench press and no deadlift. His two stated goals are a 140 kg squat and a
// 100 kg bench. The words סקוואט and לחיצת חזה appear nowhere in the file, not
// even in the prose, which quietly recast the block as horizontal pushing and leg
// work. It passed every gate on the first model call.
//
// The same program with the same goals written in English is refused twice:
// NAMED_GOAL_DIRECT_EXPOSURE_MISSING and PRIMARY_EXACT_MOVEMENT_MISSING. So the
// rule that asks whether a program trains what the client asked for was not
// failing for Hebrew athletes -- it was not running for them.
//
// The fix normalises the intake's free text once, at the door of the validation
// bundle, rather than teaching each of the 43 modules that match English words
// against intake text to read Hebrew. That kind of tax gets forgotten exactly
// once, silently, which is how this survived. The parity test below is the part
// that matters long-term: it fails loudly the next time a rule can only see one
// language.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withEnglishTerms, englishTermsIn, hasHebrew } from '../engine/intake_language.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKES = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run144_hebrew_lifter_intake.json'), 'utf8'));
const HEBREW_INTAKE = INTAKES.hebrew;
const ENGLISH_TWIN = INTAKES.english_twin;
const DELIVERED = fs.readFileSync(path.join(here, 'fixtures/run144_hebrew_lifter.txt'), 'utf8');

const codesFor = (program, intake) => {
  const result = collectRepairableValidationFailures(program, intake);
  return [...new Set((result.flags || []).map((f) => f.code))].sort();
};

test('a Hebrew goal names the movement it is about', () => {
  assert.match(englishTermsIn('סקוואט 140 ק"ג לחזרה אחת'), /Back Squat/);
  assert.match(englishTermsIn('לחיצת חזה 100 ק"ג לחזרה אחת'), /Bench Press/);
  assert.match(englishTermsIn('מתח במשקל 40 ק"ג'), /Weighted Pull-up/);
  // Hebrew glues its article and prepositions onto the word, so "הכושר האירובי"
  // has to be read as "כושר אירובי".
  assert.match(englishTermsIn('לשמור על הכושר האירובי שיש לי'), /aerobic/);
});

test('a word that merely contains a movement is not that movement', () => {
  // "מתחיל" is a beginner. It contains "מתח", a pull-up. A plain substring test
  // read it as one, and an added goal exposure is as wrong as a missing one.
  assert.equal(englishTermsIn('מתחיל להתאמן'), '');
});

test('an intake with no Hebrew in it is not touched at all', () => {
  // Returned by identity, not copied: every English build must be unchanged by
  // this, and identity is the strongest way to say so.
  assert.equal(withEnglishTerms(ENGLISH_TWIN), ENGLISH_TWIN);
  assert.equal(hasHebrew(JSON.stringify(ENGLISH_TWIN)), false);
});

test('the athlete keeps their own words', () => {
  // A rule that quotes a goal back to the client must quote what they wrote.
  const normalised = withEnglishTerms(HEBREW_INTAKE);
  assert.match(normalised.primary_goals[0], /^סקוואט 140/);
  assert.match(normalised.primary_goals[0], /Back Squat/);
});

test('the same program and the same goals are judged the same in either language', () => {
  // This is the guard. If a rule can only see one language, these diverge.
  const hebrew = codesFor(DELIVERED, HEBREW_INTAKE);
  const english = codesFor(DELIVERED, ENGLISH_TWIN);
  assert.deepEqual(hebrew, english,
    `a Hebrew intake is judged differently from its English twin:\n  Hebrew : ${hebrew.join(', ')}\n  English: ${english.join(', ')}`);
});

test('the program run #144 shipped is refused for ignoring its goals', () => {
  const codes = codesFor(DELIVERED, HEBREW_INTAKE);
  assert.ok(codes.includes('NAMED_GOAL_DIRECT_EXPOSURE_MISSING'),
    'a block with no squat and no bench for a squat and bench athlete must not ship');
  assert.ok(codes.includes('PRIMARY_EXACT_MOVEMENT_MISSING'));

  // And the program really does lack them, so the flags are not an artefact.
  for (const movement of [/Back Squat/i, /Bench Press/i]) {
    assert.doesNotMatch(DELIVERED, movement, `${movement} is genuinely absent from the delivered block`);
  }
});
