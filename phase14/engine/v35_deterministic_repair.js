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
import { repairInSeason, appendTrainingWeek } from './v83_in_season.js';
import { repairClockStatement } from './v86_training_clock.js';
import { repairDayZeroClaims, repairMatchDayPlacement, repairAllocationShift, repairSportFrequency } from './v89_block_architecture.js';
import { repairBallisticShare, collectBallisticShareFlags } from './v79_ballistic_share.js';
import { repairBenchmarkExposure } from './benchmark_exposure_repair.js';
import { repairEventComponentCoverage } from './event_component_repair.js';
import { repairCompromisedRunning } from './compromised_work_repair.js';
import { repairRaceRehearsal } from './race_rehearsal_repair.js';
import { repairModalitySubstitution, repairNoteNamedMovement } from './modality_substitution_repair.js';
import { repairNextRowClaim, repairTransitionClaim } from './structural_claim_rules.js';
import { repairSkillFoundation } from './skill_foundation_repair.js';
import { canonicaliseDayOrder } from './day_order_canonicalization.js';
import { repairConsecutiveRepGoal } from './consecutive_rep_goal.js';
import { ladderOf, kgOf } from './tsv_rows.js';
import { repairSupportivePullBudget } from './supportive_pull_budget.js';
import { repairAccessoryBudget } from './accessory_budget.js';
import { ENDURANCE_REPAIRS, repairAccessoryRedundancy, repairTaperPowerSpike } from './endurance_block_repair.js';
import { STATEMENT_REPAIRS } from './program_statement_repair.js';
import { repairConsecutiveTrainingDays } from './consecutive_day_repair.js';
import { repairSessionAdjacency } from './session_order_repair.js';
import { repairCompetitionWeekConsolidation } from './competition_week_consolidation.js';
import { repairCompetitionWeek } from './v90_competition_week.js';
import { repairTimelineIntegrity } from './v91_timeline_integrity.js';
import { repairPrescriptionIntegrity } from './v92_prescription_integrity.js';
import { appendCompetitionBlocks } from './v73_taper_audit.js';
import { appendCampSchedule, repairSportStateLanguage } from './v78_sport_taper.js';
import { classifyExercise, dayGap, stressSignature, dayKey as dayKeyOf, isFoundationalStrength, ROLE, CATEGORY } from './v38_movement_taxonomy.js';
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
// kgOf lives in tsv_rows.js.
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
  // A ladder has no single rep count. "3/1/1/1" is a triple and three singles,
  // and reading the top of it as THE rep count made the note reconciler rewrite
  // every rep word in the note to match: "stay at a double" became "stay at a
  // triples", and "keep the back-off singles" became "keep the back-off
  // triples". Both shipped in run #139 and the coach charged them. A row whose
  // note legitimately describes several different set lengths must not have
  // those lengths restated as one.
  if (ladderOf(s)) return null;
  return firstNum(s);
}

