// engine/v59_block_specificity_repair.js
//
// A deterministic answer for V35_BLOCK_SPECIFICITY_OVERSTATED.
//
// The rule is right: a block whose fastest quality work is materially slower
// than goal demand must not present itself as race-specific. Its remedy is
// right too -- "describe it as a developmental or transition block toward that
// standard". What was missing was anything that would do so. A live Tactical
// build spent four attempts and roughly eight minutes here, and no client
// program was saved.
//
// Naming the block honestly is a change to prose, not to prescription, so it
// belongs in the repair chain rather than in a regeneration.

import { validateCoachingStandards } from './v35_coaching_standards.js';

// Deliberately free of the words "race-specific" and "event-specific": the
// detector reads the narrative for those phrases, so framing text that used
// them to deny them re-triggered the very rule it was clearing.
const FRAMING = 'This is a developmental block toward that standard: the quality work here is deliberately short of event demand while tolerance is built.';

function flagsFor(program, intake) {
  const res = validateCoachingStandards(program, intake);
  const list = Array.isArray(res) ? res : (res && res.flags) || [];
  return list.filter((f) => f && f.code === 'V35_BLOCK_SPECIFICITY_OVERSTATED');
}

export function repairBlockSpecificityClaim(program, intake = {}) {
  const source = String(program || '');
  if (!flagsFor(source, intake).length) return source;

  const split = source.split(/START_WEEK1_TSV/i);
  if (split.length < 2) return source;
  let narrative = split[0];
  const rest = source.slice(narrative.length);

  // An explicit claim is corrected where it stands, so the summary does not
  // contradict itself two sentences later.
  narrative = narrative.replace(/\b(?:is|as)\s+(?:a\s+)?(?:race|event)[- ]specific\b/gi,
    'is a developmental block toward');

  // A block that merely names the goal is not overstating anything, but it
  // does need to say where it stands relative to it.
  if (!/\btowards?\b/i.test(narrative)) {
    narrative = `${narrative.replace(/\s*$/, '')}\n\n${FRAMING}\n`;
  }

  const repaired = narrative + rest;
  // Never hand back something that still fails the rule it was meant to clear.
  return flagsFor(repaired, intake).length ? source : repaired;
}
