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

export function unresolvedRulesFrom(detail) {
  const m = String(detail || '').match(UNRESOLVED);
  return m ? m[1].split('+').filter(Boolean) : [];
}

// FAIL: nothing was delivered. DIRTY: a program was delivered and still breaks
// rules. PASS: a program was delivered and breaks none.
export function deliveryVerdict(entry = {}) {
  const unresolved = unresolvedRulesFrom(entry.detail);
  if (!entry.ok) return { verdict: 'FAIL', unresolved };
  return { verdict: unresolved.length ? 'DIRTY' : 'PASS', unresolved };
}
