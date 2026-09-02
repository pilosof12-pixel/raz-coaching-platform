// Deterministic repair for unambiguous contradictions.
//
// v34/v35 added gates without matching repairs, so every contradiction became a
// regeneration request. The model then had to guess which of two disagreeing
// statements was authoritative, and the loop burned four attempts without
// converging. It never needed to guess: the STRUCTURED PRESCRIPTION is
// authoritative and the note is derived text, so a note that disagrees with its
// own row has exactly one correct resolution -- restate the note.
//
// Everything here is a mechanical rewrite of derived text, or a documented
// hold-the-accessory rule. No coaching decision is invented, no primary
// prescription is altered, and each repair is idempotent. Genuinely structural
// problems are deliberately left for the gates to reject.

import { rampText } from './specific_warmup_enrichment.js';
import { PROGRESSION_CLAIMS, reductionMetric, reductionMissing, increaseMissing } from './v34_prescription_consistency.js';
import { collectSkillCeilingFlags, collectMaintenanceDriftFlags } from './v43_coaching_governance.js';
import { longRunBuildClaim } from './v35_coaching_standards.js';
import { repairCountClaims } from './v46_language_accuracy.js';
import { repairSessionHierarchy, repairKeySessionCrowding } from './v52_session_hierarchy.js';
import { repairPrePrimaryLoad } from './v56_primary_day_protection.js';
import { repairEnduranceVolume } from './v57_endurance_volume_governor.js';
import { repairSemanticProse } from './v58_semantic_cleanup.js';
import { repairBlockSpecificityClaim } from './v59_block_specificity_repair.js';
import { repairFrequencyClaim } from './v61_weekly_exposures.js';
import { repairSecondaryVolumeCreep } from './v66_secondary_volume_hold.js';
import { repairWeek4Consolidation } from './v67_week4_consolidation.js';
import { repairCompetitionBlock } from './v70_competition_rules.js';
import { repairIntensification } from './v71_intensification.js';
import { repairCombatPower } from './v72_combat_power.js';
import { repairCampEconomy } from './v74_camp_economy.js';
import { repairWeightCutLoad } from './v75_weight_cut.js';
import { repairFightWeekClock } from './v77_fight_week_clock.js';
import { repairWarmupRampTarget } from './v34_prescription_consistency.js';
import { repairClusterNotation } from './v81_cluster_notation.js';
import { repairCampSharpening } from './v82_camp_sharpening.js';
import { repairBallisticShare } from './v79_ballistic_share.js';
import { appendCompetitionBlocks } from './v73_taper_audit.js';
import { appendCampSchedule } from './v78_sport_taper.js';
import { classifyExercise, dayGap, stressSignature, dayKey as dayKeyOf } from './v38_movement_taxonomy.js';
import { auditCircularScheduling } from './v38_structural_audit.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function kgOf(raw) {
  const m = String(raw || '').match(/\+?\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function kmOf(raw) {
  const m = String(raw || '').match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
}

function parseWeek(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![idx.day, idx.exercise, idx.sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((l) => l.split('\t'));
  if (rows.some((c) => c.length !== header.length)) return null;
  return { re, match, header, rows, day: idx.day, exercise: idx.exercise, load: col('weight', 'load / target'), sets: idx.sets, reps, notes: col('notes', 'coaching note') };
}
function rebuild(program, parsed) {
  const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
  return program.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
}
function repCount(raw) {
  const s = String(raw || '').trim();
  if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km)\b/i.test(s)) return null;
  return firstNum(s);
}
function rowKey(cells, parsed) {
  return `${String(cells[parsed.day] || '').trim().toLowerCase()}|${String(cells[parsed.exercise] || '').trim().toLowerCase()}`;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const REP_WORD_FOR = { 1: 'singles', 2: 'doubles', 3: 'triples' };
const CONDITIONAL = /\b(?:if|only if|when|provided|optional|earned|may|can)\b/i;

// A false claim is restated in terms of the metric the claim itself names, using
// the detector's own claim table. Driving both layers from one table is what
// guarantees convergence: a phrasing the detector can flag is a phrasing this
// function can rewrite, so the repair loop cannot be handed a contradiction it
// has no move against.
const HOLD_PHRASE = {
  sets: 'hold the set count',
  distance: 'hold the distance',
  'total reps': 'hold the total reps',
  volume: 'hold the total work',
};
// An instruction to add work that the prescription does not carry is the same
// error as a claimed reduction that never happened, and is restated the same
// way. A coach found "add only 1 km" against a distance that stayed at 18 km
// for three weeks running.

// Restatement rewrites the claim itself plus any text left stranded by it, and
// nothing else. Replacing the whole clause was too blunt -- it discarded genuine
// conditions ("repeat this load only if Week 3 stayed inside the cap") -- while
// replacing only the verb phrase left qualifiers dangling ("hold the set count
// than Week 3"). So the span grows left over a bare connector and right over a
// tail that carries no instruction, and stops there.
const CLAUSE_END = /[.;!?]/;
const CONNECTOR_LEAD = /(?:^|[.;!?]\s*|,\s*)(?:(?:otherwise|instead|so|then|and|but)\s+)?(?:slightly|marginally|somewhat|modestly|a little|a bit)?\s*$/i;
// A tail that still tells the athlete to do something is kept verbatim.
const TAIL_INSTRUCTION = /\b(?:if|when|unless|provided|only|once|while|so that|because|but|keep|stay|stop|hold|add|use|aim|focus|make|leave|start|drop|rest|expect)\b/i;

function strandedSpan(text, from, to) {
  let start = from;
  const lead = text.slice(0, from).match(CONNECTOR_LEAD);
  if (lead) start = from - lead[0].replace(/^[.;!?,]\s*/, '').length;

  let end = text.length;
  for (let i = to; i < text.length; i++) {
    if (CLAUSE_END.test(text[i])) { end = i; break; }
  }
  const tail = text.slice(to, end);
  return { start, end: TAIL_INSTRUCTION.test(tail) ? to : end };
}

function replaceSentence(text, from, to, phrase) {
  const sentences = [...String(text).matchAll(/[^.!?]*[.!?]?/g)].filter((m) => m[0].length);
  const owner = sentences.find((m) => from >= m.index && from < m.index + m[0].length);
  if (!owner) return replaceClaim(text, from, to, phrase);
  const lead = owner[0].match(/^\s*/)[0];
  const trailing = /[.!?]$/.test(owner[0]) ? owner[0].slice(-1) : '';
  const body = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return text.slice(0, owner.index) + lead + body + trailing + text.slice(owner.index + owner[0].length);
}

function replaceClaim(text, from, to, phrase) {
  const span = strandedSpan(text, from, to);
  const before = text.slice(0, span.start).replace(/\s+$/, '');
  const startsSentence = !before || /[.!?]$/.test(before);
  const body = startsSentence
    ? phrase.charAt(0).toUpperCase() + phrase.slice(1)
    : phrase.charAt(0).toLowerCase() + phrase.slice(1);
  return text.slice(0, span.start) + body + text.slice(span.end);
}

// Rewrite every false claim the detector would raise on this text. Both layers
// read PROGRESSION_CLAIMS, so a phrasing the detector can flag is by
// construction a phrasing this function can restate -- which is what makes the
// repair loop converge instead of exhausting its attempts.
function restateFalseClaims(text, current, prior) {
  let out = String(text || '');
  for (const claim of PROGRESSION_CLAIMS) {
    // Each rewrite shifts later offsets, so rescan from the top after a change.
    for (let guard = 0; guard < 8; guard++) {
      const m = out.match(new RegExp(claim.re.source, 'i'));
      if (!m) break;
      let phrase = null;
      if (claim.metric === 'load') {
        const { load } = current;
        if (Number.isFinite(load) && Number.isFinite(prior.load) && load !== prior.load) {
          phrase = `${load > prior.load ? 'Take' : 'Drop to'} ${load} kg`;
        }
      } else if (claim.direction === 'down') {
        const metric = reductionMetric(m[1] || m[0]);
        if (reductionMissing(metric, current, prior)) phrase = HOLD_PHRASE[metric];
      } else if (claim.direction === 'up') {
        const metric = claim.metric || reductionMetric(m[1] || m[0]);
        if (increaseMissing(metric, current, prior)) phrase = HOLD_PHRASE[metric];
      }
      if (!phrase) break;
      // An instruction to add work usually carries its own condition -- "only
      // extend to 20 km if Week 2 recovered cleanly" -- and the condition
      // belongs to the increase. Splicing over just the claim left "only hold
      // the distance if Week 2 recovered cleanly", which asks nothing coherent,
      // so the whole sentence goes and its neighbours stay.
      const next = claim.direction === 'up'
        ? replaceSentence(out, m.index, m.index + m[0].length, phrase)
        : replaceClaim(out, m.index, m.index + m[0].length, phrase);
      if (next === out) break;
      out = next;
    }
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;!?])/g, '$1').trim();
}

