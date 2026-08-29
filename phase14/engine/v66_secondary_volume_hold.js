// engine/v66_secondary_volume_hold.js
//
// Hold secondary volume when a primary quality progresses.
//
// V35_SECONDARY_VOLUME_CREEP has been a gate with no answer. Run #87 spent all
// four attempts with it in every trace: WEEKLY_MRV_EXCEEDED sat beside it and
// kept being trimmed, because that one has a repair, while the creep could
// never clear and dragged the build to exhaustion. Every other code in that
// run cleared attempt by attempt. These two did not, and only one of them
// could.
//
// The remedy is the rule's own sentence -- "secondary and accessory volume
// defaults to hold" -- so the repair is to hold it: the risen set count comes
// back to the previous week's. That changes no exercise, no load and no rep
// scheme, and it is the same lever the athlete would pull.

import { parseWeek } from './v34_workload_accounting.js';
import { validateCoachingStandards } from './v35_coaching_standards.js';

const CODE = 'V35_SECONDARY_VOLUME_CREEP';

function creepFlags(program, intake) {
  const res = validateCoachingStandards(program, intake);
  const list = Array.isArray(res) ? res : (res && res.flags) || [];
  return list.filter((f) => f && f.code === CODE);
}

export function collectSecondaryCreepFlags(program, intake = {}) {
  return creepFlags(program, intake);
}

export function repairSecondaryVolumeCreep(program, intake = {}) {
  let out = String(program || '');

  // Each hold can reveal another: the rule compares consecutive weeks, so
  // pulling week 2 down changes what week 3 is measured against. Iterate until
  // it settles rather than assuming one pass is enough, and bound it so a rule
  // that cannot be satisfied this way still terminates.
  for (let pass = 0; pass < 6; pass += 1) {
    const flags = creepFlags(out, intake);
    if (!flags.length) return out;

    let changed = false;
    for (const flag of flags) {
      const parsed = parseWeek(out, flag.week);
      if (!parsed) continue;
      const target = String(flag.exercise || '').trim().toLowerCase();
      if (!target) continue;

      // The rule sums every row for that exercise in the week: two Cable Row
      // entries of four sets are eight, not four. So the target is the week's
      // total, and the reduction is spread across the rows rather than applied
      // to one of them -- keeping the training frequency the coach chose and
      // taking the volume out of each session instead.
      const rows = parsed.rows.map((c) => c.slice());
      const idx = [];
      for (let i = 0; i < rows.length; i += 1) {
        const name = String(rows[i][parsed.exercise] || '').trim().toLowerCase();
        if (name === target) idx.push(i);
      }
      if (!idx.length) continue;

      const setsOf = (i) => Number(String(rows[i][parsed.sets] || '').match(/\d+/)?.[0]) || 0;
      let total = idx.reduce((n, i) => n + setsOf(i), 0);
      if (total <= flag.previous_sets) continue;

      // Take a set at a time off whichever row currently carries the most, so
      // the rows converge rather than one being gutted.
      let guard = 0;
      while (total > flag.previous_sets && guard < 200) {
        guard += 1;
        const biggest = idx.filter((i) => setsOf(i) > 1).sort((a, b) => setsOf(b) - setsOf(a))[0];
        if (biggest == null) break;
        rows[biggest][parsed.sets] = String(setsOf(biggest) - 1);
        total -= 1;
      }
      if (total > flag.previous_sets) continue; // cannot hold without deleting work

      let touched = false;
      for (const i of idx) {
        if (!Number.isInteger(parsed.notes)) { touched = true; continue; }
        const note = String(rows[i][parsed.notes] || '').trim();
        const reason = `Held at ${flag.previous_sets} set${flag.previous_sets === 1 ? '' : 's'} across the week: the primary quality session advances, so secondary volume stays where it was.`;
        if (!note.includes('secondary volume stays')) {
          rows[i][parsed.notes] = note ? `${note} ${reason}` : reason;
        }
        touched = true;
      }
      if (!touched) continue;

      const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
      out = out.replace(parsed.re, `$1${rebuilt}$3`);
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

export function buildSecondaryVolumeBrief(intake = {}) {
  if (!intake || typeof intake !== 'object') return '';
  return [
    '* ONE PROGRESSION AT A TIME: in a week where the primary quality session advances, secondary and accessory set counts hold at the previous week\'s value.',
    '  Progress the primary or progress the support, never both in the same week. If support volume must rise anyway, say in the row note what recovery makes that affordable.',
  ].join('\n');
}
