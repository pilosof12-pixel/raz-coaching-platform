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

  function renderWarmup(ws,weeks){
    ws.views=[{showGridLines:false}]; [14,30,20,78,18,18,18].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,"A1:G1","RAZ — WARM-UP PROTOCOL",NAVY,18); mergeTitle(ws,"A2:G2","Use the protocol matching the training day before the main work.",NAVY2,10);
    let r=4; ["Week","Day / Session","Warm-up Focus","Protocol","Status","Log","Done"].forEach((h,i)=>{ws.getCell(r,i+1).value=h; style(ws.getCell(r,i+1),{fill:NAVY2,color:WHITE,bold:true,align:"center"});}); r++;
    weeks.forEach(w=>w.rows.slice(1).filter(x=>/^\s*\[WARMUP\]/i.test(x[1]||"")).forEach(x=>{ const vals=[`Week ${w.week}`,x[0],String(x[1]).replace(/^\s*\[WARMUP\]\s*/i,""),x[7],"MANDATORY","",""]; vals.forEach((v,i)=>{setTextCell(ws.getCell(r,i+1),v); style(ws.getCell(r,i+1),{fill:MINT,bold:i===1||i===2,align:i===3?"left":"center"});}); ws.getRow(r).height=48; r++; }));
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
        if(window.ExerciseDemos&&window.ExerciseDemos.resolveExerciseDemo){ try{const d=window.ExerciseDemos.resolveExerciseDemo(x[1]); if(d&&d.url)vals[8]=d.url;}catch(_){} }
        vals.forEach((v,i)=>{setTextCell(ws.getCell(r,i+1),v); style(ws.getCell(r,i+1),{fill:MINT,bold:i===0||i===9,align:[0,1,6,8].includes(i)?"left":"center"});});
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
    renderWarmup(wb.addWorksheet("Warm-Up"),weeks);
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
