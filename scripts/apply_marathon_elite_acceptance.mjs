import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const finalPath=fileURLToPath(new URL('../phase14/engine/phase15_final_qa.js',import.meta.url));
let q=fs.readFileSync(finalPath,'utf8');

const fnMarker=q.includes('export function marathonStackedProgressionFlags(program,intake={}) {')
  ? 'export function marathonStackedProgressionFlags(program,intake={}) {'
  : 'function marathonStackedProgressionFlags(program,intake={}) {';
const fnStart=q.indexOf(fnMarker);
const fnEnd=q.indexOf('} // MARATHON-STACKED-PROGRESSION-QA',fnStart);
if(fnStart<0||fnEnd<0) throw new Error('marathon progression function anchor missing');
const fnEndFull=fnEnd+'} // MARATHON-STACKED-PROGRESSION-QA'.length;
const replacement=`export function marathonStackedProgressionFlags(program,intake={}) {
  const goals=[...(Array.isArray(intake.primary_goals)?intake.primary_goals:[]),...(Array.isArray(intake.secondary_goals)?intake.secondary_goals:[])].map(String).join(' | ');
  if(!/\\bmarathon\\b/i.test(goals)) return [];
  const paceSeconds=text=>{const m=String(text||'').match(/\\b(\\d{1,2}):([0-5]\\d)\\s*\/\\s*km\\b/i);return m?Number(m[1])*60+Number(m[2]):null;};
  const maxMinutes=text=>{const a=[...String(text||'').matchAll(/\\b(\\d+(?:\\.\\d+)?)\\s*(?:min|minutes?)\\b/ig)].map(m=>Number(m[1]));return a.length?Math.max(...a):0;};
  const maxKm=text=>{const a=[...String(text||'').matchAll(/\\b(\\d+(?:\\.\\d+)?)\\s*km\\b/ig)].map(m=>Number(m[1]));return a.length?Math.max(...a):0;};
  const weekMetrics=[];
  for(let week=1;week<=4;week++) {
    const p=parseWeek(program,week); if(!p) continue;
    const e=p.idx.exercise,r=p.idx.reps,s=p.idx.sets,n=p.idx.notes,w=p.idx.weight;
    const metric={week,quality:{volume:0,pace:null},easy:{volume:0},long:{volume:0}};
    for(const row of p.rows) {
      const ex=String(row[e]||'');
      if(!/\\brun(?:ning)?\\b/i.test(ex)) continue;
      const note=n>=0?String(row[n]||''):'';
      const dose=[r>=0?row[r]||'':'',w>=0?row[w]||'':'',note].join(' ');
      const sets=Math.max(1,Number(s>=0?row[s]||1:1)||1);
      const km=maxKm(dose)*sets;
      const minutes=maxMinutes(dose)*sets;
      const volume=km>0?km:minutes;
      if(/\\blong(?:[- ]run)?\\b|long aerobic|endurance run/i.test(note)) metric.long.volume+=volume;
      else if(/\\binterval|quality|threshold|tempo|race pace|target pace|marathon pace\\b/i.test(note)) {
        metric.quality.volume+=volume;
        const psec=paceSeconds(dose); if(psec!=null) metric.quality.pace=metric.quality.pace==null?psec:Math.min(metric.quality.pace,psec);
      }
      else if(/\\beasy|zone\\s*[- ]?2|conversational|recovery/i.test(note)) metric.easy.volume+=volume;
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
      message:'Week '+b.week+' makes the quality run both longer/more voluminous and faster than Week '+a.week+'. The authored endurance framework says progress one main variable at a time; choose pace/intensity OR accumulated quality work for this transition, not both.'
    });
    const categoryIncreases=[qualityVolumeUp||qualityPaceUp,easyUp,longUp].filter(Boolean).length;
    if(categoryIncreases>1) flags.push({
      code:'MARATHON_STACKED_VOLUME_PROGRESSION',
      message:'Week '+b.week+' progresses more than one main running category versus Week '+a.week+'. The authored endurance decision system says progress/regress one main variable according to adaptation and recovery. Choose one main progression lever for this transition and hold the other running categories stable.'
    });
  }
  return flags;
} // MARATHON-STACKED-PROGRESSION-QA`;
q=q.slice(0,fnStart)+replacement+q.slice(fnEndFull);

