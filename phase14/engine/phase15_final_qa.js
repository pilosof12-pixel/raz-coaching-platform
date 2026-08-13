import { validatePhase15Program, Phase15QualityError } from './phase15_program_qa.js';
import { endurancePerformanceIntegrityFlags } from './phase15_elite_guardrails.js';
import { resolveExerciseDemo } from '../data/lib/exerciseDemos.js';

function goalText(intake, key) {
  const v = intake?.[key];
  if (Array.isArray(v)) return v.map(String).join(' | ');
  return String(v || '');
}

function parseWeek(program, week=1) {
  const m = String(program || '').match(new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`,'i'));
  if (!m) return null;
  const lines = m[1].split('\n').filter(Boolean);
  if (lines.length < 2) return null;
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(delim).map(x=>x.trim().toLowerCase());
  const idx = Object.fromEntries(header.map((x,i)=>[x,i]));
  return { idx, rows: lines.slice(1).map(x=>x.split(delim)) };
}

function parseWeek1(program) { return parseWeek(program,1); }

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
    } else if (/^(?:Push Press|Z Press|Dumbbell Shoulder Press)$/i.test(ex)) {
      verticalDays.add(r[d] || 'unknown');
    }
  }
  return strictDays.size >= 1 && verticalDays.size >= 2;
}

export function demoCoverageAdvisories(program) {
  const missing = new Set();
  for (let w=1; w<=4; w++) {
    const p=parseWeek(program,w); if (!p) continue;
    const e=p.idx.exercise;
    for (const r of p.rows) {
      const ex=String(r[e]||'').trim();
      if (!ex || /^\s*\[WARMUP\]/i.test(ex)) continue;
      if (!resolveExerciseDemo(ex)) missing.add(ex);
    }
  }
  return [...missing];
}

function marathonStackedProgressionFlags(program,intake={}) {
  const goals=[...(Array.isArray(intake.primary_goals)?intake.primary_goals:[]),...(Array.isArray(intake.secondary_goals)?intake.secondary_goals:[])].map(String).join(' | ');
  if(!/\bmarathon\b/i.test(goals)) return [];
  const weekMetrics=[];
  for(let week=1;week<=4;week++) {
    const p=parseWeek(program,week); if(!p) continue;
    const e=p.idx.exercise,r=p.idx.reps,s=p.idx.sets,n=p.idx.notes;
    let quality=0,easy=0,long=0;
    for(const row of p.rows) {
      const ex=String(row[e]||'');
      if(!/\brun(?:ning)?\b/i.test(ex)) continue;
      const note=n>=0?String(row[n]||''):'';
      const dose=String(r>=0?row[r]||'':'')+' '+note;
      const m=dose.match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
      if(!m) continue;
      const km=Number(m[1]) * Math.max(1,Number(row[s]||1)||1);
      if(/\blong(?:[- ]run)?\b|long aerobic|endurance run/i.test(note)) long+=km;
      else if(/\binterval|quality|threshold|tempo|race pace|target pace|marathon pace\b/i.test(note)) quality+=km;
      else if(/\beasy|zone\s*[- ]?2|conversational|recovery/i.test(note)||/^\s*\[WARMUP\]/i.test(ex)) easy+=km;
    }
    weekMetrics.push({week,quality,easy,long});
  }
  const flags=[];
  for(let i=1;i<weekMetrics.length;i++) {
    const a=weekMetrics[i-1],b=weekMetrics[i];
    const increases=[b.quality>a.quality,b.easy>a.easy,b.long>a.long].filter(Boolean).length;
    if(increases>1) flags.push({
      code:'MARATHON_STACKED_VOLUME_PROGRESSION',
      message:'Week '+b.week+' increases more than one main running-volume category versus Week '+a.week+'. The authored endurance decision system says progress/regress one main variable according to adaptation and recovery. Choose one main progression lever for this transition and hold the other running-volume categories stable.'
    });
  }
  return flags;
} // MARATHON-STACKED-PROGRESSION-QA

export function validatePhase15FinalProgram(program, intake={}) {
  let baseResult={ok:true,flags:[]};
  try {
    baseResult=validatePhase15Program(program,intake);
  } catch (err) {
    if (!(err instanceof Phase15QualityError) || !Array.isArray(err.flags)) throw err;
    let flags = err.flags.slice();
    if (overheadVariationPass(program,intake)) {
      flags = flags.filter(f => f.code !== 'STRICT_OHP_SPECIFICITY_UNDERDOSED');
    }
    if (flags.length) throw new Phase15QualityError(flags);
  }

  // Week 1 is covered by validatePhase15Program above. Re-run the authored
  // endurance integrity floor on Weeks 2-4 so a later-week pace/frequency
  // regression cannot bypass client-visible final QA.
  for(let week=2;week<=4;week++) {
    const p=parseWeek(program,week);
    if(!p) continue;
    const parsed={idx:p.idx,rows:p.rows.map(cells=>({cells}))};
    const flags=endurancePerformanceIntegrityFlags(program,intake,parsed);
    if(flags.length) throw new Phase15QualityError(flags.map(flag=>({...flag,message:'Week '+week+': '+flag.message})));
  } // ENDURANCE-ALL-WEEKS-FINAL-QA

  const marathonProgressionFlags=marathonStackedProgressionFlags(program,intake);
  if(marathonProgressionFlags.length) throw new Phase15QualityError(marathonProgressionFlags);

  // Direct demo links are supplemental UI metadata, not a coaching-safety gate.
  // The browser resolver remains direct-only: when no curated URL exists it
  // simply renders no demo link. Never replace a valid coaching program with a
  // different exercise merely to satisfy video coverage, and never fall back to
  // a search-results URL. DEMO-COVERAGE-ADVISORY-NOT-BLOCKING
  const missingDemoExercises=demoCoverageAdvisories(program);
  return {...baseResult,missing_demo_exercises:missingDemoExercises};
}
