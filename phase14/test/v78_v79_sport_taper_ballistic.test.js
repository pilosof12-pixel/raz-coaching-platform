import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  sportWeek, governsSportTaper, sportTaperPlan, renderCampSchedule,
  collectSportTaperFlags, buildSportTaperBrief, appendCampSchedule,
} from '../engine/v78_sport_taper.js';
import {
  collectBallisticShareFlags, repairBallisticShare, buildBallisticShareBrief,
} from '../engine/v79_ballistic_share.js';
import { collectNoveltyFlags } from '../engine/v74_camp_economy.js';

// A swap near the event may only promote a movement the athlete has already
// done, so a camp with no earlier ballistic work gives the rule nothing to
// promote. These fixtures seed that earlier exposure, as v72 and the brief
// require the model to.
function seedFamiliar(names) {
  let week = 0;
  return CAMP.split('\n').map((line) => {
    const m = line.match(/^START_WEEK(\d)_TSV/);
    if (m) week = Number(m[1]);
    if ((week === 1 || week === 2) && /^Tue\t/.test(line) && !/WARMUP/.test(line)) {
      const cells = line.split('\t');
      const rows = names.map((n) => {
        const r = cells.slice();
        r[1] = n; r[2] = 'Light'; r[3] = '3'; r[4] = '3';
        return r.join('\t');
      });
      return `${rows.join('\n')}\n${line}`;
    }
    return line;
  }).join('\n');
}

// Pinned fixtures: acceptance runs overwrite docs/qa/.../latest, and the
// engine now prevents most of what these tests assert the detection of.
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const CAMP = fs.readFileSync(new URL('./fixtures/run92_mma_fight_camp_pre_rules.txt', import.meta.url), 'utf8');
const FIGHTER = { ...COMP.mma_fight_camp, competition_date: '2026-09-27', weigh_in_date: '2026-09-26' };
const HYBRID = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');

test('an athlete with no event is untouched by either module', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(collectSportTaperFlags(HYBRID, intake).length, 0, id);
    assert.equal(collectBallisticShareFlags(HYBRID, intake).length, 0, id);
    assert.equal(repairBallisticShare(HYBRID, intake), HYBRID, id);
    assert.equal(appendCampSchedule(HYBRID, intake), HYBRID, id);
    assert.equal(buildSportTaperBrief(intake), '', id);
    assert.equal(buildBallisticShareBrief(intake), '', id);
  }
});

test('a lifter has no sport schedule to taper', () => {
  // The weightlifter competes, but the competition lift IS the gym work --
  // there is no separate sport to withdraw, so v78 must stay silent.
  const lifter = { ...COMP.weightlifter_peak, competition_date: '2026-10-26' };
  assert.equal(governsSportTaper(lifter), false);
  assert.equal(collectSportTaperFlags(CAMP, lifter).length, 0);
  assert.equal(buildSportTaperBrief(lifter), '');
});

test('the sport week is read from the intake, not assumed', () => {
  const week = sportWeek(FIGHTER);
  assert.equal(week.length, 7, 'the fighter trains every day');
  assert.ok(week.some((d) => d.intensity === 'hard'), 'the week has hard days');
  assert.deepEqual(week.map((d) => d.day), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
});

test('hard contact declines to zero across the camp', () => {
  const plan = sportTaperPlan(FIGHTER);
  assert.equal(plan.length, 4);
  const hard = plan.map((w) => w.hardTarget);
  // Monotonic and ending at zero: the fight is the only hard contact left.
  for (let i = 1; i < hard.length; i += 1) assert.ok(hard[i] <= hard[i - 1], `week ${i + 1} adds contact: ${hard}`);
  assert.equal(hard[hard.length - 1], 0, `fight week still spars: ${hard}`);
});

test('the camp schedule names every day of the week, sport and gym', () => {
  const rendered = renderCampSchedule(FIGHTER);
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    assert.ok(rendered.includes(day), `${day} missing from the camp schedule`);
  }
  assert.match(rendered, /CAMP SCHEDULE/);
  assert.match(rendered, /hard contact/i);
});

test('a camp whose narrative never mentions the sparring taper is flagged', () => {
  // This is the delivered 8.5/10 camp: the gym block tapered, the sport did not.
  const flags = collectSportTaperFlags(CAMP, FIGHTER);
  assert.equal(flags.length, 1);
  assert.match(flags[0].code, /V78_SPORT_TAPER_NOT_ADDRESSED/);
});

