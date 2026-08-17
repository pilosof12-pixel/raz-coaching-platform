// Generic integrity guardrails for Phase 15.
// IMPORTANT: this file does not define new coaching theory. It enforces
// client/source consistency already required by the authored RAZ logic:
// named goals cannot disappear, an athlete's existing target-modality practice
// cannot be silently removed, exact kg need an exact-lift anchor, and requested
// strength frequency cannot silently become cardio/core.

function norm(s) { return String(s || '').toLowerCase().trim(); }
function num(s) { const m=String(s||'').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }
function list(v) { return Array.isArray(v) ? v : [v].filter(Boolean); }

function goalList(intake={}) {
  const out=[];
  for (const [priority,key] of [['primary','primary_goals'],['secondary','secondary_goals'],['maintenance','maintenance_goals']]) {
    for (const raw of list(intake?.[key])) {
      const text=typeof raw==='string'?raw:JSON.stringify(raw);
      if (text.trim()) out.push({priority,text});
    }
  }
  return out;
}

const MODALITY_DEFS = [
  {
    key:'running',
    goal:/\b(?:mile|3\s*k(?:m)?|5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|run(?:ning)?|sprint(?:ing)?)\b/i,
    exposure:/\b(?:run|running|jog|jogging|treadmill|sprint|shuttle run|zone[- ]?2 run)\b/i,
    sport:/\b(?:run|running|track|road running)\b/i,
    current:[
      /(?:runs?|running)\s*(\d+)\s*(?:sessions?|times?)?\s*(?:per|\/|each)\s*week/i,
      /(\d+)\s*(?:runs?|running sessions?)\s*(?:per|\/|each)?\s*week/i,
      /(\d+)\s*runs?\b/i,
    ],
  },
  {
    key:'rowing',
    goal:/\b(?:rowing|rower|erg(?:ometer)?|concept ?2|(?:500\s*m|1\s*k|2\s*k|5\s*k)\s*row)\b/i,
    exposure:/\b(?:rower|rowing|rowing ergometer|erg|concept ?2|zone[- ]?2 row)\b/i,
    sport:/\b(?:rowing|rower|crew|ergometer)\b/i,
    current:[
      /(?:rows?|rowing)\s*(\d+)\s*(?:sessions?|times?)?\s*(?:per|\/|each)\s*week/i,
      /(\d+)\s*(?:rows?|rowing sessions?)\s*(?:per|\/|each)?\s*week/i,
      /(\d+)\s*rows?\b/i,
    ],
  },
  {
    key:'cycling',
    goal:/\b(?:cycling|cyclist|bike|road bike|bike time trial|criterium|ftp)\b/i,
    exposure:/\b(?:bike|cycling|cycle|stationary bike|zone[- ]?2 bike|assault bike)\b/i,
    sport:/\b(?:cycling|cyclist|road bike|bike)\b/i,
    current:[
      /(?:rides?|cycling|cycles?)\s*(\d+)\s*(?:sessions?|times?)?\s*(?:per|\/|each)\s*week/i,
      /(\d+)\s*(?:rides?|cycling sessions?)\s*(?:per|\/|each)?\s*week/i,
      /(\d+)\s*rides?\b/i,
    ],
  },
  {
    key:'swimming',
    goal:/\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly)\b/i,
    exposure:/\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly|pool)\b/i,
    sport:/\b(?:swim|swimming)\b/i,
    current:[
      /(?:swims?|swimming)\s*(\d+)\s*(?:sessions?|times?)?\s*(?:per|\/|each)\s*week/i,
      /(\d+)\s*(?:swims?|swimming sessions?)\s*(?:per|\/|each)?\s*week/i,
      /(\d+)\s*swims?\b/i,
    ],
  },
];

function explicitModalityGoals(intake={}) {
  const out=[];
  for (const goal of goalList(intake)) {
    if (goal.priority === 'maintenance') continue;
    for (const def of MODALITY_DEFS) if (def.goal.test(goal.text)) out.push({...goal,def});
  }
  const seen=new Set();
  return out.filter(x=>{const k=`${x.priority}:${x.def.key}:${x.text}`;if(seen.has(k))return false;seen.add(k);return true;});
}

