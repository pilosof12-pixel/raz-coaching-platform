// Specialist rules for the archetypes the specialist layer never covered.
//
// phase15_specialist_rules.js has generators for gymnastics, street lifting and
// manual acceptance. Measured across the six launch avatars, that leaves three
// getting zero characters of specialist guidance: the masters rower, the sprint
// triathlete and the in-season basketball guard. The masters rower is also the
// lowest score the coach gave (8.4), and the one he sent back for the most
// substantive revision.
//
// The knowledge was never missing. engine/endurance_runtime_parts carries the
// authored endurance corpus, and it answers all three cases directly:
//
//   ARTICLE 8  concurrent strength and endurance, by priority
//   ARTICLE 9  conditioning for combat AND INTERMITTENT sports
//   ARTICLE 10 modality translation: running, cycling, rowing, swimming,
//              multisport
//
// Nothing routed them per athlete type. This module does, and every rule below
// is traceable to a line of that corpus rather than to general knowledge. Where
// the corpus marks something an unresolved source gap, that gap is passed on
// rather than filled in.

import { isInSeason, matchDays, protectedDays } from './v83_in_season.js';
import { namedComponentsFor } from './coach_standard.js';

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const text = (intake, keys) => keys.flatMap((k) => arr(intake?.[k])).map(String).join(' | ');

const goalText = (intake) => text(intake, ['primary_goals', 'secondary_goals', 'maintenance_goals']);
const allText = (intake) => `${goalText(intake)} | ${intake?.sport || ''} | ${intake?.notes || ''}`;

// The modality the primary goal is actually measured in.
const MODALITY = [
  ['rowing', /\brow(?:ing)?\b|\berg\b|ergometer/i],
  ['running', /\brun(?:ning)?\b|\b\d+\s*k(?:m)?\b|marathon|parkrun/i],
  ['cycling', /\bcycl(?:e|ing)\b|\bbike\b|\bwatt/i],
  ['swimming', /\bswim(?:ming)?\b/i],
];

export function primaryEnduranceModality(intake = {}) {
  const primary = text(intake, ['primary_goals']);
  const hay = `${primary} ${intake?.sport || ''}`;
  for (const [name, re] of MODALITY) if (re.test(hay)) return name;
  return null;
}

const RETURNING = /return(?:ing)?\b|comeback|after (?:a )?(?:long )?layoff|back to|post[- ]?partum|postpartum|discharged|cleared for/i;

// --- endurance as the priority ----------------------------------------------

export function enduranceSpecialistRules(intake = {}) {
  const modality = primaryEnduranceModality(intake);
  if (!modality) return [];
  const multi = multisportComponents(intake);
  if (multi.length >= 2) return []; // the multisport generator owns those
  const out = [`SPECIALIST SOURCE: authored endurance corpus, ARTICLE 8 (concurrent priority) and ARTICLE 10 (modality translation), primary modality=${modality}.`];

  // ARTICLE 8, endurance priority.
  out.push('ARTICLE 8 priority rule: with endurance as the primary goal, protect the key endurance sessions and the event-specific volume first. Strength is supportive, prescribed at a recoverable dose, and trends toward maintenance as the event approaches. It is not a second primary goal competing for the same recovery.');
  out.push('ARTICLE 8 shared-tissue rule: think shared tissues rather than cardio minutes. Rowing and swimming create meaningful upper-body and back fatigue, and running carries more eccentric lower-body cost than cycling, so count the endurance work against the accessory patterns it already loads.');

  // ARTICLE 10, per modality. Only the anchors the corpus actually names.
  if (modality === 'rowing') {
    out.push('ARTICLE 10 rowing anchor: prescribe rowing by pace or power per 500 m AND stroke rate, not by heart rate, because heart rate lags the effort. Every erg piece needs both numbers.');
    out.push('ARTICLE 10 rowing load: large muscle mass with substantial leg, back and pulling involvement. Low impact does not mean low systemic or pulling fatigue, so additional horizontal-pull accessory work is competing with the erg rather than supporting it.');
    out.push('ARTICLE 10 rowing progression: move from a general aerobic and threshold emphasis toward more race-specific intervals as the event approaches. Do not copy elite sample weeks.');
  }
  if (modality === 'running') {
    out.push('ARTICLE 10 running anchor: use pace or speed as the primary external anchor, with RPE and heart rate as response and context rather than as the prescription.');
    out.push('ARTICLE 10 running substitution: cycling or swimming may supplement aerobic load when impact is the limiting cost, but they do not replace running preparation. Retain enough running for event economy and tissue tolerance.');
  }
  if (modality === 'cycling') {
    out.push('ARTICLE 10 cycling anchor: where power is available it is the prescription, and heart rate or RPE are responses to it. High-power cycling still produces real quadriceps fatigue and can interfere with lower-body strength.');
  }
  if (modality === 'swimming') {
    out.push('ARTICLE 10 swimming anchor: swimming is technically dependent, and a weak swimmer is often technique-limited before the intended metabolic target is reached. Do not copy land heart-rate anchors into the water, and treat a stroke that collapses as a technique limiter rather than reading the session as aerobic work.');
  }

  // A graded return is a tolerance problem before it is a performance problem.
  if (RETURNING.test(allText(intake))) {
    out.push('GRADED RETURN: the athlete is returning rather than peaking, so the first thing that has to progress is tolerance of the goal modality itself -- exposures per week and duration or distance -- before pace or power becomes the target. A block that holds the dose flat and only sharpens the split has not built tolerance.');
    out.push('GRADED RETURN: the movement that loads the previously injured tissue is also the goal movement, so build its exposure deliberately across the block rather than assuming it. Changing the prescribed pace by a second is not a progression in tolerance.');
  }

  out.push('SOURCE GAP (passed on, do not fill from general knowledge): the corpus marks high-resolution 3K/5K/10K, marathon, rowing-race and cycling-event systems as a specialist-source gap. Prescribe within what the corpus supports and do not invent a detailed race plan.');
  return out;
}

