import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  enduranceFamilySpecialistRules,
  enduranceSpecialistRules,
  intermittentSportSpecialistRules,
  multisportSpecialistRules,
  primaryEnduranceModality,
} from '../engine/endurance_specialist_rules.js';
import { buildSpecialistRules } from '../engine/phase15_specialist_rules.js';

const A = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const H = JSON.parse(fs.readFileSync(new URL('./fixtures/hard_avatars.json', import.meta.url), 'utf8'));
const V = JSON.parse(fs.readFileSync(new URL('./fixtures/launch_v2_avatars.json', import.meta.url), 'utf8'));
const TRIATHLETE = { ...V.sprint_triathlete, event_type: 'triathlon' };

test('every launch avatar now reaches the specialist layer', () => {
  // Measured before this module existed: masters, triathlete and basketball all
  // returned zero characters, and the masters rower is the lowest score the
  // coach gave.
  for (const [id, intake] of [
    ['masters_return', H.masters_return],
    ['youth_gymnastics', A.youth_gymnastics],
    ['tactical_3k', A.tactical_3k],
    ['advanced_hybrid', A.advanced_hybrid],
    ['sprint_triathlete', TRIATHLETE],
    ['inseason_basketball', V.inseason_basketball],
  ]) {
    assert.ok(String(buildSpecialistRules(intake) || '').length > 0, `${id} gets no specialist rules`);
  }
});

test('the rowing comeback gets the anchors ARTICLE 10 actually names', () => {
  const rules = enduranceSpecialistRules(H.masters_return).join('\n');
  assert.equal(primaryEnduranceModality(H.masters_return), 'rowing');
  // "prescribe rowing pace/power and stroke rate rather than HR alone because
  // HR lags" -- the corpus is explicit, and the engine was already doing it.
  assert.match(rules, /stroke rate/i);
  assert.match(rules, /heart rate lags|because heart rate/i);
  // "low impact does not mean low systemic or pulling fatigue" -- which is the
  // principled reason a rower's extra horizontal-pull accessories compete with
  // the erg. This is the coach's accessory complaint, from his own source.
  assert.match(rules, /pulling fatigue/i);
  assert.match(rules, /recoverable dose/i);
  // A graded return is a tolerance problem first.
  assert.match(rules, /tolerance of the goal modality/i);
  assert.match(rules, /not a progression in tolerance/i);
});

test('a multisport athlete is calibrated per discipline, not once', () => {
  const rules = multisportSpecialistRules(TRIATHLETE).join('\n');
  assert.match(rules, /calibrate each discipline separately/i);
  assert.match(rules, /One heart-rate or pace zone cannot be copied/i);
  assert.match(rules, /uncovered component/i);
  // Her weakest leg is the swim and the cheapest to recover from; the corpus
  // says a technically limited discipline answers to technique first.
  assert.match(rules, /technically limited discipline/i);
  // And a single-modality athlete is not handed multisport rules.
  assert.deepEqual(multisportSpecialistRules(H.masters_return), []);
});

test('a late-game drop-off is diagnosed before more power is added', () => {
  const rules = intermittentSportSpecialistRules(V.inseason_basketball).join('\n');
  // ARTICLE 9: "IF the athlete is strong in early exchanges but fades across
  // rounds, THEN assess aerobic support, pacing and repeat-effort recovery
  // before adding more peak-power work." The guard reports 61 cm fresh and
  // 52 cm in the fourth quarter.
  assert.match(rules, /BEFORE adding more peak-power work/i);
  assert.match(rules, /repeat-effort recovery/i);
  // The fixtures have to shape the gym week.
  assert.match(rules, /competitive days are wed, sat/i);
  assert.match(rules, /protected/i);
  // Hard competitive sport already counts as conditioning.
  assert.match(rules, /counts as high-intensity conditioning/i);
});

test('an athlete with no late-game complaint gets the general diagnosis instead', () => {
  // The late-game complaint lives in the secondary goal as well as the markers,
  // so a fixture that only clears the markers still trips the detector -- which
  // is correct behaviour and was a bug in this test, not in the rule.
  const steady = {
    ...V.inseason_basketball,
    performance_markers: [],
    secondary_goals: ['Maintain lower-body strength through the season'],
    current_numbers: 'Back Squat: 150 kg x 3',
    notes: 'In-season block. Matchday Wednesday and Saturday.',
  };
  const rules = intermittentSportSpecialistRules(steady).join('\n');
  assert.match(rules, /name the failure before choosing a method/i);
  assert.doesNotMatch(rules, /BEFORE adding more peak-power work/i);
});

test('source gaps are passed on rather than filled in', () => {
  // The corpus marks these unresolved. A specialist layer that invented a race
  // plan anyway would be worse than one that said nothing.
  assert.match(enduranceSpecialistRules(H.masters_return).join('\n'), /SOURCE GAP[\s\S]*specialist-source gap/i);
  assert.match(multisportSpecialistRules(TRIATHLETE).join('\n'), /SOURCE GAP[\s\S]*Ironman/i);
  assert.match(intermittentSportSpecialistRules(V.inseason_basketball).join('\n'), /SOURCE GAP[\s\S]*work-to-rest/i);
});

test('an athlete the generators do not describe gets nothing from them', () => {
  // A pure strength athlete has no endurance priority, no components and no
  // season, so none of the three fire.
  const lifter = { primary_goals: ['Back Squat 220 kg'], secondary_goals: [], sport: '', notes: '' };
  assert.deepEqual(enduranceFamilySpecialistRules(lifter), []);
  assert.equal(primaryEnduranceModality(lifter), null);
});