export function currentTargetModalityExposure(intake={}, key='') {
  const def=MODALITY_DEFS.find(x=>x.key===key); if(!def) return 0;
  const evidence=JSON.stringify({notes:intake.notes,clarification_answers:intake.clarification_answers,current:intake.current_training,current_week:intake.current_week,sport:intake.sport}).replace(/\\n/g,' ');
  let best=0;
  for (const re of def.current) {
    for (const m of evidence.matchAll(new RegExp(re.source, re.flags.includes('g')?re.flags:`${re.flags}g`))) {
      const n=Number(m[1]); if(Number.isFinite(n)&&n>best&&n<=14) best=n;
    }
  }
  const schedule=Array.isArray(intake.sport_schedule)?intake.sport_schedule:[];
  if (def.sport.test(String(intake.sport||'')) && schedule.length) best=Math.max(best,schedule.length);
  // A modality-labelled multisport schedule can also provide explicit evidence.
  const labelled=schedule.filter(s=>def.sport.test(`${s?.sport||''} ${s?.modality||''} ${s?.type||''} ${s?.session||''}`)).length;
  if(labelled) best=Math.max(best,labelled);
  return best;
}

function meaningfulModalityRows(parsed, def) {
  const e=parsed.idx.exercise,n=parsed.idx.notes,r=parsed.idx.reps,w=parsed.idx.weight,d=parsed.idx.day;
  const rows=[];
  for (const row of parsed.rows) {
    const ex=row.cells[e]||''; if(/^\s*\[WARMUP\]/i.test(ex)) continue;
    const note=n>=0?row.cells[n]||'':'';
    const ctx=`${ex} ${note}`; if(!def.exposure.test(ctx)) continue;
    const dose=`${r>=0?row.cells[r]||'':''} ${w>=0?row.cells[w]||'':''} ${note}`;
    const mins=[...dose.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/gi)].map(m=>Number(m[1]));
    const setCount=Math.max(1,Number(row.cells[parsed.idx.sets]||1)||1);
    const meaningful=mins.some(x=>x>=15||x*setCount>=15)||/\b\d+(?:\.\d+)?\s*(?:km|m)\b/i.test(dose)||/\b\d+\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:m|km|min|minutes?)\b/i.test(dose); // MEANINGFUL-INTERVAL-SETS-DURATION
    if(meaningful) rows.push({row,day:row.cells[d]||'unknown',ctx,dose});
  }
  return rows;
}

function eventProgressionBearing(item) {
  const s=`${item.ctx} ${item.dose}`;
  const explicitTarget = /(?:\b(?:interval|threshold|critical speed|critical power|race pace|goal pace|target pace|2k pace|3k pace|5k pace|10k pace|marathon pace|split target|stroke rate|cadence|power target|pace target)\b|\b\d+:\d+(?:-\d+:\d+)?\s*\/\s*500m\b|\b\d+(?::\d+)?\s*\/\s*km\b|\b\d+(?:\.\d+)?\s*(?:km\/h|kph|watts?|w)\b|\bprogress(?:ion|ively)?\b)/i.test(s);
  // A standard interval can encode its event-specific target as repetition distance
  // plus a per-repetition clock (for example 5 x 400 m at 1:42-1:45) without
  // repeating the magic words "interval" or "3K pace" in Notes. Treat that
  // representation as progression-bearing rather than forcing stylistic wording.
  const clockTarget = /\b\d{1,2}:\d{2}(?:\s*(?:-|–|to)\s*\d{1,2}:\d{2})?\b/.test(s);
  const distanceTarget = /\b\d+(?:\.\d+)?\s*(?:m|km)\b/i.test(s);
  return explicitTarget || (clockTarget && distanceTarget); // ROWING-500M-SPLIT-PROGRESSION + DISTANCE-CLOCK-TARGET
}

function currentRunningRaceAnchor(intake={}) {
  const src=[String(intake.current_numbers||''),...list(intake.performance_markers).map(String)].join(' | ');
  const anchors=[];
  for(const m of src.matchAll(/\b(3|5|10)\s*k\s*m?\b[^0-9]{0,20}(\d{1,2}):(\d{2})\b/ig)) { // RUN-DISTANCE-SPACING-ANCHOR
    const distanceKm=Number(m[1]), totalSeconds=Number(m[2])*60+Number(m[3]);
    if(distanceKm>0&&totalSeconds>0) anchors.push({distanceKm,totalSeconds,paceSecPerKm:totalSeconds/distanceKm});
  }
  if(!anchors.length) return null;
  return anchors.sort((a,b)=>b.paceSecPerKm-a.paceSecPerKm)[0];
}

function prescribedPaceSecPerKm(text='') {
  const m=String(text||'').match(/\b(\d{1,2}):([0-5]\d)(?:\s*(?:-|–|to)\s*(\d{1,2}):([0-5]\d))?\s*\/\s*km\b/i);
  if(!m) return null;
  const first=Number(m[1])*60+Number(m[2]);
  const second=m[3]!=null ? Number(m[3])*60+Number(m[4]) : first;
  return Math.min(first,second);
}

