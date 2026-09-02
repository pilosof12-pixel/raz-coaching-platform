// engine/v82_camp_sharpening.js
//
// The last details that separate a good fight camp from a sharp one.
//
// The delivered camp was structurally right and dull in the specifics: the same
// trap-bar jump twice a week in the taper and again in fight week, a full 3x3
// jump two days out, sled pushes on 60-75 second turnarounds, and no rotational
// work anywhere in a striking and wrestling camp. Each of those is a small
// prescription error with a mechanical correction.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, eventType } from './v68_competition_state.js';
import { isPowerExposure } from './v72_combat_power.js';

const SLED = /\b(?:prowler|sled|push drive|acceleration)\b/i;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Alactic work is a speed exposure. Cut the rest and it becomes conditioning,
// which is the one thing this athlete does not need more of.
const MIN_ALACTIC_REST_SEC = 120;
// The last gym touch before the event is a primer, not a session.
const PRIMER_MAX_SETS = 2;

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' '); }

// A full commercial gym has medicine balls. Requiring the intake to list them
// by name meant a fighter in a fully equipped gym was refused rotational work
// and given an explosive push-up instead -- the equipment was there, the string
// match was not.
export function hasMedicineBall(intake = {}) {
  const kit = `${txt(intake.equipment)} ${txt(intake.training_location)}`;
  if (/med(?:icine)? ?ball|slam ball|wall ?ball/i.test(kit)) return true;
  return /\b(?:full (?:commercial )?gym|commercial[_ ]gym|full gym|globo|fitness cent(?:er|re))\b/i.test(kit);
}

export function rotationalOption(intake = {}) {
  if (!hasMedicineBall(intake)) return null;
  return {
    name: 'Medicine Ball Rotational Throw',
    sets: '3', reps: '3 per side', rest: '90 sec', rpe: '7',
    note: 'Rotational power for striking and takedown drive, which nothing else in this block trains. Throw hard, reset fully, and stop the moment speed drops.',
  };
}

function restSeconds(raw) {
  const s = String(raw || '');
  const min = s.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (min) return Number(min[1]) * 60;
  const sec = s.match(/(\d+)\s*sec/i);
  return sec ? Number(sec[1]) : null;
}

function weekRows(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rows = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    const day = String(cells[parsed.day] || '').trim();
    if (!name || !day || isWarmup(name)) return;
    rows.push({ index, name, day, dayKey: day.toLowerCase().slice(0, 3) });
  });
  return { parsed, rows };
}

// Which gym day sits last before the event.
function finalGymDay(rows) {
  const days = [...new Set(rows.map((r) => r.dayKey))];
  return days.sort((a, b) => WEEKDAYS.indexOf(b) - WEEKDAYS.indexOf(a))[0] || null;
}

function governs(intake, now) {
  return eventType(intake) === 'combat' && Boolean(competitionProfile(intake, now));
}

export function collectCampSharpeningFlags(program, intake = {}, now = Date.now()) {
  if (!governs(intake, now)) return [];
  const flags = [];

  for (let week = 1; week <= 4; week += 1) {
    const data = weekRows(program, week);
    if (!data) continue;
    const state = stateForWeek(intake, week, now);
    const late = state === STATE.TAPER || state === STATE.COMPETITION_WEEK;

    // 1. The same power movement twice in one week, near the event.
    const powerRows = data.rows.filter((r) => isPowerExposure(r.name));
    const seen = new Map();
    for (const r of powerRows) {
      const key = r.name.toLowerCase();
      if (late && seen.has(key)) {
        flags.push({
          code: 'V82_POWER_EXPOSURE_DUPLICATED', week, exercise: r.name,
          detail: `Week ${week} runs ${r.name} on both ${seen.get(key)} and ${r.day}. Two doses of one movement is not two exposures -- it is the same stimulus twice, and this close to the fight one of those slots should buy something the block does not already have. Rotational throwing trains the plane the sport is fought in and nothing else here covers it.`,
        });
      } else seen.set(key, r.day);
    }

    // 2. The last gym touch before the event should be a primer.
    if (state === STATE.COMPETITION_WEEK) {
      const last = finalGymDay(data.rows);
      for (const r of data.rows.filter((x) => x.dayKey === last && isPowerExposure(x.name))) {
        const sets = Number(String(data.parsed.rows[r.index][data.parsed.sets] || '').match(/\d+/)?.[0]);
        if (Number.isFinite(sets) && sets > PRIMER_MAX_SETS) {
          flags.push({
            code: 'V82_FINAL_PRIMER_TOO_LONG', week, exercise: r.name,
            detail: `${r.name} runs ${sets} sets in the last gym session before the fight. The final touch is a neural primer, not a session: a couple of crisp sets to leave the athlete sharp, and nothing that can still be felt on the day.`,
          });
        }
      }
    }

    // 3. Alactic work needs its recovery or it stops being speed work.
    for (const r of data.rows.filter((x) => SLED.test(x.name) || isPowerExposure(x.name))) {
      if (!Number.isInteger(data.parsed.rest)) break;
      const rest = restSeconds(data.parsed.rows[r.index][data.parsed.rest]);
      if (rest != null && rest < MIN_ALACTIC_REST_SEC) {
        flags.push({
          code: 'V82_ALACTIC_RECOVERY_TOO_SHORT', week, exercise: r.name,
          detail: `${r.name} (Week ${week}) rests ${rest} seconds between efforts. Short turnarounds turn a speed exposure into conditioning, which is the one quality this athlete is not short of. Give it at least two minutes so every effort is run at full speed.`,
        });
      }
    }
  }
  return flags;
}

