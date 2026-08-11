// Generic high-standard coaching guardrails for Phase 15.
// These rules are avatar-agnostic: they protect goal dose, loading calibration,
// and requested strength-session accounting across sports and goal combinations.

function norm(s) { return String(s || '').toLowerCase().trim(); }
function num(s) { const m=String(s||'').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }

function goalList(intake={}) {
  const out=[];
  for (const [priority,key] of [['primary','primary_goals'],['secondary','secondary_goals'],['maintenance','maintenance_goals']]) {
    for (const raw of (intake?.[key]||[])) {
      const text=typeof raw==='string'?raw:JSON.stringify(raw);
      if (text.trim()) out.push({priority,text});
    }
  }
  return out;
}

function goalFamily(text='') {
  const s=norm(text);
  const defs=[
    ['one_arm_pullup',/(one.?arm pull.?up|\boap\b)/i,/(one.?arm (?:pull|chin).?up)/i,'skill_strength'],
    ['weighted_chin',/(weighted chin|chin.?up.*\+?\d|\+?\d+\s*kg.*chin)/i,/(weighted chin|chin.?up)/i,'strength'],
    ['weighted_pullup',/(weighted pull|pull.?up.*\+?\d|\+?\d+\s*kg.*pull)/i,/(weighted pull|pull.?up)/i,'strength'],
    ['squat',/(back squat|box squat|front squat|\bsquat\b)/i,/(back squat|box squat|front squat|\bsquat\b)/i,'strength'],
    ['deadlift',/(deadlift|rdl|romanian deadlift)/i,/(deadlift|rdl|romanian deadlift)/i,'strength'],
    ['ohp',/(overhead press|\bohp\b)/i,/(overhead press|standing barbell overhead press|push press|dumbbell shoulder press|z press)/i,'strength'],
    ['bench',/(bench press|\bbench\b)/i,/(bench press|incline bench|dumbbell bench)/i,'strength'],
    ['dip',/(weighted dip|\bdips?\b)/i,/(weighted dip|\bdips?\b)/i,'strength'],
    ['planche',/planche/i,/planche/i,'skill_strength'],
    ['front_lever',/front lever/i,/front lever/i,'skill_strength'],
    ['hspu',/(handstand push|\bhspu\b)/i,/(handstand push|\bhspu\b)/i,'skill_strength'],
    ['muscle_up',/muscle.?up/i,/muscle.?up/i,'skill_strength'],
    ['running',/\b(5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|mile time|run(?:ning)?|sprint(?:ing)?)\b/i,/\b(run|running|jog|jogging|treadmill|sprint|shuttle run)\b/i,'endurance'],
    ['swimming',/\b(swim|swimming|freestyle|backstroke|breaststroke|butterfly)\b/i,/\b(swim|swimming|freestyle|backstroke|breaststroke|butterfly)\b/i,'endurance'],
    ['rowing',/\b(rowing|rower|erg(?:ometer)?|concept ?2|\d+\s*k\s*row)\b/i,/\b(rowing|rower|erg|concept ?2)\b/i,'endurance'],
    ['cycling',/\b(cycling|cyclist|bike time trial|road bike|criterium)\b/i,/\b(cycling|cycle|bike|stationary bike)\b/i,'endurance'],
  ];
  const hit=defs.find(([,g])=>g.test(s));
  return hit?{key:hit[0],pattern:hit[2],quality:hit[3]}:null;
}

function meaningfulEnduranceDose(cells,idx) {
  const reps=idx.reps>=0?cells[idx.reps]||'':'';
  const weight=idx.weight>=0?cells[idx.weight]||'':'';
  const notes=idx.notes>=0?cells[idx.notes]||'':'';
  const text=`${reps} ${weight} ${notes}`;
  const mins=[...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/gi)].map(m=>Number(m[1]));
  if (mins.some(n=>n>=15)) return true;
  if (/\b\d+(?:\.\d+)?\s*(?:km|m)\b/i.test(text)) return true;
  if (/\b\d+\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:m|km|min|minutes?)\b/i.test(text)) return true;
  return false;
}

function targetGapIsMaterial(text='') {
  const s=String(text||'');
  const nums=[...s.matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0])).filter(Number.isFinite);
  if (nums.length<2) return false;
  // Numeric performance goals with a clear current -> target statement deserve more than token practice.
  return /(?:to|->|→|from|target|goal|improve|increase|decrease|under|over|exceed)/i.test(s);
}

