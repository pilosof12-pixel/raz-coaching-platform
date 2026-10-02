// A primary endurance goal is built out of tolerance, and tolerance is volume.
//
// Masters Return was scored 8.4 and sent back for the most substantive revision.
// The coach's charge was that Week 2 was "basically identical" to Week 1, and he
// was right in a way the progression gate could not see. The two weeks differ:
//
//   W1  25 min easy  +  4 x 250 m @ 2:16-2:18 /500m
//   W2  25 min easy  +  4 x 250 m @ 2:15-2:17 /500m
//
// One second per 500 m of target pace. The dose is untouched, and the existing
// progression gate passed the block because its signature includes the pace cell
// and because something did move by Week 3 -- exactly the generic "something
// changed" logic the coach asked us to stop relying on. Then Week 3 arrives
// carrying the whole increase at once (+12 min and +200 m), which is the jump
// distributing it over Week 2 would have avoided.
//
// For a 54-year-old returning from injury on two easy ergs a week, the goal is
// rowing tolerance. A one-second pace target is not tolerance. So this gate reads
// only the volume dimension -- how much work, never how fast it is asked for --
// and requires it to move between consecutive build weeks.
//
//   "I do want deliberate progression in rowing tolerance. W1: 2 rowing
//    exposures. W2: 2 exposures with modest duration increase. W3: 2-3
//    exposures if recovery is good. W4: consolidation."
//
// Week 4 is consolidation and is never read or written here.

import { parseProgramModel, directGoalExposures } from './program_model.js';
import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';
import { declaresMaintenance } from './goal_status_declaration.js';

export const PRIMARY_VOLUME_STALLED = 'V107_PRIMARY_VOLUME_STALLED';

// Families whose currency is volume. A primary strength goal progresses by load,
// which this gate has no business judging.
const VOLUME_FAMILIES = new Set(['rowing', 'running', 'cycling', 'swimming', 'ski_erg', 'rucking', 'ruck']);

const BUILD_WEEKS = [1, 2, 3];
const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

const KM = /(\d+(?:\.\d+)?)\s*km\b/i;
const METRES = /(\d+(?:\.\d+)?)\s*m\b/i;
const MINUTES = /(\d+(?:\.\d+)?)\s*min/i;

function setCount(raw) {
  const n = String(raw ?? '').match(/\d+/);
  return n ? Number(n[0]) : 1;
}

// The dose one rep of this row asks for, in whichever unit it is written.
function perRep(raw) {
  const s = String(raw ?? '');
  const km = s.match(KM);
  if (km) return { unit: 'm', value: Number(km[1]) * 1000, written: 'km' };
  const m = s.match(METRES);
  if (m) return { unit: 'm', value: Number(m[1]), written: 'm' };
  const min = s.match(MINUTES);
  if (min) return { unit: 'min', value: Number(min[1]), written: 'min' };
  return null;
}

function rowVolume(cells, parsed) {
  const dose = perRep(cells[parsed.reps]);
  if (!dose) return null;
  const sets = setCount(cells[parsed.sets]);
  return { ...dose, sets, total: sets * dose.value };
}

// The rows in one week that carry the primary goal directly. The model owns the
// question of what counts toward a goal; source_row is 1-based over body rows.
function goalRows(program, model, family, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const picked = [];
  for (const exposure of directGoalExposures(model, family, week)) {
    const ex = exposure.exercise || exposure;
    const i = Number(ex.source_row) - 1;
    const cells = parsed.rows[i];
    if (!cells || isWarmup(cells[parsed.exercise])) continue;
    const volume = rowVolume(cells, parsed);
    if (volume) picked.push({ i, cells, volume, name: String(cells[parsed.exercise] || '').trim() });
  }
  return { parsed, rows: picked };
}

function weekTotals(rows) {
  return rows.reduce((a, r) => ({
    m: a.m + (r.volume.unit === 'm' ? r.volume.total : 0),
    min: a.min + (r.volume.unit === 'min' ? r.volume.total : 0),
  }), { m: 0, min: 0 });
}

function primaryVolumeGoals(model) {
  return (model.goals || []).filter((g) => g.tier === 'primary' && VOLUME_FAMILIES.has(String(g.family)));
}

