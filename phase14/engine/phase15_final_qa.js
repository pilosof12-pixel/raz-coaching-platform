import { validatePhase15Program, Phase15QualityError } from './phase15_program_qa.js';

function goalText(intake, key) {
  const v = intake?.[key];
  if (Array.isArray(v)) return v.map(String).join(' | ');
  return String(v || '');
}

function parseWeek1(program) {
  const m = String(program || '').match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i);
  if (!m) return null;
  const lines = m[1].split('\n').filter(Boolean);
  if (lines.length < 2) return null;
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(delim).map(x=>x.trim().toLowerCase());
  const idx = Object.fromEntries(header.map((x,i)=>[x,i]));
  return { idx, rows: lines.slice(1).map(x=>x.split(delim)) };
}

function overheadVariationPass(program, intake) {
  const secondary = goalText(intake,'secondary_goals');
  if (!/strict overhead press|\bohp\b/i.test(secondary)) return true;
  const p = parseWeek1(program); if (!p) return false;
  const e = p.idx.exercise, d = p.idx.day;
  const strictDays = new Set();
  const verticalDays = new Set();
  for (const r of p.rows) {
    const ex = r[e] || '';
    if (/^\s*\[WARMUP\]/i.test(ex)) continue;
    if (/^(?:Overhead Press|Standing Barbell Overhead Press)$/i.test(ex)) {
      strictDays.add(r[d] || 'unknown'); verticalDays.add(r[d] || 'unknown');
    } else if (/^Push Press$/i.test(ex)) {
      verticalDays.add(r[d] || 'unknown');
    }
  }
  return strictDays.size >= 1 && verticalDays.size >= 2;
}

export function validatePhase15FinalProgram(program, intake={}) {
  try {
    return validatePhase15Program(program,intake);
  } catch (err) {
    if (!(err instanceof Phase15QualityError) || !Array.isArray(err.flags)) throw err;
    let flags = err.flags.slice();
    if (overheadVariationPass(program,intake)) {
      flags = flags.filter(f => f.code !== 'STRICT_OHP_SPECIFICITY_UNDERDOSED');
    }
    if (flags.length) throw new Phase15QualityError(flags);
    return {ok:true,flags:[]};
  }
}
