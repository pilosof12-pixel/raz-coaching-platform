// The taper cap has to run after the repair that refills the taper.
//
// Live run #119 delivered a Hyrox block whose week 3 -- the taper -- carried
// eighteen power sets against nine in the building weeks, which is the coach's
// TAPER_INTRODUCES_NEW_EMPHASIS at 0.45. The repair for it existed, was
// deployed, and had been verified against the corpus. It had also already run
// by the time the week was refilled: repairTaperPowerSpike sat in
// ENDURANCE_REPAIRS near the top of the v35 chain, and repairBallisticShare --
// which swaps generic accessories for ballistic work as an event approaches,
// and has no notion of a taper -- ran three hundred lines further down.
//
// The fixture is that delivered program with the swap reversed: each row the
// swap inserted names the accessory it replaced, so the pre-swap week can be
// reconstructed exactly. Running the chain on it fires the swap for real, which
// is the only way to test the interaction rather than assert the order.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { BALLISTIC_OPTIONS } from '../engine/v79_ballistic_share.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { taperPowerSpike } from '../engine/coach_race_block_rules.js';
import { ENDURANCE_REPAIRS } from '../engine/endurance_block_repair.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = fs.readFileSync(path.join(here, 'fixtures', 'run119_taper_ballistic-program.txt'), 'utf8');

// The live intake, with the event a fixed number of days from whenever this
// runs rather than on the date run #119 happened to use.
//
// Block week comes from the hours remaining to the event, so a written-down date
// walks backwards through the block as real time passes. That is not a
// hypothetical: v77_fight_week_clock.test.js pinned a date and started failing
// the day the fight fell inside week 1, and it would have been this file's turn
// three weeks from now.
//
// Measured band for this fixture: at 30 days and beyond the ballistic swap stops
// firing, which would make the first test below pass vacuously -- the exact hole
// it exists to close. Twenty-four days sits in the middle of 18..29.
const daysOut = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const INTAKE = {
  age: 33, language: 'en', experience: 'Advanced (3+ years)', bodyweight: '76 kg',
  competition_date: daysOut(24), event_type: 'hybrid_race', event_priority: 'A',
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  secondary_goals: ['Run a half marathon two weeks after Hyrox without wrecking myself for it'],
  maintenance_goals: ['Hold my squat and pulling strength through both'],
  goal_priority_model: 'tiered', days_per_week: 4, session_duration_minutes: 75,
  gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'commercial_gym',
  equipment: 'Full gym: sled, ski erg, rower, wall ball, sandbags, barbells, dumbbells, kettlebells.',
  sport: 'Hyrox', sport_sessions_per_week: 2, sport_schedule: [],
  current_numbers: 'Back Squat: 150 kg x 1\nDeadlift: 190 kg x 1\n5 km run: 19:40\n1 km ski erg: 3:38',
  performance_markers: ['5 km: 19:40', 'Half marathon: 1:28'],
  injuries: 'Left achilles grumbles after back-to-back running days; settles with a day off.',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

test('the ballistic swap fires on this fixture, so the interaction is real', () => {
  // Without this the test would pass on a fixture the swap never touches, which
  // is exactly the hole the original verification fell through.
  const { repairs } = repairDeterministicContradictions(PROGRAM, INTAKE);
  assert.ok(repairs.some((r) => r.type === 'v79_ballistic_swapped'),
    'fixture no longer triggers the ballistic swap; it cannot test the ordering');
});

test('the taper is capped after the swap refills it', () => {
  assert.equal(taperPowerSpike(PROGRAM, INTAKE).length, 0, 'fixture should start clean');
  const { program, repairs } = repairDeterministicContradictions(PROGRAM, INTAKE);
  assert.deepEqual(taperPowerSpike(program, INTAKE), [],
    'the taper carries a power spike the chain did not cap');
  // The ordering itself is checked against the chain rather than against this
  // fixture's volumes. Asserting it through the repair log only works while the
  // cap actually fires, and whether it fires depends on how much power volume
  // the swap happens to add -- so when a later change reduced the number of
  // swaps, this assertion stopped testing ordering and started testing nothing,
  // while still passing for the wrong reason until it did not. Source order
  // cannot go quiet that way.
  const chain = fs.readFileSync(new URL('../engine/v35_deterministic_repair.js', import.meta.url), 'utf8');
  const swapAt = chain.indexOf('repairBallisticShare(candidate, intake)');
  const capAt = chain.indexOf('repairTaperPowerSpike(candidate, intake)');
  assert.ok(swapAt > -1 && capAt > -1, 'the chain no longer calls both');
  assert.ok(capAt > swapAt,
    'the cap is called before the swap again; it cannot see the week the swap builds');
});

test('every ballistic option is prescribed within the rules that judge it', () => {
  // The swap introduces alactic work, and V82 governs alactic work. Four
  // options were written at 90 seconds against a 120-second minimum, so each
  // session the swap fixed came back refused for V82_ALACTIC_RECOVERY_TOO_SHORT
  // -- one repair manufacturing the next gate's violation, with the build
  // refused either way.
  for (const option of BALLISTIC_OPTIONS) {
    const seconds = /min/i.test(option.rest)
      ? Number(option.rest.match(/([\d.]+)/)[1]) * 60
      : Number(option.rest.match(/([\d.]+)/)[1]);
    assert.ok(seconds >= 120, `${option.name} rests ${option.rest}, under the alactic minimum`);
  }
});

test('the cap is not in the early endurance list any more', () => {
  // Where it was is where it could not see the finished week.
  assert.ok(!ENDURANCE_REPAIRS.some((fn) => fn.name === 'repairTaperPowerSpike'),
    'repairTaperPowerSpike is back in ENDURANCE_REPAIRS and will run too early');
});
