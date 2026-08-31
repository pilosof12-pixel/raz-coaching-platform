// engine/v79_ballistic_share.js
//
// Near the fight, swap generic work out rather than trimming it down.
//
// The camp economy rule cut sessions to a budget and the power rule added one
// ballistic exposure, which together produced a smaller version of a gym
// programme. The review asked for something different: as Day 0 approaches the
// proportion of familiar ballistic and sport-support work should rise, and
// generic rows, presses and planks should be replaced by it rather than merely
// reduced.
//
// So a session in the taper or fight week that is mostly generic accessory work
// gets one of those swapped for a throw, a jump or an explosive push-up. The
// count stays the same; what the session is made of changes.
//
// The volume stays deliberately small. Ballistic work here is a primer, not a
// stimulus, and adding plyometrics because they look sport-specific is how a
// camp acquires soreness it cannot afford.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile } from './v68_competition_state.js';
import { isPowerExposure } from './v72_combat_power.js';

const NECK_GRIP = /\b(?:neck|grip|farmer|wrist)\b/i;
const SLED = /\b(?:prowler|sled|push drive|acceleration)\b/i;
// Generic work with a ballistic alternative that does the same job for less.
const SWAPPABLE = /\b(?:row|pulldown|fly|curl|extension|lateral raise|plank|dead bug|shoulder press|bench|chest press|leg press|calf)\b/i;

// Ordered by how sport-specific they are for a fighter.
const BALLISTIC_OPTIONS = [
  { name: 'Medicine Ball Rotational Throw', needs: /med(?:icine)? ?ball/i, sets: '3', reps: '3 per side', rest: '90 sec', rpe: '7',
    note: 'Rotational power for striking and takedown drive. Throw hard, reset fully, stop the moment speed drops.' },
  { name: 'Medicine Ball Scoop Throw', needs: /med(?:icine)? ?ball/i, sets: '3', reps: '3', rest: '90 sec', rpe: '7',
    note: 'Whole-body extension at speed. Three hard throws, full reset, nothing chased.' },
  { name: 'Explosive Push-up', needs: null, sets: '3', reps: '3', rest: '90 sec', rpe: '7',
    note: 'Upper-body ballistic work at almost no cost. Leave the floor, land soft, stop while every rep is sharp.' },
  { name: 'Box Jump', needs: null, sets: '3', reps: '3', rest: '2 min', rpe: '6-7',
    note: 'Step down between reps: the jump is the exposure, the landing is not. Low volume, full recovery.' },
];

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' '); }

// Every ballistic movement the athlete has already performed earlier in this
// block, with the dose it was given, so a swap can promote one instead of
// inventing one.
function familiarBallistic(program, week) {
  const seen = new Map();
  for (let w = 1; w < week; w += 1) {
    const parsed = parseWeek(program, w);
    if (!parsed) continue;
    parsed.rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !isPowerExposure(name)) return;
      if (seen.has(name)) return;
      const at = (i) => (Number.isInteger(i) ? String(cells[i] || '') : '');
      const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
      seen.set(name, {
        name,
        sets: at(parsed.sets) || '3',
        reps: at(parsed.reps) || '3',
        rest: at(parsed.rest) || '90 sec',
        rpe: (rpeCol >= 0 ? String(cells[rpeCol] || '') : '') || '7',
        note: 'Same exposure as earlier in the block, kept short and sharp. Speed is the point; stop the moment it drops.',
      });
    });
  }
  return seen;
}

// A swap this close to the event must promote something the athlete already
// knows. Introducing a movement in the taper hands them unpredictable soreness
// with no time left to discover it -- which the camp economy rule flags, and
// rightly: a live build died on exactly that contradiction between these two
// rules. "Familiar" was in this file's own description of the work and nowhere
// in the code that chose it.
function chooseBallistic(intake, exclude = new Set(), familiar = new Map()) {
  for (const [name, spec] of familiar) {
    if (!exclude.has(name)) return spec;
  }
  return null;
}

function sessions(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const days = new Map();
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    const day = String(cells[parsed.day] || '').trim();
    if (!name || !day || isWarmup(name)) return;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push({ index, name });
  });
  return { parsed, days };
}

// Ballistic and sport-support work as a share of the session.
function shareOf(rows) {
  const specific = rows.filter((r) => isPowerExposure(r.name) || SLED.test(r.name) || NECK_GRIP.test(r.name)).length;
  return rows.length ? specific / rows.length : 1;
}

const GOVERNED = new Set([STATE.TAPER, STATE.COMPETITION_WEEK]);