// --- 1. note claims restated from the row's own fields -----------------------

function repairRowNote(note, { sets, reps, km, load, volume, priorSets, priorReps, priorKm, priorVolume, priorLoad }) {
  let out = String(note || '');
  if (!out.trim()) return { note: out, changed: false };
  const before = out;

  // "N attempts per set" / spelled-out equivalents.
  if (Number.isFinite(reps)) {
    out = out.replace(/\b(\d+)(\s*(?:quality\s+|clean\s+|good\s+)?(?:attempts?|reps?|tries)\s+per\s+set\b)/gi,
      (w, n, tail) => (Number(n) === reps ? w : `${reps}${tail}`));
    out = out.replace(/\b([a-z]+)(\s+(?:quality\s+|clean\s+|good\s+)?(?:attempts?|reps?|entries)\s+per\s+set\b)/gi,
      (w, word, tail) => {
        const n = NUMBER_WORDS[String(word).toLowerCase()];
        return (!Number.isFinite(n) || n === reps) ? w : `${reps}${tail}`;
      });
    // Rep words describing this row's own dose. Above three reps there is no
    // natural word, so name the number instead of leaving the contradiction.
    const wanted = REP_WORD_FOR[reps] || `sets of ${reps}`;
    out = out.replace(/\b(singles?|doubles?|triples?)\b/gi, (w) => {
      const n = { single: 1, singles: 1, double: 2, doubles: 2, triple: 3, triples: 3 }[String(w).toLowerCase()];
      return (!Number.isFinite(n) || n === reps) ? w : wanted;
    });
  }

  // "N total attempts" must equal sets x reps.
  if (Number.isFinite(sets) && Number.isFinite(reps)) {
    const total = sets * reps;
    out = out.replace(/\b(\d+)(\s+total\s+(?:attempts?|reps?|entries)\b)/gi,
      (w, n, tail) => (Number(n) === total ? w : `${total}${tail}`));
    out = out.replace(/\b((?:up to|no more than|at most)\s+)(\d+)(\s+total\s+(?:attempts?|reps?|entries)\b)/gi,
      (w, verb, n, tail) => (Number(n) <= total ? w : `${verb}${total}${tail}`));
  }

  // Set-count claims.
  if (Number.isFinite(sets)) {
    out = out.replace(/\b(stay at|keep|hold|maintain|remain at)\s+(\d+)(\s+(?:clean|quality|good|solid)?\s*sets?\b)/gi,
      (w, verb, n, tail) => (Number(n) === sets ? w : `${verb} ${sets}${tail}`));
  }

  // A claimed reduction that did not happen becomes a hold statement, and a
  // "repeat this load" claim against a load that moved names the new load.
  out = restateFalseClaims(out, { sets, reps, km, load, volume }, { sets: priorSets, reps: priorReps, km: priorKm, volume: priorVolume, load: priorLoad });

  // An unconditional instruction to add work becomes explicitly optional.
  if (/\badd (?:one|an?|another|1)\s+(?:more\s+)?(?:set|rep|single)\b/i.test(out) && !CONDITIONAL.test(out)) {
    out = out.replace(/\badd (?:one|an?|another|1)\s+(?:more\s+)?(set|rep|single)\b/i,
      'you may add one optional $1 only if every prescribed set was clean at or below the target RPE');
  }

  out = out.replace(/\s{2,}/g, ' ').trim();
  return { note: out, changed: out !== before };
}

// --- 2. warm-up ramps regenerated from the work load -------------------------

function repairWarmupRamps(parsed) {
  if (!Number.isInteger(parsed.load) || !Number.isInteger(parsed.notes)) return false;
  const workLoad = new Map();
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) continue;
    const kg = kgOf(cells[parsed.load]);
    if (Number.isFinite(kg)) {
      const k = rowKey(cells, parsed);
      workLoad.set(k, Math.max(workLoad.get(k) ?? -Infinity, kg));
    }
  }
  let changed = false;
  const seen = new Set();
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!isWarmup(name)) continue;
    const day = String(cells[parsed.day] || '').trim().toLowerCase();
    const before = String(cells[parsed.notes] || '');
    let after = before;
    after = after.replace(/Ramp\s+([A-Za-z][A-Za-z\- ]*?):\s*[^;]*?work sets\./gi, (whole, movement) => {
      const key = `${day}|${movement.trim().toLowerCase()}`;
      const work = workLoad.get(key);
      if (!Number.isFinite(work)) return whole;
      // One specific ramp per movement per day; drop any duplicate.
      if (seen.has(key)) { changed = true; return ''; }
      seen.add(key);
      const fresh = rampText(movement.trim(), `${work} kg`);
      return fresh || whole;
    });
    after = after.replace(/;\s*;/g, ';').replace(/\s{2,}/g, ' ').trim();
    if (after !== before) { cells[parsed.notes] = after; changed = true; }
  }
  return changed;
}