function maxContinuousMinutes(text='') {
  const values=[];
  for(const m of String(text||'').matchAll(/\b(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:min|minutes?)\b/ig)) {
    values.push(Number(m[2]||m[1]));
  }
  return values.length ? Math.max(...values) : null;
}

function formatPaceSec(sec) {
  const s=Math.round(Number(sec)||0);
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}

export function endurancePerformanceIntegrityFlags(program, intake={}, parsed=null) {
  if(!parsed) return [];
  const flags=[];
  const byKey=new Map();
  for(const g of explicitModalityGoals(intake)) {
    const prev=byKey.get(g.def.key);
    // Primary wins over secondary when the same modality appears in both.
    if(!prev || (g.priority==='primary'&&prev.priority!=='primary')) byKey.set(g.def.key,g);
  }
  for(const {priority,text,def} of byKey.values()) {
    const rows=meaningfulModalityRows(parsed,def);
    const actualDays=new Set(rows.map(x=>x.day)).size;
    const existing=currentTargetModalityExposure(intake,def.key);
    const required=existing>0?existing:1;
    if(actualDays<required) flags.push({
      code:'TARGET_MODALITY_EXPOSURE_REDUCED',
      message:`${def.key} is a named ${priority} performance goal. The intake documents about ${existing||'at least one'} current ${def.key} exposure(s) per week, but Week 1 programs ${actualDays}. Do not silently remove target-modality practice; preserve the athlete's stated current exposure unless the authored plan makes and explains a deliberate recovery tradeoff.`
    });
    if(def.key==='running') {
      const race=currentRunningRaceAnchor(intake);
      if(race) {
        for(const item of rows) {
          const rowText=String(item.ctx||'')+' '+String(item.dose||'');
          if(!/\b(?:zone\s*[- ]?2|easy|conversational|low[- ]?intensity)\b/i.test(rowText)) continue;
          const prescribed=prescribedPaceSecPerKm(rowText);
          if(prescribed!=null && prescribed<=race.paceSecPerKm) {
            flags.push({
              code:'LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE',
              message:"A low-intensity/Zone-2 running row uses "+formatPaceSec(prescribed)+"/km, while the athlete's demonstrated "+race.distanceKm+"K performance is about "+formatPaceSec(race.paceSecPerKm)+"/km. Zone 2 is explicitly below the first major threshold; do not label current race pace or faster as easy. Re-anchor from the authored field-performance + RPE/breathing hierarchy without inventing a universal zone formula."
            });
            break;
          }
        }
      }
    } // LOW-INTENSITY-RACE-PACE-INTEGRITY
    if(def.key==='running') {
      const race=currentRunningRaceAnchor(intake);
      if(race) {
        for(const item of rows) {
          const rowText=String(item.ctx||'')+' '+String(item.dose||'');
          if(/\b(?:test|race|time trial|assessment)\b/i.test(rowText)) continue;
          const pace=prescribedPaceSecPerKm(rowText);
          const durationMin=maxContinuousMinutes(rowText);
          const setCount=Math.max(1,Number(item.row?.cells?.[parsed.idx.sets]||1)||1);
          if(setCount===1 && pace!=null && durationMin!=null && pace<race.paceSecPerKm && durationMin*60>=race.totalSeconds) {
            flags.push({
              code:'CONTINUOUS_RUN_EXCEEDS_CURRENT_RACE_BENCHMARK',
              message:"A continuous running prescription asks for "+durationMin+" minutes at about "+formatPaceSec(pace)+"/km, while the athlete's demonstrated "+race.distanceKm+"K is "+Math.round(race.totalSeconds/60)+" minutes at about "+formatPaceSec(race.paceSecPerKm)+"/km. That would imply sustaining a faster-than-current race pace for current-race duration or longer. Re-anchor from current field performance and the authored endurance sources; do not assume future/goal pace is already continuously sustainable. Across the block, progress the smallest useful variable rather than automatically increasing pace and duration together."
            });
            break;
          }
        }
      }
    } // CONTINUOUS-RACE-BENCHMARK-INTEGRITY
    if(def.key==='running') {
      const sportContext=String(intake.sport||'')+' '+JSON.stringify(intake.sport_schedule||[]);
      const combatConcurrent=/\b(?:bjj|jiu[- ]?jitsu|mma|wrestl(?:e|ing)|boxing|combat)\b/i.test(sportContext);
      if(combatConcurrent) {
        const exIdx=parsed.idx.exercise, noteIdx=parsed.idx.notes, repsIdx=parsed.idx.reps, weightIdx=parsed.idx.weight, setsIdx=parsed.idx.sets;
        const unjustified=[];
        for(const rr of parsed.rows) {
          const ex=String(rr.cells[exIdx]||'');
          if(/^\s*\[WARMUP\]/i.test(ex)) continue;
          const note=noteIdx>=0?String(rr.cells[noteIdx]||''):'';
          const ctx=ex+' '+note;
          if(!/\b(?:bike|cycling|rower|rowing|zone[- ]?2 bike|zone[- ]?2 row)\b/i.test(ctx)) continue;
          const dose=String(repsIdx>=0?rr.cells[repsIdx]||'':'')+' '+String(weightIdx>=0?rr.cells[weightIdx]||'':'')+' '+note;
          const mins=maxContinuousMinutes(dose);
          const sets=Math.max(1,Number(rr.cells[setsIdx]||1)||1);
          const meaningful=(mins!=null&&mins*sets>=15)||/\b\d+(?:\.\d+)?\s*(?:km|m)\b/i.test(dose);
          if(!meaningful) continue;
          const hasPurpose=/\b(?:lower[- ]?impact|impact management|reduce(?:d)? impact|recovery cost|fatigue cost|supplement(?:al)?|replace(?:s|ment)?|because|aerobic volume with less|orthopedic|eccentric cost|missing aerobic|specific purpose)\b/i.test(note);
          if(!hasPurpose) unjustified.push(ex);
        }
        if(unjustified.length) flags.push({
          code:'CONCURRENT_ENDURANCE_REDUNDANCY_UNJUSTIFIED',
          message:'The athlete already has concurrent combat practice plus a named running goal, yet Week 1 adds meaningful '+[...new Set(unjustified)].join(', ')+' work without stating the source-grounded purpose. The authored endurance cluster says sport practice must be counted first and supplemental conditioning should fill a defined gap. Preserve the required direct running exposures; use bike/row only when it deliberately reduces mechanical cost, replaces higher-cost volume, or fills an identified missing quality, and state that purpose instead of stacking generic Zone 2 by habit.'
        });
      }
    } // CONCURRENT-ENDURANCE-REDUNDANCY-INTEGRITY
    const eventGoal=/\d|\b(?:mile|3\s*k|5\s*k|10\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\b/i.test(text);
    const marathonLongRunProgression=/\bmarathon\b/i.test(text) && rows.some(item => {
      const rowText=String(item.ctx||'')+' '+String(item.dose||'');
      const longRole=/\blong(?:[- ]run)?\b|long aerobic|endurance run/i.test(rowText);
      const externalDose=/\b\d+(?:\.\d+)?\s*(?:km|miles?|min|minutes?|hours?|hrs?)\b/i.test(rowText);
      return longRole && externalDose;
    }); // MARATHON-LONG-RUN-PROGRESSION
    if(eventGoal && !rows.some(eventProgressionBearing) && !marathonLongRunProgression) flags.push({
      code:'EVENT_PROGRESSING_SESSION_MISSING',
      message:`The ${def.key} performance goal '${text}' has no progression-bearing event-specific session in Week 1. For marathon preparation, an explicitly identified long run with a prescribed duration/distance is a valid event-specific progression anchor; other events still require their source-supported pace/power/split/interval or equivalent progression.`
    });
  }
  return flags;
}

function goalFamily(text='') {
  const s=norm(text);
  const defs=[
    ['one_arm_pullup',/(one.?arm pull.?up|\boap\b)/i,/(one.?arm (?:pull|chin).?up)/i],
    ['weighted_chin',/(weighted chin|chin.?up.*\+?\d|\+?\d+\s*kg.*chin)/i,/(weighted chin|chin.?up)/i],
    ['weighted_pullup',/(weighted pull|pull.?up.*\+?\d|\+?\d+\s*kg.*pull)/i,/(weighted pull|pull.?up)/i],
    ['squat',/(back squat|box squat|front squat|\bsquat\b)/i,/(back squat|box squat|front squat|\bsquat\b)/i],
    ['deadlift',/(deadlift|rdl|romanian deadlift)/i,/(deadlift|rdl|romanian deadlift)/i],
    ['ohp',/(overhead press|\bohp\b)/i,/(overhead press|standing barbell overhead press|push press|dumbbell shoulder press|z press)/i],
    ['bench',/(bench press|\bbench\b)/i,/(bench press|incline bench|dumbbell bench)/i],
    ['dip',/(weighted dip|\bdips?\b)/i,/(weighted dip|\bdips?\b)/i],
    ['planche',/planche/i,/planche/i],
    ['front_lever',/front lever/i,/front lever/i],
    ['hspu',/(handstand push|\bhspu\b)/i,/(handstand push|\bhspu\b)/i],
    ['muscle_up',/muscle.?up/i,/muscle.?up/i],
    ['running',MODALITY_DEFS[0].goal,MODALITY_DEFS[0].exposure],
    ['rowing',MODALITY_DEFS[1].goal,MODALITY_DEFS[1].exposure],
    ['cycling',MODALITY_DEFS[2].goal,MODALITY_DEFS[2].exposure],
    ['swimming',MODALITY_DEFS[3].goal,MODALITY_DEFS[3].exposure],
  ];
  const hit=defs.find(([,g])=>g.test(s));
  return hit?{key:hit[0],pattern:hit[2]}:null;
}

export function goalDoseFlags(program, intake={}, parsed=null) {
  if (!parsed) return [];
  const e=parsed.idx.exercise, d=parsed.idx.day, notes=parsed.idx.notes;
  const flags=[];
  for (const goal of goalList(intake)) {
    const fam=goalFamily(goal.text);
    if (!fam) continue;
    const days=new Set();
    for (const row of parsed.rows) {
      const ex=row.cells[e]||'';
      if (/^\s*\[WARMUP\]/i.test(ex)) continue;
      const ctx=`${ex} ${notes>=0?row.cells[notes]||'':''}`;
      if (fam.pattern.test(ctx)) days.add(row.cells[d]||'unknown');
    }
    if (days.size<1) flags.push({
      code:'NAMED_GOAL_DIRECT_EXPOSURE_MISSING',
      message:`Named ${goal.priority} goal '${goal.text}' has no direct Week 1 exposure. Support work/cross-training cannot replace the stated goal pattern.`
    });
  }
  return flags;
}

function liftFamily(name='') {
  const s=norm(name);
  if (/squat/.test(s)) return 'squat';
  if (/(chin.?up|pull.?up)/.test(s)) return 'vertical_pull';
  if (/(overhead press|ohp|shoulder press|push press)/.test(s)) return 'overhead_press';
  if (/bench/.test(s)) return 'bench';
  if (/(deadlift|rdl|romanian deadlift)/.test(s)) return 'hinge';
  if (/dip/.test(s)) return 'dip';
  return null;
}

function canonicalLift(name='') {
  return norm(name)
    .replace(/\[[^\]]+\]/g,'')
    .replace(/[:].*$/,'')
    .replace(/\brdl\b/g,'romanian deadlift')
    .replace(/\bohp\b/g,'overhead press')
    .replace(/[^a-z0-9+ -]+/g,' ')
    .replace(/\s+/g,' ')
    .trim(); // EXACT-VARIATION-KEY: keep box/front/pause/ROM/push-press/etc distinct.
}