// --- multisport --------------------------------------------------------------

function multisportComponents(intake = {}) {
  let named = [];
  try { named = namedComponentsFor(intake) || []; } catch (_) { named = []; }
  const swimBikeRun = named.filter((c) => /swim|bike|cycl|run/i.test(String(c)));
  return swimBikeRun.length >= 2 ? named : [];
}

export function multisportSpecialistRules(intake = {}) {
  const components = multisportComponents(intake);
  if (components.length < 2) return [];
  const out = [`SPECIALIST SOURCE: authored endurance corpus, ARTICLE 10 (multisport), components=${components.join(' / ')}.`];
  out.push('ARTICLE 10 multisport rule: calibrate each discipline separately. One heart-rate or pace zone cannot be copied across modes, so every discipline needs its own anchor expressed in its own units.');
  out.push('ARTICLE 10 multisport allocation: allocate training by event duration, cumulative and transition fatigue, the athlete\'s current limiter and each discipline\'s technical and local demands -- not evenly across the three.');
  out.push('ARTICLE 10 multisport exposure: every named component needs sufficient specific exposure in the block. A discipline that appears in the goal and not in the weeks is an uncovered component.');
  out.push('ARTICLE 10 limiter rule: train the limiter where it is cheapest to train. A technically limited discipline improves through technique and economy work before it responds to added metabolic load, and the discipline with the highest tissue cost is not automatically the one to add volume to.');
  out.push('SOURCE GAP (passed on): the corpus marks detailed Ironman and long-course volume, fuelling and periodization as beyond its resolution. Do not generate one.');
  return out;
}

// --- intermittent sport, in season ------------------------------------------

export function intermittentSportSpecialistRules(intake = {}) {
  let inSeason = false;
  try { inSeason = isInSeason(intake); } catch (_) { inSeason = false; }
  const intermittent = /basketball|football|soccer|rugby|handball|hockey|netball|volleyball|tennis|bjj|jiu|mma|boxing|kickbox|combat|wrestl/i
    .test(`${intake?.sport || ''}`);
  if (!inSeason && !intermittent) return [];

  let fixtures = [];
  let protectedList = [];
  try { fixtures = matchDays(intake) || []; } catch (_) { fixtures = []; }
  try { protectedList = protectedDays(intake) || []; } catch (_) { protectedList = []; }

  const out = ['SPECIALIST SOURCE: authored endurance corpus, ARTICLE 9 (combat and intermittent sports) and ARTICLE 8 (concurrent priority).'];
  out.push('ARTICLE 9 sequence: map the real sport week first -- which sessions are light or technical, which are moderate, which are hard or competitive -- and programme the gym week around it rather than treating every sport day alike.');
  out.push('ARTICLE 9 double-count rule: hard competitive sport already supplies repeated severe efforts, so it counts as high-intensity conditioning. Add formal hard intervals only for a deficit the sport itself does not develop.');
  out.push('ARTICLE 9 no-punishment rule: supplemental work targets a quality sport practice does not develop efficiently enough, while preserving technical quality. It is not a conditioning circuit added for its own sake.');
  out.push('ARTICLE 8 priority rule: sport practice is the primary specific stimulus in season. Strength and supplemental conditioning exist to support availability and quality, at a dose that leaves the athlete fresh for the fixture.');

  if (fixtures.length) {
    out.push(`FIXTURE STRUCTURE: competitive days are ${fixtures.join(', ')} and the day before each is protected (${protectedList.join(', ') || 'none resolved'}). Heavy slow lower-body work does not belong on a protected day, and the gym week must fit the fixtures rather than the fixtures fitting the gym.`);
  }

  // The failure mode the corpus names, matched to what the athlete reports.
  const fades = /fade|fourth quarter|late in (?:games|matches)|last \d+ minutes|drop[- ]?off|end of (?:games|matches)/i
    .test(allText(intake));
  if (fades) {
    out.push('ARTICLE 9 differential diagnosis: the athlete holds output early and loses it late, so assess aerobic support, pacing and repeat-effort recovery BEFORE adding more peak-power work. Adding jumps or heavier lifting to a late-game drop-off treats the wrong quality.');
    out.push('ARTICLE 9 corollary: if peak output is intact when fresh, the deficit is the ability to repeat it, which is a recovery-between-efforts quality rather than a maximum-strength one.');
  } else {
    out.push('ARTICLE 9 differential diagnosis: name the failure before choosing a method -- overall pace loss, poor recovery between bursts, lost peak explosiveness, or technique degrading under fatigue. If decisive explosive actions are weak while pace holds, prioritise strength, power and high-quality explosive exposure rather than more conditioning volume.');
  }

  out.push('ARTICLE 9 lowest-cost rule: choose the lowest-cost method that develops the missing quality. A general modality gives control and lower technical and orthopaedic fatigue; sport-specific intervals transfer better but control the dose less well.');
  out.push('SOURCE GAP (passed on): the corpus gives no universal work-to-rest ratio for any ruleset or format. Do not invent one.');
  return out;
}

export function enduranceFamilySpecialistRules(intake = {}) {
  return [
    ...enduranceSpecialistRules(intake),
    ...multisportSpecialistRules(intake),
    ...intermittentSportSpecialistRules(intake),
  ];
}