// --- 3. narrative claims restated ---------------------------------------------

function repairNarrative(program, intake) {
  const head = String(program).split(/START_WEEK1_TSV/i)[0];
  if (!head.trim()) return { program, changed: false };
  let out = head;

  // Long-run "builds" claim against the structured distances.
  const km = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let best = null;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !/\brun(?:ning)?\b/i.test(name)) continue;
      const v = (String(cells[parsed.reps] || '').match(/(\d+(?:\.\d+)?)\s*km\b/i) || [])[1];
      if (v != null) best = Math.max(best ?? 0, Number(v));
    }
    if (best != null) km.push(best);
  }
  if (km.length > 1 && !km.some((v, i) => i > 0 && v > km[i - 1])) {
    // Restate whatever the detector would flag, using its own claim table. A
    // private phrase list here covered one wording out of six, so every other
    // way of saying the same false thing was flagged and never rewritten.
    //
    // The whole sentence is replaced, not the matched span. Splicing a
    // correction into the middle left the claim's adverbs and time references
    // stranded ("held at the tolerated dose gradually across the block"), and
    // where two patterns overlapped it produced nonsense.
    for (let guard = 0; guard < 4; guard++) {
      const claim = longRunBuildClaim(out);
      if (!claim) break;
      const at = claim.match.index;
      const sentences = [...out.matchAll(/[^.!?]*[.!?]?/g)].filter((m) => m[0].length);
      const owner = sentences.find((m) => at >= m.index && at < m.index + m[0].length);
      if (!owner) break;
      const trailing = /[.!?]$/.test(owner[0]) ? owner[0].slice(-1) : '';
      const lead = owner[0].match(/^\s*/)[0];
      const replacement = `${lead}The long run is held at the tolerated dose${trailing}`;
      const next = out.slice(0, owner.index) + replacement + out.slice(owner.index + owner[0].length);
      if (next === out) break;
      out = next;
    }
  }

  // Only one symptom-response hierarchy may stand. Keep the source-linked one.
  const sourceLinked = /reduce the stressor that (?:actually )?provoked|most recently increased|hold the newest/i.test(out);
  if (sourceLinked) {
    out = out.replace(/(?:^|(?<=[.!?]\s))[^.!?]*?(?:cut|reduce|trim)\s+easy[- ]?run(?:ning)?\s*(?:duration|volume)?\s*first[^.!?]*[.!?]\s*/gi, '');
  }

  out = out.replace(/[ \t]{2,}/g, ' ');
  if (out === head) return { program, changed: false };
  return { program: out + String(program).slice(head.length), changed: true };
}

// --- 4. accessory volume held when a primary quality advances ------------------

function primaryPattern(intake) {
  const p = goals(intake, 'primary').toLowerCase();
  if (/\b\d+\s*k(?:m)?\b|marathon|run|3\s*k/.test(p)) return /\brun(?:ning)?\b/i;
  if (/squat/.test(p)) return /squat/i;
  if (/pull[- ]?up|muscle[- ]?up/.test(p)) return /pull[- ]?up|muscle[- ]?up/i;
  return null;
}

function repairAccessoryCreep(program, intake, repairs) {
  const pattern = primaryPattern(intake);
  if (!pattern) return program;
  const qualityMetres = (week) => {
    const parsed = parseWeek(program, week);
    if (!parsed) return null;
    let m = 0, longest = 0;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !pattern.test(name)) continue;
      const sets = firstNum(cells[parsed.sets]) || 0;
      const d = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
      if (d != null && sets >= 2) { m += Number(d) * sets; longest = Math.max(longest, Number(d)); }
    }
    return { metres: m, longest };
  };

  let candidate = program;
  for (let week = 2; week <= 4; week++) {
    const now = parseWeek(candidate, week);
    const prev = parseWeek(candidate, week - 1);
    if (!now || !prev) continue;
    const q = qualityMetres(week), qp = qualityMetres(week - 1);
    if (!q || !qp) continue;
    if (!(q.metres > qp.metres || q.longest > qp.longest)) continue;

    const priorSets = new Map();
    for (const cells of prev.rows) {
      const name = String(cells[prev.exercise] || '').trim();
      if (!name || isWarmup(name) || pattern.test(name)) continue;
      priorSets.set(rowKey(cells, prev), firstNum(cells[prev.sets]));
    }
    let changed = false;
    for (const cells of now.rows) {
      const name = String(cells[now.exercise] || '').trim();
      if (!name || isWarmup(name) || pattern.test(name)) continue;
      const key = rowKey(cells, now);
      const before = priorSets.get(key);
      const current = firstNum(cells[now.sets]);
      if (Number.isFinite(before) && Number.isFinite(current) && current > before) {
        cells[now.sets] = String(before);
        repairs.push({ type: 'v35_accessory_volume_held', week, exercise: name, from: current, to: before });
        changed = true;
      }
    }
    if (changed) candidate = rebuild(candidate, now);
  }
  return candidate;
}

// --- 5. governance repairs ----------------------------------------------------

// A skill row with no stop condition and a maintenance lift drifting upward are
// both hard violations, and a hard rule with no repair is how a generation loop
// burns all four attempts on one code. Neither repair invents coaching: one
// appends the stop condition the rest of the program already states, the other
// restores the dose the athlete's own maintenance goal asks for.

const SKILL_STOP_SENTENCE = 'Prescribed attempts are a ceiling, not a quota: stop the set early if quality, symmetry or balance breaks down.';

function repairSkillCeilings(program, intake, repairs) {
  let candidate = program;
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    let changed = false;
    for (const flag of collectSkillCeilingFlags(candidate, intake)) {
      if (flag.week !== week) continue;
      for (const cells of parsed.rows) {
        if (String(cells[parsed.exercise] || '').trim() !== flag.exercise) continue;
        if (String(cells[parsed.day] || '').trim() !== flag.day) continue;
        const note = String(cells[parsed.notes] || '').trim();
        if (note.includes(SKILL_STOP_SENTENCE)) continue;
        cells[parsed.notes] = note ? `${note.replace(/\s*$/, '')}${/[.!?]$/.test(note) ? '' : '.'} ${SKILL_STOP_SENTENCE}` : SKILL_STOP_SENTENCE;
        repairs.push({ type: 'v43_skill_ceiling_stated', week, exercise: flag.exercise });
        changed = true;
      }
    }
    if (changed) candidate = rebuild(candidate, parsed);
  }
  return candidate;
}