function benchmarkRows(intake={}) {
  const markers=Array.isArray(intake.performance_markers)?intake.performance_markers:[];
  const src=[...markers,...String(intake.current_numbers||'').split(/\n|;/)].map(String).filter(Boolean);
  const out=[];
  for (const line of src) {
    const loadMatch=line.match(/(?:\+\s*)?(\d+(?:\.\d+)?)\s*kg/i);
    const repMatch=line.match(/(?:x|×)\s*(\d+)\b|\b(\d+)\s*reps?\b/i);
    if (!loadMatch) continue;
    const family=liftFamily(line); if(!family) continue;
    out.push({raw:line,family,canonical:canonicalLift(line.replace(/[:].*$/,'')),load:Number(loadMatch[1]),reps:Number(repMatch?.[1]||repMatch?.[2]||1)});
  }
  return out;
}

export function repairUnbenchmarkedVariationLoads(program, intake={}) {
  const benches=benchmarkRows(intake);
  if(!benches.length) return String(program||'');
  const fixedKg=/(?:^|\s|\+)\d+(?:\.\d+)?\s*kg\b/i;
  return String(program||'').split('\n').map(line=>{
    if(!line.includes('\t')) return line;
    const cells=line.split('\t');
    if(cells.length!==9 || /^Day$/i.test(String(cells[0]||'').trim())) return line;
    const ex=String(cells[1]||'').trim();
    if(!ex || /^\s*\[WARMUP\]/i.test(ex)) return line;
    const family=liftFamily(ex);
    if(!family || !fixedKg.test(String(cells[2]||''))) return line;
    const sameFamily=benches.filter(b=>b.family===family);
    if(!sameFamily.length) return line;
    const exact=sameFamily.some(b=>canonicalLift(ex)===b.canonical);
    if(exact) return line;
    cells[2]='RPE-selected load';
    return cells.join('\t');
  }).join('\n');
} // UNBENCHMARKED-VARIATION-LOAD-REPAIR

