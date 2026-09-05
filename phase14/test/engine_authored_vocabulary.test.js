// Every exercise name the engine writes for itself must exist in its own
// dictionary.
//
// The deterministic repair layer does not only edit sets and notes: the
// ballistic-swap and combat-power rules replace a row's exercise outright, by
// name, from a hardcoded list. Five of those names -- Explosive Push-up, the
// three medicine-ball throws and Trap Bar Jump -- were not in the dictionary,
// so the engine was prescribing movements its own gate calls hallucinations.
//
// They shipped because ordering hid it. The bundle runs the dictionary gate,
// then early repairs, then the gate again "so production never grants itself a
// bypass" -- but the repair chain carrying these two rules runs a hundred lines
// further down, after the last gate. Two programs reached the coach carrying
// names that would have been rejected had anything looked.
//
// A comment cannot hold that invariant. This test can.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchDictionary } from '../engine/exercise_dictionary.js';
import { BALLISTIC_OPTIONS } from '../engine/v79_ballistic_share.js';
import { POWER_OPTIONS } from '../engine/v72_combat_power.js';

const authored = [
  ...BALLISTIC_OPTIONS.map((o) => ['v79_ballistic_share', o.name]),
  ...POWER_OPTIONS.map((o) => ['v72_combat_power', o.name]),
];

test('every exercise the repair layer can insert is in the dictionary', () => {
  assert.ok(authored.length >= 6, 'the option lists should not be empty');
  const missing = authored.filter(([, name]) => matchDictionary(name).status === 'miss');
  assert.deepEqual(
    missing, [],
    `these are written by the engine but rejected by it: ${missing.map(([m, n]) => `${n} (${m})`).join(', ')}`,
  );
});

test('the dictionary accepts them as canonical, not by loose matching', () => {
  // An alias or a composed match would mean the repair writes one name and the
  // program ends up carrying another, which is how a swap silently loses the
  // exercise it chose.
  for (const [module, name] of authored) {
    const m = matchDictionary(name);
    assert.equal(m.status, 'hit', `${name} (${module}) resolves as "${m.status}", not a canonical entry`);
  }
});