if(!q.includes('MARATHON-STRENGTH-MAINTENANCE-QA')) {
  const anchor='export function validatePhase15FinalProgram(program, intake={}) {';
  if(!q.includes(anchor)) throw new Error('final QA export anchor missing');
  const helper=`export function marathonStrengthMaintenanceFlags(program,intake={}) {
  const primary=goalText(intake,'primary_goals');
  const secondary=goalText(intake,'secondary_goals');
  if(!/\\bmarathon\\b/i.test(primary)||!/(?:maintain|maintenance)[^|]{0,40}strength|stay durable|durability/i.test(secondary)) return [];
  const lower=/\\b(?:back squat|front squat|box squat|deadlift|romanian deadlift|rdl|lunge|split squat|hip thrust|leg press|step-up)\\b/i;
  const repHigh=x=>{const a=[...String(x||'').matchAll(/\\d+(?:\\.\\d+)?/g)].map(m=>Number(m[0]));return a.length?Math.max(...a):null;};
  const rpeHigh=x=>{const a=[...String(x||'').matchAll(/\\d+(?:\\.\\d+)?/g)].map(m=>Number(m[0]));return a.length?Math.max(...a):null;};
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

`;
  q=q.replace(anchor,helper+anchor);
}

const callAnchor=`  const marathonProgressionFlags=marathonStackedProgressionFlags(program,intake);\n  if(marathonProgressionFlags.length) throw new Phase15QualityError(marathonProgressionFlags);`;
if(!q.includes(callAnchor)) throw new Error('marathon progression call anchor missing');
if(!q.includes('marathonStrengthMaintenanceFlags(program,intake)')) q=q.replace(callAnchor,callAnchor+`\n\n  const marathonStrengthFlags=marathonStrengthMaintenanceFlags(program,intake);\n  if(marathonStrengthFlags.length) throw new Phase15QualityError(marathonStrengthFlags);`);
fs.writeFileSync(finalPath,q);

const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js',import.meta.url));
let e=fs.readFileSync(elitePath,'utf8');
const old="For each build-week transition, choose ONE main running-volume progression lever: quality-session distance, routine easy-run distance/duration, or long-run distance/duration. Hold the other two categories stable rather than escalating them together. Week 1 should start near the documented current workload rather than creating a large step-change.";
const neu="For each build-week transition, choose ONE main running progression lever. Within a quality session, do not increase both pace/intensity and accumulated work in the same transition. Across the week, do not progress quality work, routine easy volume and long-run volume together; hold the other running categories stable. Week 1 should start near the documented current workload rather than creating a large step-change.";
if(!e.includes(neu) && !e.includes('MARATHON SINGLE-LEVER HARD CONTRACT')) {
  if(!e.includes(old)) throw new Error('marathon prompt rule anchor missing');
  e=e.replace(old,neu);
}
if(!e.includes('MARATHON STRENGTH-MAINTENANCE SUPPORT RULE')) {
  const anchor="    } // MARATHON-CURRENT-WEEKLY-VOLUME-PROMPT\n    rules.push(`TARGET-MODALITY INTEGRITY:";
  if(!e.includes(anchor)) throw new Error('marathon prompt insertion anchor missing');
  const insert="    } // MARATHON-CURRENT-WEEKLY-VOLUME-PROMPT\n    if(def.key==='running' && /\\bmarathon\\b/i.test(text) && /(?:maintain|maintenance)[^|]{0,40}strength|stay durable|durability/i.test(list(intake.secondary_goals).map(String).join(' | '))) rules.push('MARATHON STRENGTH-MAINTENANCE SUPPORT RULE: marathon performance is primary and strength is maintenance/support. Protect key endurance sessions and event-specific volume. Keep lower-body lifting low-cost and recoverable; do not turn several assistance lifts into a progressive hypertrophy block by raising both rep demand and RPE across the block. Strength may be maintained with stable quality exposure while the selected running variable progresses.'); // MARATHON-STRENGTH-MAINTENANCE-PROMPT\n    rules.push(`TARGET-MODALITY INTEGRITY:";
  e=e.replace(anchor,insert);
}
fs.writeFileSync(elitePath,e);
console.log('marathon elite acceptance guards applied');