test('appending the schedule answers the flag, and is idempotent', () => {
  const once = appendCampSchedule(CAMP, FIGHTER);
  assert.notEqual(once, CAMP);
  // Before the tables, where the rule reads and the coach looks first.
  assert.ok(once.indexOf('CAMP SCHEDULE') < once.search(/START_WEEK1_TSV/i), 'schedule landed after the tables');
  assert.equal((once.match(/START_WEEK\d_TSV/g) || []).length, 4, 'week tables damaged');
  assert.equal(collectSportTaperFlags(once, FIGHTER).length, 0);
  assert.equal(appendCampSchedule(once, FIGHTER), once, 'schedule appended twice');
});

test('the ballistic repair replaces accessories rather than adding work', () => {
  const seeded = seedFamiliar(['Medicine Ball Rotational Throw', 'Box Jump']);
  const before = collectBallisticShareFlags(seeded, FIGHTER);
  assert.ok(before.length > 0, 'the camp is accessory-heavy near the fight');

  const repaired = repairBallisticShare(seeded, FIGHTER);
  assert.equal(collectBallisticShareFlags(repaired, FIGHTER).length, 0);
  assert.equal(repairBallisticShare(repaired, FIGHTER), repaired, 'repair is not idempotent');

  // The point of the coach's note: minimal work, not more work. Row count must
  // not grow -- a swap, never an addition.
  const rows = (t) => t.split('\n').filter((l) => l.split('\t').length >= 4).length;
  assert.equal(rows(repaired), rows(seeded), 'the repair added rows instead of swapping them');
});

test('a camp with no earlier ballistic work still gets some, by introduction', () => {
  // Correctly dosed ballistic work leaves very little soreness and builds
  // almost no mass, so introducing an explosive push-up or a low jump late in a
  // camp sharpens the athlete rather than costing recovery. This is the live
  // case from run #96, where refusing to introduce anything left the fighter
  // with no ballistic work at all.
  const before = collectBallisticShareFlags(CAMP, FIGHTER);
  assert.ok(before.length > 0);
  const repaired = repairBallisticShare(CAMP, FIGHTER);
  assert.equal(collectBallisticShareFlags(repaired, FIGHTER).length, 0);
  assert.equal(collectNoveltyFlags(repaired, FIGHTER).length, 0, 'the introduced work must not read as novelty');
});

test('a movement the athlete already knows is preferred over a new one', () => {
  const seeded = seedFamiliar(['Medicine Ball Rotational Throw']);
  const repaired = repairBallisticShare(seeded, FIGHTER);
  const added = repaired.split('\n').filter((l) => !seeded.includes(l.trim()) && l.split('\t').length >= 4);
  assert.ok(added.some((l) => l.split('\t')[1] === 'Medicine Ball Rotational Throw'),
    'the familiar movement was not promoted first');
});

test('the rule asks only for what the familiar work on hand can deliver', () => {
  // One familiar movement cannot carry a session to the share on its own. A
  // rule that keeps asking anyway spends the attempt budget and kills the
  // build, which is how live run #96 died.
  const seeded = seedFamiliar(['Medicine Ball Rotational Throw']);
  const repaired = repairBallisticShare(seeded, FIGHTER);
  assert.equal(collectBallisticShareFlags(repaired, FIGHTER).length, 0, 'rule still asking after its own repair');
});

test('the swap never introduces a movement the camp economy rule forbids', () => {
  // v79 swapping in an unfamiliar exercise and v74 refusing novelty near the
  // event is a contradiction between two rules the generator cannot resolve:
  // live run #96 exhausted four attempts on V74_NOVEL_EXERCISE_NEAR_EVENT
  // caused by v79's own swap. Neither rule may be satisfied at the other's
  // expense.
  for (const names of [['Medicine Ball Rotational Throw'], ['Medicine Ball Rotational Throw', 'Box Jump']]) {
    const repaired = repairBallisticShare(seedFamiliar(names), FIGHTER);
    assert.equal(collectNoveltyFlags(repaired, FIGHTER).length, 0, `v79 introduced novelty near the event: ${names}`);
    assert.equal(collectBallisticShareFlags(repaired, FIGHTER).length, 0);
  }
});

test('the swapped-in work is always ballistic, and always at a primer dose', () => {
  const repaired = repairBallisticShare(seedFamiliar(['Medicine Ball Rotational Throw']), FIGHTER);
  const seeded = seedFamiliar(['Medicine Ball Rotational Throw']);
  const added = repaired.split('\n').filter((l) => !seeded.includes(l.trim()) && l.split('\t').length >= 4);
  assert.ok(added.length > 0);
  for (const row of added) {
    const cells = row.split('\t');
    assert.match(cells[1], /throw|jump|explosive|push-up/i, `not a ballistic swap: ${cells[1]}`);
    // The dose is what makes late ballistic work safe, so it must stay a primer.
    assert.ok(Number(cells[3]) <= 4, `too many sets for a primer: ${row}`);
    assert.ok(Number(String(cells[4]).match(/\d+/)?.[0]) <= 5, `too many reps for a primer: ${row}`);
  }
});