export function goalDoseFlags(program, intake={}, parsed=null) {
  if (!parsed) return [];
  const e=parsed.idx.exercise, d=parsed.idx.day, notes=parsed.idx.notes;
  const flags=[];
  for (const goal of goalList(intake)) {
    if (goal.priority==='maintenance') continue;
    const fam=goalFamily(goal.text);
    if (!fam) continue;
    const days=new Set();
    for (const row of parsed.rows) {
      const ex=row.cells[e]||'';
      if (/^\s*\[WARMUP\]/i.test(ex)) continue;
      const ctx=`${ex} ${notes>=0?row.cells[notes]||'':''}`;
      if (!fam.pattern.test(ctx)) continue;
      if (fam.quality==='endurance' && !meaningfulEnduranceDose(row.cells,parsed.idx)) continue;
      days.add(row.cells[d]||'unknown');
    }
    let floor=goal.priority==='primary'?2:1;
    if (goal.priority==='secondary' && targetGapIsMaterial(goal.text)) floor=2;
    if (fam.quality==='endurance' && targetGapIsMaterial(goal.text)) floor=Math.max(floor,2);
    if (days.size<floor) flags.push({
      code:'GOAL_DOSE_UNDERFLOOR',
      message:`${goal.priority} goal '${goal.text}' receives ${days.size} meaningful direct exposure day(s) in Week 1; require at least ${floor}. Cross-training/support work does not replace direct goal practice.`
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
  return norm(name).replace(/\[[^\]]+\]/g,'').replace(/\b(to parallel|parallel|paused?|tempo|speed|box|front|high bar|low bar|deficit|block|rack|close grip|incline|dumbbell|barbell|strict)\b/g,' ').replace(/\s+/g,' ').trim();
}

function benchmarkRows(intake={}) {
  const src=[...(intake.performance_markers||[]),String(intake.current_numbers||'').split(/\n|;/)].flat().map(String).filter(Boolean);
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

export function unbenchmarkedVariationLoadFlags(intake={}, parsed=null) {
  if (!parsed) return [];
  const benches=benchmarkRows(intake); if(!benches.length) return [];
  const e=parsed.idx.exercise,w=parsed.idx.weight,r=parsed.idx.reps,notes=parsed.idx.notes;
  const flags=[];
  for (const row of parsed.rows) {
    const ex=row.cells[e]||''; if(/^\s*\[WARMUP\]/i.test(ex)) continue;
    const family=liftFamily(ex); if(!family) continue;
    const load=num(row.cells[w]||''); if(load==null) continue;
    const sameFamily=benches.filter(b=>b.family===family); if(!sameFamily.length) continue;
    const exact=sameFamily.some(b=>norm(ex).includes(b.canonical) || b.canonical.includes(canonicalLift(ex)));
    if (exact) continue;
    const strongest=Math.max(...sameFamily.map(b=>b.load));
    const programmedReps=num(row.cells[r]||'')||1;
    const bestRepAtStrongest=Math.max(...sameFamily.filter(b=>b.load===strongest).map(b=>b.reps));
    const aggressive=load>=strongest*0.90 && programmedReps>=bestRepAtStrongest;
    const autoreg=/rpe-selected|auto.?reg|top set by rpe|work up/i.test(`${row.cells[w]||''} ${notes>=0?row.cells[notes]||'':''}`);
    if (aggressive && !autoreg) flags.push({
      code:'UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE',
      message:`${ex} is a different variation from the available ${family} benchmark, yet it is assigned ${load} kg for ${programmedReps} reps. Use an RPE-selected/conservative load until that variation has its own reliable benchmark.`
    });
  }
  return flags;
}

function meaningfulStrengthRow(exercise='', cells=[], idx={}) {
  const ex=norm(exercise);
  if (!ex || /^\s*\[warmup\]/i.test(ex)) return false;
  if (/(zone.?2|bike|rower|run|jog|sprint|shuttle|walk|conditioning|pallof|side plank|plank|dead bug|bird dog|neck isometric|face pull|mobility|stretch)/i.test(ex)) return false;
  const resistance=/(squat|lunge|deadlift|rdl|hinge|press|bench|row|chin|pull.?up|dip|curl|extension|raise|fly|pulldown|leg press|leg curl|hip thrust|split squat|step.?up|calf|planche|lever|handstand|muscle.?up)/i.test(ex);
  if (!resistance) return false;
  const sets=num(cells[idx.sets]||'')||1;
  return sets>=2;
}

function highConcurrentSportLoad(intake={}) {
  const sched=Array.isArray(intake.sport_schedule)?intake.sport_schedule:[];
  const hard=sched.filter(x=>/hard/i.test(String(x?.intensity||''))).length;
  return sched.length>=4 || hard>=2;
}

export function strengthSessionAccountingFlags(program, intake={}, parsed=null) {
  const requested=Number(intake.days_per_week||0);
  if (!parsed || !requested) return [];
  const d=parsed.idx.day,e=parsed.idx.exercise;
  const strengthDays=new Set();
  const allDays=new Set();
  for (const row of parsed.rows) {
    const day=row.cells[d]||''; if(!day) continue;
    allDays.add(day);
    if (meaningfulStrengthRow(row.cells[e]||'',row.cells,parsed.idx)) strengthDays.add(day);
  }
  if (strengthDays.size>=requested) return [];
  const concurrent=highConcurrentSportLoad(intake);
  const narrative=String(program||'').replace(/START_WEEK1_TSV[\s\S]*?END_WEEK4_TSV/i,' ');
  const explained=/\b(reduc(?:e|ed|ing)|three strength|3 strength|fewer strength|recovery trade.?off|sport load|mma|bjj|combat sport|concurrent training)\b/i.test(narrative);
  if (concurrent && strengthDays.size>=Math.max(2,requested-1) && explained) return [];
  return [{
    code:'REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED',
    message:`Client requested ${requested} strength sessions; Week 1 contains ${strengthDays.size} meaningful resistance-training day(s). If concurrent sport/recovery justifies fewer, state that trade-off explicitly in the client narrative; otherwise preserve the requested resistance frequency.`
  }];
}

export function elitePromptRules(intake={}) {
  return [
    'ELITE GOAL-DOSE RULE: every primary goal needs multiple meaningful direct exposures unless the sport schedule itself supplies them. A secondary goal with a material current-to-target gap also needs more than a token exposure. Support work and cross-training may supplement but cannot masquerade as direct goal dose.',
    'ELITE LOADING CALIBRATION RULE: never treat a related exercise variation as if it shares an exact benchmark with another lift. If the exact variation has no reliable performance marker, use conservative RPE-selected loading rather than an assertive fixed load near the benchmark of a different variation.',
    `ELITE SESSION-ACCOUNTING RULE: requested strength frequency is ${Number(intake.days_per_week||0)||'unspecified'}. High concurrent-sport load may justify one fewer meaningful resistance day, but that is a coaching trade-off that must be stated explicitly to the client, not silently substituted with cardio/core work.`,
  ];
}