function repairMaintenanceDrift(program, intake, repairs) {
  let candidate = program;
  for (let week = 2; week <= 4; week++) {
    const flags = collectMaintenanceDriftFlags(candidate, intake).filter((f) => f.week === week);
    if (!flags.length) continue;
    const now = parseWeek(candidate, week);
    const prev = parseWeek(candidate, week - 1);
    if (!now || !prev) continue;
    const priorByKey = new Map();
    for (const cells of prev.rows) {
      priorByKey.set(rowKey(cells, prev), {
        sets: cells[prev.sets],
        load: prev.load == null ? null : cells[prev.load],
      });
    }
    let changed = false;
    for (const cells of now.rows) {
      const name = String(cells[now.exercise] || '').trim();
      if (!flags.some((f) => f.exercise === name)) continue;
      const prior = priorByKey.get(rowKey(cells, now));
      if (!prior) continue;
      // Hold the maintenance dose at the week that already worked.
      if (Number.isInteger(now.load) && prior.load != null) cells[now.load] = prior.load;
      cells[now.sets] = prior.sets;
      repairs.push({ type: 'v43_maintenance_dose_held', week, exercise: name });
      changed = true;
    }
    if (changed) candidate = rebuild(candidate, now);
  }
  return candidate;
}

// --- 6. missing heavy-strength ramps ------------------------------------------

// A heavy loaded lift needs a progressive ramp before its work sets, and the
// gate that enforces this had no repair: Advanced Hybrid spent all four attempts
// of live run #67 on HEAVY_STRENGTH_RAMP_MISSING, failing from the first
// attempt. A ramp is not a coaching decision -- it is derived arithmetically
// from the work load by rampText, the same function the enrichment layer already
// uses -- so there was never a reason to ask the model for it again.

// Load anchors the gate counts. Mirrored here so the repair adds exactly what
// the check looks for rather than guessing at it.
function rampAnchorCount(text) {
  const kg = String(text || '').match(/(?:\b\d+(?:\.\d+)?\s*kg\b[^|;]{0,18}(?:x|×)\s*\d+)|(?:\b\d+(?:\.\d+)?\s*kg\b)/gi) || [];
  const pct = String(text || '').match(/\b\d+(?:\.\d+)?\s*%\b/g) || [];
  const bar = /(?:empty\s+bar|barbell\s*(?:x|×)\s*\d+|bar\s*(?:x|×)\s*\d+)/i.test(String(text || ''));
  return { kg: kg.length, pct: pct.length, bar };
}
function hasRamp(text) {
  const a = rampAnchorCount(text);
  return a.kg >= 3 || a.pct >= 3 || (a.bar && a.kg >= 2);
}

function repairMissingHeavyRamps(program, intake, repairs) {
  let candidate = program;
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.notes) || !Number.isInteger(parsed.load)) continue;

    const byDay = new Map();
    parsed.rows.forEach((cells, index) => {
      const day = String(cells[parsed.day] || '').trim();
      if (!day) return;
      if (!byDay.has(day)) byDay.set(day, { warmups: [], work: [] });
      const entry = byDay.get(day);
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name) return;
      (isWarmup(name) ? entry.warmups : entry.work).push({ cells, index, name });
    });

    let changed = false;
    for (const [day, entry] of byDay) {
      if (!entry.warmups.length) continue;
      const text = entry.warmups.map((w) => `${w.cells[parsed.load]} ${w.cells[parsed.reps]} ${w.cells[parsed.notes]}`).join(' | ');
      if (hasRamp(text)) continue;

      // One ramp, for the day's heaviest loaded lift. Ramping every loaded row
      // would bloat the warm-up into its own training session.
      const loaded = entry.work
        .map((r) => ({ ...r, kg: kgOf(r.cells[parsed.load]) }))
        .filter((r) => Number.isFinite(r.kg))
        .sort((a, b) => b.kg - a.kg);
      if (!loaded.length) continue;
      const heaviest = loaded[0];
      const ramp = rampText(heaviest.name, String(heaviest.cells[parsed.load] || ''));
      if (!ramp) continue;

      const target = entry.warmups[0].cells;
      const note = String(target[parsed.notes] || '').trim();
      target[parsed.notes] = note ? `${note}${/[.!?;]$/.test(note) ? '' : ';'} ${ramp}` : ramp;
      repairs.push({ type: 'v45_heavy_ramp_added', week, day, exercise: heaviest.name });
      changed = true;
    }
    if (changed) candidate = rebuild(candidate, parsed);
  }
  return candidate;
}

// --- 7. a missing One-Arm Pull-up assistance exposure -------------------------

// Advanced Hybrid lost runs #66 and #69 to ADVANCED_HYBRID_OAP_SPECIFICITY, four
// attempts each. The rule requires two unilateral pulling exposures per week,
// strict and assisted, and the model kept shipping only the strict one. Both
// earlier fixes were guesses at what it had written; the dictionary turned out
// to contain no name the matchers missed, so the exposure was simply absent.
//
// Nothing about the missing row is a coaching decision the engine has not
// already made. The planner brief specifies this exposure and its dose --
// "Assisted One-Arm Pull-up doubles or triples with the minimum assistance
// needed for clean symmetrical reps" -- and the coach-reviewed program places it
// as a deliberately low-cost adjacent-day microdose. So the engine writes it
// rather than asking a fifth time.

const ASSISTED_OAP_ROW = {
  exercise: 'Assisted One-Arm Pull-up',
  load: 'Minimum assistance for clean reps',
  sets: '2',
  reps: '1 per arm',
  rest: '120-150 sec',
  rpe: '6-6.5',
  notes: 'Technique-only exposure. Lead the weaker arm and use the least assistance that keeps full range, no twist and equal tempo each side. Recovery-first pulling microdose: keep it at RPE 6-6.5 or easier and stop well before local fatigue.',
};

const STRICT_OAP_NAME = /^(?:weighted\s+)?one[- ]arm\s+(?:pull|chin)-?up$/i;
const ANY_OAP_NAME = /one[- ]arm\s+(?:pull|chin)-?up/i;

function wantsOapExposures(intake = {}) {
  const primary = arr(intake.primary_goals).map(String).join(' ').toLowerCase();
  return /one[- ]?arm\s*(?:pull|chin)|\boap\b/.test(primary);
}


// The strict exposure may only be written back for an athlete who has shown it.
function canRestoreStrictOap(intake = {}) {
  const shown = `${arr(intake.current_numbers).join(' ')} ${arr(intake.performance_markers).join(' ')}`;
  const demonstrated = /one[- ]arm\s+(?:pull|chin)-?up[^.\n]{0,40}\d/i.test(shown);
  if (!demonstrated) return false;
  // An athlete with active pain that pulling reproduces is the one case where
  // the missing row may be a coaching decision rather than an omission.
  const pain = intake?.pain;
  if (pain && pain.active) {
    const text = `${pain.description || ''} ${pain.tolerated_movements || ''} ${intake.injuries || ''}`;
    if (/pull|chin|hang|elbow|shoulder|lat/i.test(text)) return false;
  }
  return true;
}

const STRICT_OAP_ROW = {
  exercise: 'One-Arm Pull-up',
  load: 'Bodyweight',
  sets: '3',
  reps: '1-2 per arm',
  rest: '150-240 sec',
  rpe: '8',
  notes: 'Strict skill-strength exposure, weaker arm first. Every rep starts from a dead hang with no kip or swing; stop the set while one clean rep is still in reserve.',
};