export function collectBallisticShareFlags(program, intake = {}, now = Date.now()) {
  if (!competitionProfile(intake, now)) return [];
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    if (!GOVERNED.has(stateForWeek(intake, week, now))) continue;
    const data = sessions(program, week);
    if (!data) continue;
    // With nothing familiar to promote, the only way to satisfy this rule would
    // be to introduce a novel movement in the taper, which is worse than the
    // generic row it replaces. The rule then has nothing coherent to ask for.
    const familiar = familiarBallistic(program, week);
    if (!familiar.size) continue;
    for (const [day, rows] of data.days) {
      if (rows.length < 3) continue;
      if (shareOf(rows) >= 0.5) continue;
      const generic = rows.filter((r) => SWAPPABLE.test(r.name) && !isPowerExposure(r.name)).map((r) => r.name);
      if (!generic.length) continue;

      // Only ask for what the familiar work on hand can actually deliver. A
      // session with one familiar movement and four generic rows cannot reach
      // the share however many passes it is given, and a rule that keeps asking
      // anyway spends the attempt budget and kills the build. Deleting rows to
      // force the number would risk taking the last strength-maintenance work
      // with it, so the brief carries this case instead.
      const present = new Set(rows.filter((r) => isPowerExposure(r.name)).map((r) => r.name));
      const spare = [...familiar.keys()].filter((n) => !present.has(n)).length;
      const swappable = Math.min(spare, generic.length);
      const best = (rows.filter((r) => isPowerExposure(r.name) || SLED.test(r.name) || NECK_GRIP.test(r.name)).length + swappable) / rows.length;
      if (best < 0.5) continue;
      flags.push({
        code: 'V79_TOO_GENERIC_NEAR_EVENT',
        week, day,
        detail: `Week ${week} ${day} is mostly generic gym work this close to the fight (${generic.join(', ')}). `
          + `As Day 0 approaches the session should look less like a gym programme and more like a small set of familiar ballistic and sport-support primers. Replace generic accessory work rather than only reducing its sets.`,
      });
    }
  }
  return flags;
}

export function repairBallisticShare(program, intake = {}, now = Date.now()) {
  if (!competitionProfile(intake, now)) return String(program || '');
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    if (!GOVERNED.has(stateForWeek(intake, week, now))) continue;
    const data = sessions(out, week);
    if (!data) continue;
    const { parsed } = data;
    const familiar = familiarBallistic(out, week);
    if (!familiar.size) continue;
    const rows = parsed.rows.map((c) => c.slice());
    let changed = false;

    for (const [, sessionRows] of data.days) {
      if (sessionRows.length < 3) continue;
      // One swap per session does not converge: a session carrying two generic
      // rows is still under the threshold after the first swap, so the flag
      // survives its own repair and the attempt budget burns out. Keep swapping
      // until the session actually meets the share the rule asks for.
      const swapped = new Map();
      const view = () => sessionRows.map((r) => ({ ...r, name: swapped.get(r.index) || r.name }));

      while (shareOf(view()) < 0.5) {
        const current = view();
        const present = new Set(current.filter((r) => isPowerExposure(r.name)).map((r) => r.name));
        const option = chooseBallistic(intake, present, familiar);
        if (!option) break;

        // Swap the most generic row rather than adding to the session.
        const target = current.find((r) => SWAPPABLE.test(r.name) && !isPowerExposure(r.name));
        if (!target) break;
        swapped.set(target.index, option.name);

        const cells = rows[target.index];
        cells[parsed.exercise] = option.name;
        if (Number.isInteger(parsed.load)) cells[parsed.load] = 'Light, speed-first load';
        cells[parsed.sets] = option.sets;
        cells[parsed.reps] = option.reps;
        if (Number.isInteger(parsed.rest)) cells[parsed.rest] = option.rest;
        const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
        if (rpeCol >= 0) cells[rpeCol] = option.rpe;
        if (Number.isInteger(parsed.notes)) {
          cells[parsed.notes] = `${option.note} Replaces ${target.name}: closer to the fight this buys more than another accessory set.`;
        }
        changed = true;
      }
    }

    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildBallisticShareBrief(intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile || !profile.blockEndsAtEvent) return '';
  return [
    '* AS DAY 0 APPROACHES, CHANGE WHAT THE SESSION IS MADE OF, NOT ONLY HOW MUCH OF IT THERE IS.',
    `  Replace generic accessories -- rows, presses, curls, planks -- with familiar low-volume ballistic work: ${BALLISTIC_OPTIONS.map((o) => o.name.toLowerCase()).join(', ')}, or short sled accelerations. Swap them out rather than trimming their sets.`,
    '  ESTABLISH THEM IN WEEK 1. Whatever ballistic work appears in the taper or fight week must already have appeared earlier in the block. A movement introduced near the event brings soreness nobody can predict and there is no time left to discover it, so a novel exercise late is worse than the generic row it would replace.',
    '  Keep only the minimum strength maintenance the athlete needs. Every remaining generic exercise must justify itself against a ballistic or sport-specific alternative.',
    '  The last session before the fight is a brief neural primer, not a gym session: two to four familiar explosive drills, ten to twenty minutes, or nothing at all if the cut or readiness says so.',
    '  None of this is a licence to add plyometrics. Everything here is familiar, technically clean, very low volume, and must leave no soreness.',
  ].join('\n');
}
