import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectCampSharpeningFlags, repairCampSharpening, hasMedicineBall, rotationalOption, buildCampSharpeningBrief,
} from '../engine/v82_camp_sharpening.js';
import { isPowerExposure } from '../engine/v72_combat_power.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
// The camp delivered by run #97 and rated 8.8: trap-bar jump twice a week in
// weeks 3 and 4, a full 3x3 jump in the last session before the fight, sled
// pushes on 60-75 second turnarounds, and no rotational work anywhere.
const CAMP = fs.readFileSync(new URL('./fixtures/run97_mma_camp_delivered.txt', import.meta.url), 'utf8');
const HYBRID = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
const iso = (w) => new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10);
const FIGHTER = { ...COMP.mma_fight_camp, competition_date: iso(4), weigh_in_date: iso(4 - 1 / 7), event_type: 'combat', event_priority: 'A' };

const codes = (p, code) => collectCampSharpeningFlags(p, FIGHTER).filter((f) => f.code === code);

function week(program, n) {
  const start = program.indexOf(`START_WEEK${n}_TSV`);
  const stop = program.indexOf(`END_WEEK${n}_TSV`);
  return program.slice(start, stop).split('\n').slice(2)
    .map((l) => l.split('\t')).filter((c) => c.length > 5 && !/WARMUP/.test(c[1]));
}

test('an athlete with no event is untouched', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(collectCampSharpeningFlags(HYBRID, intake).length, 0, id);
    assert.equal(repairCampSharpening(HYBRID, intake), HYBRID, id);
    assert.equal(buildCampSharpeningBrief(intake), '', id);
  }
});

test('a full commercial gym counts as having medicine balls', () => {
  // Requiring the intake to name them meant a fighter in a fully equipped gym
  // was refused rotational work over a string match.
  assert.equal(hasMedicineBall(FIGHTER), true);
  assert.equal(hasMedicineBall({ equipment: 'Pull-up bar and bands only', training_location: 'home_gym' }), false);
  assert.equal(hasMedicineBall({ equipment: 'Rings, bar, medicine ball' }), true);
  assert.ok(rotationalOption(FIGHTER));
  assert.equal(rotationalOption({ equipment: 'bands' }), null);
});

test('the same power movement twice in a taper week is flagged', () => {
  const flags = codes(CAMP, 'V82_POWER_EXPOSURE_DUPLICATED');
  assert.equal(flags.length, 2, 'weeks 3 and 4 both run the jump twice');
  assert.match(flags[0].detail, /Rotational throwing/);
});

test('the duplicate slot becomes rotational work', () => {
  const fixed = repairCampSharpening(CAMP, FIGHTER);
  assert.equal(codes(fixed, 'V82_POWER_EXPOSURE_DUPLICATED').length, 0);
  for (const n of [3, 4]) {
    const names = week(fixed, n).map((c) => c[1]);
    assert.ok(names.includes('Medicine Ball Rotational Throw'), `week ${n} has no rotational work`);
    const jumps = names.filter((x) => /Trap Bar Jump/.test(x));
    assert.ok(jumps.length <= 1, `week ${n} still repeats the jump: ${jumps.length}`);
  }
});

test('the last gym touch before the fight is a primer', () => {
  assert.equal(codes(CAMP, 'V82_FINAL_PRIMER_TOO_LONG').length, 1);
  const fixed = repairCampSharpening(CAMP, FIGHTER);
  assert.equal(codes(fixed, 'V82_FINAL_PRIMER_TOO_LONG').length, 0);
  // Whatever power work survives in that session runs at two sets.
  const fri = week(fixed, 4).filter((c) => /^Fri/i.test(c[0]) && isPowerExposure(c[1]));
  assert.ok(fri.length > 0);
  for (const row of fri) assert.ok(Number(row[3]) <= 2, `final primer still runs ${row[3]} sets`);
});

test('speed work is given its recovery', () => {
  assert.ok(codes(CAMP, 'V82_ALACTIC_RECOVERY_TOO_SHORT').length > 0);
  const fixed = repairCampSharpening(CAMP, FIGHTER);
  assert.equal(codes(fixed, 'V82_ALACTIC_RECOVERY_TOO_SHORT').length, 0);
  for (const n of [1, 2, 3, 4]) {
    for (const row of week(fixed, n).filter((c) => /prowler|sled/i.test(c[1]))) {
      assert.match(row[5], /min/, `sled still on a short turnaround in week ${n}: ${row[5]}`);
    }
  }
});

test('the repair answers every flag it raises and is idempotent', () => {
  const fixed = repairCampSharpening(CAMP, FIGHTER);
  assert.equal(collectCampSharpeningFlags(fixed, FIGHTER).length, 0);
  assert.equal(repairCampSharpening(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('the repair swaps rather than adds', () => {
  const fixed = repairCampSharpening(CAMP, FIGHTER);
  for (const n of [1, 2, 3, 4]) {
    assert.equal(week(fixed, n).length, week(CAMP, n).length, `week ${n} changed row count`);
  }
});

test('the brief teaches the dose and the rotational gap', () => {
  const brief = buildCampSharpeningBrief(FIGHTER);
  assert.match(brief, /rotational medicine-ball work/i);
  assert.match(brief, /at least two minutes/i);
  assert.match(brief, /neural primer/i);
  assert.match(brief, /Weeks 1 and 2 still carry meaningful strength intensity/i);
});