export function unbenchmarkedVariationLoadFlags(intake={}, parsed=null) {
  if (!parsed) return [];
  const benches=benchmarkRows(intake); if(!benches.length) return [];
  const e=parsed.idx.exercise,w=parsed.idx.weight;
  const flags=[];
  for (const row of parsed.rows) {
    const ex=row.cells[e]||''; if(/^\s*\[WARMUP\]/i.test(ex)) continue;
    const family=liftFamily(ex); if(!family) continue;
    const weight=String(row.cells[w]||'');
    const fixedKg=/(?:^|\s|\+)\d+(?:\.\d+)?\s*kg\b/i.test(weight);
    if(!fixedKg) continue;
    const sameFamily=benches.filter(b=>b.family===family); if(!sameFamily.length) continue;
    const exact=sameFamily.some(b=>canonicalLift(ex)===b.canonical);
    if (exact) continue;
    flags.push({
      code:'UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE',
      message:`${ex} uses exact kilograms without a benchmark for that exact ${family} variation. A related lift benchmark is not an exact-load anchor; use the authored RPE/autoregulation path instead.`
    });
  }
  return flags;
}

const EXACT_PRIMARY_LIFTS = [
  {goal:/\bback squat\b/i,ex:/^back squat$/i,label:'Back Squat'},
  {goal:/\bbox squat\b/i,ex:/^box squat(?: to parallel)?$/i,label:'Box Squat'},
  {goal:/\bweighted chin[- ]?up\b/i,ex:/^weighted chin[- ]?up$/i,label:'Weighted Chin-up'},
  {goal:/\bweighted pull[- ]?up\b/i,ex:/^weighted pull[- ]?up$/i,label:'Weighted Pull-up'},
  {goal:/\b(?:overhead press|ohp)\b/i,ex:/^(?:overhead press|standing barbell overhead press)$/i,label:'Overhead Press'},
  {goal:/\bbench press\b/i,ex:/^bench press$/i,label:'Bench Press'},
];

