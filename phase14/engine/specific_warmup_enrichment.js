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

function exerciseFamily(name) {
  const n = String(name || '').toLowerCase();
  if (/deadlift|romanian deadlift|\brdl\b/.test(n)) return 'hinge';
  if (/squat|split squat|lunge|step-up|leg press/.test(n)) return 'squat';
  if (/pull-up|chin-up|row|lat pulldown|muscle-up/.test(n)) return 'pull';
  if (/overhead press|push press|shoulder press/.test(n)) return 'overhead';
  if (/bench press|push-up|dip|chest press/.test(n)) return 'horizontal_push';
  return 'other';
}

function rampText(exercise, load) {
  const added = parseAddedKg(load);
  if (added != null && /pull-up|chin-up/i.test(exercise)) {
    const a = roundTo2p5(added * 0.35);
    const b = roundTo2p5(added * 0.7);
    return `Ramp ${exercise}: bodyweight x 5, +${a} kg x 3, +${b} kg x 2 before +${added} kg work sets.`;
  }

  const kg = parseKg(load);
  if (kg == null || kg < 20) return '';
  const a = roundTo2p5(kg * 0.4);
  const b = roundTo2p5(kg * 0.6);
  const c = roundTo2p5(kg * 0.78);
  return `Ramp ${exercise}: ${a} kg x 5, ${b} kg x 3, ${c} kg x 1-2 before ${roundTo2p5(kg)} kg work sets.`;
}

function drillText(families) {
  const drills = [];
  if (families.has('hinge')) drills.push('Hip-hinge drill x 8', 'Glute bridge x 10');
  if (families.has('squat')) drills.push('Squat-and-reach x 6', 'Bodyweight squat x 8');
  if (families.has('pull')) drills.push('Scapular pull-up 2 x 5-6', 'Band pull-apart x 10-12');
  if (families.has('overhead')) drills.push('Band shoulder pass-through x 10', 'Wall slide x 8');
  if (families.has('horizontal_push') && !families.has('overhead')) drills.push('Band shoulder pass-through x 10', 'Scapular push-up x 8');
  return [...new Set(drills)].slice(0, 4).join('; ');
}

function enrichWeekBlock(block) {
  const lines = String(block || '').split('\n');
  if (lines.length < 2) return block;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const dayIdx = index.day;
  const exIdx = index.exercise;
  const weightIdx = index.weight;
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

  for (const entries of days.values()) {
    const work = entries.filter(({ cells }) => {
      const ex = String(cells[exIdx] || '').trim();
      return ex && !/^\[WARMUP\]$/i.test(ex) && !/cool[- ]?down/i.test(String(cells[notesIdx] || ''));
    });
    if (!work.length) continue;

    const warmups = entries.filter(({ cells }) => /^\[WARMUP\]$/i.test(String(cells[exIdx] || '').trim()));
    if (!warmups.length) continue;

    const families = new Set(work.map(({ cells }) => exerciseFamily(cells[exIdx])));
    const drills = drillText(families);
    const ramps = work
      .map(({ cells }) => rampText(cells[exIdx], cells[weightIdx]))
      .filter(Boolean)
      .slice(0, 2);

    // Preserve authored running-specific warm-ups. Enrich generic gym warm-ups.
    for (const warm of warmups) {
      const existing = String(warm.cells[notesIdx] || '').trim();
      if (/easy jog|strides?|running drills?|ankling|a-skip|b-skip/i.test(existing)) continue;
      const parts = [];
      if (drills) parts.push(drills);
      parts.push(...ramps);
      if (!parts.length) continue;
      warm.cells[notesIdx] = parts.join('; ') + ' Keep the warm-up specific and non-fatiguing.';
    }
  }

  return [header.join('\t'), ...rows.map((cells) => cells.join('\t'))].join('\n');
}

export function enrichSpecificWarmups(program) {
  let out = String(program || '');
  for (let week = 1; week <= 4; week++) {
    const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
    out = out.replace(re, (_m, start, block, end) => start + enrichWeekBlock(block) + end);
  }
  return out;
}
