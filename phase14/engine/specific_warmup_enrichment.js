function roundTo2p5(n) {
  return Math.max(0, Math.round(Number(n || 0) / 2.5) * 2.5);
}

function parseKg(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}

function parseAddedKg(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^\s*\+\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}

function parsePercent(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^\s*(\d+(?:\.\d+)?)\s*%\b/i);
  return m ? Number(m[1]) : null;
}

function exerciseFamily(name) {
  const n = String(name || '').toLowerCase();
  if (/deadlift|romanian deadlift|\brdl\b/.test(n)) return 'hinge';
  if (/squat|split squat|lunge|step-up|leg press/.test(n)) return 'squat';
  if (/pull-up|chin-up|row|lat pulldown|muscle-up/.test(n)) return 'pull';
  if (/overhead press|push press|shoulder press/.test(n)) return 'overhead';
  if (/bench press|push-up|dip|chest press/.test(n)) return 'horizontal_push';
  return 'other';
}

// Exported so a later load-stabilising normalizer can REGENERATE the ramp from
// the final work prescription instead of string-patching the stale one. Warm-up
// text must always be derived from the load actually prescribed on the day.
export function rampText(exercise, load) {
  if (/backpack\s+carry|ruck|loaded\s+march|farmer(?:'s)?\s+carry|suitcase\s+carry/i.test(String(exercise || ''))) return '';
  const added = parseAddedKg(load);
  if (added != null && /pull-up|chin-up/i.test(exercise)) {
    const a = roundTo2p5(added * 0.35);
    const b = roundTo2p5(added * 0.7);
    return `Ramp ${exercise}: bodyweight x 5, +${a} kg x 3, +${b} kg x 2 before +${added} kg work sets.`;
  }

  const kg = parseKg(load);
  if (kg != null && kg >= 20) {
    const a = roundTo2p5(kg * 0.4);
    const b = roundTo2p5(kg * 0.6);
    const c = roundTo2p5(kg * 0.78);
    return `Ramp ${exercise}: ${a} kg x 5, ${b} kg x 3, ${c} kg x 1-2 before ${roundTo2p5(kg)} kg work sets.`;
  }

  const pct = parsePercent(load);
  if (pct != null && pct >= 35) {
    const a = Math.max(20, Math.round(pct * 0.4 / 5) * 5);
    const b = Math.max(a + 5, Math.round(pct * 0.62 / 5) * 5);
    const c = Math.max(b + 5, Math.round(pct * 0.8 / 5) * 5);
    return `Ramp ${exercise}: ${a}% x 5, ${b}% x 3, ${Math.min(c, Math.max(a, pct - 5))}% x 1-2 before ${pct}% work sets.`;
  }

  return '';
}

function rampMagnitude(load) {
  const added = parseAddedKg(load);
  if (added != null) return added;
  const kg = parseKg(load);
  if (kg != null) return kg;
  const pct = parsePercent(load);
  return pct == null ? -1 : pct;
}

function normalizedExerciseKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function priorityRampRows(work) {
  // Top-set + back-off prescriptions for the same movement are one training
  // exposure and need one ramp, not a second warm-up sequence before back-offs.
  // Keep movement order, retain the heaviest parseable target, and do this for
  // every loaded movement on the day. The old two-movement cap could leave an
  // otherwise valid heavy lift with no ramp and made the validator impossible to
  // satisfy deterministically on mixed strength days.
  const byMovement = new Map();
  work.forEach((entry, order) => {
    const exercise = String(entry.exercise || '');
    const key = normalizedExerciseKey(exercise);
    if (!key) return;
    const load = String(entry.weight || '');
    if (!rampText(exercise, load)) return;
    const magnitude = rampMagnitude(load);
    const previous = byMovement.get(key);
    if (!previous || magnitude > previous.magnitude) {
      byMovement.set(key, { ...entry, order: previous?.order ?? order, magnitude });
    }
  });
  return [...byMovement.values()].sort((a, b) => a.order - b.order);
}

// A Hebrew client received Hebrew coaching notes with English drill lists
// inside them. Every mixed-language fragment in the delivered Hebrew program
// came from here: five strings, twelve appearances each.
//
// The convention this settles: an exercise NAME stays English, because the
// dictionary is English-canonical and the hallucination gate and every repair
// key on it -- and Israeli lifters use English movement names in the gym. A
// drill list inside a note is not a name, it is coaching prose, so it is
// written in the athlete's language like the rest of the note around it.
const DRILLS = {
  en: {
    hinge: ['Hip-hinge drill x 8', 'Glute bridge x 10'],
    squat: ['Squat-and-reach x 6', 'Bodyweight squat x 8'],
    pull: ['Scapular pull-up 2 x 5-6', 'Band pull-apart x 10-12'],
    overhead: ['Band shoulder pass-through x 10', 'Wall slide x 8'],
    push: ['Band shoulder pass-through x 10', 'Scapular push-up x 8'],
  },
  he: {
    hinge: ['\u05ea\u05e8\u05d2\u05d9\u05dc \u05e6\u05d9\u05e8 \u05d9\u05e8\u05da x 8', '\u05d2\u05e9\u05e8 \u05d9\u05e9\u05d1\u05df x 10'],
    squat: ['\u05e1\u05e7\u05d5\u05d5\u05d0\u05d8 \u05e2\u05dd \u05d4\u05d5\u05e9\u05d8\u05d4 x 6', '\u05e1\u05e7\u05d5\u05d5\u05d0\u05d8 \u05de\u05e9\u05e7\u05dc \u05d2\u05d5\u05e3 x 8'],
    pull: ['\u05de\u05ea\u05d7 \u05e1\u05e7\u05e4\u05d5\u05dc\u05e8\u05d9 2 x 5-6', '\u05e4\u05ea\u05d9\u05d7\u05ea \u05d2\u05d5\u05de\u05d9\u05d9\u05d4 x 10-12'],
    overhead: ['\u05d4\u05e2\u05d1\u05e8\u05ea \u05d2\u05d5\u05de\u05d9\u05d9\u05d4 \u05de\u05e2\u05dc \u05d4\u05e8\u05d0\u05e9 x 10', '\u05d4\u05d7\u05dc\u05e7\u05ea \u05e7\u05d9\u05e8 x 8'],
    push: ['\u05d4\u05e2\u05d1\u05e8\u05ea \u05d2\u05d5\u05de\u05d9\u05d9\u05d4 \u05de\u05e2\u05dc \u05d4\u05e8\u05d0\u05e9 x 10', '\u05e9\u05db\u05d9\u05d1\u05ea \u05e1\u05de\u05d9\u05db\u05d4 \u05e1\u05e7\u05e4\u05d5\u05dc\u05e8\u05d9\u05ea x 8'],
  },
};

function drillList(families, lang = 'en') {
  const table = DRILLS[lang] || DRILLS.en;
  const drills = [];
  if (families.has('hinge')) drills.push(...table.hinge);
  if (families.has('squat')) drills.push(...table.squat);
  if (families.has('pull')) drills.push(...table.pull);
  if (families.has('overhead')) drills.push(...table.overhead);
  if (families.has('horizontal_push') && !families.has('overhead')) drills.push(...table.push);
  return [...new Set(drills)].slice(0, 6);
}

function isWarmupExercise(raw) {
  return /^\s*\[WARMUP\](?:\s|$)/i.test(String(raw || '').trim());
}

function isRunExercise(raw) {
  return /^\s*(?:run|running)\s*$/i.test(String(raw || '').trim());
}

function numericSets(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function isHardRunRow({ exercise, sets, reps, notes }) {
  if (!isRunExercise(exercise)) return false;
  const repText = String(reps || '').toLowerCase();
  const noteText = String(notes || '').toLowerCase();
  return numericSets(sets) >= 3 ||
    /\b(?:interval|repeat|repeats|vo2|maximal aerobic|3k pace|5k pace)\b/.test(noteText) ||
    /\b(?:200|300|400|500|600|800|1000)\s*m\b/.test(repText);
}

function hasSpecificRunPrep(text) {
  return /easy jog|easy run|strides?|running drills?|ankling|a-skip|b-skip|jog(?:ging)? before|run(?:ning)? before/i.test(String(text || ''));
}

function hasRampAlready(text, exercise, load) {
  const s = String(text || '');
  const escaped = String(exercise || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (escaped && new RegExp(`Ramp\\s+${escaped}\\s*:`, 'i').test(s)) return true;

  const kg = parseKg(load);
  if (kg != null && new RegExp(`before\\s+${String(roundTo2p5(kg)).replace('.', '\\.')}\\s*kg\\s+work`, 'i').test(s)) return true;
  const added = parseAddedKg(load);
  if (added != null && new RegExp(`before\\s+\\+${String(added).replace('.', '\\.')}\\s*kg\\s+work`, 'i').test(s)) return true;
  const pct = parsePercent(load);
  if (pct != null && new RegExp(`before\\s+${String(pct).replace('.', '\\.')}%\\s+work`, 'i').test(s)) return true;
  return false;
}

function appendUnique(parts, text) {
  const value = String(text || '').trim();
  if (!value) return;
  const combined = parts.join(' | ').toLowerCase();
  if (!combined.includes(value.toLowerCase())) parts.push(value);
}

function makeWarmupCells(headerLength, index, day, note, hardRun) {
  const cells = Array(headerLength).fill('');
  cells[index.day] = day;
  cells[index.exercise] = '[WARMUP]';
  if (Number.isInteger(index.weight)) cells[index.weight] = 'N/A';
  if (Number.isInteger(index.sets)) cells[index.sets] = '1';
  if (Number.isInteger(index.reps)) cells[index.reps] = hardRun ? '10 min' : '8 min';
  if (Number.isInteger(index.rest)) cells[index.rest] = 'N/A';
  if (Number.isInteger(index['target rpe'])) cells[index['target rpe']] = '3';
  if (Number.isInteger(index.notes)) cells[index.notes] = note;
  if (Number.isInteger(index.results)) cells[index.results] = '';
  return cells;
}

function enrichWeekBlock(block, lang = 'en') {
  const lines = String(block || '').split('\n');
  if (lines.length < 2) return block;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const dayIdx = index.day;
  const exIdx = index.exercise;
  const weightIdx = index.weight;
  const setsIdx = index.sets;
  const repsIdx = index.reps;
  const notesIdx = index.notes;
  if ([dayIdx, exIdx, weightIdx, notesIdx].some((x) => !Number.isInteger(x))) return block;

  const rows = lines.slice(1).map((line) => line.split('\t'));
  const days = new Map();
  rows.forEach((cells, i) => {
    const day = String(cells[dayIdx] || '').trim();
    if (!day) return;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push({ cells, i });
  });

  const insertions = [];
  for (const [day, entries] of days.entries()) {
    const work = entries.filter(({ cells }) => {
      const ex = String(cells[exIdx] || '').trim();
      return ex && !isWarmupExercise(ex) && !/cool[- ]?down/i.test(String(cells[notesIdx] || ''));
    });
    if (!work.length) continue;

    const families = new Set(work.map(({ cells }) => exerciseFamily(cells[exIdx])));
    const drills = drillList(families, lang);
    const rampWork = priorityRampRows(work.map(({ cells }) => ({
      exercise: cells[exIdx],
      weight: cells[weightIdx],
    })));
    const hardRun = work.some(({ cells }) => isHardRunRow({
      exercise: cells[exIdx],
      sets: Number.isInteger(setsIdx) ? cells[setsIdx] : '',
      reps: Number.isInteger(repsIdx) ? cells[repsIdx] : '',
      notes: cells[notesIdx],
    }));

    const warmups = entries.filter(({ cells }) => isWarmupExercise(cells[exIdx]));
    const existing = warmups.length ? String(warmups[0].cells[notesIdx] || '').trim() : '';
    const parts = existing ? [existing] : [];

    if (hardRun && !hasSpecificRunPrep(existing)) {
      appendUnique(parts, 'Easy jog 6-8 min; dynamic running drills; 3 relaxed strides before the hard running work');
    }

    for (const drill of drills) appendUnique(parts, drill);
    for (const row of rampWork) {
      if (!hasRampAlready(parts.join('; '), row.exercise, row.weight)) {
        appendUnique(parts, rampText(row.exercise, row.weight));
      }
    }

    const needsWarmup = hardRun || rampWork.length > 0;
    if (!warmups.length) {
      if (!needsWarmup) continue;
      insertions.push({
        index: Math.min(...entries.map((entry) => entry.i)),
        cells: makeWarmupCells(header.length, index, day, parts.join('; '), hardRun),
      });
      continue;
    }

    if (!parts.length) continue;
    // No closing boilerplate. The drills are listed in the note already, so the
    // sentence added nothing this day did not show, and repeating it verbatim on
    // every session of every week is what makes an output read as templated
    // rather than coached. It was English too, so it surfaced untranslated in
    // the middle of Hebrew programs.
    warmups[0].cells[notesIdx] = parts.join('; ');

    // One warm-up block per session. Only the first was ever enriched, so a day
    // that already had a general warm-up and then picked up a specific one
    // carried both -- the Hebrew lifter got a skipping warm-up that listed band
    // pull-aparts, and a separate band pull-apart warm-up underneath it.
    for (let i = 1; i < warmups.length; i += 1) {
      const extra = String(warmups[i].cells[notesIdx] || '').trim();
      if (extra) {
        const merged = parts.slice();
        for (const piece of extra.split(/\s*;\s*/)) appendUnique(merged, piece.trim());
        warmups[0].cells[notesIdx] = merged.join('; ');
      }
      warmups[i].cells.dropRow = true;
    }
  }

  // Insert from bottom to top so each recorded original row index remains valid.
  insertions.sort((a, b) => b.index - a.index);
  for (const insertion of insertions) rows.splice(insertion.index, 0, insertion.cells);

  const kept = rows.filter((cells) => !cells.dropRow);
  return [header.join('\t'), ...kept.map((cells) => cells.join('\t'))].join('\n');
}

export function enrichSpecificWarmups(program, intake = {}) {
  let out = String(program || '');
  // The athlete's language, so the drills inside a note are written in the same
  // language as the note. Defaulted, so every existing caller keeps English.
  const lang = String(intake?.language || 'en').toLowerCase().startsWith('he') ? 'he' : 'en';
  for (let week = 1; week <= 4; week++) {
    const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
    out = out.replace(re, (_m, start, block, end) => start + enrichWeekBlock(block, lang) + end);
  }
  return out;
}
