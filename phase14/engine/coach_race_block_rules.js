// engine/coach_race_block_rules.js
//
// Three findings the coach made on the first Hyrox block that the grader could
// not see. Each is written from his review of run #116 rather than invented.
//
// He made seven findings on that program and the encoded standard caught two.
// Of the five it missed, three were things the engine already knew and nothing
// read: the taper audit had already counted the power sets, the day labels were
// already parsed, and the note text was already in memory. These are the two
// that needed new rules plus the one that needed a number read back.

import { rows } from './coach_rules.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const setsOf = (r) => Number(r.sets) || 0;

// --- 1. a taper that introduces a new training emphasis ----------------------
//
// "Going from 2 to 17 power sets is not preservation. It is a new training
// emphasis." Week 3 of the Hyrox block cut total volume and simultaneously
// multiplied jumping by eight and a half, on an athlete whose stated injury is
// an achilles that flares. The taper audit had already computed 2 / 2 / 17 and
// printed it in the delivered program; no rule compared the numbers.
//
// The principle is the coach's own: a taper dissipates fatigue while preserving
// qualities the block already built. Anything that rises as volume falls is
// being introduced, not preserved.

const MEANINGFUL_WEEKLY_POWER_DOSE = 8;

const POWER = /explosive|plyo|box jump|broad jump|depth jump|bound|jump squat|hop|med(?:icine)? ball|throw|snap down/i;

export function taperPowerSpike(program, intake = {}) {
  const byWeek = new Map();
  for (const r of rows(program)) {
    if (isWarmup(r.name)) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, { total: 0, power: 0, names: new Set() });
    const w = byWeek.get(r.week);
    w.total += setsOf(r);
    if (POWER.test(r.name)) { w.power += setsOf(r); w.names.add(r.name); }
  }
  if (byWeek.size < 2) return [];

  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  const peak = Math.max(...weeks.map((w) => byWeek.get(w).total));
  // Weeks that are still building set the baseline this athlete has actually
  // been doing; weeks that are coming down are the ones held to it.
  const building = weeks.filter((w) => byWeek.get(w).total >= peak);
  const baseline = Math.max(...building.map((w) => byWeek.get(w).power), 0);

  const out = [];
  for (const week of weeks) {
    const w = byWeek.get(week);
    if (w.total >= peak) continue;
    // A couple of extra sets is noise; a multiple of a real dose is a decision.
    // The absolute floor matters as much as the ratio: against a baseline of
    // zero every ratio is infinite, and a fight camp that adds three ballistic
    // sets in its sharpening week is doing the right thing -- the engine's own
    // combat-power repair puts them there. Eight sets in a week is the point
    // where this stops being a sharpener and starts being a block of training.
    if (w.power < MEANINGFUL_WEEKLY_POWER_DOSE) continue;
    if (w.power < baseline * 1.5 + 2) continue;
    out.push({
      rule: 'TAPER_INTRODUCES_POWER_VOLUME',
      week,
      power: w.power,
      baseline,
      detail: `Week ${week} cuts total work to ${w.total} sets from a peak of ${peak}, and raises power work to ${w.power} sets against ${baseline} in the building weeks (${[...w.names].join(', ')}). A taper preserves qualities the block already built; something that rises while volume falls is a new emphasis, not a preserved one.`,
    });
  }
  return out;
}

// --- 2. coaching language borrowed from another athlete ----------------------
//
// "Horizontal power for level changes and takedown entries." in a Hyrox
// program. The coach read it as what it is: the explanation was inherited from
// a different athlete type rather than derived from this event. It is cheap to
// charge and cheap to detect, and it is the clearest possible signal that a
// justification was not written for the person reading it.

const VOCABULARY = [
  { sport: /mma|boxing|wrestl|grappl|judo|bjj|combat|fight/i, words: /\b(?:takedown|takedowns|level change|level changes|clinch|sparring|grappling|mat work|opponent|weigh-?in|fight week|round(?:s)? of (?:sparring|rolling)|shoot(?:ing)? entries)\b/i, label: 'combat sport' },
  { sport: /football|soccer|rugby|basketball|hockey/i, words: /\b(?:matchday|match day|md-?\d|fixture|selection|the gaffer|pitch session)\b/i, label: 'team sport' },
  { sport: /weightlifting|olympic lifting/i, words: /\b(?:snatch balance|jerk recovery|platform|the podium lift)\b/i, label: 'weightlifting' },
];

export function borrowedSportLanguage(program, intake = {}) {
  const sport = `${String(intake.sport || '')} ${String(intake.event_type || '')}`;
  const out = [];
  const seen = new Set();
  for (const r of rows(program)) {
    const text = String(r.notes || '');
    if (!text) continue;
    for (const v of VOCABULARY) {
      if (v.sport.test(sport)) continue; // the athlete actually does this sport
      const hit = v.words.exec(text);
      if (!hit || seen.has(`${v.label}|${hit[0].toLowerCase()}`)) continue;
      seen.add(`${v.label}|${hit[0].toLowerCase()}`);
      out.push({
        rule: 'BORROWED_SPORT_LANGUAGE',
        week: r.week,
        movement: r.name,
        detail: `"${hit[0]}" is ${v.label} language, and this athlete's sport is ${String(intake.sport || 'not that').trim()}. It appears in the note for ${r.name} in week ${r.week}, which means the justification was carried over from another athlete rather than written for this event.`,
      });
    }
  }
  return out;
}

// --- 3. a number that survives the movement changing -------------------------
//
// "Prefer the ski erg if it is open; the listed split is the point." -- beside
// a RowErg prescription of 1:51/500 m. Rowing and skiing do not produce the
// same split for the same athlete, so the note lets the movement change while
// the target that defines the effort stays fixed. The coach's objection is also
// the machine's: nothing can verify a prescription whose movement is optional
// and whose number is not.

const SUBSTITUTION = /\b(?:prefer|use|swap to|switch to|if .{0,30}(?:is )?(?:open|free|available|taken|busy))\b/i;
const MODALITY = /\b(ski ?erg|row ?erg|rower|bike ?erg|assault bike|treadmill|echo bike)\b/gi;
const MODALITY_NUMBER = /\d+:\d{2}\s*(?:\/|per )\s*(?:500\s*m|km|k)\b|\bsplit\b/i;

export function modalitySplitCarriedOver(program, intake = {}) {
  const out = [];
  const seen = new Set();
  for (const r of rows(program)) {
    const note = String(r.notes || '');
    const load = String(r.load || '');
    if (!SUBSTITUTION.test(note)) continue;
    if (!MODALITY_NUMBER.test(load) && !MODALITY_NUMBER.test(note)) continue;

    const named = [...new Set([...note.matchAll(MODALITY)].map((m) => m[1].toLowerCase().replace(/\s+/g, ' ')))];
    const prescribed = String(r.name || '').toLowerCase();
    const different = named.filter((m) => !prescribed.includes(m.split(' ')[0]));
    if (!different.length) continue;
    const key = `${r.name}|${different.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      rule: 'MODALITY_SUBSTITUTION_KEEPS_THE_NUMBER',
      week: r.week,
      movement: r.name,
      detail: `The note beside ${r.name} offers ${different.join(' or ')} instead while the prescription keeps "${load || note.slice(0, 40)}". Those machines do not produce the same split for the same athlete, so the effort changes while the number that defines it does not, and nothing can check which one was actually done.`,
    });
  }
  return out;
}

export const RACE_BLOCK_RULES = [taperPowerSpike, borrowedSportLanguage, modalitySplitCarriedOver];