export function collectPrimaryVolumeProgressionFlags(program, intake = {}, suppliedModel = null) {
  const text = String(program || '');
  let model;
  try { model = suppliedModel || parseProgramModel(text, intake); } catch { return []; }
  const flags = [];

  for (const goal of primaryVolumeGoals(model)) {
    // A goal the block openly holds is a coaching decision, not a stall.
    if (declaresMaintenance(text, goal.family)) continue;
    const weeks = BUILD_WEEKS.map((w) => {
      const found = goalRows(text, model, goal.family, w);
      return found && found.rows.length ? { week: w, totals: weekTotals(found.rows) } : null;
    });
    for (let i = 1; i < weeks.length; i += 1) {
      const prev = weeks[i - 1];
      const here = weeks[i];
      if (!prev || !here) continue;
      if (here.totals.m === prev.totals.m && here.totals.min === prev.totals.min) {
        flags.push({
          code: PRIMARY_VOLUME_STALLED,
          family: goal.family,
          goal: goal.raw,
          weeks: [prev.week, here.week],
          volume: here.totals,
          detail: `Primary goal '${goal.raw}' asks for the same ${goal.family} volume in Week ${here.week} as in Week ${prev.week} `
            + `(${here.totals.min} min, ${here.totals.m} m). A change of target pace alone is not a progression in tolerance.`,
        });
      }
    }
  }
  return flags;
}

// A modest, legible step: about a tenth more, rounded to something a coach would
// actually write on a sheet.
function step(volume) {
  if (volume.unit === 'm') {
    const raw = volume.value * 0.1;
    return Math.max(25, Math.round(raw / 25) * 25);
  }
  const raw = volume.value * 0.1;
  return Math.max(1, Math.round(raw));
}

// A note that still describes the dose this repair just changed.
//
// The engine's own output contract requires it: "For any row that CHANGED from
// the prior week, the Notes cell states the change in plain language." This
// repair changed the row and left the sentence alone, so the Masters block came
// out of it reading "Same total work, slightly faster split only" above 4 x 275
// m where Week 1 had 4 x 250 m -- 1000 m against 1100 m. That is the coach's
// TEXT_CONTRADICTS_TABLE, introduced by the thing meant to fix the week.
//
// The coaching in these notes is worth keeping: stroke rate, the stop rule, what
// to do if posture drifts. So only the sentence that makes the false claim is
// replaced, and when no sentence makes one the change is simply stated.
const SAME_DOSE_CLAIM = [
  /\b(?:the\s+)?same\s+(?:total\s+)?(?:work|volume|distance|duration|dose|length)\b/i,
  /\b(?:split|pace|speed)\s+only\b/i,
  /\bonly\s+the\s+(?:split|pace|speed)\b/i,
  /\bno\s+(?:extra|more|additional)\s+(?:work|volume|distance)\b/i,
];

function reconcileNote(note, volume, fromValue, nextValue) {
  const unit = volume.written === 'km' ? 'km' : volume.written;
  const asText = (v) => (volume.written === 'km' ? `${+(v / 1000).toFixed(2)} km` : `${v} ${unit}`);
  const stated = volume.sets > 1
    ? `Each interval steps from ${asText(fromValue)} to ${asText(nextValue)} this week; the number of intervals is unchanged.`
    : `Steps from ${asText(fromValue)} to ${asText(nextValue)} this week.`;

  const text = String(note || '').trim();
  if (!text) return stated;
  // Sentence-wise, so the rest of the coaching survives.
  const parts = text.split(/(?<=[.!?])\s+/);
  const hit = parts.findIndex((part) => SAME_DOSE_CLAIM.some((re) => re.test(part)));
  if (hit >= 0) {
    parts[hit] = stated;
    return parts.join(' ');
  }
  return `${stated} ${text}`;
}

function writeDose(cells, parsed, volume, nextValue) {
  const out = cells.slice();
  const written = volume.written === 'km' ? `${+(nextValue / 1000).toFixed(2)} km` : `${nextValue} ${volume.written}`;
  out[parsed.reps] = String(cells[parsed.reps]).replace(
    volume.written === 'km' ? KM : volume.written === 'm' ? METRES : MINUTES,
    written,
  );
  if (parsed.notes != null) {
    out[parsed.notes] = reconcileNote(cells[parsed.notes], volume, volume.value, nextValue);
  }
  return out;
}

