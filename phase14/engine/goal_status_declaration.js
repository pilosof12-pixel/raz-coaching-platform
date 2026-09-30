// engine/goal_status_declaration.js
//
// A named goal has a status, and the block has to say which.
//
// The coach's first engine-level correction: "Named secondary goals need a
// declared status: develop or maintain. If Marathon is intentionally maintained
// because squat/OAP/MMA dominate the recovery budget, say so. Don't silently
// give a named goal maintenance programming while describing everything as
// progression."
//
// This also resolves a real contradiction between two rules that were both
// right. The AH-01 hierarchy deliberately holds the secondary press through the
// build weeks so the primary goals and sport recovery survive; the progression
// gate requires a named goal to move. Measured honestly across Weeks 1-3, a held
// goal fails the second rule for obeying the first. The missing third option is
// the coach's: hold it, and say you are holding it and why.
//
// Declaring costs nothing and changes no prescription. What it buys is that the
// athlete reading "100 kg overhead press" in their goals and 65 kg in every week
// of the table knows which of the two is a mistake -- neither.

import { parseWeek } from './v34_workload_accounting.js';

const FAMILY_WORDS = {
  overhead_press: /overhead press|\bohp\b|strict press/i,
  running: /\brun(?:ning)?\b|marathon/i,
  rowing: /\brow(?:ing)?\b|\berg(?:ometer)?\b/i,
  squat: /\bsquat\b/i,
  deadlift: /\bdeadlift\b/i,
  pull_up: /pull[- ]?up|chin[- ]?up/i,
  ruck: /\bruck\b|loaded march/i,
  handstand: /handstand/i,
  bar_muscle_up: /muscle[- ]?up/i,
  bench_press: /bench press/i,
};

// The declaration has to name the thing and say it is being held, in one
// sentence. "Maintenance" floating elsewhere in the block does not count.
// Deliberately narrow. A first attempt accepted any of "held", "hold" or
// "preserved" near the goal word, and passed on a sentence reading "with OHP
// moving at a smaller dose and one weekly easy long run preserved" -- which says
// the opposite. Ordinary coaching prose is full of "hold"; a status declaration
// is a specific claim and has to look like one.
const HELD = new RegExp([
  'maintenance (?:dose|level|volume|programming)',
  'held at (?:a |its )?maintenance',
  'hold(?:s|ing)? (?:it|this|them|that) at (?:a |its )?maintenance',
  'deliberately (?:held|maintained|not developed)',
  'maintained rather than develop',
  'rather than developing it',
  'not (?:being )?developed (?:in|this|here|during)',
  'kept at maintenance',
].join('|'), 'i');

export function familyWords(family) { return FAMILY_WORDS[family] || null; }

function sentences(text) {
  return String(text || '').split(/(?<=[.;!?])\s+|\n+/).filter(Boolean);
}

export function declaresMaintenance(program, family) {
  const words = FAMILY_WORDS[family];
  if (!words) return false;
  const head = String(program || '').split(/START_WEEK1_TSV/i)[0];
  return sentences(head).some((s) => words.test(s) && HELD.test(s));
}

function goalLabel(target) {
  // progressionAnalysis rows carry the athlete's own wording under `goal`;
  // raw targets carry it under `raw`. Reading only one printed family names.
  const raw = String(target.goal || target.raw || '').trim();
  return raw || String(target.family || '').replace(/_/g, ' ');
}

// What the block IS developing, so the declaration can say what the recovery
// budget went to instead of asserting it in the abstract.
function developedLabels(targets) {
  return targets
    .filter((t) => t.progressed && (t.tier === 'primary' || t.tier === 'secondary'))
    .map((t) => goalLabel(t))
    .slice(0, 3);
}

export function collectUndeclaredGoalStatusFlags(analysis, program) {
  const targets = analysis?.targets || [];
  const flags = [];
  for (const target of targets) {
    if (target.tier !== 'primary' && target.tier !== 'secondary') continue;
    if (target.progressed) continue;
    if (!FAMILY_WORDS[target.family]) continue;
    if (declaresMaintenance(program, target.family)) continue;
    flags.push({
      code: 'V101_GOAL_STATUS_UNDECLARED',
      family: target.family,
      tier: target.tier,
      goal: goalLabel(target),
      detail: `'${goalLabel(target)}' is a named ${target.tier} goal and its prescription does not change across the build weeks. Holding it is often the right call when higher-priority goals and sport load own the recovery budget, but the block must say so. An athlete reading an improvement goal in their intake and an unchanging dose in the table cannot tell which one is the mistake.`,
    });
  }
  return flags;
}

const DECLARATION_SENTINEL = /this block holds it at a maintenance dose rather than developing it/i;

export function normalizeGoalStatusDeclaration(program, intake = {}, analysis = null) {
  const original = String(program || '');
  if (!analysis) return { program: original, repaired: false, repairs: [] };

  const head = original.split(/START_WEEK1_TSV/i)[0];
  if (!head.trim()) return { program: original, repaired: false, repairs: [] };

  // Strip the paragraphs this repair owns BEFORE deciding what needs declaring.
  // Doing it the other way round meant a goal was skipped because it was already
  // declared, and then had its declaration deleted by the rewrite -- so the block
  // shipped with the goal flat and nothing saying so. Anything the model wrote
  // itself survives and still counts as a declaration.
  const cleanedHead = head
    .split(/\n\n+/)
    .filter((para) => !DECLARATION_SENTINEL.test(para))
    .join('\n\n')
    .trimEnd();
  const rest = original.slice(head.length).replace(/^\s*/, '');
  const cleaned = `${cleanedHead}\n\n${rest}`;

  const flags = collectUndeclaredGoalStatusFlags(analysis, cleaned);
  if (!flags.length) {
    // Nothing to declare. Only report a repair if stripping actually changed the
    // program, which happens when a goal started progressing again.
    const changed = cleaned !== original;
    return { program: changed ? cleaned : original, repaired: changed, repairs: [] };
  }

  const developed = developedLabels(analysis.targets || []);
  const sport = Number(intake.sport_sessions_per_week || 0);
  const because = [
    developed.length ? `${developed.join(' and ')} ${developed.length > 1 ? 'are' : 'is'} what this block develops` : null,
    sport >= 4 ? `${sport} sport sessions a week already own most of the recovery budget` : null,
  ].filter(Boolean).join(', and ');

  const lines = flags.map((f) => {
    const why = because ? ` ${because.charAt(0).toUpperCase()}${because.slice(1)}.` : '';
    return `On ${f.goal}: this block holds it at a maintenance dose rather than developing it, on purpose.${why} Keeping the exposure protects what you already have and keeps it ready to progress in the next block; it is not an attempt to improve it in these four weeks.`;
  });

  // Rewriting is not the same as changing. A later pass re-derives the same
  // declarations from the same state and must report no repair, or the chain
  // never settles and idempotency is meaningless.
  const updated = `${cleanedHead}\n\n${lines.join('\n\n')}\n\n${rest}`;
  if (updated === original) return { program: original, repaired: false, repairs: [] };
  return {
    program: updated,
    repaired: true,
    repairs: flags.map((f) => ({ type: 'goal_status_declared', family: f.family, tier: f.tier })),
  };
}
