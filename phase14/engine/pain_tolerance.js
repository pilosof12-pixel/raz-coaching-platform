// engine/pain_tolerance.js
//
// The safety rule that was computed and then ignored.
//
// painToleranceGate() answers three ways for a client whose intake reports
// sciatica or lower-back symptoms: allowed, "tolerance_gate", or a flat refusal
// carrying the code PAIN_TOLERANCE_CONFLICT and a list of safer movements. Its
// only caller reads the middle answer and drops the other two on the floor. So
// a loaded deep squat prescribed to someone with sciatica was computed to be
// wrong, named as wrong, given three alternatives -- and shipped.
//
// The tolerance_gate branch is read, but only to raise
// PAIN_TOLERANCE_NOT_ACKNOWLEDGED, which had no repair. A flag with no repair
// is answered by asking the model four times and then failing the build, and
// this one fires on precisely the clients least able to absorb a bad program.
//
// Both have a mechanical answer. A refused movement is replaced with one of the
// alternatives the rule itself names. A tolerance-gated movement keeps its place
// and gains the condition it was missing. Neither is a judgement call, and
// neither needs the model.

import { parseWeek } from './v34_workload_accounting.js';
import { painToleranceGate } from './phase15_quality_rules.js';
import { matchDictionary } from './exercise_dictionary.js';

const LUMBAR = /(sciatica|lumbar|lower back|low back)/i;
const ACKNOWLEDGED = /(toler|pain.?free|symptom|if comfortable|stop if|proven)/i;

// Matches the validator's acceptance regex, and says something a client can act
// on rather than a disclaimer.
const TOLERANCE_SENTENCE = 'Keep this pain-free: work only through the range you tolerate today, and stop the set if symptoms appear rather than finishing the reps.';

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function painText(intake = {}) {
  return JSON.stringify(intake.pain || intake.limitations || '');
}

export function governsPainTolerance(intake = {}) {
  return LUMBAR.test(painText(intake));
}

// The first named alternative the dictionary accepts and the day does not
// already train. Substituting in a movement the session already contains would
// trade a safety problem for a duplication one.
function substitution(alternatives, alreadyOnDay) {
  for (const name of alternatives || []) {
    if (alreadyOnDay.has(String(name).toLowerCase())) continue;
    const hit = matchDictionary(name);
    if (hit && hit.status === 'hit') return name;
  }
  return null;
}

export function repairPainTolerance(program, intake = {}) {
  if (!governsPainTolerance(intake)) return String(program || '');
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const rows = parsed.rows.map((c) => c.slice());
    const notes = Number.isInteger(parsed.notes) ? parsed.notes : -1;
    let changed = false;

    // What each day already trains, so a substitution does not land on top of
    // something the session has. Days inherit down continuation rows.
    const dayOf = [];
    const byDay = new Map();
    let lastDay = '';
    parsed.rows.forEach((cells, i) => {
      const raw = String(cells[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      dayOf[i] = lastDay;
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      if (!byDay.has(lastDay)) byDay.set(lastDay, new Set());
      byDay.get(lastDay).add(name.toLowerCase());
    });

    parsed.rows.forEach((cells, i) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      const gate = painToleranceGate(name, intake);

      if (gate.allowed === false) {
        const onDay = byDay.get(dayOf[i]) || new Set();
        const swap = substitution(gate.alternatives, onDay);
        // With nothing safe to put in its place the row is dropped rather than
        // kept: the rule says this movement must not be prescribed to this
        // client, and leaving it there is the one outcome that is not allowed.
        if (!swap) { rows[i][parsed.exercise] = ''; changed = true; return; }
        onDay.delete(name.toLowerCase());
        onDay.add(swap.toLowerCase());
        rows[i][parsed.exercise] = swap;
        if (Number.isInteger(parsed.load)) rows[i][parsed.load] = 'RPE-selected load';
        if (notes >= 0) {
          // The note described the movement that just left. Appending to it
          // leaves the client reading "hold the bottom position" against a box
          // squat, so it is replaced rather than added to.
          rows[i][notes] = `Replaces ${name}: your intake reports lower-back symptoms, and that pattern under load is the one most likely to provoke them. This trains the same quality without the spinal cost. Work in a range that stays pain-free and stop the set if symptoms appear.`;
        }
        changed = true;
        return;
      }

      if (gate.allowed === 'tolerance_gate' && notes >= 0) {
        const prior = String(rows[i][notes] || '').trim();
        if (ACKNOWLEDGED.test(prior)) return;
        rows[i][notes] = prior ? `${prior} ${TOLERANCE_SENTENCE}` : TOLERANCE_SENTENCE;
        changed = true;
      }
    });

    if (!changed) continue;
    const kept = rows.filter((c) => String(c[parsed.exercise] || '').trim());
    const rebuilt = [parsed.header.join('\t'), ...kept.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

// Named so a program that still carries a refused movement can be reported,
// rather than the engine quietly believing the repair always worked.
export function collectPainToleranceFlags(program, intake = {}) {
  if (!governsPainTolerance(intake)) return [];
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    parsed.rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      if (painToleranceGate(name, intake).allowed === false) {
        flags.push({
          code: 'PAIN_TOLERANCE_CONFLICT',
          week,
          exercise: name,
          detail: `Week ${week} prescribes ${name} to a client whose intake reports lower-back symptoms. That movement under load is the pattern most likely to provoke them, and safer alternatives train the same quality.`,
        });
      }
    });
  }
  return flags;
}