// Placed on the freshest fixed strength day the week already uses, so the
// restored row never invents a training day the athlete did not agree to.
function insertStrictOapRow(program, parsed, work, intake) {
  const fixedDays = arr(intake.available_gym_days).map((d) => String(d).trim()).filter(Boolean);
  const present = [...new Set(work.map((c) => String(c[parsed.day] || '').trim()).filter(Boolean))];
  const eligible = fixedDays.length
    ? present.filter((d) => fixedDays.some((f) => f.toLowerCase() === d.toLowerCase()))
    : present;
  if (!eligible.length) return null;

  // A day the program itself calls low-cost cannot take a strict primary
  // exposure: the restored row would contradict the day's own description, and
  // the offline stress run caught exactly that -- the repair cleared the OAP
  // gate and raised V42_LOW_COST_CLAIM_CONTRADICTED in its place.
  const LOW_COST_DAY = /\b(?:low[- ]cost|recovery|deload|technical only|easy)\b/i;
  const lowCostDays = new Set();
  for (const c of work) {
    const day = String(c[parsed.day] || '').trim();
    const text = `${Number.isInteger(parsed.notes) ? c[parsed.notes] || '' : ''} ${Number.isInteger(parsed.load) ? c[parsed.load] || '' : ''}`;
    if (day && LOW_COST_DAY.test(String(text))) lowCostDays.add(day);
  }

  // The day carrying the most non-conditioning work is the athlete's main
  // strength day, which is where strict skill-strength belongs.
  const score = new Map();
  for (const c of work) {
    const day = String(c[parsed.day] || '').trim();
    if (!eligible.includes(day) || lowCostDays.has(day)) continue;
    const conditioning = ['endurance', 'loaded_carry'].includes(classifyExercise(String(c[parsed.exercise] || '')).category);
    if (!conditioning) score.set(day, (score.get(day) || 0) + 1);
  }
  const target = [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    || eligible.find((d) => !lowCostDays.has(d));
  if (!target) return null; // every eligible day is declared low-cost; leave it to regeneration

  const row = parsed.header.map(() => '');
  row[parsed.day] = target;
  row[parsed.exercise] = STRICT_OAP_ROW.exercise;
  if (Number.isInteger(parsed.load)) row[parsed.load] = STRICT_OAP_ROW.load;
  row[parsed.sets] = STRICT_OAP_ROW.sets;
  row[parsed.reps] = STRICT_OAP_ROW.reps;
  if (Number.isInteger(parsed.rest)) row[parsed.rest] = STRICT_OAP_ROW.rest;
  const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
  if (rpeCol >= 0) row[rpeCol] = STRICT_OAP_ROW.rpe;
  if (Number.isInteger(parsed.notes)) row[parsed.notes] = STRICT_OAP_ROW.notes;

  // First row of that day, because strict skill-strength takes the freshest slot.
  const rows = parsed.rows.map((c) => c.slice());
  const at = rows.findIndex((c) => String(c[parsed.day] || '').trim() === target);
  rows.splice(at < 0 ? rows.length : at, 0, row);
  const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
  return String(program).replace(parsed.re, `$1${rebuilt}$3`);
}

function repairMissingOapAssistance(program, intake, repairs) {
  if (!wantsOapExposures(intake)) return program;
  let candidate = program;

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;

    const work = parsed.rows.filter((c) => {
      const n = String(c[parsed.exercise] || '').trim();
      return n && !isWarmup(n);
    });
    const strictRow = work.find((c) => STRICT_OAP_NAME.test(String(c[parsed.exercise] || '').trim()));
    const hasAssisted = work.some((c) => {
      const n = String(c[parsed.exercise] || '').trim();
      return ANY_OAP_NAME.test(n) && !STRICT_OAP_NAME.test(n);
    });
    // A week missing the strict exposure used to be left alone, on the view
    // that writing one would be inventing training. Run #84 spent three
    // attempts proving that view expensive: the gate refuses, no repair
    // answers it, and the build dies.
    //
    // It is not invention when the athlete has already done it. The gate's own
    // message is "do not regress an athlete already performing strict OAPs",
    // the benchmark is in the intake, and strict work is the literal primary
    // goal. So the exposure is restored on the same terms the assisted one is
    // -- but only when the athlete has demonstrated it and nothing in the
    // intake argues against pulling.
    if (!strictRow && canRestoreStrictOap(intake)) {
      const restored = insertStrictOapRow(candidate, parsed, work, intake);
      if (restored) {
        candidate = restored;
        repairs.push({ type: 'v35_strict_oap_restored', week });
        continue;
      }
    }
    if (!strictRow || hasAssisted) continue;

    const strictDay = String(strictRow[parsed.day] || '').trim();
    // Only the athlete's own fixed strength days are eligible. The first version
    // of this repair picked the lightest day overall and landed the row on a
    // running day, inventing a strength session the athlete never agreed to and
    // trading one hard failure for ADVANCED_HYBRID_CALENDAR_DRIFT.
    const fixedDays = arr(intake.available_gym_days).map((d) => String(d).trim().toLowerCase()).filter(Boolean);
    const isEligible = (day) => {
      if (day === strictDay) return false;
      if (fixedDays.length) return fixedDays.includes(day.toLowerCase());
      // No stated gym days: any day already carrying non-conditioning work.
      return work.some((c) => String(c[parsed.day] || '').trim() === day
        && !['endurance', 'loaded_carry'].includes(classifyExercise(String(c[parsed.exercise] || '')).category));
    };

    const dayLoad = new Map();
    for (const c of work) {
      const day = String(c[parsed.day] || '').trim();
      if (!day || !isEligible(day)) continue;
      dayLoad.set(day, (dayLoad.get(day) || 0) + 1);
    }
    // Prefer a day that is not next to the strict exposure, then the lightest.
    // The two rules governing this pull against each other -- one requires a
    // second unilateral exposure every week, the other forbids conflicting
    // exposures on consecutive days -- and run #70 showed the model resolving
    // that tension by putting the assistance work next to the strict work and
    // failing V38_CONSECUTIVE_CONFLICTING_EXPOSURE four times. Choosing the day
    // deliberately satisfies both.
    const adjacentToStrict = (day) => {
      const gap = dayGap(strictDay, day);
      const back = dayGap(day, strictDay);
      return gap === 1 || back === 1;
    };
    const ranked = [...dayLoad.entries()]
      .sort((a, b) => (adjacentToStrict(a[0]) ? 1 : 0) - (adjacentToStrict(b[0]) ? 1 : 0) || a[1] - b[1])
      .map(([day]) => day);
    const target = ranked[0];
    if (!target) continue;

    const cells = new Array(parsed.header.length).fill('');
    cells[parsed.day] = target;
    cells[parsed.exercise] = ASSISTED_OAP_ROW.exercise;
    if (Number.isInteger(parsed.load)) cells[parsed.load] = ASSISTED_OAP_ROW.load;
    cells[parsed.sets] = ASSISTED_OAP_ROW.sets;
    cells[parsed.reps] = ASSISTED_OAP_ROW.reps;
    if (Number.isInteger(parsed.rest)) cells[parsed.rest] = ASSISTED_OAP_ROW.rest;
    const rpeIndex = parsed.header.findIndex((h) => /rpe|rir/i.test(String(h || '')));
    if (rpeIndex >= 0) cells[rpeIndex] = ASSISTED_OAP_ROW.rpe;
    cells[parsed.notes] = ASSISTED_OAP_ROW.notes;

    // Place it after the target day's existing rows so session order is kept.
    let insertAt = parsed.rows.length;
    for (let i = parsed.rows.length - 1; i >= 0; i--) {
      if (String(parsed.rows[i][parsed.day] || '').trim() === target) { insertAt = i + 1; break; }
    }
    parsed.rows.splice(insertAt, 0, cells);
    repairs.push({ type: 'v47_oap_assistance_added', week, day: target, strictDay });
    candidate = rebuild(candidate, parsed);
  }
  return candidate;
}

