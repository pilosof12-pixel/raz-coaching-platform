import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function secondaryText(intake = {}) { return arr(intake.secondary_goals).map(String).join(' | '); }
function isWarmup(name) { return /^\s*\[WARMUP\](?:\s|$)/i.test(String(name || '').trim()); }
function isRunLike(name) { return /^(?:run|running|bike|cycling|row|rowing|swim|ruck|backpack carry)$/i.test(String(name || '').trim()); }

function parseWeek(program, weekNumber) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  if (!Number.isInteger(index.day) || !Number.isInteger(index.exercise)) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return { re, match, header, index, rows };
}

function makePushPressRow(parsed, day, weekNumber) {
  const cells = Array(parsed.header.length).fill('');
  cells[parsed.index.day] = day;
  cells[parsed.index.exercise] = 'Push Press';
  if (Number.isInteger(parsed.index.weight)) cells[parsed.index.weight] = 'RPE-selected load';
  if (Number.isInteger(parsed.index.sets)) cells[parsed.index.sets] = weekNumber === 4 ? '1' : '2';
  if (Number.isInteger(parsed.index.reps)) cells[parsed.index.reps] = '3';
  if (Number.isInteger(parsed.index.rest)) cells[parsed.index.rest] = '2-3 min';
  if (Number.isInteger(parsed.index['target rpe'])) cells[parsed.index['target rpe']] = weekNumber === 4 ? '6' : '6-7';
  if (Number.isInteger(parsed.index.notes)) {
    cells[parsed.index.notes] = weekNumber === 4
      ? 'Low-cost complementary vertical-press microdose. Keep it fast and easy in consolidation week; no grinders.'
      : 'Low-cost complementary vertical-press microdose. Crisp dip and drive; stop well before grinding so strict OHP and MMA recovery stay protected.';
  }
  if (Number.isInteger(parsed.index.results)) cells[parsed.index.results] = '';
  return cells;
}

function rowName(parsed, cells) { return String(cells[parsed.index.exercise] || '').trim(); }
function rowDay(parsed, cells) { return String(cells[parsed.index.day] || '').trim(); }

function chooseTargetDay(parsed) {
  const ohpDays = new Set(parsed.rows.filter((cells) => /^overhead press$/i.test(rowName(parsed, cells))).map((cells) => rowDay(parsed, cells)));
  const candidates = new Map();
  parsed.rows.forEach((cells, i) => {
    const exercise = rowName(parsed, cells);
    const day = rowDay(parsed, cells);
    if (!day || !exercise || isWarmup(exercise) || isRunLike(exercise)) return;
    if (!candidates.has(day)) candidates.set(day, { day, rows: 0, insertAfter: i + 1, hasPrimaryAnchor: false });
    const entry = candidates.get(day);
    entry.rows += 1;
    entry.insertAfter = i + 1;
    if (/^(?:back squat|one-arm pull-up)$/i.test(exercise)) entry.hasPrimaryAnchor = true;
  });

  const ranked = [...candidates.values()].filter((x) => !ohpDays.has(x.day));
  if (!ranked.length) return [...candidates.values()][0] || null;
  ranked.sort((a, b) => Number(b.hasPrimaryAnchor) - Number(a.hasPrimaryAnchor) || a.rows - b.rows);
  return ranked[0];
}

function rewriteWeek(program, parsed) {
  const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
  return program.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
}

function pressDoseFields(parsed) {
  return ['weight', 'sets', 'reps', 'rest', 'target rpe']
    .map((key) => parsed.index[key])
    .filter(Number.isInteger);
}

// Secondary OHP is deliberately held stable in build weeks for a high-concurrency
// athlete whose primary goals are elsewhere. This is not a generic OHP rule. It is
// a deterministic convergence rule for the frozen AH-01 hierarchy: the model may
// not keep solving a recovery-overload rejection by re-progressing the secondary
// press family on every repair attempt. Weeks 2-3 copy the actual Week-1 pressing
// dose; Week 4 may remain lower for consolidation and is never increased here.
function stabilizeSecondaryPressDose(program, intake = {}) {
  if (!isHighConcurrencyHybrid(intake) || !/(?:overhead\s*press|\bohp\b)/i.test(secondaryText(intake))) {
    return { program, repairs: [] };
  }

  let candidate = String(program || '');
  const baseline = parseWeek(candidate, 1);
  if (!baseline) return { program: candidate, repairs: [] };

  const baselineByName = new Map();
  for (const cells of baseline.rows) {
    const name = rowName(baseline, cells);
    if (/^(?:overhead press|push press)$/i.test(name)) baselineByName.set(name.toLowerCase(), cells);
  }
  if (!baselineByName.size) return { program: candidate, repairs: [] };

  const repairs = [];
  for (const week of [2, 3]) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = false;
    const fields = pressDoseFields(parsed);
    for (const cells of parsed.rows) {
      const name = rowName(parsed, cells);
      const base = baselineByName.get(name.toLowerCase());
      if (!base) continue;
      const baseFields = pressDoseFields(baseline);
      // Headers are contract-stable, but map by field name so this remains robust
      // if column positions are ever rearranged in a non-production fixture.
      const keys = ['weight', 'sets', 'reps', 'rest', 'target rpe'];
      for (const key of keys) {
        const dst = parsed.index[key];
        const src = baseline.index[key];
        if (!Number.isInteger(dst) || !Number.isInteger(src)) continue;
        if (cells[dst] !== base[src]) {
          cells[dst] = base[src];
          changed = true;
        }
      }
      if (changed) repairs.push({ week, exercise: name, action: 'hold_secondary_press_at_week1_dose' });
    }
    if (changed) candidate = rewriteWeek(candidate, parsed);
  }
  return { program: candidate, repairs };
}

// The Advanced Hybrid contract requires one strict OHP exposure plus one small
// complementary vertical-press exposure. Repeated live failures showed the model
// can preserve the important strict OHP work yet omit only Push Press on every
// repair attempt. That omission is safe to converge deterministically because the
// authored role is explicitly a low-cost support exposure. This repair NEVER
// invents strict OHP, never changes benchmark-anchored OHP loading, and never adds
// a new training day. If strict OHP is missing, production still fails closed.
export function normalizeAdvancedHybridOHPComplement(program, intake = {}) {
  const original = String(program || '');
  if (!isHighConcurrencyHybrid(intake) || !/(?:overhead\s*press|\bohp\b)/i.test(secondaryText(intake))) {
    return { program: original, repaired: false, repairs: [] };
  }

  let candidate = original;
  const repairs = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const workNames = parsed.rows.map((cells) => rowName(parsed, cells)).filter((name) => name && !isWarmup(name));
    const hasOHP = workNames.some((name) => /^overhead press$/i.test(name));
    const hasPushPress = workNames.some((name) => /^push press$/i.test(name));
    if (!hasOHP || hasPushPress) continue;

    const target = chooseTargetDay(parsed);
    if (!target) continue;
    const pushRow = makePushPressRow(parsed, target.day, week);
    parsed.rows.splice(target.insertAfter, 0, pushRow);
    candidate = rewriteWeek(candidate, parsed);
    repairs.push({ week, day: target.day, exercise: 'Push Press', sets: week === 4 ? 1 : 2 });
  }

  const stabilized = stabilizeSecondaryPressDose(candidate, intake);
  candidate = stabilized.program;
  repairs.push(...stabilized.repairs);

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
