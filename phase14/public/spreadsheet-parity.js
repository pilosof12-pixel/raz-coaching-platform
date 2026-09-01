// Youth-gymnastics product parity exporter.
// Overrides the older raw Strength Block workbook with the approved client structure:
// Overview -> Warm-Up -> Week 1 -> Week 2 -> Week 3 -> Week 4.
(() => {
  const NAVY = 'FF0B1324';
  const NAVY_2 = 'FF16213A';
  const BAND = 'FF111C32';
  const HEADER = 'FF263757';
  const BODY = 'FFECFDF5';
  const LABEL = 'FFF2F5F9';
  const DAY_BAND = 'FFD9E5F5';
  const WHITE = 'FFFFFFFF';
  const TEXT = 'FF111827';
  const LINK = 'FF0563C1';

  const toList = (v) => Array.isArray(v) ? v.filter(Boolean).map(String) : (v ? [String(v)] : []);
  const text = (v) => v == null ? '' : String(v);
  const joinGoals = (v) => toList(v).join('; ');
  const clean = (v) => text(v).replace(/\s+/g, ' ').trim();

  function fill(cell, argb) {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb} };
  }
  function font(cell, opts={}) {
    cell.font = { name:'Calibri', size: opts.size || 11, bold: !!opts.bold, italic: !!opts.italic,
      color:{argb: opts.color || TEXT}, underline: !!opts.underline };
  }
  function align(cell, opts={}) {
    cell.alignment = { vertical:'middle', horizontal:opts.horizontal || 'left', wrapText:true };
  }
  function styleRange(ws, range, opts={}) {
    ws.getCell(range.split(':')[0]);
    ws.getRow(1);
    const r = ws.getCell(range.split(':')[0]);
    void r;
    ws.getRange ? null : null;
  }
  function styleCells(ws, startRow, endRow, startCol, endCol, opts={}) {
    for (let r=startRow; r<=endRow; r++) for (let c=startCol; c<=endCol; c++) {
      const cell = ws.getRow(r).getCell(c);
      if (opts.fill) fill(cell, opts.fill);
      font(cell, opts);
      align(cell, {horizontal:opts.horizontal || 'left'});
      if (opts.border) cell.border = opts.border;
    }
  }
  function mergeTitle(ws, row, endCol, value, bg, size, color=WHITE) {
    ws.mergeCells(row,1,row,endCol);
    const cell = ws.getRow(row).getCell(1);
    cell.value = value;
    fill(cell,bg); font(cell,{size,bold:true,color}); align(cell);
    ws.getRow(row).height = Math.max(20, size + 8);
  }

  function block(textValue, n) {
    const re = new RegExp(`START_WEEK${n}_TSV([\\s\\S]*?)END_WEEK${n}_TSV`, 'i');
    const m = text(textValue).match(re);
    return m ? m[1].replace(/```(?:tsv|text|plaintext)?/gi,'').trim() : '';
  }
  function splitLine(line, delim) {
    if (delim === '\t') return line.split('\t').map(x=>x.trim().replace(/^"|"$/g,''));
    // CSV fallback used only when a legacy build emits commas rather than tabs.
    const out=[]; let cur='', q=false;
    for (let i=0;i<line.length;i++) {
      const ch=line[i];
      if (ch==='"') { if(q && line[i+1]==='"'){cur+='"';i++;} else q=!q; }
      else if(ch===',' && !q){out.push(cur.trim());cur='';}
      else cur+=ch;
    }
    out.push(cur.trim()); return out;
  }
  function parseWeek(program, n) {
    const raw=block(program,n); if(!raw) return {week:n,headers:[],rows:[]};
    const lines=raw.split(/\r?\n/).filter(x=>x.trim());
    if(!lines.length) return {week:n,headers:[],rows:[]};
    const delim=lines[0].includes('\t')?'\t':',';
    const headers=splitLine(lines[0],delim);
    const rows=lines.slice(1).map(l=>splitLine(l,delim));
    return {week:n,headers,rows};
  }
  function idx(headers, names) {
    const h=headers.map(x=>clean(x).toLowerCase());
    for(const name of names){ const i=h.indexOf(name); if(i>=0) return i; }
    return -1;
  }
  function normalizedRows(week) {
    const h=week.headers;
    const iDay=idx(h,['day']);
    const iEx=idx(h,['exercise']);
    const iLoad=idx(h,['weight','load','load / target','target']);
    const iSets=idx(h,['sets']);
    const iReps=idx(h,['reps','reps / duration','repetitions']);
    const iRest=idx(h,['rest']);
    const iEffort=idx(h,['target rpe','rpe','effort','rir']);
    const iNotes=idx(h,['notes','coaching note','note']);
    return week.rows.map(r=>({
      day:iDay>=0?clean(r[iDay]):'', exercise:iEx>=0?clean(r[iEx]):'', load:iLoad>=0?clean(r[iLoad]):'',
      sets:iSets>=0?clean(r[iSets]):'', reps:iReps>=0?clean(r[iReps]):'', rest:iRest>=0?clean(r[iRest]):'',
      effort:iEffort>=0?clean(r[iEffort]):'', notes:iNotes>=0?clean(r[iNotes]):''
    })).filter(r=>r.exercise);
  }
  function sessions(week) {
    const rows=normalizedRows(week).filter(r=>!/^\s*\[(?:WARMUP|חימום)\]/i.test(r.exercise));
    const out=[]; let current=null;
    for(const r of rows){
      if(r.day && (!current || r.day!==current.day)){ current={day:r.day,rows:[]}; out.push(current); }
      if(!current){ current={day:'Session',rows:[]}; out.push(current); }
      current.rows.push(r);
    }
    return out;
  }
  function warmupRows(week) {
    return normalizedRows(week).filter(r=>/^\s*\[(?:WARMUP|חימום)\]/i.test(r.exercise));
  }

  function ageFromIntake(intake={}) {
    const direct=Number(intake.age || intake.age_years || 0); if(direct>0) return direct;
    const m=(`${text(intake.notes)} ${text(intake.current_numbers)}`).match(/(?:athlete\s+is|age\s*[:=]?)\s*(\d{1,2})\b/i);
    return m?Number(m[1]):null;
  }
  function hasGoal(intake, re) { return re.test(`${joinGoals(intake.primary_goals)} ${joinGoals(intake.secondary_goals)}`); }
  function equipmentText(intake) { return clean(intake.equipment) || 'Bodyweight / equipment as listed in intake'; }
  function painText(intake) {
    if(typeof intake.injuries==='string' && intake.injuries.trim()) return clean(intake.injuries);
    if(intake.pain?.active) return clean(intake.pain.description || 'Active pain / limitation reported');
    return 'None reported';
  }
  function benchmarkText(intake) {
    const parts=[];
    if(clean(intake.current_numbers)) parts.push(clean(intake.current_numbers));
    if(intake.clarification_answers && typeof intake.clarification_answers==='object') {
      for(const v of Object.values(intake.clarification_answers)) if(clean(v)) parts.push(clean(v));
    }
    return parts.join(' | ');
  }
  function fallbackDemo(name) {
    const direct = window.ExerciseDemos?.resolveExerciseDemo ? window.ExerciseDemos.resolveExerciseDemo(name) : null;
    if(direct?.url) return direct.url;
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(clean(name) + ' exercise demo').replace(/%20/g,'+');
  }
  function setHyperlink(cell, name, visibleText='Open demo', linkStyle=true) {
    // A protocol row carries its drills in the coaching note and has no
    // exercise of its own to link. Writing the hyperlink object anyway put a
    // literal {"text":"","hyperlink":...} into the cell, because ExcelJS only
    // recognises the hyperlink shape when there is text to show.
    const target=String(name||'').trim();
    if(!target){ cell.value=''; align(cell); return null; }
    const url=fallbackDemo(name);
    cell.value={text:String(visibleText||'').trim()||target,hyperlink:url,tooltip:'Open exercise demonstration'};
    if(linkStyle) font(cell,{size:10,color:LINK,underline:true}); else font(cell,{size:11,color:TEXT});
    align(cell);
    return url;
  }

  // A generated warm-up row often carries no exercise of its own and lists its
  // drills as one semicolon-separated protocol in the coaching note. The
  // reference layout gives every drill its own cell, so split that protocol
  // into one row per drill instead of leaving a blank exercise column.
  function splitProtocolNote(note) {
    const parts=String(note||'').split(';').map(x=>x.trim()).filter(Boolean);
    if(parts.length<2) return null;
    const drills=[]; const rules=[];
    for(const part of parts){
      // "Ramp Back Squat: 47.5 kg x 5, 72.5 kg x 3" -- a named ramp protocol.
      let m=part.match(/^(.+?):\s*(.+)$/);
      if(m){ drills.push({exercise:m[1].trim(),reps:m[2].trim()}); continue; }
      // "Squat-and-reach x 6", "Scapular pull-up 2 x 5-6", "Wall slide x 8".
      m=part.match(/^(.+?)\s+((?:\d+\s*)?x\s*[\d].*)$/i);
      if(m){ drills.push({exercise:m[1].trim(),reps:m[2].trim()}); continue; }
      // A segment carrying no dose and reading as a sentence is a coaching
      // rule, not a drill. "Keep the warm-up specific and short" is not an
      // exercise and must not occupy an exercise row.
      if(part.split(/\s+/).length>4){ rules.push(part); continue; }
      drills.push({exercise:part,reps:''});
    }
    if(!drills.length) return null;
    return {drills,rules};
  }

  function profileRows(intake={}, frequencyText='') {
    const rows=[]; const age=ageFromIntake(intake); const benchmarks=benchmarkText(intake);
    if(age) rows.push(['Age',String(age)]);
    if(intake.bodyweight || intake.weight_kg) rows.push(['Bodyweight',clean(intake.bodyweight || intake.weight_kg)]);
    const p=joinGoals(intake.primary_goals); if(p) rows.push(['Primary goals',p]);
    const s=joinGoals(intake.secondary_goals); if(s) rows.push(['Secondary goal',s]);
    if(hasGoal(intake,/bar muscle.?up/i) && intake.clarification_answers?.benchmark_bar_muscle_up)
      rows.push(['Muscle-up / pulling baseline',clean(intake.clarification_answers.benchmark_bar_muscle_up)]);
    if(hasGoal(intake,/handstand/i) && intake.clarification_answers?.benchmark_handstand)
      rows.push(['Handstand baseline',clean(intake.clarification_answers.benchmark_handstand)]);
    if(/pistol/i.test(text(intake.current_numbers))) rows.push(['Lower-body benchmark',clean(intake.current_numbers)]);
    else if(benchmarks && !rows.some(r=>/baseline|benchmark/i.test(r[0]))) rows.push(['Current benchmarks',benchmarks]);
    // Prefer the counted week. The requested figure is kept only when there is
    // no program to count, so the sheet never contradicts the table beside it.
    const requested = `${Number(intake.days_per_week||0)||''} structured sessions/week`.trim();
    rows.push(['Training frequency', frequencyText || requested]);
    rows.push(['Equipment',equipmentText(intake)]);
    if(clean(intake.sport)) rows.push(['Concurrent sport',clean(intake.sport)]);
    rows.push(['Pain / injury',painText(intake)]);
    return rows.filter(r=>r[1]);
  }

  function sessionLabel(intake, session, i) {
    const flexible=String(intake.gym_availability_mode||'').toLowerCase()==='flexible' && !(intake.available_gym_days||[]).length;
    return flexible ? `Session ${String.fromCharCode(65+i)}` : (session.day || `Session ${String.fromCharCode(65+i)}`);
  }
  function sessionType(session) {
    const s=session.rows.map(r=>r.exercise).join(' ');
    const tags=[];
    if(/handstand/i.test(s)) tags.push('Handstand');
    if(/bar muscle.?up|muscle.?up transition/i.test(s)) tags.push('Bar muscle-up');
    if(/squat|lunge|pistol|deadlift|jump|sprint/i.test(s)) tags.push('Athletic / lower-body strength');
    if(/pull.?up|chin.?up|row/i.test(s) && tags.length<3) tags.push('Pull strength');
    if(/press|push.?up|dip/i.test(s) && tags.length<3) tags.push('Push strength');
    return tags.slice(0,3).join(' + ') || 'Strength / skill session';
  }
  function sessionPurpose(session, i) {
    const s=session.rows.map(r=>r.exercise).join(' ');
    if(/handstand/i.test(s) && /bar muscle.?up|muscle.?up transition/i.test(s)) {
      return i===0 ? 'Fresh skill practice; bar-specific pulling/transition; push/pull foundation; lower-body strength where relevant.'
        : 'Second direct exposure to both primary skills; complementary strength; preserve quality and athleticism.';
    }
    return 'Primary work first; supporting strength and accessories follow without displacing the stated goals.';
  }

  function programRules(intake={}) {
    const rules=[]; const age=ageFromIntake(intake);
    rules.push('Progress the main goals only when rep quality and the prescribed effort remain intact.');
    if(hasGoal(intake,/bar muscle.?up/i)) rules.push('Bar muscle-up progress stays bar-specific: direct transition practice plus high/explosive pulling; generic pulling is support, not a replacement.');
    if(hasGoal(intake,/freestanding handstand|handstand balance/i)) rules.push('Handstand progress is judged by better kick-up control, alignment and independent balance — not wall-hold duration alone.');
    if(age && age<18) rules.push('Skill quality comes before fatigue. No max-effort grinders or repeated failed attempts; stop when speed, position or confidence clearly deteriorates.');
    if(intake.pain?.active || (intake.injuries && !/none/i.test(String(intake.injuries)))) rules.push('Pain rule: stop or regress any movement that clearly worsens the reported issue; do not force the planned variation.');
    rules.push('If time or recovery is limited, remove the lowest-priority accessory before cutting the primary skill/strength exposure.');
    rules.push('Video cells use a curated direct demo when available; otherwise they link to an exercise-specific YouTube search.');
    return rules;
  }

  function overviewTitle(intake={}) {
    const g=`${joinGoals(intake.primary_goals)} ${joinGoals(intake.secondary_goals)}`;
    if(/3\s*k(?:m)?|ruck|tactical|special[- ]?operations/i.test(`${g} ${text(intake.notes)}`)) return 'RAZ — TACTICAL 3K / GPP PROGRAM';
    if(ageFromIntake(intake) && ageFromIntake(intake)<18) return 'RAZ — YOUTH PERFORMANCE PROGRAM';
    if(/one[- ]?arm\s*(?:pull|chin)|marathon|back squat|overhead press/i.test(g)) return 'RAZ — ADVANCED HYBRID PERFORMANCE PROGRAM';
    return 'RAZ — PERFORMANCE PROGRAM';
  }

  // What the week actually contains, counted from the prescription.
  //
  // This row used to read intake.days_per_week, so the Overview quoted what
  // the athlete asked for while the table beside it showed what was
  // prescribed: "4 structured sessions/week" against a Mon/Tue/Thu/Fri/Sun
  // schedule. A client reading one sheet saw a contradiction and was right to.
  //
  // The engine counts the same thing in v61_weekly_exposures.js. Browser code
  // cannot import it, so a test asserts the two agree on the live programs
  // rather than trusting that they do.
  // "row" used to be in here as a synonym for the ergometer, and it counted
  // Cable Row and Chest-Supported Row as cardio: a Hybrid week with one run
  // reported four running exposures. Rowing as conditioning has to name itself
  // -- rowing, or an erg -- because a bare "Row" is a pulling exercise.
  const ENDURANCE_RE = /\b(?:run|running|jog|ruck|backpack carry|loaded carry|weighted carry|rowing|erg|bike|cycl|swim|sled|treadmill)\b/i;
  // A run and a ruck both condition and are not interchangeable: one is the
  // event, the other competes with it for the same tissue.
  const RUCK_RE = /\bruck|backpack carry|weighted carry|loaded carry|sandbag carry\b/i;

  function weeklyExposures(week) {
    const byDay = new Map();
    let running = 0;
    let ruck = 0;
    for (const r of normalizedRows(week)) {
      const name = String(r.exercise || '');
      if (/^\s*\[(?:WARMUP|חימום)\]/i.test(name)) continue;
      const day = String(r.day || '').trim();
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, { strength: 0, endurance: 0 });
      const b = byDay.get(day);
      if (ENDURANCE_RE.test(name)) {
        b.endurance += 1;
        if (RUCK_RE.test(name)) ruck += 1; else running += 1;
      } else b.strength += 1;
    }
    const days = [...byDay.keys()];
    return {
      total: days.length,
      strength: days.filter((d) => byDay.get(d).strength > 0).length,
      enduranceOnly: days.filter((d) => byDay.get(d).endurance > 0 && byDay.get(d).strength === 0).length,
      runningExposures: running,
      ruckExposures: ruck,
      conditioningExposures: running + ruck,
    };
  }

  function describeExposures(ex, intake) {
    if (!ex || !ex.total) return '';
    const parts = [];
    if (ex.strength) parts.push(ex.strength + ' strength');
    if (ex.runningExposures) parts.push(ex.runningExposures + ' running');
    if (ex.ruckExposures) parts.push(ex.ruckExposures + ' ruck');
    const detail = parts.length ? ' (' + parts.join(', ') + ')' : '';
    const sportDays = Array.isArray(intake && intake.sport_schedule) ? intake.sport_schedule.length : 0;
    const sport = sportDays ? ', plus ' + sportDays + ' sport session' + (sportDays === 1 ? '' : 's') : '';
    return ex.total + ' training day' + (ex.total === 1 ? '' : 's') + '/week' + detail + sport;
  }

  function renderOverview(ws, intake, week1) {
    ws.views=[{showGridLines:false}];
    [28,34,16,48].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,1,4,overviewTitle(intake),NAVY,16);
    mergeTitle(ws,2,4,'EXACT LIVE PRODUCTION ACCEPTANCE — 4-WEEK BLOCK',NAVY_2,10,'FFDCE7F7');
    let row=4;
    ['ATHLETE / PROGRAM','DETAIL','',''].forEach((v,i)=>{const c=ws.getRow(row).getCell(i+1);c.value=v;fill(c,HEADER);font(c,{size:10,bold:true,color:WHITE});align(c,{horizontal:'center'});});
    row++;
    for(const [k,v] of profileRows(intake, describeExposures(weeklyExposures(week1), intake))){
      const a=ws.getRow(row).getCell(1), b=ws.getRow(row).getCell(2);
      a.value=k; b.value=v; fill(a,LABEL); font(a,{size:10,bold:true}); align(a);
      ws.mergeCells(row,2,row,4); fill(b,BODY); font(b,{size:10}); align(b); ws.getRow(row).height=34; row++;
    }
    row++;
    mergeTitle(ws,row,4,'PROGRAM RULES',DAY_BAND,10,'FF0B1324'); row++;
    for(const rule of programRules(intake)){
      ws.mergeCells(row,1,row,4); const c=ws.getRow(row).getCell(1); c.value='• '+rule; fill(c,BODY); font(c,{size:10}); align(c); ws.getRow(row).height=32; row++;
    }
  }

  function derivedWarmup(session, intake) {
    const names=session.rows.map(r=>r.exercise).join(' '); const out=[];
    if(/handstand/i.test(names)) {
      out.push(['WRIST / SHOULDER','Wrist Rock / Palm Pulse','1 × 8–10 each','20–30 s','Prepare wrists for handstand loading','Gentle, pain-free range.']);
      out.push(['SHOULDER','Scapular Push-up','1 × 8','30 s','Prime shoulder control','Smooth reps; no fatigue.']);
    }
    if(/pull.?up|chin.?up|muscle.?up|row/i.test(names)) out.push(['PULL','Scapular Pull-up','1 × 6','30–45 s','Prime active hang and pulling mechanics','Elbows straight; full control.']);
    if(/bar muscle.?up|muscle.?up transition/i.test(names) && /band/i.test(equipmentText(intake)))
      out.push(['MUSCLE-UP','Easy Band-Assisted Bar Muscle-up','2 × 1','60 s','Rehearse bar path and turnover','Use more assistance than work sets.']);
    if(/squat|lunge|pistol|jump|sprint/i.test(names)) {
      out.push(['LOWER','Leg Swings','1 × 8 / side','20–30 s','Prepare hips and legs','Short and dynamic.']);
      if(/jump|sprint/i.test(names)) out.push(['JUMP PREP','Pogo Jumps','2 × 10','30–45 s','Prepare ankle stiffness and landing rhythm','Quiet contacts.']);
    }
    if(/press|dip|push.?up/i.test(names) && !/handstand/i.test(names)) out.push(['PRESS','Shoulder CARs','1 × 5 / side','30 s','Prepare shoulder range','Smooth, controlled circles.']);
    if(!out.length) out.push(['GENERAL','Easy movement + joint prep','3–5 min','—','Raise temperature without fatigue','Stay conversational and fresh.']);
    return out.slice(0,5);
  }

  function splitWarmupDose(raw) {
    const x=clean(raw);
    const m=x.match(/^(\d+)\s*[×x]\s*(.+)$/i);
    if(m) return [m[1],m[2]];
    return ['1',x||'N/A'];
  }

  function renderWarmup(ws, intake, week1) {
    ws.views=[{showGridLines:false}];
    [18,32,10,18,12,54].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,1,6,'RAZ — WARM-UP / PREPARATION',NAVY,16);
    mergeTitle(ws,2,6,'Warm-ups are separated from the weekly prescription so the training sheets stay clean and use the approved 11-column template.',NAVY_2,10,'FFDCE7F7');
    let row=4;
    ['SESSION / DAY','EXERCISE','SETS','REPS / DURATION','REST','COACHING NOTE'].forEach((v,j)=>{const c=ws.getRow(row).getCell(j+1);c.value=v;fill(c,HEADER);font(c,{size:10,bold:true,color:WHITE});align(c,{horizontal:'center'});});
    row++;
    const ss=sessions(week1), explicit=warmupRows(week1);
    ss.forEach((session,i)=>{
      const label=sessionLabel(intake,session,i);
      const same=explicit.filter(x=>!x.day || x.day===session.day);
      let items=[];
      if(same.length) {
        items=[];
        for(const x of same){
          const name=x.exercise.replace(/^\s*\[(?:WARMUP|חימום)\]\s*/i,'').trim();
          const split=name?null:splitProtocolNote(x.notes);
          if(split){
            const rule=split.rules.join(' ')||'Session-specific preparation';
            split.drills.forEach((d,i)=>items.push({exercise:d.exercise,sets:'1',reps:d.reps||'N/A',rest:x.rest||'N/A',note:i===0?rule:'Session-specific preparation'}));
          } else {
            items.push({exercise:name,sets:x.sets||'1',reps:x.reps||'N/A',rest:x.rest||'N/A',note:x.notes||'Session-specific preparation'});
          }
        }
      } else {
        items=derivedWarmup(session,intake).map(x=>{const [sets,reps]=splitWarmupDose(x[2]);return {exercise:x[1],sets,reps,rest:x[3]||'N/A',note:[x[4],x[5]].filter(Boolean).join(' ')};});
      }
      items.forEach((item,itemIndex)=>{
        const vals=[itemIndex===0?label:'',item.exercise,item.sets,item.reps,item.rest,item.note];
        vals.forEach((v,j)=>{const c=ws.getRow(row).getCell(j+1);c.value=v;fill(c,BODY);font(c,{size:10});align(c);});
        setHyperlink(ws.getRow(row).getCell(2),item.exercise,item.exercise,false);
        ws.getRow(row).height=34; row++;
      });
    });
  }

  // Week 3 used to be labelled SPECIFICITY unconditionally. For a block whose
  // quality work is still materially slower than race demand that is simply
  // untrue, and it contradicted the program's own opening sentence, which
  // called the block developmental. The label now reads the narrative rather
  // than asserting a phase: the engine already makes that sentence honest, so
  // it is the single source of truth and nothing here has to re-derive it.
  const DEVELOPMENTAL_NARRATIVE = /\b(?:developmental|pre[- ]specific|transition(?:al)?|base(?:[- ]building)?)\b/i;

  // A phase name is a claim about the prescription. Week 4 called
  // CONSOLIDATE / EXPRESS while carrying the same volume as Week 1 is a label
  // contradicting the table under it, which is what a coach reads first.
  function weekSets(program, n) {
    const m = String(program || '').match(new RegExp('START_WEEK' + n + '_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK' + n + '_TSV', 'i'));
    if (!m) return null;
    let total = 0;
    const lines = m[1].split('\n').slice(1);
    for (const line of lines) {
      const c = line.split('\t');
      if (c.length < 5) continue;
      if (/^\s*\[(?:WARMUP|חימום)\]/i.test(c[1] || '')) continue;
      const n2 = Number(String(c[3]).match(/\d+/) ? String(c[3]).match(/\d+/)[0] : 0);
      total += n2 || 0;
    }
    return total;
  }

  // A block aimed at a meet eight weeks out is an intensification build, and its
  // last week is not an expression week. "Express" claims the athlete is
  // realising fitness for competition; naming a 59-set five-day week that reads
  // as more advanced than the prescription actually is. Realization words are
  // reserved for a block that genuinely reaches the event -- which the engine
  // already states in its opening sentence, so this reads that rather than
  // guessing. Checked before the taper pattern because the sentence that
  // establishes an intensification block is usually "not the taper".
  const INTENSIFICATION_NARRATIVE = /\b(?:intensification|pre[- ]?peak|prepeak|build block|not the (?:taper|peak))\b/i;
  const REALIZATION_NARRATIVE = /\b(?:taper|realizations?|realisations?|peaking|competition week|fight week|meet week)\b/i;

  function blockPhase(program) {
    const narrative = String(program || '').split(/START_WEEK1_TSV/i)[0];
    if (INTENSIFICATION_NARRATIVE.test(narrative)) return 'intensification';
    if (REALIZATION_NARRATIVE.test(narrative)) return 'realization';
    return 'general';
  }

  function weekTitle(n, program) {
    const phase = blockPhase(program);
    if (phase === 'intensification') {
      // Volume coming down here is specificity, not consolidation or expression.
      if (n === 1) return 'WEEK 1 — ACCUMULATION';
      if (n === 2) return 'WEEK 2 — INTENSIFICATION';
      if (n === 3) return 'WEEK 3 — INTENSIFICATION';
      return 'WEEK 4 — SPECIFIC CONSOLIDATION';
    }
    if (n === 1) return 'WEEK 1 — FOUNDATION';
    if (n === 2) return 'WEEK 2 — BUILD';
    if (n === 4) {
      const w3 = weekSets(program, 3);
      const w4 = weekSets(program, 4);
      // Only claim consolidation when the week actually consolidates.
      return (w3 != null && w4 != null && w4 >= w3)
        ? 'WEEK 4 — PEAK LOAD'
        : 'WEEK 4 — CONSOLIDATE / EXPRESS';
    }
    const narrative = String(program || '').split(/START_WEEK1_TSV/i)[0];
    return DEVELOPMENTAL_NARRATIVE.test(narrative)
      ? 'WEEK 3 — PEAK LOAD'
      : 'WEEK 3 — SPECIFICITY';
  }
  function applyTrackingValidation(cell, kind) {
    cell.dataValidation = kind==='status'
      ? {type:'list',allowBlank:true,formulae:['"Not Started,In Progress,Complete"']}
      : {type:'list',allowBlank:true,formulae:['",✓"']};
  }
  function renderWeek(ws, intake, week, program) {
    ws.views=[{showGridLines:false,state:'frozen',ySplit:4}];
    [29,23,9,17,14,16,50,13,38,14,9].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,1,11,weekTitle(week.week, program),NAVY,16);
    mergeTitle(ws,2,11,'Exact live production prescription in the approved client template. Day names are section bands, not a permanent data column.',NAVY_2,10,'FFDCE7F7');
    const headers=['Exercise','Load / Target','Sets','Reps / Duration','Rest','Effort','Coaching Note','Log','Video','Status','Done'];
    let row=4;
    headers.forEach((v,j)=>{const c=ws.getRow(row).getCell(j+1);c.value=v;fill(c,HEADER);font(c,{size:10,bold:true,color:WHITE});align(c,{horizontal:'center'});});
    row++;
    const ss=sessions(week);
    ss.forEach((session,i)=>{
      ws.mergeCells(row,1,row,11);
      const band=ws.getRow(row).getCell(1); band.value=sessionLabel(intake,session,i); fill(band,DAY_BAND); font(band,{size:10,bold:true,color:'FF0B1324'}); align(band); ws.getRow(row).height=24; row++;
      for(const r of session.rows){
        const vals=[r.exercise,r.load,r.sets,r.reps,r.rest,r.effort,r.notes,'','','',''];
        vals.forEach((v,j)=>{const c=ws.getRow(row).getCell(j+1);c.value=v;fill(c,BODY);font(c,{size:10});align(c,{horizontal:[2,3,4,5,6,9,10,11].includes(j+1)?'center':'left'});});
        // The exercise name carries its own demo link, so a coach clicks the
        // thing they are reading rather than hunting for a separate column.
        // The Warm-Up sheet already reads this way; the week tables did not.
        setHyperlink(ws.getRow(row).getCell(1),r.exercise,r.exercise,false);
        setHyperlink(ws.getRow(row).getCell(9),r.exercise,'Open demo',true);
        applyTrackingValidation(ws.getRow(row).getCell(10),'status');
        applyTrackingValidation(ws.getRow(row).getCell(11),'done');
        ws.getRow(row).height=34; row++;
      }
      row++;
    });
  }

  async function buildParitySpreadsheet(program, intake={}) {
    if(!window.ExcelJS) throw new Error('Spreadsheet engine did not load. Check your connection and try again.');
    if(window.ExerciseDemos?.load){ try{await window.ExerciseDemos.load();}catch(e){console.warn('Exercise demo library unavailable; using search-link fallback.',e);} }
    const weeks=[1,2,3,4].map(n=>parseWeek(program,n));
    if(weeks.some(w=>!w.rows.length)) throw new Error('The program is missing one or more week tables, so the premium spreadsheet could not be built safely.');
    const wb=new ExcelJS.Workbook(); wb.creator='RAZ Performance Coaching Engine'; wb.created=new Date();
    renderOverview(wb.addWorksheet('Overview'),intake,weeks[0]);
    renderWarmup(wb.addWorksheet('Warm-Up'),intake,weeks[0]);
    weeks.forEach(w=>renderWeek(wb.addWorksheet(`Week ${w.week}`),intake,w,program));
    const buffer=await wb.xlsx.writeBuffer();
    const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='RAZ_4_Week_Performance_Program.xlsx'; document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    return weeks.reduce((n,w)=>n+normalizedRows(w).filter(r=>!/^\s*\[(?:WARMUP|חימום)\]/i.test(r.exercise)).length,0);
  }

  // Preserve parser helpers from spreadsheet.js, but make this the only client export path.
  window.buildStrengthSpreadsheet=buildParitySpreadsheet;
})();
