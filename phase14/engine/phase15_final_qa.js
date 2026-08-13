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

export function marathonStackedProgressionFlags(program,intake={}) {
  const goals=[...(Array.isArray(intake.primary_goals)?intake.primary_goals:[]),...(Array.isArray(intake.secondary_goals)?intake.secondary_goals:[])].map(String).join(' | ');
  if(!/\bmarathon\b/i.test(goals)) return [];
  const paceSeconds=text=>{const m=String(text||'').match(/\b(\d{1,2}):([0-5]\d)\s*\/\s*km\b/i);return m?Number(m[1])*60+Number(m[2]):null;};
  const maxMinutes=text=>{const a=[...String(text||'').matchAll(/\b(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/ig)].map(m=>Number(m[1]));return a.length?Math.max(...a):0;};
  const maxKm=text=>{const a=[...String(text||'').matchAll(/\b(\d+(?:\.\d+)?)\s*km\b/ig)].map(m=>Number(m[1]));return a.length?Math.max(...a):0;};
  const weekMetrics=[];
  for(let week=1;week<=4;week++) {
    const p=parseWeek(program,week); if(!p) continue;
    const e=p.idx.exercise,r=p.idx.reps,s=p.idx.sets,n=p.idx.notes,w=p.idx.weight;
    const metric={week,quality:{volume:0,pace:null},easy:{volume:0},long:{volume:0}};
    for(const row of p.rows) {
      const ex=String(row[e]||'');
      if(!/\brun(?:ning)?\b/i.test(ex)) continue;
      const note=n>=0?String(row[n]||''):'';
      const dose=[r>=0?row[r]||'':'',w>=0?row[w]||'':'',note].join(' ');
      const sets=Math.max(1,Number(s>=0?row[s]||1:1)||1);
      const km=maxKm(dose)*sets;
      const minutes=maxMinutes(dose)*sets;
      // Compare like-for-like dose dimensions. Distance is preferred when supplied;
      // otherwise duration is the external-volume anchor for that row.
      const volume=km>0?km:minutes;
      if(/\blong(?:[- ]run)?\b|long aerobic|endurance run/i.test(note)) metric.long.volume+=volume;
      else if(/\binterval|quality|threshold|tempo|race pace|target pace|marathon pace\b/i.test(note)) {
        metric.quality.volume+=volume;
        const psec=paceSeconds(dose); if(psec!=null) metric.quality.pace=metric.quality.pace==null?psec:Math.min(metric.quality.pace,psec);
      }
      else if(/\beasy|zone\s*[- ]?2|conversational|recovery/i.test(note)) metric.easy.volume+=volume;
    }
    weekMetrics.push(metric);
  }
  const flags=[];
  for(let i=1;i<weekMetrics.length;i++) {
    const a=weekMetrics[i-1],b=weekMetrics[i];
    const qualityVolumeUp=b.quality.volume>a.quality.volume;
    const qualityPaceUp=a.quality.pace!=null&&b.quality.pace!=null&&b.quality.pace<a.quality.pace;
    const easyUp=b.easy.volume>a.easy.volume;
    const longUp=b.long.volume>a.long.volume;
    if(qualityVolumeUp&&qualityPaceUp) flags.push({
      code:'MARATHON_QUALITY_DOUBLE_PROGRESSION',
      message:'Week '+b.week+' makes the quality run both longer/more voluminous and faster than Week '+a.week+'. The authored endurance framework says progress one main variable at a time. Choose pace/intensity OR accumulated quality work for this transition, not both. If pace progresses, copy the prior week quality duration/distance unchanged. If accumulated quality work progresses, copy the prior week pace unchanged.'
    });
    const categoryIncreases=[qualityVolumeUp||qualityPaceUp,easyUp,longUp].filter(Boolean).length;
    if(categoryIncreases>1) flags.push({
      code:'MARATHON_STACKED_VOLUME_PROGRESSION',
      message:'Week '+b.week+' progresses more than one main running category versus Week '+a.week+'. The authored endurance decision system says progress/regress one main variable according to adaptation and recovery. Choose one main progression lever for this transition and copy the non-selected category prescriptions from Week '+a.week+' unchanged. If long-run volume progresses, keep quality and routine easy volume unchanged; if quality progresses, keep long-run and easy volume unchanged; if easy volume progresses, keep quality and long-run prescriptions unchanged.'
    });
  }
  return flags;
} // MARATHON-STACKED-PROGRESSION-QA

export function marathonStrengthMaintenanceFlags(program,intake={}) {
  const primary=goalText(intake,'primary_goals');
  const secondary=goalText(intake,'secondary_goals');
  if(!/\bmarathon\b/i.test(primary)||!/(?:maintain|maintenance)[^|]{0,40}strength|stay durable|durability/i.test(secondary)) return [];
  const lower=/\b(?:back squat|front squat|box squat|deadlift|romanian deadlift|rdl|lunge|split squat|hip thrust|leg press|step-up)\b/i;
  const repHigh=x=>{const a=[...String(x||'').matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));return a.length?Math.max(...a):null;};
  const rpeHigh=x=>{const a=[...String(x||'').matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));return a.length?Math.max(...a):null;};
  const weeks=[];
  for(let week=1;week<=4;week++) {
    const p=parseWeek(program,week); if(!p) continue;
    const map=new Map();
    for(const row of p.rows) {
      const ex=String(row[p.idx.exercise]||'').trim(); if(!lower.test(ex)) continue;
      map.set(ex.toLowerCase(),{ex,reps:repHigh(row[p.idx.reps]),rpe:rpeHigh(row[p.idx['target rpe']])});
    }
    weeks.push({week,map});
  }
  if(weeks.length<2) return [];
  const first=weeks[0].map,last=weeks[weeks.length-1].map;
  const progressed=[];
  for(const [key,a] of first) {
    const b=last.get(key); if(!b||a.reps==null||b.reps==null||a.rpe==null||b.rpe==null) continue;
    if(b.reps>a.reps&&b.rpe>a.rpe) progressed.push(a.ex);
  }
  const totalComparable=[...first.keys()].filter(k=>last.has(k)).length;
  if(progressed.length>=2 && progressed.length>=Math.ceil(totalComparable/2)) return [{
    code:'MARATHON_STRENGTH_MAINTENANCE_OVERLOAD',
    message:'Strength is a maintenance/support goal behind marathon performance, but multiple lower-body support movements increase both rep demand and RPE across the block ('+progressed.join(', ')+'). The authored concurrent-training source says endurance-priority athletes should protect key endurance work and use strength supportively at a recoverable dose. Keep the maintenance dose stable/low-cost rather than turning several lower-body accessories into a simultaneous progressive overload block.'
  }];
  return [];
} // MARATHON-STRENGTH-MAINTENANCE-QA

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

  const marathonStrengthFlags=marathonStrengthMaintenanceFlags(program,intake);
  if(marathonStrengthFlags.length) throw new Phase15QualityError(marathonStrengthFlags);

  // Direct demo links are supplemental UI metadata, not a coaching-safety gate.
  // The browser resolver remains direct-only: when no curated URL exists it
  // simply renders no demo link. Never replace a valid coaching program with a
  // different exercise merely to satisfy video coverage, and never fall back to
  // a search-results URL. DEMO-COVERAGE-ADVISORY-NOT-BLOCKING
  const missingDemoExercises=demoCoverageAdvisories(program);
  return {...baseResult,missing_demo_exercises:missingDemoExercises};
}