// --- 8. notes that cite a load the program never establishes ------------------

// V34_NOTE_UNDEFINED_LOAD_REFERENCE appeared at the FIRST attempt in both of the
// Hybrid runs that later failed, and had no repair, so it cost a full
// regeneration -- around three minutes and a paid call -- before the model had
// even been told anything else. It self-clears on regeneration, which is why it
// never showed up as the blocking code, but it was quietly buying an attempt
// every run.
//
// The correction is deliberately conservative. A note citing a load the program
// never establishes is unverifiable, so the sentence carrying it goes. If that
// sentence is the note's only content, nothing is removed: an empty note is
// worse than an unverifiable one, and rewriting it would mean inventing a
// coaching cue rather than deleting an unsupported claim.

function loadTokensIn(text) {
  return String(text || '').match(/\+?\s*\d+(?:\.\d+)?\s*kg\b/gi) || [];
}
function normaliseToken(t) { return String(t).replace(/\s+/g, '').toLowerCase(); }

function repairUndefinedLoadReferences(program, intake, repairs) {
  let candidate = program;

  // Every load the program itself prescribes, anywhere, plus the athlete's own
  // stated numbers: those are established and may be referenced.
  const established = new Set();
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.load)) continue;
    for (const cells of parsed.rows) for (const t of loadTokensIn(cells[parsed.load])) established.add(normaliseToken(t));
  }
  for (const t of loadTokensIn(txt(intake.current_numbers) + ' ' + txt(intake.performance_markers))) established.add(normaliseToken(t));

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    let changed = false;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const note = String(cells[parsed.notes] || '');
      if (!note.trim()) continue;
      const rowLoads = new Set(Number.isInteger(parsed.load) ? loadTokensIn(cells[parsed.load]).map(normaliseToken) : []);

      const sentences = note.split(/(?<=[.!?])\s+/).filter((x) => x.trim());
      if (sentences.length < 2) continue; // the only sentence stays; see above
      const kept = sentences.filter((sentence) => !loadTokensIn(sentence)
        .some((t) => !rowLoads.has(normaliseToken(t)) && !established.has(normaliseToken(t))));
      if (kept.length === sentences.length || !kept.length) continue;

      cells[parsed.notes] = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
      repairs.push({ type: 'v49_unverifiable_load_reference_dropped', week, exercise: name });
      changed = true;
    }
    if (changed) candidate = rebuild(candidate, parsed);
  }
  return candidate;
}

// --- 9. lower-priority stress the rules say to cut -----------------------------

// Two Advanced Hybrid rules state their own remedy. One says to remove optional
// intervals, sprints, finishers and metcons; the other says Week 1 running must
// not exceed the volume the athlete has demonstrated. Both are the coach's cut
// order applied to the lowest-priority stressor, and both were left to
// regeneration, which had to rewrite an entire program to delete a finisher.
//
// Deletion and reduction are the safest repair class: nothing is invented, and
// what is removed is by definition optional or above what the athlete has shown
// they tolerate.

const OPTIONAL_CONDITIONING = /interval|sprint|burpee|emom|metcon|finisher/i;

function hybridWithSecondaryEndurance(intake = {}) {
  const sport = arr(intake.sport_schedule).length;
  return sport >= 4 || /mma|bjj|grappl|boxing|muay/i.test(txt(intake.sport));
}

function repairExtraHardConditioning(program, intake, repairs) {
  if (!hybridWithSecondaryEndurance(intake)) return program;
  let candidate = program;
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const keep = [];
    let removed = 0;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      // Only the movement's own identity counts. Coaching prose may legitimately
      // say "without intervals", and deleting a row for its note would be wrong.
      if (name && !isWarmup(name) && OPTIONAL_CONDITIONING.test(name)) {
        repairs.push({ type: 'v49_optional_conditioning_removed', week, exercise: name });
        removed += 1;
        continue;
      }
      keep.push(cells);
    }
    if (!removed) continue;
    parsed.rows.length = 0;
    parsed.rows.push(...keep);
    candidate = rebuild(candidate, parsed);
  }
  return candidate;
}

// The demonstrated weekly running volume, from the athlete's own words.
function statedWeeklyRunKm(intake = {}) {
  const src = `${txt(intake.notes)} ${txt(intake.current_numbers)} ${txt(intake.clarification_answers)}`;
  const range = src.match(/(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*km\b/i);
  if (range) return Math.max(Number(range[1]), Number(range[2]));
  const single = src.match(/(?:about|around|roughly|~)?\s*(\d{1,3})\s*km\s*(?:total|per week|\/week|a week|weekly)/i);
  return single ? Number(single[1]) : null;
}

function repairRunBaselineExceeded(program, intake, repairs) {
  const baseline = statedWeeklyRunKm(intake);
  if (!baseline) return program;
  const parsed = parseWeek(program, 1);
  if (!parsed) return program;

  let changed = false;
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name) || !/\brun(?:ning)?\b/i.test(name) || /ruck|march/i.test(name)) continue;
    const km = kmOf(cells[parsed.reps]);
    if (!Number.isFinite(km) || km <= baseline) continue;
    // Hold Week 1 at what the athlete has actually been running. Building from
    // above a demonstrated baseline is the jump their history warns about.
    cells[parsed.reps] = String(cells[parsed.reps]).replace(/(\d+(?:\.\d+)?)(\s*km\b)/i, `${baseline}$2`);
    repairs.push({ type: 'v49_run_held_at_baseline', exercise: name, from_km: km, to_km: baseline });
    changed = true;
  }
  return changed ? rebuild(program, parsed) : program;
}

// --- 10. pulling volume stacked on consecutive days ---------------------------

