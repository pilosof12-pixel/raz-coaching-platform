// engine/v57_endurance_volume_governor.js
//
// When the primary goal is an endurance event, lower-body accessory work
// around the key endurance sessions defaults to the minimum useful dose.
//
// The Tactical 3K athlete is chasing 13:30 -> sub-12:00 over 3 km. His week
// put an 8 km ruck under 20 kg on Thursday and then, on Friday, Bulgarian
// split squats 3 x 8/side at RPE 8, machine hamstring curls at RPE 8 and a
// 40-minute run. Nothing there is wrong in isolation; together they spend the
// recovery the primary event needs, purely because the schedule had room.
//
// The hierarchy this enforces:
//   primary event work > maintenance strength > necessary tissue work > accessories
//
// Maintenance strength is deliberately untouched. A conservative Back Squat
// 2 x 3 at RPE 6.5 is how an endurance athlete stays strong; it is not what
// steals a race.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise, dayKey, nextDay, previousDay } from './v38_movement_taxonomy.js';

const LOWER_BODY = new Set(['unilateral_lower', 'knee_dominant', 'hip_dominant', 'tissue_capacity']);
const ENDURANCE = new Set(['endurance', 'loaded_carry']);

// Isolation work the taxonomy files as "secondary" because of the muscle it
// trains, not because of the role it plays in an endurance block.
const ISOLATION = /hamstring curl|leg curl|leg extension|leg press|hip thrust|glute bridge|calf raise|lunge|step[- ]up|split squat/i;

const HIGH_EFFORT = 7.5;
const GOVERNED_RPE = '7';
const GOVERNED_SETS = 2;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function txt(v) { return arr(v).map((x) => String(x || '')).join(' '); }

function topOfRange(raw) {
  const nums = [...String(raw || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : null;
}

// Does this athlete's primary goal live on a track or a road rather than a bar?
export function endurancePrimary(intake = {}) {
  const goals = txt(intake.primary_goals).toLowerCase();
  if (!goals) return false;
  return /\b\d+\s*(?:k|km|mile|m)\b|marathon|half|ruck|run|row|swim|cycle|triathlon|sub-?\d/i.test(goals);
}

function rpeIndex(parsed) {
  return parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
}

function isGovernable(name) {
  const { category, role } = classifyExercise(name);
  if (role === 'primary') return false;
  if (!LOWER_BODY.has(category)) return false;
  return role === 'accessory' || ISOLATION.test(name);
}

// A day is "key endurance" if it carries running or loaded-carry work at all:
// for a 3 km athlete every such session is either the event, the tempo that
// builds it, or the ruck that competes with it for the same tissue.
function keyEnduranceDays(parsed) {
  const days = new Set();
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    const day = dayKey(cells[parsed.day]);
    if (!name || !day || isWarmup(name)) continue;
    if (ENDURANCE.has(classifyExercise(name).category)) days.add(day);
  }
  return days;
}

function offendingRows(parsed) {
  const key = keyEnduranceDays(parsed);
  const rpeCol = rpeIndex(parsed);
  const out = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    const day = dayKey(cells[parsed.day]);
    if (!name || !day || isWarmup(name)) return;
    if (!isGovernable(name)) return;
    // Same day, the day before, or the day after a key endurance session: the
    // ruck on Thursday and the accessories on Friday are one problem.
    const adjacent = key.has(day) || key.has(nextDay(day)) || key.has(previousDay(day));
    if (!adjacent) return;
    const rpe = rpeCol >= 0 ? topOfRange(cells[rpeCol]) : null;
    const sets = topOfRange(cells[parsed.sets]);
    if (rpe == null || rpe < HIGH_EFFORT) return;
    out.push({ index, name, day, rpe, sets, rpeCol });
  });
  return out;
}

export function collectEnduranceVolumeFlags(program, intake = {}) {
  if (!endurancePrimary(intake)) return [];
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const row of offendingRows(parsed)) {
      flags.push({
        code: 'V57_ACCESSORY_STEALS_ENDURANCE_RECOVERY',
        week,
        day: row.day,
        exercise: row.name,
        detail: `${row.name} runs ${row.sets ?? '?'} sets at RPE ${row.rpe} on ${row.day}, beside a key endurance session. With an endurance primary goal, lower-body accessories around run and ruck stress hold the minimum useful dose.`,
      });
    }
  }
  return flags;
}

export function repairEnduranceVolume(program, intake = {}) {
  if (!endurancePrimary(intake)) return program;
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const offenders = offendingRows(parsed);
    if (!offenders.length) continue;

    const rows = parsed.rows.map((cells) => cells.slice());
    for (const row of offenders) {
      const cells = rows[row.index];
      if (row.rpeCol >= 0) cells[row.rpeCol] = GOVERNED_RPE;
      if (row.sets != null && row.sets > GOVERNED_SETS) cells[parsed.sets] = String(GOVERNED_SETS);
      if (Number.isInteger(parsed.notes)) {
        const note = String(cells[parsed.notes] || '').trim();
        const reason = 'Held to the minimum useful dose: this sits beside key endurance work, and the run is the goal this accessory is meant to support.';
        if (!note.includes('minimum useful dose')) cells[parsed.notes] = note ? `${note} ${reason}` : reason;
      }
    }

    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildEnduranceVolumeBrief(intake = {}) {
  if (!endurancePrimary(intake)) return '';
  return [
    '* SECONDARY VOLUME GOVERNOR: the primary goal is an endurance event, so recovery belongs to it first.',
    '  Rank work as primary event work > maintenance strength > necessary tissue work > hypertrophy and accessories.',
    '  Lower-body accessories on or beside a key run or ruck day take the minimum useful dose: keep the tissue exposure, not the effort. Do not add hypertrophy volume merely because a day has room for it.',
  ].join('\n');
}