function explicitMovementAvoidance(intake,label) {
  const s=JSON.stringify({pain:intake.pain,injuries:intake.injuries,limitations:intake.limitations,notes:intake.notes}).toLowerCase();
  const name=label.toLowerCase().replace(/[- ]/g,'[- ]?');
  return new RegExp(`(?:avoid|cannot|can't|not tolerated|do not|painful)[^.!]{0,60}${name}|${name}[^.!]{0,60}(?:aggravat|painful|not tolerated|avoid|cannot|can't)`, 'i').test(s);
}

function painSensitiveCloseVariation(intake,label,parsed=null) {
  if (label!=='Back Squat') return false;
  const s=JSON.stringify({pain:intake.pain,injuries:intake.injuries,limitations:intake.limitations,notes:intake.notes}).toLowerCase();
  const mechanism=/(deep|depth|below parallel|high[- ]?volume|lumbar flexion|butt wink|range of motion|\brom\b)/i.test(s);
  const boxTolerated=/(?:box squat[^.!]{0,70}(?:tolerat|comfortable|pain.?free)|(?:tolerat|comfortable|pain.?free)[^.!]{0,70}box squat)/i.test(s);
  if(!(mechanism&&boxTolerated)) return false;
  if(!parsed) return true;
  const ex=parsed.idx.exercise;
  return parsed.rows.some(row=>!/^\s*\[WARMUP\]/i.test(String(row.cells[ex]||''))&&/^Box Squat(?: to Parallel)?$/i.test(String(row.cells[ex]||'').trim()));
} // PAIN-SENSITIVE-SQUAT-SUBSTITUTION

export function exactPrimaryMovementFlags(program,intake={},parsed=null) {
  if(!parsed) return [];
  const primary=list(intake.primary_goals).map(String).join(' | ');
  const e=parsed.idx.exercise;
  const flags=[];
  for(const def of EXACT_PRIMARY_LIFTS) {
    if(!def.goal.test(primary)||explicitMovementAvoidance(intake,def.label)) continue;
    const closePainVariation=painSensitiveCloseVariation(intake,def.label,parsed);
    const present=parsed.rows.some(row=>{
      const ex=String(row.cells[e]||'').trim();
      return !/^\s*\[WARMUP\]/i.test(ex)&&def.ex.test(ex);
    });
    if(!present && !closePainVariation) flags.push({
      code:'PRIMARY_EXACT_MOVEMENT_MISSING',
      message:`Primary goal names ${def.label}, but Week 1 contains no direct ${def.label} work and the intake does not explicitly prohibit that movement. A related variation may support the goal but cannot silently replace the exact primary movement; if pain requires temporary substitution, explain and stage that tradeoff explicitly.`
    });
  }
  return flags;
}