// Live run #74 lost Hybrid to V38_CONSECUTIVE_CONFLICTING_EXPOSURE on all four
// attempts. This athlete trains Mon, Tue, Fri and Sun, so on a circular week
// three of the four possible pairs are adjacent, and the rule accumulates: one
// heavy vertical pull scores 3, but two light ones also reach 3. A single
// accessory pull row too many on the day after the strict One-Arm Pull-up trips
// it. The coach-reviewed program is clean but sits one row from the edge, which
// is why the model keeps landing the wrong side of it.
//
// The repair is the cut order once more: the day carrying the primary exposure
// is protected, and the lowest-priority accessory pulling on the other side of
// the pair goes until the pair is under the threshold. The required One-Arm
// Pull-up exposures are never candidates -- removing one to satisfy this rule
// would simply fail the other.

const REQUIRED_OAP = /one[- ]arm\s+(?:pull|chin)-?up/i;

function repairConsecutivePullStacking(program, intake, repairs) {
  let candidate = program;

  for (let guard = 0; guard < 8; guard++) {
    const clashes = auditCircularScheduling(candidate, intake)
      .filter((f) => f.tissue === 'vertical pulling');
    if (!clashes.length) break;
    const clash = clashes[0];

    const parsed = parseWeek(candidate, clash.week);
    if (!parsed) break;

    // Protect whichever side carries the heavier primary pulling exposure.
    const pullOn = (day) => parsed.rows.filter((c) => {
      const name = String(c[parsed.exercise] || '').trim();
      return name && !isWarmup(name)
        && dayKeyOf(c[parsed.day]) === day
        && ['vertical_pull', 'horizontal_pull'].includes(classifyExercise(name).category);
    });
    const primaryWeight = (day) => pullOn(day).filter((c) => REQUIRED_OAP.test(String(c[parsed.exercise] || ''))).length;
    const secondary = primaryWeight(clash.from) >= primaryWeight(clash.to) ? clash.to : clash.from;

    const dayRows = parsed.rows.filter((c) => dayKeyOf(c[parsed.day]) === secondary
      && String(c[parsed.exercise] || '').trim() && !isWarmup(String(c[parsed.exercise] || '')));
    const candidates = pullOn(secondary)
      .filter((c) => !REQUIRED_OAP.test(String(c[parsed.exercise] || '')))
      .sort((a, b) => {
        const w = (c) => stressSignature(String(c[parsed.exercise] || '')).upperPull;
        return w(b) - w(a);
      });
    // Never strip a session below a complete one to satisfy a scheduling rule.
    if (!candidates.length || dayRows.length <= 3) break;

    const drop = candidates[0];
    const index = parsed.rows.indexOf(drop);
    if (index < 0) break;
    parsed.rows.splice(index, 1);
    const next = rebuild(candidate, parsed);
    if (next === candidate) break;
    candidate = next;
    repairs.push({
      type: 'v50_consecutive_pull_thinned',
      week: clash.week,
      day: secondary,
      exercise: String(drop[parsed.exercise] || '').trim(),
    });
  }
  return candidate;
}

// --- entry point --------------------------------------------------------------

