// A delivered program is not necessarily a clean one.
//
// When four repair attempts cannot clear a rule, the salvage path ships the
// best candidate rather than throwing away a complete program and charging for
// nothing. That is a deliberate decision and the right one: thirteen of
// fifty-five paid builds once died with a valid four-week program sitting in
// memory. It records what stayed broken at the front of the job detail.
//
// Run #160 is why this is its own module with its own test. The grading script
// read only the `QA trace:` part of that detail and printed PASS, so the run was
// reported as two of two when one of the two shipped carrying
// SPORT_DAY_COUPLING_VIOLATION and LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_
// PERFORMANCE. The engine said so plainly; the reporting hid it, and I repeated
// the wrong number.
//
// A report that overstates what shipped is worse than no report, because a
// launch decision gets made on it.

const UNRESOLVED = /delivered with unresolved rules:\s*([A-Z0-9_+]+)/;

// The effort the program was actually written at. The trace opens with
// E0:<effort> and every de-escalation appends @<effort>, so the last one named
// is the one that produced the delivered program.
//
// This matters because the ladder is not quality-neutral the whole way down.
// high -> medium costs nothing: high never finished inside the request ceiling
// on four of five avatars, so medium was already writing every program. medium
// -> low is different. In run #160 the sprint triathlete fell to low and it
// shows in the output: six minutes of intervals on her Monday and a weekly
// running volume at roughly half the 22-25 km she tolerates.
//
// A program written at low effort is a delivered program whose quality was
// traded for completion. That is the right trade against delivering nothing,
// and it is not something a report should leave for someone to infer from a
// trace string.
const EFFORT = /(?:^|\s)E0:(low|medium|high)\b/;
const DEESCALATED = /@(low|medium|high)\b/g;

export function effortThatWroteIt(detail) {
  const text = String(detail || '');
  const steps = [...text.matchAll(DEESCALATED)].map((m) => m[1]);
  if (steps.length) return steps[steps.length - 1];
  const opened = text.match(EFFORT);
  return opened ? opened[1] : null;
}

export function unresolvedRulesFrom(detail) {
  const m = String(detail || '').match(UNRESOLVED);
  return m ? m[1].split('+').filter(Boolean) : [];
}

// FAIL: nothing was delivered. DIRTY: a program was delivered and still breaks
// rules. PASS: a program was delivered and breaks none.
export function deliveryVerdict(entry = {}) {
  const unresolved = unresolvedRulesFrom(entry.detail);
  const effort = effortThatWroteIt(entry.detail);
  // Reported alongside the verdict rather than folded into it: a clean program
  // written at low effort is still clean, and still worth a second look.
  const degraded = effort === 'low';
  if (!entry.ok) return { verdict: 'FAIL', unresolved, effort, degraded };
  return { verdict: unresolved.length ? 'DIRTY' : 'PASS', unresolved, effort, degraded };
}