function meaningfulStrengthRow(exercise='', cells=[], idx={}) {
  const ex=norm(exercise);
  if (!ex || /^\s*\[warmup\]/i.test(ex)) return false;
  if (/(zone.?2|bike|rower|run|jog|sprint|shuttle|walk|conditioning|pallof|side plank|plank|dead bug|bird dog|neck isometric|mobility|stretch)/i.test(ex)) return false;
  const resistance=/(squat|lunge|deadlift|rdl|hinge|press|bench|row|chin|pull.?up|dip|curl|extension|raise|fly|pulldown|leg press|leg curl|hip thrust|split squat|step.?up|calf|planche|lever|handstand|muscle.?up)/i.test(ex);
  if (!resistance) return false;
  return (num(cells[idx.sets]||'')||1)>=2;
}

export function strengthSessionAccountingFlags(program, intake={}, parsed=null) {
  const requested=Number(intake.days_per_week||0);
  if (!parsed || !requested) return [];
  const d=parsed.idx.day,e=parsed.idx.exercise;
  const strengthDays=new Set();
  for (const row of parsed.rows) {
    const day=row.cells[d]||''; if(!day) continue;
    if (meaningfulStrengthRow(row.cells[e]||'',row.cells,parsed.idx)) strengthDays.add(day);
  }
  if (strengthDays.size>=requested) return [];
  return [{
    code:'REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED',
    message:`Client requested ${requested} strength sessions; Week 1 contains ${strengthDays.size} meaningful resistance-training day(s). The authored planner may choose lower-cost strength work under high sport load, but it may not silently turn a requested strength day into cardio/core only.`
  }];
}