export function repairDeterministicContradictions(program, intake = {}) {
  let candidate = String(program || '');
  const repairs = [];

  // Accessory holds first: they change set counts that later note repairs cite.
  candidate = repairAccessoryCreep(candidate, intake, repairs);
  candidate = repairMaintenanceDrift(candidate, intake, repairs);
  candidate = repairSkillCeilings(candidate, intake, repairs);
  candidate = repairMissingHeavyRamps(candidate, intake, repairs);
  candidate = repairMissingOapAssistance(candidate, intake, repairs);
  candidate = repairUndefinedLoadReferences(candidate, intake, repairs);
  candidate = repairExtraHardConditioning(candidate, intake, repairs);
  candidate = repairRunBaselineExceeded(candidate, intake, repairs);
  candidate = repairConsecutivePullStacking(candidate, intake, repairs);

  // Reordering changes no prescription, so a secondary lift interrupting the
  // primaries is moved rather than regenerated.
  const hierarchy = repairSessionHierarchy(candidate, intake);
  if (hierarchy.repaired) {
    candidate = hierarchy.program;
    repairs.push(...hierarchy.repairs);
  }

  // Secondary work in the 24 hours before the primary day is held to a
  // technical dose. Capping an effort ceiling changes no exercise, no load and
  // no set count, so this never needs regeneration.
  candidate = repairPrePrimaryLoad(candidate, intake);

  // With an endurance primary goal, lower-body accessories beside key run and
  // ruck work are held to the minimum useful dose. Maintenance strength is
  // untouched: a conservative squat is how an endurance athlete stays strong.
  candidate = repairEnduranceVolume(candidate, intake);

  // The lower-cost exposure of a primary movement is relocated off the day
  // before its heavy exposure. Moving a row between the athlete's own training
  // days changes no prescription.
  const crowding = repairKeySessionCrowding(candidate, intake);
  if (crowding.repaired) {
    candidate = crowding.program;
    repairs.push(...crowding.repairs);
  }

  const prior = new Map();
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = repairWarmupRamps(parsed);
    const thisWeek = new Map();

    parsed.rows.forEach((cells, row) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name) return;
      const key = rowKey(cells, parsed);
      const sets = firstNum(cells[parsed.sets]);
      const reps = repCount(cells[parsed.reps]);
      const load = Number.isInteger(parsed.load) ? kgOf(cells[parsed.load]) : null;
      const km = kmOf(cells[parsed.reps]);
      const volume = (Number.isFinite(sets) && Number.isFinite(reps)) ? sets * reps : null;
      thisWeek.set(key, { sets, reps, load, km, volume });
      if (isWarmup(name) || !Number.isInteger(parsed.notes)) return;

      const p = prior.get(key) || {};
      const { note, changed: noteChanged } = repairRowNote(cells[parsed.notes], {
        sets, reps, load, km, volume,
        priorSets: p.sets, priorReps: p.reps, priorLoad: p.load, priorKm: p.km, priorVolume: p.volume,
      });
      if (noteChanged) {
        cells[parsed.notes] = note;
        repairs.push({ type: 'v35_note_restated', week, row, exercise: name });
        changed = true;
      }

      // The load/target cell also carries prose, and a deterministic normalizer can
      // write a reduction claim there while leaving this row's dose untouched. That
      // contradiction is engine-authored, so no amount of regeneration can clear it.
      if (Number.isInteger(parsed.load)) {
        const { note: descriptor, changed: loadChanged } = repairRowNote(cells[parsed.load], {
          sets, reps, km, volume, load: null,
          priorSets: p.sets, priorReps: p.reps, priorKm: p.km, priorVolume: p.volume, priorLoad: null,
        });
        if (loadChanged) {
          cells[parsed.load] = descriptor;
          repairs.push({ type: 'v35_load_descriptor_restated', week, row, exercise: name });
          changed = true;
        }
      }

      // The reps cell carries prose too, and the detector reads it alongside
      // the note and the load cell when it looks for a progression claim. Only
      // two of those three were ever repaired, so a reduction claim written
      // here was detected on every pass and answered on none: a HARD code with
      // no reachable repair, which spends all four attempts and then fails the
      // build. The rep count itself is the row's dose, so a rewrite that would
      // disturb it is refused rather than trusted.
      if (Number.isInteger(parsed.reps)) {
        const { note: repsText, changed: repsChanged } = repairRowNote(cells[parsed.reps], {
          sets, reps: null, km, volume, load: null,
          priorSets: p.sets, priorReps: p.reps, priorKm: p.km, priorVolume: p.volume, priorLoad: null,
        });
        // A reps cell holds the dose, not coaching prose. Restating the claim
        // in place would leave "2 hold the total work." in a Reps column, which
        // reads as a defect on the spreadsheet the coach reviews, so the
        // corrected claim is lifted out of the cell and the dose left clean.
        const holds = Object.values(HOLD_PHRASE).map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const cleaned = repsText
          .replace(new RegExp(`\\s*\\b(?:${holds})\\b\\s*\\.?`, 'gi'), ' ')
          .replace(/\s{2,}/g, ' ')
          .replace(/\s+([.,;])/g, '$1')
          .replace(/[\s.,;]+$/, '')
          .trim();
        const finalReps = cleaned || repsText;

        if (repsChanged && repCount(finalReps) === reps && kmOf(finalReps) === km) {
          cells[parsed.reps] = finalReps;
          repairs.push({ type: 'v35_reps_descriptor_restated', week, row, exercise: name });
          changed = true;
        }
      }
    });

    for (const [k, v] of thisWeek) prior.set(k, v);
    if (changed) candidate = rebuild(candidate, parsed);
  }

  // A sentence that miscounts the program it introduces is an objective error
  // with a mechanical correction, and was being left to regeneration.
  const counts = repairCountClaims(candidate, intake);
  if (counts.repaired) {
    candidate = counts.program;
    repairs.push(...counts.repairs);
  }

  const narrative = repairNarrative(candidate, intake);
  if (narrative.changed) {
    candidate = narrative.program;
    repairs.push({ type: 'v35_narrative_restated' });
  }

  // Last, once the logic is frozen and every repair above has written into
  // the notes: make the sentences say what the rows already say. This changes
  // no number, load or exercise.
  // Name the block honestly. This is prose, not prescription, and without it
  // the rule had no deterministic answer and cost four attempts.
  // A stated weekly frequency that does not match the prescription is a
  // contradiction the client can see on one sheet. Counting is deterministic.
  // Secondary volume holds when the primary quality advances. Reducing a set
  // count changes no exercise and no load, so this converges here rather than
  // dragging a build to exhaustion the way it did in run #87.
  const held = repairSecondaryVolumeCreep(candidate, intake);
  if (held !== candidate) {
    candidate = held;
    repairs.push({ type: 'v66_secondary_volume_held' });
  }

  // Week 4 consolidates -- and this has to run after the volume hold above,
  // not before it. Consolidation is measured against Week 3, so holding
  // secondary volume first changes the very number Week 4 must come in under.
  // Ordered the other way, the hold silently undid the consolidation and the
  // finding came back.
  // Competition shape before consolidation: for an athlete with an event, the
  // final week is a competition week rather than a consolidation week, and the
  // two want different things from the same rows.
  // An intensification block trades volume for intensity and gives the
  // competition lifts a larger share as the meet approaches.
  // A fighter's block must contain speed work, not just the word explosive.
  const powered = repairCombatPower(candidate, intake);
  if (powered !== candidate) {
    candidate = powered;
    repairs.push({ type: 'v72_combat_power_added' });
  }

  // After the speed exposure exists, not before: trimming first would cut the
  // session down and then add a row back into it.
  const lean = repairCampEconomy(candidate, intake);
  if (lean !== candidate) {
    candidate = lean;
    repairs.push({ type: 'v74_camp_economy_trimmed' });
  }

  // A cut spends the same recovery the training does, so the effort ceiling
  // comes down with it.
  const cut = repairWeightCutLoad(candidate, intake);
  if (cut !== candidate) {
    candidate = cut;
    repairs.push({ type: 'v75_weight_cut_held' });
  }

  // Last of the competition repairs: the clock is written after every other
  // rule has finished editing the notes it prefixes.
  const sharpened = repairCampSharpening(candidate, intake);
  if (sharpened !== candidate) {
    candidate = sharpened;
    repairs.push({ type: 'v82_camp_sharpened' });
  }

  const clustered = repairClusterNotation(candidate, intake);
  if (clustered !== candidate) {
    candidate = clustered;
    repairs.push({ type: 'v81_cluster_recorded' });
  }

  const ramped = repairWarmupRampTarget(candidate, intake);
  if (ramped !== candidate) {
    candidate = ramped;
    repairs.push({ type: 'v34_warmup_ramp_target' });
  }

  // Swap generic accessories for ballistic work before the clock is written,
  // so the countdown prefixes the notes the swap leaves behind.
  const ballistic = repairBallisticShare(candidate, intake);
  if (ballistic !== candidate) {
    candidate = ballistic;
    repairs.push({ type: 'v79_ballistic_swapped' });
  }

  const onClock = repairFightWeekClock(candidate, intake);
  if (onClock !== candidate) {
    candidate = onClock;
    repairs.push({ type: 'v77_fight_week_clock' });
  }

  // Deliverables, appended once everything else has settled: the audit reports
  // the block that actually shipped, not an intermediate one.
  const documented = appendCampSchedule(appendCompetitionBlocks(candidate, intake), intake);
  if (documented !== candidate) {
    candidate = documented;
    repairs.push({ type: 'v73_v78_blocks_appended' });
  }

  const intensified = repairIntensification(candidate, intake);
  if (intensified !== candidate) {
    candidate = intensified;
    repairs.push({ type: 'v71_intensification_shaped' });
  }

  const peaked = repairCompetitionBlock(candidate, intake);
  if (peaked !== candidate) {
    candidate = peaked;
    repairs.push({ type: 'v70_competition_shape' });
  }

  const consolidated = repairWeek4Consolidation(candidate, intake);
  if (consolidated !== candidate) {
    candidate = consolidated;
    repairs.push({ type: 'v67_week4_consolidated' });
  }

  const counted = repairFrequencyClaim(candidate, intake);
  if (counted !== candidate) {
    candidate = counted;
    repairs.push({ type: 'v61_frequency_claim_counted' });
  }

  const named = repairBlockSpecificityClaim(candidate, intake);
  if (named !== candidate) {
    candidate = named;
    repairs.push({ type: 'v59_block_specificity_named' });
  }

  const cleaned = repairSemanticProse(candidate, intake);
  if (cleaned !== candidate) {
    candidate = cleaned;
    repairs.push({ type: 'v58_semantic_cleanup' });
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
