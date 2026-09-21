// The dominant component does not take the station dose rule.
//
// "For a component accounting for >= 50% of expected competition duration, do
// not use the 25% race-dose rule. Running in a run-dominant hybrid race is the
// obvious example." A quarter of the running in a HYROX is a decision about a
// whole endurance quality, not a station rehearsal.
//
// The engine holds race doses in metres and reps and holds no expected duration
// at all, so it cannot compute a literal time share. The exemption is carried
// by modality: the locomotion modes declare no race dose and take the
// unknownDose path. This pins that set, because it is the approximation that
// stands in for the coach's threshold and a silent change to it would move the
// rule without anyone deciding to.

import test from 'node:test';
import assert from 'node:assert/strict';

import { COMPONENT_SPEC } from '../engine/event_component_rules.js';

test('the locomotion modes are exempt from the station dose rule', () => {
  for (const name of ['Run', 'Swim', 'Bike']) {
    const spec = COMPONENT_SPEC[name];
    assert.ok(spec, `${name} is no longer a known component`);
    assert.equal(spec.race, null, `${name} must declare no race dose, which is what exempts it`);
  }
});

test('the stations are not exempt', () => {
  // If a station quietly lost its race dose it would stop being checked at all,
  // which looks identical to passing.
  for (const name of ['Wall Ball', 'Rowing Ergometer', 'Ski Ergometer']) {
    const spec = COMPONENT_SPEC[name];
    if (!spec) continue;
    assert.ok(spec.race && (spec.race.metres || spec.race.reps),
      `${name} must keep a race dose or the 25% floor cannot be applied to it`);
  }
});