export function repairCampSharpening(program, intake = {}, now = Date.now()) {
  if (!governs(intake, now)) return String(program || '');
  let out = String(program || '');
  const rotational = rotationalOption(intake);

  for (let week = 1; week <= 4; week += 1) {
    const data = weekRows(out, week);
    if (!data) continue;
    const { parsed } = data;
    const state = stateForWeek(intake, week, now);
    const late = state === STATE.TAPER || state === STATE.COMPETITION_WEEK;
    const rows = parsed.rows.map((c) => c.slice());
    const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
    let changed = false;

    // 1. Give the duplicate slot to rotational work.
    if (late && rotational) {
      const seen = new Set();
      const present = new Set(data.rows.filter((r) => isPowerExposure(r.name)).map((r) => r.name.toLowerCase()));
      for (const r of data.rows.filter((x) => isPowerExposure(x.name))) {
        const key = r.name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); continue; }
        if (present.has(rotational.name.toLowerCase())) continue;
        const cells = rows[r.index];
        cells[parsed.exercise] = rotational.name;
        if (Number.isInteger(parsed.load)) cells[parsed.load] = 'Light, speed-first load';
        cells[parsed.sets] = rotational.sets;
        cells[parsed.reps] = rotational.reps;
        if (Number.isInteger(parsed.rest)) cells[parsed.rest] = rotational.rest;
        if (rpeCol >= 0) cells[rpeCol] = rotational.rpe;
        if (Number.isInteger(parsed.notes)) cells[parsed.notes] = `${rotational.note} Replaces a second ${r.name}: one exposure of it is the dose.`;
        present.add(rotational.name.toLowerCase());
        changed = true;
      }
    }

    // 2. Shorten the last primer before the fight.
    if (state === STATE.COMPETITION_WEEK) {
      const last = finalGymDay(data.rows);
      for (const r of data.rows.filter((x) => x.dayKey === last && isPowerExposure(x.name))) {
        const cells = rows[r.index];
        const sets = Number(String(cells[parsed.sets] || '').match(/\d+/)?.[0]);
        if (!Number.isFinite(sets) || sets <= PRIMER_MAX_SETS) continue;
        cells[parsed.sets] = String(PRIMER_MAX_SETS);
        const reps = Number(String(cells[parsed.reps] || '').match(/\d+/)?.[0]);
        if (Number.isFinite(reps) && reps > 3) cells[parsed.reps] = '3';
        if (Number.isInteger(parsed.notes)) {
          const note = String(cells[parsed.notes] || '');
          const add = 'Last touch before the fight: a primer, not a session. Two crisp sets, stop while every rep is fast.';
          if (!note.includes('primer, not a session')) cells[parsed.notes] = note ? `${note} ${add}` : add;
        }
        changed = true;
      }
    }

    // 3. Let the speed work recover.
    if (Number.isInteger(parsed.rest)) {
      for (const r of data.rows.filter((x) => SLED.test(x.name) || isPowerExposure(x.name))) {
        const cells = rows[r.index];
        const rest = restSeconds(cells[parsed.rest]);
        if (rest == null || rest >= MIN_ALACTIC_REST_SEC) continue;
        cells[parsed.rest] = SLED.test(r.name) ? '2-3 min' : '2 min';
        if (Number.isInteger(parsed.notes)) {
          const note = String(cells[parsed.notes] || '');
          const add = 'Full recovery between efforts: this is a speed exposure, and a short turnaround makes it conditioning instead.';
          if (!note.includes('speed exposure, and a short turnaround')) cells[parsed.notes] = note ? `${note} ${add}` : add;
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

export function buildCampSharpeningBrief(intake = {}, now = Date.now()) {
  if (!governs(intake, now)) return '';
  const lines = [
    '* SHARPEN THE DETAILS, NOT ONLY THE STRUCTURE.',
    '  One exposure of a movement is the dose. Do not run the same jump twice in a week near the fight; a second slot should buy a quality the block does not already have.',
    '  Alactic work -- sled pushes, jumps, throws -- needs at least two minutes between efforts. A short turnaround turns a speed exposure into conditioning, which is the one quality a fighter training seven times a week is not short of.',
    '  The last gym touch before the fight is a neural primer, not a session: about two crisp sets of two or three reps, and nothing that can still be felt on the day.',
    '  Weeks 1 and 2 still carry meaningful strength intensity. Volume comes down across the camp, but early-camp loads should be heavy enough to hold what the athlete has -- maintenance is an intensity statement, not a volume one, and a block of light doubles maintains nothing.',
  ];
  if (hasMedicineBall(intake)) {
    lines.splice(2, 0, '  Include rotational medicine-ball work -- throws and slams. Striking and takedown drive happen in the transverse plane, and nothing else in a gym block trains it.');
  }
  return lines.join('\n');
}