// The reps a ladder row actually prescribes, so volume claims still reconcile.
function ladderVolume(raw) {
  const ladder = ladderOf(raw);
  return ladder ? ladder.reduce((a, b) => a + b, 0) : null;
}
function rowKey(cells, parsed) {
  return `${String(cells[parsed.day] || '').trim().toLowerCase()}|${String(cells[parsed.exercise] || '').trim().toLowerCase()}`;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const REP_WORD_FOR = { 1: 'singles', 2: 'doubles', 3: 'triples' };
import { namesAnAlternativeDose } from './v34_prescription_consistency.js';

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

function repairRowNote(note, { sets, reps, km, load, volume, measured, priorSets, priorReps, priorKm, priorVolume, priorLoad }) {
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
    //
    // Not on a row prescribed by distance or time. A Farmer Carry written as
    // 1 x 100 m parses reps as 100, and "Single direct touch for grip and
    // posture" came out as "sets of 100 reps, direct touch for grip and
    // posture" -- twice in run #136, which he charged 0.08 as a genuine
    // client-facing execution error. A carry measured in metres has no reps to
    // restate, and the word in front of it is not a claim about a rep count.
    const wanted = measured ? null : (REP_WORD_FOR[reps] || `sets of ${reps}`);
    if (wanted) {
      // Not a rep word that names the fallback rather than the prescription.
      // "Strict ring doubles only if rep 1 is crisp. If rep 2 would be soft,
      // switch to singles" is a row prescribed at 2 reps whose second rep word
      // is deliberately a different dose -- the thing to do when the prescribed
      // one cannot be met. Restating it as the row's own dose produced "switch
      // to doubles" on a set already prescribed as doubles, which the coach
      // charged as a client-facing execution error on run #138. The repair made
      // that line worse than the model wrote it.
      out = out.replace(/\b(singles?|doubles?|triples?)\b/gi, (w, _g, offset, whole) => {
        const n = { single: 1, singles: 1, double: 2, doubles: 2, triple: 3, triples: 3 }[String(w).toLowerCase()];
        if (!Number.isFinite(n) || n === reps) return w;
        if (namesAnAlternativeDose(whole, { 0: w, index: offset })) return w;
        return wanted;
      });
    }
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

    // An early-stop instruction has to name a set the athlete would otherwise
    // still have in front of them. Repairs downstream of note generation cut a
    // Dip from four sets to two and left "stop at 3 sets" behind it, so the note
    // told him to stop at a set the row no longer contains. Stopping early means
    // one short of what is prescribed; below two sets there is nothing to stop
    // short of, and the clause goes.
    out = out.replace(/(,?\s*(?:and\s+)?)\bstop at\s+(\d+)(\s+(?:clean|quality|good|solid)?\s*sets?\b)/gi,
      (w, lead, n, tail) => {
        if (Number(n) < sets) return w;
        if (sets < 2) return '';
        const kept = sets - 1;
        return `${lead}stop at ${kept}${tail.replace(/sets\b/i, kept === 1 ? 'set' : 'sets')}`;
      });
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

      const unverifiable = (t) => !rowLoads.has(normaliseToken(t)) && !established.has(normaliseToken(t));

      // Restate before deleting. A note citing a load the program never
      // establishes is nearly always citing the wrong number for its own row --
      // a load that moved under it during repair -- and the row itself says what
      // the right one is. Restating is what every other reconciler here does,
      // and unlike deleting it always has an answer.
      //
      // Deleting alone could not converge. A single-sentence note was never
      // touched, and a note whose every sentence carried a load was left whole,
      // so V34_NOTE_UNDEFINED_LOAD_REFERENCE survived each attempt and the build
      // spent all four calls on it: run #140 took 466 seconds and shipped with
      // the rule unresolved.
      const rowLoadToken = Number.isInteger(parsed.load) ? loadTokensIn(cells[parsed.load])[0] : null;

      // A fallback clause is the exception. "Drop to +35 kg if it turns grindy"
      // names a load to retreat TO, so restating it as the row's own load makes
      // it vacuous -- an instruction to drop to the weight already on the belt.
      // Where other sentences survive, that clause goes instead.
      const fallback = /\b(?:drop(?:ping)? (?:back )?to|reduce(?:d)? to|fall(?:ing)? back (?:on|to)|revert(?:ing)? to|back (?:down )?to|switch(?:ing)? to)\b/i;
      const all = note.split(/(?<=[.!?])\s+/).filter((x) => x.trim());
      const survivors = all.filter((x) => !(fallback.test(x) && loadTokensIn(x).some(unverifiable)));
      if (survivors.length && survivors.length < all.length) {
        const trimmed = survivors.join(' ').replace(/\s{2,}/g, ' ').trim();
        if (trimmed !== note) {
          cells[parsed.notes] = trimmed;
          repairs.push({ type: 'v49_unverifiable_fallback_load_dropped', week, exercise: name });
          changed = true;
          if (!loadTokensIn(trimmed).some(unverifiable)) continue;
        }
      }

      // Only where the sentence is telling him what to lift today. A load can
      // also be referenced rather than prescribed -- "build toward your +30 kg
      // standard from the last block" is a claim about his history, and
      // restating that as the weight on the bar this week does not make it true,
      // it makes it false. Those still reach the gate, deliberately.
      const PRESCRIBES = /\b(?:start(?:ing)? at|begin at|open at|work(?:ing)? at|use|hold|keep|stay at|top set at|load(?:ed)? at|add|take)\b/i;
      const REFERENCES = /\b(?:your|his|her|their)\b[^.]{0,40}\b(?:standard|best|pr|max|record)\b|\b(?:last|previous|prior|earlier) (?:block|cycle|phase|programme|program)\b|\ball[- ]time\b/i;
      const restatable = (sentence) => PRESCRIBES.test(sentence) && !REFERENCES.test(sentence);

      if (rowLoadToken) {
        const current = String(cells[parsed.notes] || '');
        let restated = current
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => {
            if (!restatable(sentence)) return sentence;
            let outS = sentence;
            for (const t of loadTokensIn(sentence)) {
              if (unverifiable(t)) outS = outS.split(t).join(rowLoadToken);
            }
            return outS;
          })
          .join(' ');
        if (restated !== current) {
          cells[parsed.notes] = restated.replace(/\s{2,}/g, ' ').trim();
          repairs.push({ type: 'v49_unverifiable_load_reference_restated', week, exercise: name });
          changed = true;
          continue;
        }
      }

      // No load on the row to restate against, so the claim cannot be made true
      // and the sentence carrying it goes. Where that is the whole note the note
      // goes with it: an empty cell is a smaller problem than a rule the build
      // cannot clear, which is what the old caution actually bought.
      // Deleting is the fallback, and it keeps its old caution: where the claim
      // is the whole note there is nothing to delete down to, and an empty note
      // is worse than an unverifiable one. Those reach the gate.
      const sentences = String(cells[parsed.notes] || '').split(/(?<=[.!?])\s+/).filter((x) => x.trim());
      const kept = sentences.filter((sentence) => !loadTokensIn(sentence).some(unverifiable));
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

    // And never take the last foundational pull off a day that carries upper-body
    // skill work.
    //
    // Run #130's calisthenics build is what this is for. The delivered program
    // had no foundation violations at all; this repair removed Tuesday's
    // Inverted Row to fix a consecutive-pull clash, and Tuesday is a handstand
    // and planche day -- so the chain manufactured four V38_SKILL_WITHOUT_-
    // FOUNDATION findings that the gate then refused, four times, before the
    // build gave up and shipped them. The foundation repair could not put it
    // back either, because re-adding recreates the clash this one is removing.
    //
    // Spacing pulls across days is a scheduling preference. Strength under a
    // skill is the thing the skill is built on, so it wins.
    const skillDay = dayRows.some((c) => {
      const { category, role } = classifyExercise(String(c[parsed.exercise] || ''));
      return role === ROLE.SKILL_PRACTICE && category === CATEGORY.SKILL;
    });
    const remainingPulls = (dropped) => dayRows.filter((c) => c !== dropped
      && isFoundationalStrength(String(c[parsed.exercise] || ''))
      && /pull|row|chin/i.test(String(c[parsed.exercise] || ''))).length;
    const safe = candidates.filter((c) => !skillDay || remainingPulls(c) > 0);

    // Nothing safe to remove: leave the week alone and let the finding stand.
    //
    // De-loading the Tuesday pull was tried and fires without helping, because
    // the clash is anchored on Monday's Weighted Pull-up -- a primary goal
    // movement this repair is forbidden to touch. Softening the other side of a
    // conflict it does not own is motion, not a fix, and a repair that reports
    // success while the gate still refuses is worse than one that declines.
    if (!safe.length) break;

    const drop = safe[0];
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

  // Spread the week before anything decides what goes on which day. An athlete
  // with no sport schedule and no fixed gym days was training Monday to Friday
  // with the weekend empty, which the coach charges as avoidable clustering --
  // avoidable being the word that matters, since nothing in the intake asked
  // for it. Sessions keep their order and their contents; only the weekday
  // label moves, so a week cannot get harder or easier by being spread out.
  const spread = repairConsecutiveTrainingDays(candidate, intake);
  if (spread.changed) {
    candidate = spread.program;
    repairs.push({
      type: 'consecutive_training_days_spread',
      moved: spread.moves.map((m) => `w${m.week} ${m.from.join('/')} -> ${m.to.join('/')}`),
    });
  }

  // Then settle which session sits on which of those days. The spread above
  // chooses the calendar; this chooses the running order, and only the running
  // order -- no exercise, set, rep or load changes. It runs here, before
  // anything reasons about content, so the repairs downstream see the week the
  // athlete will actually train rather than one this pass is about to rearrange.
  const reordered = repairSessionAdjacency(candidate, intake);
  if (reordered.changed) {
    candidate = reordered.program;
    repairs.push({
      type: 'session_adjacency_reordered',
      moved: reordered.moves.map((m) => `${m.from.join('/')} -> ${m.to.join('/')} (${m.clashes_before} -> ${m.clashes_after})`),
    });
  }

  // Facts from the intake that the program contradicted: a ruck shorter than
  // the distance the athlete already covers, quality running that never
  // approaches the pace they named, a movement serving an improvement goal that
  // never moves. The tactical runner is the worst program the coach has scored
  // and the chain applied nothing at all to it, because every one of its
  // findings was detection-only.
  for (const fn of ENDURANCE_REPAIRS) {
    const r = fn(candidate, intake);
    if (!r.changed) continue;
    candidate = r.program;
    repairs.push({ type: fn.name, moves: r.moves.length });
  }

  // Put the race back into a race block. The brief names every station with its
  // race dose and the model still trained three of eight, which is the second
  // time an instruction has arrived in full and not come back in the program.
  // It spends a slot rather than adding one, on the coach's reasoning about the
  // generic work he charged: those exercises are not bad, their opportunity cost
  // four weeks out is.
  // Before anything counts the rows: a note telling the athlete to do a
  // different movement than the row names means every downstream count records
  // the work against the wrong exercise. Run #124 had five Goblet Squat rows
  // whose notes said to do wall balls, so a race station was being tallied as
  // squat volume.
  const renamedByNote = repairNoteNamedMovement(candidate, intake);
  if (renamedByNote.changed) {
    candidate = renamedByNote.program;
    repairs.push({
      type: 'note_named_movement_applied',
      moves: renamedByNote.moves.map((m) => `w${m.week} ${m.from} -> ${m.to}`),
    });
  }

  const raced = repairEventComponentCoverage(candidate, intake);
  if (raced.changed) {
    candidate = raced.program;
    repairs.push({
      type: 'event_components_exposed',
      swapped: raced.swaps.map((x) => `w${x.week} ${x.from} -> ${x.to}`),
    });
  }

  // Immediately after the stations exist, because a run can only be run off a
  // station the program actually contains. This one moves an existing run row
  // behind an existing station on the same day: no set is added, no load
  // changes, no session is invented. Where a day has no run or no station it
  // does nothing, which is the case that really would be composition.
  const compromised = repairCompromisedRunning(candidate, intake);
  if (compromised.changed) {
    candidate = compromised.program;
    repairs.push({
      type: 'compromised_running_paired',
      moves: compromised.moves.map((m) => `w${m.week} ${m.day} after ${m.after}`),
    });
  }

  // The most invasive repair in the chain, and the only one that changes what two
  // sessions contain rather than their order. It gathers a race rehearsal by
  // moving component rows onto the day already closest to being one, within the
  // same week so the week's coverage is untouched. Every move is checked against
  // the structural audit and abandoned if anything gets worse -- moving work into
  // a day can push it past its time budget, and that is a code the audit counts.
  const rehearsed = repairRaceRehearsal(candidate, intake);
  if (rehearsed.changed) {
    candidate = rehearsed.program;
    repairs.push({
      type: 'race_rehearsal_gathered',
      moves: rehearsed.moves.map((m) => `w${m.week} ${m.component} -> ${m.day}`),
    });
  }


  // A split belongs to the machine that produced it. Prose-only: this rewrites
  // the clause that offers another machine so the alternative carries the RPE
  // the row already has, instead of inheriting a number never measured on it.
  const anchoredModality = repairModalitySubstitution(candidate, intake);
  if (anchoredModality.changed) {
    candidate = anchoredModality.program;
    repairs.push({
      type: 'modality_substitution_anchored',
      moves: anchoredModality.moves.map((m) => `w${m.week} ${m.movement}/${m.alternative}`),
    });
  }

  // Put back a benchmarked movement the block never trains. It prefers to spend
  // a redundant slot, so most of the time this changes what a session contains
  // rather than how much of it there is -- but when nothing is redundant it has
  // to add sets, and everything that reacts to a row has to run downstream of
  // that. It sat later twice and both placements were wrong: after the camp
  // economy trim an added row was a seventh exercise nothing could cut, and
  // after the warm-up and heavy-ramp regeneration the second pass discovered
  // the new row and wrote it a ramp the first pass had not, which is a repair
  // chain that does not settle. It is the first content repair for that reason:
  // a row that appears after the things that react to rows have already run is
  // a row the program was never really built around.
  const exposed = repairBenchmarkExposure(candidate, intake);
  if (exposed.changed) {
    candidate = exposed.program;
    repairs.push({
      type: 'benchmarked_movement_exposed',
      swapped: exposed.swaps.map((x) => `w${x.week} ${x.from} -> ${x.to}`),
      inserted: exposed.inserts.map((x) => `w${x.week} ${x.day} + ${x.movement}`),
    });
  }

  // Last claim on a surplus slot. Everything above that wanted one has taken it
  // by now, so what is still doing the same job twice is doing it for nobody.
  const trimmed = repairAccessoryRedundancy(candidate, intake);
  if (trimmed.changed) {
    candidate = trimmed.program;
    repairs.push({ type: 'accessory_redundancy_trimmed', moves: trimmed.moves.length });
  }

  // Accessory holds next: they change set counts that later note repairs cite.
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
      const volume = ladderVolume(cells[parsed.reps])
        ?? ((Number.isFinite(sets) && Number.isFinite(reps)) ? sets * reps : null);
      thisWeek.set(key, { sets, reps, load, km, volume });
      if (isWarmup(name) || !Number.isInteger(parsed.notes)) return;

      const p = prior.get(key) || {};
      // A reps cell carrying a unit is a distance or a duration, not a count.
      const measured = /\d\s*(?:m|km|mi|min|minutes?|sec|s)\b/i.test(String(cells[parsed.reps] || ''));
      const { note, changed: noteChanged } = repairRowNote(cells[parsed.notes], {
        sets, reps, load, km, volume, measured,
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
  const moreSport = repairSportFrequency(candidate, intake);
  if (moreSport !== candidate) {
    candidate = moreSport;
    repairs.push({ type: 'v89_gym_slot_replaced_with_sport_exposure' });
  }

  const allocated = repairAllocationShift(candidate, intake);
  if (allocated !== candidate) {
    candidate = allocated;
    repairs.push({ type: 'v89_allocation_shifted_toward_sport' });
  }

  const dayZero = repairDayZeroClaims(candidate, intake);
  if (dayZero !== candidate) {
    candidate = dayZero;
    repairs.push({ type: 'v89_unearned_peak_language_removed' });
  }

  const placed = repairMatchDayPlacement(candidate, intake);
  if (placed !== candidate) {
    candidate = placed;
    repairs.push({ type: 'v89_sessions_placed_by_match_day' });
  }

  const clocked = repairClockStatement(candidate, intake);
  if (clocked !== candidate) {
    candidate = clocked;
    repairs.push({ type: 'v86_clock_stated' });
  }

  const shown = appendTrainingWeek(candidate, intake);
  if (shown !== candidate) {
    candidate = shown;
    repairs.push({ type: 'v83_sport_week_shown' });
  }

  const inSeason = repairInSeason(candidate, intake);
  if (inSeason !== candidate) {
    candidate = inSeason;
    repairs.push({ type: 'v83_match_day_protected' });
  }

  // Before the note pass and the structural repairs, so everything downstream
  // sees the prescription the athlete will actually train: a goal stated as
  // consecutive reps has to be trained in sets, not only in weekly volume.
  const accessories = repairAccessoryBudget(candidate, intake);
  if (accessories.changed) {
    candidate = accessories.program;
    repairs.push({ type: 'accessoryBudget', moves: accessories.moves.length });
  }

  const pullBudget = repairSupportivePullBudget(candidate, intake);
  if (pullBudget.changed) {
    candidate = pullBudget.program;
    repairs.push({ type: 'supportivePullBudget', moves: pullBudget.moves.length });
  }

  const laddered = repairConsecutiveRepGoal(candidate, intake);
  if (laddered.changed) {
    candidate = laddered.program;
    repairs.push({ type: 'consecutiveRepGoal', moves: laddered.moves.length });
  }

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

  // The strength under the skill, late: after the repairs that resolve
  // conflicting adjacent exposures.
  //
  // Placed early it did nothing at all. The delivered program carries eight
  // conflicting-exposure findings as well as eight missing-foundation ones, and
  // the chain clears the first set further down -- so a repair that runs before
  // that is judged against a program still carrying them, every candidate row
  // looks like it makes things worse, and the guard refuses all of it.
  // Run #129's calisthenics build spent four model calls on
  // V38_SKILL_WITHOUT_FOUNDATION and shipped with eight: an entire upper-body
  // day of handstand work with no pulling or pushing underneath it. The brief
  // says not to in as many words and the model did it anyway, four times, which
  // is a gate with no converging repair.
  const founded = repairSkillFoundation(candidate, intake);
  if (founded.changed) {
    candidate = founded.program;
    repairs.push({
      type: 'skill_foundation_added',
      moves: founded.moves.map((m) => `w${m.week} ${m.day} ${m.added} (${m.kind})`),
    });
  }

  // Swap generic accessories for ballistic work before the clock is written,
  // so the countdown prefixes the notes the swap leaves behind.
  const ballistic = repairBallisticShare(candidate, intake);
  if (ballistic !== candidate) {
    candidate = ballistic;
    repairs.push({ type: 'v79_ballistic_swapped' });
  }

  // The tapering week gets its volume judged here for the same reason the
  // competition week does, one step below: the ballistic swap has just finished
  // deciding what the sessions are made of. Earlier in the chain this repair
  // trimmed week 3 to seven power sets and the swap then refilled it to
  // eighteen, which is the finding the coach charges 0.45 for. It trims sets
  // and never deletes a movement, so the exposure the swap just bought survives
  // at a dose a taper can carry.
  const capped = repairTaperPowerSpike(candidate, intake);
  if (capped.changed) {
    candidate = capped.program;
    repairs.push({ type: 'repairTaperPowerSpike', moves: capped.moves.length });
  }

  // Competition week may lose a day -- before the freshness budget is judged.
  //
  // Placed after repairCompetitionWeek it merged a day on the meet-week
  // program, made the receiving day too big for the budget, and nothing ran
  // again to notice: V90_SESSION_GROWS_INTO_DAY_ZERO on a program that had been
  // converging. Clearing a scheduling finding by overloading the day before the
  // event is the opposite of the point, so the merge happens first and the
  // budget judges what it leaves behind.
  //
  // The coach charged a HYROX block 0.20 for four straight competition-week
  // days. The engine could not act on it: its own taper rule held
  // competition-week frequency at 70% of baseline, and four sessions inside a
  // Day -7 to Day -4 window are necessarily consecutive, so no legal layout
  // existed. He scoped that floor to the taper week and named the order of
  // sacrifice, which ends with frequency rather than beginning there.
  //
  // It consolidates rather than spreads, because spreading would move a session
  // toward Day 0 and he ruled that out by name.
  const compWeekMerge = repairCompetitionWeekConsolidation(candidate, intake);
  if (compWeekMerge.changed) {
    candidate = compWeekMerge.program;
    repairs.push({
      type: 'competition_week_consolidated',
      moved: compWeekMerge.moves.map((m) => `w${m.week} ${m.from} -> ${m.into} (${m.rows} rows)`),
    });
  }

  // Competition week last of the content repairs: the ballistic swap has
  // finished deciding what the sessions are made of, so this is the only point
  // where the week's real volume can be judged against Day 0.
  const budgeted = repairCompetitionWeek(candidate, intake);
  if (budgeted !== candidate) {
    candidate = budgeted;
    repairs.push({ type: 'v90_competition_week_freshness_budget' });
  }

  const onClock = repairFightWeekClock(candidate, intake);
  if (onClock !== candidate) {
    candidate = onClock;
    repairs.push({ type: 'v77_fight_week_clock' });
  }

  // Prose about the next row, restated once every repair that moves rows has
  // finished. Run #124 claimed a run flowed into a sled pull row that was
  // actually a Rower; the coach charged 0.15, and the point of that row is the
  // transition, so a claimed transition that is not programmed is the defect
  // rather than the wording. Placed here because a claim checked before the
  // rehearsal sequencer or the day spread would be checked against rows that
  // move afterwards.
  // Transitions stated in either direction, restated once the rows have settled.
  // "straight off SkiErg" looks backwards, "straight into sled pull" forwards,
  // and the coach charged 0.25 for notes naming transitions the rows did not
  // make. Runs after the sequencer for the same reason as the next-row claim: a
  // claim checked before the rows move is checked against rows that then move.
  const restatedTransitions = repairTransitionClaim(candidate, intake);
  if (restatedTransitions.changed) {
    candidate = restatedTransitions.program;
    repairs.push({
      type: 'transition_claim_restated',
      moves: restatedTransitions.moves.map((m) => `w${m.week} ${m.movement} ${m.word} ${m.from} -> ${m.to || 'removed'}`),
    });
  }

  const restatedNextRow = repairNextRowClaim(candidate, intake);
  if (restatedNextRow.changed) {
    candidate = restatedNextRow.program;
    repairs.push({
      type: 'next_row_claim_restated',
      moves: restatedNextRow.moves.map((m) => `w${m.week} ${m.movement}: ${m.from} -> ${m.to}`),
    });
  }

  // Deliverables, appended once everything else has settled: the audit reports
  // the block that actually shipped, not an intermediate one.
  // The audit and the camp schedule are rendered LAST, below, because they
  // describe the finished program and five row-changing repairs still run
  // after this point.

  const honest = repairPrescriptionIntegrity(candidate, intake);
  if (honest !== candidate) {
    candidate = honest;
    repairs.push({ type: 'v92_prescription_says_what_decides' });
  }

  const coherent = repairTimelineIntegrity(candidate, intake);
  if (coherent !== candidate) {
    candidate = coherent;
    repairs.push({ type: 'v91_timeline_made_consistent' });
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

  // Rendered here, after every repair that can change a row. Appended at the
  // top of this section instead, the audit reported the program as it stood
  // before the taper trim, the intensification shaping and the competition-week
  // trim had run -- so the weightlifting block shipped a table reading
  // 69/69/69/50 against a week table that ran 69/63/58/49, and reported
  // competition-lift share flat at 39% when it actually climbs to 47%. The
  // document made the block look worse than it was, in the section written to
  // be the trustworthy summary.
  const documented = appendCampSchedule(appendCompetitionBlocks(candidate, intake), intake);
  // Deliberately after the calendar is written: the contradiction this repair
  // resolves is between the calendar and the week table, so it has to run on
  // the document that actually ships, not an intermediate one.
  if (documented !== candidate) {
    candidate = documented;
    repairs.push({ type: 'v73_v78_blocks_appended' });
  }

  // Last, because it reads the same computation the calendar was rendered from.
  // A note calling Friday's mat session hard when the block demoted it to
  // technical is the calendar and the row disagreeing about the day the athlete
  // is standing in.
  const described = repairSportStateLanguage(candidate, intake);
  if (described.changed) {
    candidate = described.program;
    repairs.push({ type: 'v78_sport_state_language' });
  }

  // Two decisions the block made and did not mention: which reading of
  // days_per_week governs, and that it quietly rewrote the athlete's sport
  // week. Neither is a training change and both are answered by saying so.
  //
  // They run at the very end, after the calendar and the camp schedule have
  // been appended, because the sentence has to describe the week that actually
  // shipped. Placed earlier -- as they were first -- the statement was written
  // against a program that later repairs then changed underneath it.
  for (const fn of STATEMENT_REPAIRS) {
    const r = fn(candidate, intake);
    if (!r.changed) continue;
    candidate = r.program;
    repairs.push({ type: fn.name });
  }

  // Settle the swap against the trims that follow it.
  //
  // The swap converges within a session, but the repairs after it move rows,
  // and a session that met the share when the swap ran can fall back under it
  // afterwards. On the fight-camp corpus that left one Week 3 session short --
  // a single Side Plank -- and the gate refused the build for it, which live is
  // a regeneration. Re-running the swap once cleared it every time.
  //
  // Bounded, and the cap re-runs behind it, because these two have fought
  // before: the swap once refilled week 3 to eighteen power sets after the cap
  // had trimmed it to seven, and that is a 0.45 deduction the coach charges by
  // name. The corpus severity ratchet is what holds that line, so if this ever
  // starts giving volume back it fails there rather than silently shipping.
  for (let pass = 0; pass < 2; pass += 1) {
    if (!collectBallisticShareFlags(candidate, intake).length) break;
    const again = repairBallisticShare(candidate, intake);
    if (again === candidate) break;
    candidate = again;
    repairs.push({ type: 'v79_ballistic_swapped_after_trim' });
    const recapped = repairTaperPowerSpike(candidate, intake);
    if (recapped.changed) {
      candidate = recapped.program;
      repairs.push({ type: 'repairTaperPowerSpike', moves: recapped.moves.length });
    }
    // A swapped row arrives without the countdown the clock writes into notes,
    // and the clock has already run by the time we get here. Leaving it is how
    // clearing V79 traded straight into V77_FIGHT_WEEK_NOT_ON_THE_CLOCK on both
    // fight-camp programs -- the same build refused for a different reason,
    // which is no better than the first. The swap site upstream says the clock
    // must follow the swap; this keeps that true for the late pass too.
    const reclocked = repairFightWeekClock(candidate, intake);
    if (reclocked !== candidate) {
      candidate = reclocked;
      repairs.push({ type: 'v77_fight_week_clock' });
    }
  }

  // Last, once nothing else will move a session: print the week in the order it
  // is trained. The adjacency and spread repairs relabel days in place, so a
  // corrected week can come out of the chain reading Mon/Wed/Tue/Fri/Sat.
  const ordered = canonicaliseDayOrder(candidate, intake);
  if (ordered.changed) {
    candidate = ordered.program;
    repairs.push({ type: 'canonicaliseDayOrder', moves: ordered.moves.length });
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
