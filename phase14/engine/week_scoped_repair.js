// A repair rewrites the weeks that are wrong, not the whole program.
//
// Every repair attempt asked the model for the COMPLETE program again: about
// 25,000 characters and 150-250 seconds, to fix a defect that usually lives in
// one week. Run #163's triathlete spent two of those on Week 4 alone. When
// every rule that failed names the weeks it failed in, and that is not all
// four, the model is asked for those weeks' blocks only. They are spliced into
// the candidate and the WHOLE program is validated again, so a rewritten week
// that breaks a cross-week rule is caught exactly as before. Anything the
// splice cannot place falls back to the full repair.

const RETURN_FULL = 'Return the COMPLETE corrected client program with all four START_WEEKn_TSV / END_WEEKn_TSV blocks. Return no repair commentary outside the normal client-facing deliverable.';

function weeksIn(value, out) {
  if (value == null) return;
  if (Array.isArray(value)) { value.forEach((v) => weeksIn(v, out)); return; }
  if (typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    if ((k === 'week' || k === 'from_week' || k === 'to_week') && Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 4) out.add(Number(v));
    else if (k !== 'source_error') weeksIn(v, out);
  }
}

// The weeks every failing rule points at, or null when any of them does not
// say (a block-level or cross-week rule), or when the answer is all four.
export function weeksImplicatedBy(flags = []) {
  const list = Array.isArray(flags) ? flags : [];
  if (!list.length) return null;
  const all = new Set();
  for (const flag of list) {
    const found = new Set();
    weeksIn(flag?.details ?? flag, found);
    if (!found.size) {
      for (const m of String(flag?.amendment || flag?.message || '').matchAll(/\bWeek\s+([1-4])\b/g)) found.add(Number(m[1]));
    }
    if (!found.size) return null;
    found.forEach((w) => all.add(w));
  }
  if (!all.size || all.size >= 4) return null;
  return [...all].sort((a, b) => a - b);
}

export function scopeRepairPrompt(prompt, weeks) {
  const label = weeks.length === 1 ? `Week ${weeks[0]}` : `Weeks ${weeks.join(', ')}`;
  const blocks = weeks.map((w) => `START_WEEK${w}_TSV ... END_WEEK${w}_TSV`).join(' and ');
  const instruction = `WEEK-SCOPED REPAIR: the defects are in ${label} only. Return ONLY the corrected ${blocks} block${weeks.length > 1 ? 's' : ''}, complete, with the same header. Do not return any other week, the introduction or the progression notes; everything you do not return is kept exactly as it is. Keep the rewritten week consistent with the weeks around it.`;
  const src = String(prompt || '');
  return src.includes(RETURN_FULL) ? src.replace(RETURN_FULL, instruction) : `${src}\n\n${instruction}`;
}

function block(text, week) {
  const m = String(text || '').match(new RegExp(`START_WEEK${week}_TSV\\s*\\n[\\s\\S]*?\\nEND_WEEK${week}_TSV`, 'i'));
  return m ? m[0] : null;
}

// The candidate with the returned weeks put in place, or null when the reply
// does not carry every requested week (the caller then repairs in full).
export function spliceWeekBlocks(candidate, reply, weeks) {
  let out = String(candidate || '');
  for (const w of weeks) {
    const fresh = block(reply, w);
    const old = block(out, w);
    if (!fresh || !old) return null;
    out = out.replace(old, () => fresh);
  }
  return out;
}
