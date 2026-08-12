export function patchPhase15RuntimeSource(input) {
  let s = String(input || '');

  // The old formula safety-net treated every endurance/cardio goal as requiring
  // an EMOM/AMRAP/Zone-2/density-style row. That is not source-grounded: a valid
  // named endurance goal may use continuous, threshold, pace or interval work.
  // Keep this legacy absence check only for goals that explicitly request density.
  const densityLine = /^\s*const DENSITY_DEMANDING_GOAL = \/.*\/;\s*$/m;
  const densityMatches = s.match(new RegExp(densityLine.source, 'gm')) || [];
  if (densityMatches.length !== 1) throw new Error(`Expected one DENSITY_DEMANDING_GOAL line, found ${densityMatches.length}`);
  s = s.replace(densityLine, '    const DENSITY_DEMANDING_GOAL = /(?:emom|amrap|density)/; // source-aligned: only explicit density goals require density rows');

  // Sprint intensity uses speed/quality language, not strength-set RPE. Preserve
  // the speed prescription in Notes and make the TSV Target RPE semantically N/A.
  const fnStart = s.indexOf('function phase15LastMileTsv');
  const fnEnd = s.indexOf('\nfunction privacyScrub', fnStart);
  if (fnStart < 0 || fnEnd < 0) throw new Error('phase15LastMileTsv block not found');
  let block = s.slice(fnStart, fnEnd);
  const pushAnchor = "    out.push(cells.join('\\t'));";
  const pushCount = block.split(pushAnchor).length - 1;
  if (pushCount !== 1) throw new Error(`Expected one phase15LastMileTsv push anchor, found ${pushCount}`);
  block = block.replace(pushAnchor, [
    "    if (/^Sprint$/i.test(ex)) {",
    "      cells[6] = 'N/A';",
    "      const sprintNote = String(cells[7] || '').trim();",
    "      if (!/(speed|velocity|quality|%)/i.test(sprintNote)) cells[7] = sprintNote ? sprintNote + ' Speed/quality target governs intensity; stop before speed drops.' : 'Speed/quality target governs intensity; stop before speed drops.';",
    "    }",
    pushAnchor,
  ].join('\n'));
  s = s.slice(0, fnStart) + block + s.slice(fnEnd);

  // Make the compact-provider instruction say the same thing before generation,
  // reducing how often the deterministic semantic cleanup is needed.
  const oldSprint = 'short acceleration sprints use roughly 90-95% quality effort with about 2-3 minutes full recovery and stop before speed drops.';
  const newSprint = 'short acceleration sprints use roughly 90-95% speed-quality effort with about 2-3 minutes full recovery and stop before speed drops. For Sprint rows, Target RPE is N/A because speed quality, not strength-set RPE, defines intensity.';
  const sprintCount = s.split(oldSprint).length - 1;
  if (sprintCount === 1) s = s.replace(oldSprint, newSprint);

  return s;
}
