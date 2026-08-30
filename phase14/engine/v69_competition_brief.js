// engine/v69_competition_brief.js
//
// The coaching the model receives when the athlete has a competition.
//
// Assembled per week-state rather than pasted whole: the source cluster runs to
// roughly 73,000 characters against a 20,000-character developer-prompt guard,
// so injecting all of it is impossible and injecting most of it would push a
// generation that already takes five to fourteen minutes past its ceiling. An
// athlete with no event gets nothing from this file and their prompt does not
// grow by a byte.
//
// Everything below is the cluster's own guidance, compressed. Where the cluster
// says a thing is a default rather than a law -- taper duration, last heavy day,
// opener percentages -- the brief says so too, because a false certainty is
// worse coaching than an acknowledged range.

import { STATE, competitionProfile, freshnessPriority } from './v68_competition_state.js';

// The cost matrix, reduced to what changes a prescription. Intensity is not
// cost: this is the distinction the engine had no way to express.
const COST_RULES = [
  'Cost is not intensity. A heavy crisp single can be cheap; a set of slow eccentric accessory work to failure is expensive. Judge exposures by what they leave behind, not by the number on the bar.',
  'Highest residual cost near competition: unfamiliar movements, high-strain eccentric or lengthened-position work, near-failure sets, long hard intervals and circuits, hard contact, and anything the athlete has not done recently.',
  'Lowest residual cost: familiar patterns, brief crisp exposures with full rest, technical work at competition speed, and easy aerobic movement.',
];

const STATE_BRIEF = {
  [STATE.SPECIFICITY]: [
    'Emphasis: make the qualities already built transfer to the event. More event-relevant lifts, paces, skill sequences and tactical scenarios; less low-value variety and redundant general work.',
    'This is still a building block. Do not taper, do not reduce volume for the event, and do not treat this as peak week -- the competition is far enough away that fitness is still the objective.',
    'Specificity means closer to the event, not merely harder. Nonessential gym complexity earns less space as the event approaches.',
  ],
  [STATE.MIDDLE_CAMP]: [
    'Emphasis: the sport is taking more, so the gym takes less. Strength shifts from developing to maintaining -- fewer hard sets, less novelty, and supplemental work only where it still solves a real deficit.',
    'Ask of every gym exposure whether it is still solving a problem the sport is not already creating. If it is not, remove it rather than shrinking it.',
  ],
  [STATE.LATE_CAMP]: [
    'Emphasis: minimal effective dose. Strength work exists to preserve force and speed, not to build anything, and the sport is already supplying the hard work.',
    'Keep total gym volume very low. Favour power and speed-biased exposures: familiar compound movements for crisp doubles and triples with full rest, stopping while bar speed is still high. Intensity may stay meaningful; volume must not.',
    'Remove high-repetition hypertrophy work, grinders, near-failure sets, novel exercises and large eccentric doses. These offer little late-camp return and cost soreness the athlete cannot afford.',
    'A combat athlete does not need a strength-sport realization phase. Near-maximal gym performance is not the competition demand, so do not build toward a gym test.',
  ],
  [STATE.REALIZATION]: [
    'Emphasis: can the athlete express the required qualities under event-like constraints? High-quality specific exposures and controlled simulations, with general volume coming down.',
    'What should start disappearing: failure training, excessive accessories, redundant conditioning, and anything novel.',
    'Keep developing only what can still meaningfully adapt before the event. A quality that cannot improve in the time left is maintained or dropped, not chased.',
  ],
  [STATE.TAPER]: [
    'Emphasis: fatigue must fall without losing feel, speed or confidence. Cut volume substantially; preserve the intensity and the session frequency that keep the competition qualities sharp.',
    'Reduce volume first, preferentially from non-specific and high-cost work. Volume is the fatigue lever; intensity is the signal that stops the athlete going flat.',
    'A progressive reduction is the reasonable default when the athlete has no personal taper history. Do not invent a sudden single-day drop.',
    'Do not add work because the athlete starts to feel good. Feeling fresh is the taper working, not evidence it was unnecessary.',
  ],
  [STATE.COMPETITION_WEEK]: [
    'This week is competition week. Its job is arriving able to perform, not training. Nothing this week is intended to create adaptation.',
    'What stays: short familiar technical touches that preserve feel and confidence, competition-speed movement, the rehearsed warm-up, easy aerobic movement for routine and circulation, and optionally a very low-volume power primer.',
    'What leaves: hypertrophy-only volume, failure work, novel lifts or drills, high-damage eccentric work, large volumes of loaded lower-body work, redundant hard conditioning, and any unplanned test or confidence workout.',
    'A primer creates readiness, not adaptation: familiar movements, very low set and rep counts, generous rest, fast concentric intent, and stop before speed or technique deteriorates. It may be moderately heavy; what defines it is low residual fatigue, not a percentage.',
    'If a session leaves the athlete more fatigued, sorer or technically worse than before it, the dose was wrong for the purpose.',
  ],
  [STATE.POST]: [
    'The event has passed. Prioritise recovery and re-entry over immediate progression.',
  ],
};

