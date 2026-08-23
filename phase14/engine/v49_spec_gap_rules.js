// The two frozen Coaching Specification v1.0 rules that had no implementation.
//
// An offline audit mapped all seventeen v1.0 rules to the codes the engine
// actually emits. Fifteen were enforced. YG-06 and T3K-04 were written into the
// specification, briefed to the model, and never checked -- so a program could
// break either one and pass every gate.
//
// Both are review signals rather than hard failures, which is what the
// specification classifies them as, and what the closing principle asks for:
// flag soft issues for review rather than turning every coaching preference into
// a deterministic rejection.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise, CATEGORY, ROLE } from './v38_movement_taxonomy.js';
import { raceProfile } from './v40_tactical_hard_rules.js';

function txt(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function rowKey(cells, parsed) {
  return `${String(cells[parsed.day] || '').trim().toLowerCase()}|${String(cells[parsed.exercise] || '').trim().toLowerCase()}`;
}

// --- YG-06: power progresses through output before volume --------------------

// Output language: height, distance, speed, intent. If a power row adds reps
// while saying nothing about how well they are produced, more fatigue is being
// bought instead of more power.
const OUTPUT_LANGUAGE = /\b(?:height|higher|distance|speed|fast|explosive|velocity|power|intent|snap|pop|drive|jump higher|chest to bar|bar to|reach|quality of each)\b/i;

export function collectPowerOutputFlags(program, intake = {}) {
  const flags = [];
  let previous = new Map();
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const thisWeek = new Map();
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const { category, role } = classifyExercise(name);
      if (category !== CATEGORY.POWER && role !== ROLE.SKILL_PRACTICE) continue;
      const sets = firstNum(cells[parsed.sets]);
      const reps = firstNum(cells[parsed.reps]);
      const volume = (Number.isFinite(sets) && Number.isFinite(reps)) ? sets * reps : null;
      const key = rowKey(cells, parsed);
      thisWeek.set(key, { volume });
      if (category !== CATEGORY.POWER) continue;

      const before = previous.get(key);
      if (!before || !Number.isFinite(volume) || !Number.isFinite(before.volume)) continue;
      if (volume <= before.volume) continue;
      const note = `${txt(cells[parsed.notes])} ${parsed.load == null ? '' : txt(cells[parsed.load])}`;
      if (OUTPUT_LANGUAGE.test(note)) continue;

      flags.push({
        code: 'COACH_SPEC_V1_YG_POWER_VOLUME_BEFORE_OUTPUT',
        rule: 'YG-06',
        week,
        exercise: name,
        previous_volume: before.volume,
        current_volume: volume,
        message: `${name} (Week ${week}) raises power volume from ${before.volume} to ${volume} total reps with nothing said about output. Power progresses through height, speed or intent first; a rep increase with no protected output is buying fatigue rather than power.`,
      });
    }
    for (const [k, v] of thisWeek) previous.set(k, v);
  }
  return flags;
}

// --- T3K-04: interval pace starts from demonstrated capacity -----------------

// What the athlete has actually run, as seconds per km. Read from stated repeat
// performances rather than the goal, which is the whole point of the rule.
export function demonstratedIntervalPace(intake = {}) {
  const src = `${txt(intake.notes)} ${txt(intake.current_numbers)} ${txt(intake.clarification_answers)} ${txt(intake.performance_markers)}`;
  // e.g. "400 m repeats are around 1:42-1:45"
  const m = src.match(/\b(\d{3,4})\s*m\b[^.]{0,60}?(\d{1,2}):(\d{2})(?:\s*[-–]\s*(\d{1,2}):(\d{2}))?/i);
  if (!m) {
    // No repeat performance stated, but the athlete's current race time is a
    // demonstrated capacity too. Asking them for repeats they may never have run
    // would be interrogating an intake that already answered the question.
    const race = raceProfile(intake);
    if (race && Number.isFinite(race.currentPace) && race.currentPace > race.goalPace) {
      return { metres: race.km * 1000, seconds: race.currentSec, pace: race.currentPace, source: 'race_time' };
    }
    return null;
  }
  const metres = Number(m[1]);
  if (!(metres > 0)) return null;
  const times = [Number(m[2]) * 60 + Number(m[3])];
  if (m[4] != null) times.push(Number(m[4]) * 60 + Number(m[5]));
  // The slower end of a stated range is the repeatable one.
  const seconds = Math.max(...times);
  return { metres, seconds, pace: seconds / (metres / 1000) };
}

export function collectIntervalPaceOriginFlags(program, intake = {}) {
  const race = raceProfile(intake);
  const demonstrated = demonstratedIntervalPace(intake);
  if (!race || !demonstrated) return [];

  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      if (classifyExercise(name).category !== CATEGORY.ENDURANCE) continue;
      const sets = firstNum(cells[parsed.sets]) || 0;
      if (sets < 2) continue;
      const metres = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
      if (metres == null) continue;
      const text = `${txt(cells[parsed.notes])} ${parsed.load == null ? '' : txt(cells[parsed.load])}`;
      const split = text.match(/\b(\d{1,2}):(\d{2})\b/);
      if (!split) continue;
      const pace = (Number(split[1]) * 60 + Number(split[2])) / (Number(metres) / 1000);

      // Faster than what the athlete has demonstrated, and at or beyond goal
      // pace, means the prescription started from the target rather than from
      // current capacity.
      if (pace < demonstrated.pace && pace <= race.goalPace) {
        flags.push({
          code: 'COACH_SPEC_V1_T3K_PACE_FROM_GOAL_NOT_CAPACITY',
          rule: 'T3K-04',
          week,
          exercise: name,
          prescribed_pace_s_per_km: Math.round(pace),
          demonstrated_pace_s_per_km: Math.round(demonstrated.pace),
          goal_pace_s_per_km: Math.round(race.goalPace),
          message: `${name} (Week ${week}) prescribes about ${Math.round(pace)} s/km, at or beyond the ${Math.round(race.goalPace)} s/km goal, while the athlete has demonstrated about ${Math.round(demonstrated.pace)} s/km in repeats. Interval pace starts from current demonstrated capacity and moves toward the goal, not from the goal itself.`,
        });
      }
    }
  }
  return flags;
}

export function collectSpecGapFlags(program, intake = {}) {
  return [...collectPowerOutputFlags(program, intake), ...collectIntervalPaceOriginFlags(program, intake)];
}

export function buildSpecGapBrief(intake = {}) {
  const lines = [];
  const goalText = `${txt(intake.primary_goals)} ${txt(intake.secondary_goals)}`;
  if (/muscle[- ]?up|handstand|jump|power|explosive|gymnastic/i.test(goalText)) {
    lines.push('POWER PROGRESSES THROUGH OUTPUT (YG-06): raise height, speed or intent before raising reps. If a power row gains volume, say on that row what is protecting output; more reps at the same quality is fatigue, not power.');
  }
  const race = raceProfile(intake);
  const demonstrated = demonstratedIntervalPace(intake);
  if (race && demonstrated) {
    lines.push(`INTERVAL PACE STARTS FROM CAPACITY (T3K-04): the athlete has demonstrated about ${Math.round(demonstrated.pace)} s/km in repeats against a ${Math.round(race.goalPace)} s/km goal. Build from the demonstrated pace toward the goal across the block. Do not prescribe goal pace in early weeks.`);
  }
  return lines.join('\n');
}