// The value the same movement is asked for in the following build week. The
// repair stays under it, so fixing Week 2 never overtakes Week 3.
function ceilingFor(program, model, family, week, name) {
  if (week + 1 > 3) return null;
  const found = goalRows(program, model, family, week + 1);
  if (!found) return null;
  const match = found.rows.find((r) => r.name.toLowerCase() === String(name).toLowerCase());
  return match ? match.volume : null;
}

export function normalizePrimaryVolumeProgression(program, intake = {}) {
  const original = String(program || '');
  let out = original;
  const repairs = [];

  let model;
  try { model = parseProgramModel(out, intake); } catch { return { program: original, repaired: false, repairs: [] }; }

  for (const goal of primaryVolumeGoals(model)) {
    if (declaresMaintenance(out, goal.family)) continue;

    for (let week = 2; week <= 3; week += 1) {
      const prev = goalRows(out, model, goal.family, week - 1);
      const here = goalRows(out, model, goal.family, week);
      if (!prev || !here || !prev.rows.length || !here.rows.length) continue;
      const before = weekTotals(prev.rows);
      const now = weekTotals(here.rows);
      if (now.m !== before.m || now.min !== before.min) continue;

      // Progress the sharpest piece first: the interval work is what carries a
      // 2 km erg goal toward the event, and it is where the coach wanted the
      // increase to start rather than land all at once in Week 3.
      const intervals = here.rows.filter((r) => r.volume.sets >= 2);
      const continuous = here.rows.filter((r) => r.volume.sets === 1);
      const order = [...intervals, ...continuous];

      let applied = null;
      for (const row of order) {
        const ceiling = ceilingFor(out, model, goal.family, week, row.name);
        const proposed = row.volume.value + step(row.volume);
        const capped = ceiling && ceiling.unit === row.volume.unit && ceiling.value > row.volume.value
          ? Math.min(proposed, ceiling.value - (row.volume.unit === 'm' ? 25 : 1))
          : proposed;
        if (capped <= row.volume.value) continue;
        applied = { row, value: capped, kind: 'dose' };
        break;
      }

      // Nothing had room to lengthen, so take one more rep of the interval
      // instead. Volume still moves and the piece itself stays where it is.
      if (!applied && intervals.length) {
        applied = { row: intervals[0], value: intervals[0].volume.sets + 1, kind: 'sets' };
      }
      if (!applied) continue;

      const parsed = here.parsed;
      const rows = parsed.rows.map((cells, i) => {
        if (i !== applied.row.i) return cells;
        if (applied.kind === 'sets') {
          const copy = cells.slice();
          copy[parsed.sets] = String(applied.value);
          return copy;
        }
        return writeDose(cells, parsed, applied.row.volume, applied.value);
      });
      out = rebuild(out, parsed, rows);
      repairs.push({
        week,
        exercise: applied.row.name,
        from: applied.kind === 'sets' ? `${applied.row.volume.sets} sets` : `${applied.row.volume.value} ${applied.row.volume.written}`,
        to: applied.kind === 'sets' ? `${applied.value} sets` : `${applied.value} ${applied.row.volume.written}`,
        why: `Week ${week} repeated Week ${week - 1} volume for the primary ${goal.family} goal`,
      });
      try { model = parseProgramModel(out, intake); } catch { /* keep the previous model */ }
    }
  }

  if (out === original) return { program: original, repaired: false, repairs: [] };
  return { program: out, repaired: true, repairs };
}

export function buildPrimaryVolumeProgressionBrief(intake = {}) {
  const goals = [intake.primary_goals].flat().filter(Boolean).map(String).join(' | ');
  if (!/row|erg|run|ride|cycl|swim|ruck|ski/i.test(`${goals} ${intake.sport || ''}`)) return '';
  return [
    '* PRIMARY ENDURANCE VOLUME MUST PROGRESS WEEK TO WEEK.',
    '  Where the primary goal is an endurance or sport-modality performance, the weekly dose of that modality -- duration, distance, or number of exposures -- must increase from Week 1 to Week 2 and again from Week 2 to Week 3. Week 4 consolidates.',
    '  Changing only the target pace or split is not a progression in tolerance. Two weeks of the same 4 x 250 m, written once at 2:16 and once at 2:15, ask the athlete for exactly the same work.',
    '  Spread the increase across the build weeks. Holding Weeks 1-2 level and delivering the whole rise in Week 3 gives the athlete a jump where they needed a ramp.',
  ].join('\n');
}