const COMBAT_BRIEF = [
  'Sport practice is the priority and counts as load. Count the mat, ring and cage sessions before writing a single gym set -- the gym exists around them, not beside them.',
  'Generic conditioning must not duplicate hard sparring. An athlete already sparring hard several times a week does not need conditioning added to prove fitness.',
  'Store technical intensity and contact intensity separately. Preserving intensity must not mean preserving damage: technical drilling, pad work and controlled positional rounds keep timing at a fraction of the cost of unrestricted hard sparring.',
  'Strength work in camp maintains what exists. Favour power-biased, low-volume, familiar compound exposures with full rest; avoid muscle damage, near-failure work and heavy eccentric loading.',
  'As hard sport practice rises the gym contribution falls. Do not hold off-season strength volume flat and add fight-camp sparring on top of it.',
  'A strength session that is reasonable in isolation becomes excessive when it loads the same tissues shortly before or after hard sport practice. Count the sport sessions first, then decide what the gym can afford.',
];

const STRENGTH_MEET_BRIEF = [
  'Keep the competition lifts or highly specific variants as the main patterns while total volume falls. Preserve meaningful load exposure and reduce repetitions, accessory work and failure risk.',
  'Remove high-soreness eccentric accessories and novel variations first. Maintain enough lift frequency for technical feel.',
  'There is no universal last-heavy-day rule. The question is how long this athlete needs a heavy low-volume exposure to improve readiness rather than suppress it, so state the intent of a heavy exposure rather than asserting a fixed day.',
];

const WEIGHT_CLASS_BRIEF = [
  'A weight-class plan is underway. Prioritise safe weight management and technical freshness over maintaining normal gym volume, and do not answer weight-cut fatigue with more training.',
];


// "This is Weeks -8 to -5. An intensification block, not the final taper."
// A block that does not say where it sits invites the athlete to read it as the
// peak whatever it contains.
function runwayStatement(profile) {
  const start = Math.round(profile.weeksOut);
  const end = Math.max(0, start - 3);
  const window = end === 0 ? `Weeks -${start} to the event` : `Weeks -${start} to -${end}`;
  if (profile.blockEndsAtEvent) {
    return `This block is ${window}: it runs into the event, so the final week is competition week rather than a normal training week.`;
  }
  if (start > 5) {
    return `This block is ${window}: an intensification block, not the final taper. The taper is a separate block generated closer to the event.`;
  }
  return `This block is ${window}: the run-in to the event.`;
}

function bullet(lines) { return lines.map((l) => `  ${l}`).join('\n'); }

export function buildCompetitionBrief(intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile) return '';

  const perWeek = profile.weeks
    .map((w) => `Week ${w.week}: ${w.state.replace(/_/g, ' ')} (${w.weeksOut <= 0 ? 'event week' : `${w.weeksOut} weeks out`})`)
    .join('; ');

  // Only the states this block actually contains, so the prompt carries no
  // guidance for a phase the athlete never reaches.
  const states = [...new Set(profile.weeks.map((w) => w.state))];
  const guidance = states.flatMap((s) => STATE_BRIEF[s] || []);

  const lines = [
    `* COMPETITION PREPARATION: the athlete has a ${profile.eventType.replace(/_/g, ' ')} event, priority ${profile.priority}, about ${profile.weeksOut} weeks away.`,
    `  Week states across this block -- ${perWeek}.`,
    `  ${runwayStatement(profile)}`,
    '  Say in the opening paragraph where this block sits in the run-up and what kind of block it therefore is. An athlete reading week 1 should know whether they are building or peaking.',
    '  Build the block from the event backwards. Do not write a normal block and then forbid things in the last week.',
    bullet(guidance),
    bullet(COST_RULES),
  ];

  if (profile.eventType === 'combat') lines.push(bullet(COMBAT_BRIEF));
  if (profile.eventType === 'strength_meet') lines.push(bullet(STRENGTH_MEET_BRIEF));
  if (/difficult|routine|cut/i.test(String(intake?.weight_class_status || ''))
    || /weight cut|weigh[- ]?in/i.test(String(intake?.notes || ''))) {
    lines.push(bullet(WEIGHT_CLASS_BRIEF));
  }

  if (profile.priority === 'C') {
    lines.push('  This is a low-priority event: preserve the training block and use only a small reduction rather than peaking aggressively.');
  } else if (profile.priority === 'B') {
    lines.push('  This is a secondary event: reduce fatigue enough to perform well without sacrificing the larger training block.');
  }

  lines.push(`  Freshness priority for the final week: ${freshnessPriority(profile.weeks[3].state)}.`);
  return lines.filter(Boolean).join('\n');
}
