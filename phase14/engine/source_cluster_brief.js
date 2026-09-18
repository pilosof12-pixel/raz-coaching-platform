// engine/source_cluster_brief.js
//
// The two knowledge clusters, as instructions.
//
// engine_instructions.txt is an older build carrying Articles 1-101 and nothing
// else. The Endurance / Conditioning cluster and the Competition Preparation /
// Peaking / Tapering cluster were never in it: "critical power" appears 0 times
// against 15 in the source, "VO2max" 0 against 46, "pretaper" 0 against 10,
// "Mujika" 0. The engine has been generating against knowledge it was never
// given, and those two documents are the ones the reviewing coach cites for
// exactly the findings we keep taking.
//
// They are not appended wholesale. The instruction file is already ~360K tokens
// sent on every request, and 47K more tokens of bioenergetics would reach every
// athlete regardless of whether they run. These are the prescriptive parts --
// what to decide, in what order, against which numbers -- emitted only for the
// athletes they govern.
//
// Source: docs/knowledge/endurance_conditioning_cluster.txt and
// docs/knowledge/competition_peaking_tapering_cluster.txt.

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const goals = (intake) => ['primary', 'secondary', 'maintenance']
  .flatMap((t) => arr(intake[`${t}_goals`]).map(String)).join(' ');

const ENDURANCE_GOAL = /\b\d+(?:\.\d+)?\s*k(?:m)?\b|\bmarathon\b|\bhalf\b|\brun\b|\bruck\b|\brow\b|\berg\b|\bsprint\b|\bconditioning\b|\bhyrox\b|\bendurance\b|\brepeat(?:ed)?[- ]effort\b/i;

export function buildEnduranceSourceBrief(intake = {}) {
  if (!ENDURANCE_GOAL.test(goals(intake))) return '';
  return [
    '* BUILD THE CONDITIONING IN THIS ORDER, NOT BY FILLING DAYS.',
    '  Start from the required output: the event duration, the pace or power it demands, the repeated-effort pattern it imposes, and the mechanical constraints the athlete brings.',
    '  Count what is already there -- sport practice, sparring, matches, lifting, existing runs -- before adding a single session. A conditioning block is an allocation problem, not an addition problem.',
    '  Name the one quality that actually limits this athlete: aerobic base, sustainable intensity, high aerobic power, repeated-sprint ability, peak power, or economy. Choose one to develop and hold the rest at the minimum dose that preserves them.',
    '  Set the weekly hard-session budget before you add any easy volume. High-intensity sessions carry a disproportionate share of the fatigue cost, and easy volume fills what is left.',
    '  Place the priority session where the athlete is freshest, and progress one variable at a time. Do not raise frequency, duration and intensity together.',
    '',
    '* PEAK SPEED AND REPEATABILITY ARE DIFFERENT SESSIONS, AND RECOVERY IS WHAT SEPARATES THEM.',
    '  If the goal is peak sprint speed or power, give enough recovery to preserve maximal output and stop before the session becomes metabolic conditioning.',
    '  If the goal is repeatability -- the athlete fades late in a match or a race -- recovery is deliberately incomplete so they must restore output under pressure. More than two efforts, each about 10 seconds or less, at or near maximal intent, with under 60 seconds between them.',
    '  A session with near-full recovery is speed work whatever it is called, and a session at 90% of effort is quality work rather than repeatability work. Name each one for what its recovery makes it.',
    '  The variables that decide the dose are sprint duration, recovery duration, recovery intensity, repetition count, any change of direction, and the mode. Change one of them at a time.',
  ].join('\n');
}

// Mujika, as the cluster summarises him. The numbers are population-level
// findings from swimming, running and cycling, and the cluster states that
// boundary itself -- so they are given as a starting point to reason from, not
// a target to hit.
export function buildTaperSourceBrief(intake = {}, inCompetitionBlock = false) {
  if (!inCompetitionBlock) return '';
  return [
    '* WHAT A TAPER ACTUALLY CHANGES.',
    '  Volume is the lever that sheds fatigue. A reduction of roughly 41 to 60% of pre-taper volume is the strongest general starting point; a competition week that trims a tenth of the work has not tapered.',
    '  Intensity is what the taper protects. Keep competition-relevant load, pace or intent and take the repetitions off instead. The athlete should still touch meaningful loads or move at competition speed, with very little total work and nothing near failure.',
    '  Frequency is held more than volume. Sessions get shorter, not fewer -- the athlete keeps turning up, which protects rhythm and technical feel. Cutting training days is the wrong lever.',
    '  Remove volume selectively rather than uniformly: general conditioning, hypertrophy-only accessories, redundant strength patterns and high-damage work come off first, and the competition-specific quality comes off last.',
    '  For a combat athlete, "maintain intensity" means competition-speed movement and tactical urgency. It does not mean preserving heavy contact or exhaustive sparring.',
  ].join('\n');
}