export function elitePromptRules(intake={}) {
  const rules=[
    'INTEGRITY RULE: every named goal must retain at least one direct exposure of its own pattern. Any higher frequency, volume or progression comes only from the deterministic planner, specialist rules and curated RAZ coaching sources.',
    'INTEGRITY RULE: exact kilograms require a reliable benchmark for that exact loaded variation or another explicit deterministic anchor. Never transfer fixed kilograms from Back Squat to Box/Front/Pause Squat, or between any other merely related variations. Use RPE-selected load when the exact variation is unbenchmarked.',
    `INTEGRITY RULE: the client requested ${Number(intake.days_per_week||0)||'an unspecified number of'} strength sessions. Respect the deterministic planner's session structure; cardio/core work cannot silently replace a requested resistance-training day.`,
  ];
  for(const {priority,text,def} of explicitModalityGoals(intake)) {
    const current=currentTargetModalityExposure(intake,def.key);
    if(def.key==='running') {
      const race=currentRunningRaceAnchor(intake);
      if(race) rules.push('LOW-INTENSITY RUNNING ANCHOR: the intake demonstrates about '+formatPaceSec(race.paceSecPerKm)+'/km for '+race.distanceKm+'K. Any row labelled easy, conversational or Zone 2 must be genuinely below that demonstrated race intensity; never use that race pace or a faster pace as low intensity. If no threshold test exists, use the authored pace + RPE/breathing hierarchy rather than fabricating a precise breakpoint.');
      if(race) rules.push('CURRENT-RACE PERFORMANCE ANCHOR: do not prescribe a continuous non-test run faster than the demonstrated '+race.distanceKm+'K pace for the same race duration or longer; that would assume performance beyond the supplied current benchmark. If faster work is source-appropriate, calibrate its structure from the authored endurance sources rather than treating goal pace as already sustainable. Across the four-week block, progress the smallest useful variable and do not automatically increase both pace and duration together.'); // CONTINUOUS-RACE-BENCHMARK-PROMPT
    }
    if(def.key==='running') {
      const sportContext=String(intake.sport||'')+' '+JSON.stringify(intake.sport_schedule||[]);
      if(/\b(?:bjj|jiu[- ]?jitsu|mma|wrestl(?:e|ing)|boxing|combat)\b/i.test(sportContext)) {
        rules.push('CONCURRENT ENDURANCE BUDGET: count the existing combat sessions inside the athlete\'s finite weekly recovery budget before adding conditioning. Preserve the stated direct running exposures first because running specificity matters for the named event. Do not automatically add generic Zone 2 bike/row sessions on top. Cross-training may supplement only when the curated endurance sources support a specific reason such as obtaining useful aerobic work with lower mechanical cost, replacing higher-cost running volume, or filling an identified missing quality; if you use it, state that purpose. Poor/variable recovery or high sport load strengthens the case for removing redundant volume before adding more.');
      }
    } // CONCURRENT-ENDURANCE-BUDGET-PROMPT
    if(def.key==='running' && /\bmarathon\b/i.test(text)) {
      const volumeSource=String(intake.notes||'')+' '+String(intake.current_numbers||'');
      const vm=volumeSource.match(/\b(?:about|around|roughly|approximately|~)?\s*(\d+(?:\.\d+)?)\s*km\s*(?:\/|per)\s*week\b/i);
      if(vm) rules.push('MARATHON CURRENT-WEEKLY-VOLUME ANCHOR: the intake documents about '+vm[1]+' km/week currently. Treat that established workload as the starting anchor rather than creating a large Week-1 step-change. The authored endurance framework says progress/regress one main variable according to adaptation and recovery. MARATHON SINGLE-LEVER HARD CONTRACT: for EACH Week 1 to 2, Week 2 to 3 and Week 3 to 4 transition, choose exactly ONE main running progression lever. Within a quality session, change pace/intensity OR accumulated work, never both in the same transition. Across the week, if the long run progresses then COPY the prior-week quality and routine-easy prescriptions unchanged; if quality progresses then COPY the prior-week long-run and routine-easy prescriptions unchanged; if routine easy volume progresses then COPY the prior-week quality and long-run prescriptions unchanged. When the intake supplies current weekly running distance, Week 1 total direct running distance MUST NOT exceed that supplied current weekly distance; treat it as the starting workload anchor and begin progression later. Preserve the stated run frequency while redistributing the Week 1 distances inside that current-volume ceiling.');
    } // MARATHON-CURRENT-WEEKLY-VOLUME-PROMPT
    if(def.key==='running' && /\bmarathon\b/i.test(text) && /(?:maintain|maintenance)[^|]{0,40}strength|stay durable|durability/i.test(list(intake.secondary_goals).map(String).join(' | '))) rules.push('MARATHON STRENGTH-MAINTENANCE SUPPORT RULE: marathon performance is primary and strength is maintenance/support. Protect key endurance sessions and event-specific volume. Keep lower-body lifting low-cost and recoverable; do not turn several assistance lifts into a progressive hypertrophy block by raising both rep demand and RPE across the block. Strength may be maintained with stable quality exposure while the selected running variable progresses.'); // MARATHON-STRENGTH-MAINTENANCE-PROMPT
    rules.push(`TARGET-MODALITY INTEGRITY: ${def.key} is a named ${priority} performance goal${current?` and the intake documents about ${current} current ${def.key} exposure(s) per week`:''}. Do not silently reduce that existing target-modality practice. Put the target-modality sessions into the four-week deliverable, including non-gym sport days when needed, and use the curated endurance sources to assign their actual purpose/dose. Cross-training may supplement but not replace them.`);
    if(/\d|\b(?:mile|3\s*k|5\s*k|10\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\b/i.test(text)) rules.push(`EVENT-PROGRESSION INTEGRITY: '${text}' needs at least one progression-bearing ${def.key} session with an external event-relevant target. For a marathon goal, a clearly identified long run with a prescribed duration or distance is a legitimate event-specific progression anchor; interval/tempo/pace work may also be used only when supported by the curated source and athlete context. For other events use the relevant source-selected interval, pace, power, split, stroke-rate or equivalent prescription. A warm-up or generic easy session alone is not sufficient. The exact workout design must come from the curated sources, not generic model memory.`); // MARATHON-LONG-RUN-PROMPT
  }
  const primary=list(intake.primary_goals).map(String).join(' | ');
  for(const def of EXACT_PRIMARY_LIFTS) {
    if(!def.goal.test(primary)||explicitMovementAvoidance(intake,def.label)) continue;
    if(painSensitiveCloseVariation(intake,def.label)) rules.push(`PAIN-SENSITIVE SPECIFICITY: ${def.label} is the target, but the intake identifies an aggravating squat feature and explicitly tolerates a close box-squat variation. Preserve the squat-strength target with the closest tolerated source-supported variation rather than forcing the provocative feature.`);
    else rules.push(`PRIMARY-MOVEMENT INTEGRITY: ${def.label} is named in a primary goal and is not explicitly prohibited by the intake. Keep direct ${def.label} exposure. Related variations may support it but cannot silently replace it.`);
  }
  return rules;
}
