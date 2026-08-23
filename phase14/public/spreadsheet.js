// Client-facing spreadsheet builder aligned to the approved RAZ template.
// Exposes window.buildStrengthSpreadsheet, window.hasSpreadsheetData,
// window.getProgramTable, and window.splitProgramNarrative. Depends on ExcelJS.
(function () {
  const REQUIRED = ["Day", "Exercise", "Weight", "Sets", "Reps", "Rest", "Target RPE", "Notes", "Results"];
  const SYNONYMS = {
    day:"Day", exercise:"Exercise", movement:"Exercise", weight:"Weight", load:"Weight",
    sets:"Sets", reps:"Reps", "reps/duration":"Reps", duration:"Reps", rest:"Rest",
    "target rpe":"Target RPE", rpe:"Target RPE", "load/rir":"Target RPE", "load/rir/rpe":"Target RPE",
    notes:"Notes", modification:"Notes", modifications:"Notes", purpose:"Notes", results:"Results"
  };
  const NAVY = "FF0D1B33", NAVY2 = "FF273E63", MINT = "FFE8F7F1", LIGHT = "FFF1F4F8", WHITE = "FFFFFFFF", BLACK = "FF111111", BORDER = "FFD7DEE8";

  function cleanCell(value) {
    return String(value == null ? "" : value).replace(/<br\s*\/?>/gi,"\n").replace(/\\n/g,"\n").replace(/\*\*/g,"").replace(/`/g,"").replace(/[ \t\r\f\v]+/g," ").replace(/ *\n */g,"\n").trim();
  }
  function normalizeHeader(value){ const k=cleanCell(value).toLowerCase(); return SYNONYMS[k] || cleanCell(value); }
  function setTextCell(cell,value){ cell.value=value==null?"":String(value); cell.numFmt = "@"; return cell.value; }
  function isHebrewProgram(text,intake){ return /[\u0590-\u05FF]/.test(String(text||"")+" "+JSON.stringify(intake||{})); }
  function parseDelimitedRegion(text,startMarker,endMarker){
    let raw=String(text||"").replace(/```(?:text|tsv|plaintext)?/gi,"").replace(/```/g,"").trim();
    if(startMarker&&endMarker){ const s=raw.indexOf(startMarker),e=raw.indexOf(endMarker); if(s<0||e<0||e<=s)return null; raw=raw.slice(s+startMarker.length,e).trim(); }
    const lines=raw.split(/\r?\n/).filter(l=>l.trim()); if(!lines.length)return null;
    const d=lines[0].includes("\t")?"\t":lines[0].includes(",")?",":null; if(!d)return null;
    return lines.map(line=>line.split(d).map(cleanCell));
  }
  function parseMarkdownTable(text){
    const lines=String(text||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean).filter(l=>l.includes("|"));
    if(lines.length<2)return null;
    const rows=lines.map(l=>l.replace(/^\|/,"").replace(/\|$/,"").split("|").map(cleanCell)).filter(c=>c.length>=2).filter(c=>!c.every(x=>/^:?-{3,}:?$/.test(x)));
    return rows.length?rows:null;
  }
  function convertRows(rows){
    if(!rows||rows.length<2) throw new Error("Could not find a table with a header row and exercise rows.");
    const headers=rows[0].map(normalizeHeader), map={}; headers.forEach((h,i)=>{ if(map[h]===undefined)map[h]=i; });
    if(map.Exercise===undefined) throw new Error("Could not find an Exercise column.");
    const out=[REQUIRED]; let lastDay="";
    for(const row of rows.slice(1)){
      if(!row.some(Boolean))continue; const get=n=>map[n]===undefined?"":cleanCell(row[map[n]]);
      let day=get("Day")||lastDay; if(day)lastDay=day; const ex=get("Exercise"); if(!ex||/^exercise$/i.test(ex))continue;
      out.push([day,ex,get("Weight"),get("Sets"),get("Reps"),get("Rest"),get("Target RPE"),get("Notes"),""]);
    }
    if(out.length<2)throw new Error("No exercise rows were found after the header."); return out;
  }
  function extractRows(text){ return convertRows(parseDelimitedRegion(text,"START_WEEK1_TSV","END_WEEK1_TSV") || parseDelimitedRegion(text,null,null) || parseMarkdownTable(text)); }
  function extractWeek(text,n){ const r=parseDelimitedRegion(text,`START_WEEK${n}_TSV`,`END_WEEK${n}_TSV`); if(!r)return null; try{return convertRows(r)}catch(_){return null} }
  function extractAllWeeks(text){ const weeks=[]; const w1=extractWeek(text,1); weeks.push({week:1,rows:w1||extractRows(text)}); for(let n=2;n<=4;n++){const r=extractWeek(text,n); if(r)weeks.push({week:n,rows:r});} return weeks; }
  function stripMachineBlocks(text){
    let x=String(text||""); for(let n=1;n<=4;n++)x=x.replace(new RegExp(`START_WEEK${n}_TSV[\\s\\S]*?END_WEEK${n}_TSV`,"g"),"");
    return x.replace(/^QA_FORMULA_VIOLATION_COUNT:.*$/gm,"").replace(/^QA_NOTES:.*$/gm,"").replace(/```[a-z]*\n?/gi,"").replace(/\n{3,}/g,"\n\n").trim();
  }
  function style(cell,{fill=WHITE,color=BLACK,bold=false,size=10,align="left",border=BORDER,italic=false}={}){
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:fill}}; cell.font={name:"Calibri",size,bold,italic,color:{argb:color}};
    cell.alignment={vertical:"middle",horizontal:align,wrapText:true}; cell.border={top:{style:"thin",color:{argb:border}},bottom:{style:"thin",color:{argb:border}},left:{style:"thin",color:{argb:border}},right:{style:"thin",color:{argb:border}}};
  }
  function mergeTitle(ws,range,text,fill=NAVY,size=18){ ws.mergeCells(range); const c=ws.getCell(range.split(":")[0]); c.value=text; style(c,{fill,color:WHITE,bold:true,size,align:"left",border:fill}); }
  function intakeValue(intake,...keys){ for(const k of keys){ const v=intake?.[k]; if(Array.isArray(v)&&v.length)return v.filter(Boolean).join("; "); if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim(); } return ""; }
  function lineList(v){ return Array.isArray(v)?v.filter(Boolean):String(v||"").split(/\n|;/).map(s=>s.trim()).filter(Boolean); }
  function titleFromGoals(intake){ const p=intakeValue(intake,"primary_goals","goal_primary","primary_goal"); const first=lineList(p)[0]||"INDIVIDUALIZED PERFORMANCE"; return first.toUpperCase().slice(0,80); }
  function programSubtitle(intake){ const goals=lineList(intakeValue(intake,"primary_goals","goal_primary","primary_goal")).slice(0,2).join(" + "); return `4-WEEK ${goals || "INDIVIDUALIZED TRAINING"} BLOCK`.toUpperCase(); }

  function renderOverview(ws,weeks,text,intake){
    ws.views=[{showGridLines:false}]; [34,78,20,56,16,16,16,16].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,"A1:H1",`RAZ — ${titleFromGoals(intake)}`,NAVY,18); mergeTitle(ws,"A2:H2",programSubtitle(intake),NAVY2,11);
    ws.getRow(1).height=24; ws.getRow(2).height=20;
    const age=intakeValue(intake,"age"); const primary=intakeValue(intake,"primary_goals","goal_primary","primary_goal"); const secondary=intakeValue(intake,"secondary_goals","goal_secondary","secondary_goal");
    const benchmarks=intakeValue(intake,"current_numbers","performance_markers"); const equipment=intakeValue(intake,"equipment"); const pain=intakeValue(intake,"injuries","pain_description"); const freq=intakeValue(intake,"days_per_week","days"); const sport=intakeValue(intake,"sport");
    const profile=[["ATHLETE PROFILE","DETAIL"],["Age",age||"Not specified"],["Primary goals",primary||"Not specified"],["Secondary goal",secondary||"None specified"],["Current benchmarks",benchmarks||"Not specified"],["Training frequency",freq?`${freq} structured sessions/week`:"Not specified"],["Concurrent sport",sport||"None reported"],["Equipment",equipment||"Not specified"],["Pain / injury",pain||"None reported"]];
    let r=4; profile.forEach((row,i)=>{ ws.getCell(r+i,1).value=row[0]; ws.getCell(r+i,2).value=row[1]; style(ws.getCell(r+i,1),{fill:i===0?NAVY2:LIGHT,color:i===0?WHITE:BLACK,bold:true,align:i===0?"center":"left"}); style(ws.getCell(r+i,2),{fill:i===0?NAVY2:WHITE,color:i===0?WHITE:BLACK,bold:i===0,align:i===0?"center":"left"}); });
    r+=profile.length+1; mergeTitle(ws,`A${r}:D${r}`,"WEEKLY STRUCTURE",NAVY2,11); r++;
    ["DAY / SESSION","TYPE","PRIORITY","COACHING PURPOSE"].forEach((h,i)=>{ws.getCell(r,i+1).value=h; style(ws.getCell(r,i+1),{fill:LIGHT,bold:true,align:"center"});}); r++;
    const groups={}; weeks[0].rows.slice(1).filter(x=>!/^\s*\[WARMUP\]/i.test(x[1]||"")).forEach(x=>{groups[x[0]]=(groups[x[0]]||[]).concat(x[1]);});
    Object.entries(groups).forEach(([day,exs])=>{ ws.getCell(r,1).value=day; ws.getCell(r,2).value=exs.slice(0,3).join(" + "); ws.getCell(r,3).value="MANDATORY"; ws.getCell(r,4).value="Complete the prescribed work at the listed effort and preserve technical quality."; for(let c=1;c<=4;c++)style(ws.getCell(r,c),{fill:WHITE,bold:c===1}); r++; });
    r+=1; mergeTitle(ws,`A${r}:H${r}`,"PROGRAM RULES",NAVY,11); r++;
    const narrative=stripMachineBlocks(text); const rules=narrative.split(/\n{2,}/).filter(Boolean).slice(0,6); if(!rules.length)rules.push("Follow the prescribed RPE, stop sets when technique deteriorates, and use the Results / Log columns to record actual performance.");
    rules.forEach(rule=>{ ws.mergeCells(`A${r}:H${r}`); const c=ws.getCell(r,1); c.value="• "+rule.replace(/\n/g," "); style(c,{fill:WHITE,align:"left"}); ws.getRow(r).height=Math.min(60,18+Math.ceil(rule.length/120)*14); r++; });
  }

  // The warm-up is one protocol, not four copies of it. It used to be emitted
  // once per day per week -- sixteen near-identical rows -- with the whole
  // protocol crammed into a single cell, so a client could not read it and a
  // coach could not check it. It is now laid out the way the approved template
  // does: a daily circuit listed once, then the ramps that differ by day, with
  // every movement in its own row.

  // A protocol cell is a semicolon-separated mix of three things: a purpose
  // line, individual drills carrying their own dose, and load ramps.
  // The dose is everything from the first count onwards, INCLUDING a leading
  // "x". Capturing only the number left the movement reading "Squat-and-reach x".
  const DOSE_TAIL=/\s+((?:\d+\s*(?:x|×)\s*)?(?:x|×)?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*(?:sec|secs|s|min|reps?|each side|\/\s*side|per side))?)\s*$/i;
  function classifyWarmupSegment(raw){
    const text=cleanCell(raw); if(!text) return null;
    if(/^ramp\b/i.test(text)){
      const m=text.match(/^ramp\s+([^:]+):\s*(.+)$/i);
      return m?{kind:"ramp",movement:cleanCell(m[1]),dose:cleanCell(m[2]).replace(/\.$/,"")}:{kind:"ramp",movement:"",dose:text};
    }
    const m=text.match(DOSE_TAIL);
    if(m&&!/[.!?]$/.test(text)){
      const movement=cleanCell(text.slice(0,m.index)).replace(/\s*(?:x|×)\s*$/i,"");
      let dose=cleanCell(m[1]);
      if(/^\d/.test(dose)&&!/(?:x|×)/i.test(dose)) dose=`x ${dose}`;
      return {kind:"drill",movement,dose};
    }
    return {kind:"note",movement:"",dose:text};
  }
  function warmupProtocolsByDay(weeks){
    const byDay=new Map();
    weeks.forEach(w=>w.rows.slice(1).forEach(x=>{
      if(!/^\s*\[WARMUP\]/i.test(x[1]||""))return;
      const day=cleanCell(x[0]); if(!day)return;
      const segments=String(x[7]||"").split(";").map(classifyWarmupSegment).filter(Boolean);
      if(!byDay.has(day))byDay.set(day,{drills:new Map(),ramps:new Map(),notes:new Set(),rest:cleanCell(x[5])});
      const entry=byDay.get(day);
      for(const seg of segments){
        if(seg.kind==="drill"&&seg.movement)entry.drills.set(seg.movement.toLowerCase(),seg);
        else if(seg.kind==="ramp")entry.ramps.set((seg.movement||seg.dose).toLowerCase(),seg);
        else if(seg.kind==="note")entry.notes.add(seg.dose);
      }
    }));
    return byDay;
  }

  function renderWarmup(ws,weeks,intake){
    ws.views=[{showGridLines:false}]; [22,42,30,12,64].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,"A1:E1","RAZ — WARM-UP PROTOCOL",NAVY,18);
    mergeTitle(ws,"A2:E2","Run the daily circuit before every session, then the ramps for that day. Same circuit every week.",NAVY2,10);

    const byDay=warmupProtocolsByDay(weeks);
    if(!byDay.size){ mergeTitle(ws,"A4:E4","No warm-up protocol was prescribed for this block.",LIGHT,10); return; }

    // Drills prescribed on every training day are the shared circuit; anything
    // else belongs to the day that asks for it.
    const days=[...byDay.keys()];
    const counts=new Map();
    days.forEach(d=>byDay.get(d).drills.forEach((_,k)=>counts.set(k,(counts.get(k)||0)+1)));
    // Requiring a drill on EVERY day emptied the circuit as soon as one session
    // prepped differently, and the same movements were then repeated under every
    // day heading. A drill prescribed on most days is the daily circuit.
    const threshold=Math.max(2,Math.ceil(days.length/2));
    const shared=[...counts.entries()].filter(([,n])=>n>=threshold).map(([k])=>k);
    const drillFor=(key)=>{ for(const d of days){ const hit=byDay.get(d).drills.get(key); if(hit) return hit; } return null; };
    let r=4;
    const sectionBar=(label)=>{ ws.mergeCells(`A${r}:E${r}`); ws.getCell(r,1).value=label; style(ws.getCell(r,1),{fill:NAVY,color:WHITE,bold:true,align:"left"}); r++; };
    const headerRow=(cols)=>{ cols.forEach((h,i)=>{ws.getCell(r,i+1).value=h; style(ws.getCell(r,i+1),{fill:NAVY2,color:WHITE,bold:true,align:"center"});}); r++; };
    const bodyRow=(cols,fill)=>{ cols.forEach((v,i)=>{setTextCell(ws.getCell(r,i+1),v); style(ws.getCell(r,i+1),{fill:fill||MINT,bold:i===0,align:i>=2&&i<=3?"center":"left"});}); ws.getRow(r).height=Math.max(18,Math.ceil(String(cols[4]||"").length/60)*15); r++; };

    if(shared.length){
      sectionBar("DAILY PREP CIRCUIT  •  1 ROUND  •  LOW FATIGUE");
      headerRow(["Section","Movement","Dose","Rest","Purpose"]);
      shared.forEach((key,i)=>{ const d=drillFor(key); if(!d)return;
        bodyRow([`PREP ${i+1}`,d.movement,d.dose,"0 s",""]); });
      ws.mergeCells(`A${r}:E${r}`); ws.getCell(r,1).value="Keep the circuit brief and non-fatiguing. It prepares the session; it is not part of it.";
      style(ws.getCell(r,1),{fill:LIGHT,color:"FF526173",italic:true,align:"left"}); r+=2;
    }

    days.forEach(day=>{
      const entry=byDay.get(day);
      const own=[...entry.drills.entries()].filter(([k])=>!shared.includes(k)).map(([,v])=>v);
      const ramps=[...entry.ramps.values()];
      if(!own.length&&!ramps.length)return;
      sectionBar(`${day.toUpperCase()}  |  SPECIFIC PREPARATION`);
      headerRow(["Type","Movement","Dose / Ramp","Rest","Purpose"]);
      own.forEach(d=>bodyRow(["Prep",d.movement,d.dose,"0 s",""]));
      ramps.forEach(d=>bodyRow(["Load ramp",d.movement||"Work-set ramp",d.dose,entry.rest||"45-90 s","Build to the first work set without spending it."]));
      r++;
    });

    const rules=[...new Set([...byDay.values()].flatMap(e=>[...e.notes]))].filter(Boolean);
    if(rules.length){
      sectionBar("PROTOCOL RULES");
      rules.forEach(text=>{ ws.mergeCells(`A${r}:E${r}`); ws.getCell(r,1).value=text;
        style(ws.getCell(r,1),{fill:"FF3A3320",color:"FFF2E7C3",align:"left"}); ws.getRow(r).height=Math.max(18,Math.ceil(text.length/110)*15); r++; });
    }
  }

  const WEEK_INTENT={1:"FOUNDATION • Establish repeatable execution and baseline quality",2:"BUILD • Progress one or two variables while keeping recovery under control",3:"SPECIFICITY • Push the main progression lever without increasing everything",4:"CONSOLIDATE • Retain the best standard with lower fatigue"};
  function renderWeek(ws,wk,intake){
    ws.views=[{showGridLines:false,state:"frozen",ySplit:8}]; [34,24,9,16,14,16,56,18,34,16,10].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,"A1:K1",`RAZ — ${titleFromGoals(intake)}`,NAVY,17); mergeTitle(ws,"A2:K2",`INDIVIDUALIZED TRAINING BLOCK • WEEK ${wk.week}`,NAVY2,10);
    mergeTitle(ws,"A4:K4",`WEEK INTENT • ${WEEK_INTENT[wk.week]||"PROGRESS WITH CONTROL"}`,NAVY,10);
    const all=wk.rows.slice(1), days=[]; all.forEach(x=>{if(!days.includes(x[0]))days.push(x[0]);}); let r=6;
    days.forEach((day,di)=>{
      const main=all.filter(x=>x[0]===day&&!/^\s*\[WARMUP\]/i.test(x[1]||"")); if(!main.length)return;
      mergeTitle(ws,`A${r}:K${r}`,`${day.toUpperCase()}  |  TRAINING SESSION  •  MANDATORY`,NAVY2,10); r++;
      ws.mergeCells(`A${r}:K${r}`); ws.getCell(r,1).value=`WARM-UP • Use the ${day} protocol in the Warm-Up tab`; style(ws.getCell(r,1),{fill:LIGHT,color:"FF526173",italic:true,align:"left"}); r++;
      const headers=["Exercise","Load / Target","Sets","Reps / Duration","Rest","Effort","Coaching Note","Log","Video","Status","Done"];
      headers.forEach((h,i)=>{ws.getCell(r,i+1).value=h; style(ws.getCell(r,i+1),{fill:NAVY2,color:WHITE,bold:true,align:"center"});}); r++;
      main.forEach(x=>{
        const optional=/\boptional\b/i.test(x[7]||""); const vals=[x[1],x[2],x[3],x[4],x[5],x[6],x[7],"","",optional?"OPTIONAL":"MANDATORY",""];
        let demoUrl="";
        if(window.ExerciseDemos&&window.ExerciseDemos.resolveExerciseDemo){ try{const d=window.ExerciseDemos.resolveExerciseDemo(x[1]); if(d&&d.url){demoUrl=d.url; vals[8]=d.url;}}catch(_){} }
        vals.forEach((v,i)=>{setTextCell(ws.getCell(r,i+1),v); style(ws.getCell(r,i+1),{fill:MINT,bold:i===0||i===9,align:[0,1,6,8].includes(i)?"left":"center"});});
        // The demo belongs on the movement the athlete is reading, not only in a
        // column further along the row that they have to look across for.
        if(demoUrl){
          const nameCell=ws.getCell(r,1);
          nameCell.value={text:String(x[1]||""),hyperlink:demoUrl,tooltip:"Watch the movement demo"};
          style(nameCell,{fill:MINT,bold:true,align:"left"});
          nameCell.font={...(nameCell.font||{}),color:{argb:"FF0B6B5B"},underline:true,bold:true};
          const videoCell=ws.getCell(r,9);
          videoCell.value={text:"Watch",hyperlink:demoUrl,tooltip:"Watch the movement demo"};
          videoCell.font={...(videoCell.font||{}),color:{argb:"FF0B6B5B"},underline:true};
        }
        if(vals[8]){ ws.getCell(r,9).value={text:vals[8],hyperlink:vals[8]}; ws.getCell(r,9).font={name:"Calibri",size:9,color:{argb:"FF0563C1"},underline:true}; }
        ws.getRow(r).height=42; r++;
      });
      r+= di===days.length-1?0:2;
    });
  }

  function renderQa(ws,weeks,text,intake){
    ws.views=[{showGridLines:false}]; [34,14,14,62,56,8,24,22].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,"A1:H1","RAZ — FINAL QA",NAVY,18);
    const checks=[
      ["Four-week structure",weeks.length===4,"All generated weeks are present"],
      ["Warm-up routing",weeks.some(w=>w.rows.slice(1).some(x=>/^\s*\[WARMUP\]/i.test(x[1]||""))),"Warm-up rows are separated from main work"],
      ["Client-clean output",!/(START_WEEK|END_WEEK|QA_FORMULA_VIOLATION_COUNT)/.test(stripMachineBlocks(text)),"No machine markers appear in client prose"],
      ["Results logging",true,"Every exercise row includes a Log and Done field"],
      ["Video support",true,"Exercise demo column is included when a demo resolves"],
      ["Intake context",!!intakeValue(intake,"primary_goals","goal_primary","primary_goal"),"Primary goal is carried into the workbook"],
    ];
    const headers=["QA Check","Status","Rating","Evidence","Comment","","FINAL SCORE","VALUE"]; headers.forEach((h,i)=>{ws.getCell(3,i+1).value=h; style(ws.getCell(3,i+1),{fill:NAVY2,color:WHITE,bold:true,align:"center"});});
    checks.forEach((c,idx)=>{const r=4+idx; const vals=[c[0],c[1]?"PASS":"CHECK",c[1]?"✓":"!",c[2],c[1]?"Ready":"Review before client delivery","",idx===0?"Delivery verdict":"",idx===0?(checks.every(x=>x[1])?"CLIENT READY":"REVIEW REQUIRED"):""]; vals.forEach((v,i)=>{setTextCell(ws.getCell(r,i+1),v); style(ws.getCell(r,i+1),{fill:i>=6?LIGHT:WHITE,bold:i===0||i===1||i>=6,align:i===3||i===4?"left":"center"});}); });
  }

  async function buildStrengthSpreadsheet(text,intake={}){
    if(!window.ExcelJS)throw new Error("Spreadsheet engine did not load. Check your connection and try again.");
    if(window.ExerciseDemos&&window.ExerciseDemos.load){try{await window.ExerciseDemos.load();}catch(_){} }
    const weeks=extractAllWeeks(text); const wb=new ExcelJS.Workbook(); wb.creator="Raz Pilosof Coaching Engine"; wb.created=new Date();
    renderOverview(wb.addWorksheet("Overview"),weeks,text,intake);
    renderWarmup(wb.addWorksheet("Warm-Up"),weeks,intake);
    weeks.forEach(w=>renderWeek(wb.addWorksheet(`Week ${w.week}`),w,intake));
    renderQa(wb.addWorksheet("QA Checklist"),weeks,text,intake);
    const isHebrew=isHebrewProgram(text,intake);
    wb.worksheets.forEach(ws=>{ ws.views=(ws.views&&ws.views.length?ws.views:[{}]).map(v=>({...v, rightToLeft: isHebrew})); });
    const buffer=await wb.xlsx.writeBuffer(); const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="raz_individualized_training_block.xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    return weeks.reduce((n,w)=>n+w.rows.length-1,0);
  }
  function hasSpreadsheetData(text){try{extractRows(text);return true}catch(_){return false}}
  function getProgramTable(text){try{return extractRows(text)}catch(_){return null}}
  function splitProgramNarrative(text){const before=stripMachineBlocks(text);return {before,after:""};}
  window.buildStrengthSpreadsheet=buildStrengthSpreadsheet; window.hasSpreadsheetData=hasSpreadsheetData; window.getProgramTable=getProgramTable; window.splitProgramNarrative=splitProgramNarrative;
})();
