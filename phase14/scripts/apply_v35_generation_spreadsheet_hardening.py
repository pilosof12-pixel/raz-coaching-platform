from pathlib import Path

# A) Maximise single-run generation quality before paid QA.
p = Path('phase14/scripts/build_phase15_runtime.mjs')
s = p.read_text()
replacements = [
    ('const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || \\"low\\";',
     'const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || \\"high\\";'),
    ('const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 14000);',
     'const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 24000);'),
    ('const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || (OPENAI_API_KEY ? 120000 : 110000));',
     'const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || (OPENAI_API_KEY ? 180000 : 110000));'),
    ('const BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || (OPENAI_API_KEY ? 180000 : 210000));',
     'const BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || (OPENAI_API_KEY ? 360000 : 210000));'),
    ('const MAX_ATTEMPTS = OPENAI_API_KEY ? 1 : 3;',
     'const MAX_ATTEMPTS = OPENAI_API_KEY ? 2 : 3;'),
]
for old, new in replacements:
    if old in s:
        s = s.replace(old, new, 1)
    elif new not in s:
        raise SystemExit(f'generation hardening anchor missing: {old[:80]}')

audit_anchor = '  \\"Return only a short client-ready intro, a short weeks 2-4 progression note, pain/substitution guidance relevant to this athlete, then the four TSV blocks.\\"\\n].join(\\"\\\\n\\");'
audit_replacement = '  \\"SILENT FINAL AUDIT BEFORE OUTPUT: use the reasoning budget to review all four weeks as one program. Confirm primary goals own the best readiness slots, the actual target quality is trained directly, maintenance stays stable unless deliberately developed, total workload includes all generated work, week-to-week progression language matches the structured dose, every numerical note agrees with Sets x Reps, and injury/recovery responses target the provocative or newest stressor. Repair any violation before answering. Do not print this audit.\\",\\n  \\"Return only a short client-ready intro, a short weeks 2-4 progression note, pain/substitution guidance relevant to this athlete, then the four TSV blocks.\\"\\n].join(\\"\\\\n\\");'
if audit_anchor in s:
    s = s.replace(audit_anchor, audit_replacement, 1)
elif 'SILENT FINAL AUDIT BEFORE OUTPUT' not in s:
    raise SystemExit('final-audit prompt anchor missing')
p.write_text(s)

# B) Approved spreadsheet parity.
p = Path('phase14/public/spreadsheet-parity.js')
s = p.read_text()
if "const DAY_BAND = 'FFD9E5F5';" not in s:
    s = s.replace("  const LABEL = 'FFF2F5F9';", "  const LABEL = 'FFF2F5F9';\n  const DAY_BAND = 'FFD9E5F5';", 1)

old_link = """  function setHyperlink(cell, name) {
    const url=fallbackDemo(name);
    cell.value={text:url,hyperlink:url,tooltip:'Open exercise demonstration'};
    font(cell,{size:10,color:LINK,underline:true}); align(cell);
    return url;
  }
"""
new_link = """  function setHyperlink(cell, name, visibleText='Open demo', linkStyle=true) {
    const url=fallbackDemo(name);
    cell.value={text:visibleText,hyperlink:url,tooltip:'Open exercise demonstration'};
    if(linkStyle) font(cell,{size:10,color:LINK,underline:true}); else font(cell,{size:11,color:TEXT});
    align(cell);
    return url;
  }
"""
if old_link in s:
    s = s.replace(old_link, new_link, 1)
elif new_link not in s:
    raise SystemExit('hyperlink helper anchor missing')

start = s.index('  function renderOverview(')
end = s.index('  function derivedWarmup(', start)
new_overview = r'''  function overviewTitle(intake={}) {
    const g=`${joinGoals(intake.primary_goals)} ${joinGoals(intake.secondary_goals)}`;
    if(/3\s*k(?:m)?|ruck|tactical|special[- ]?operations/i.test(`${g} ${text(intake.notes)}`)) return 'RAZ — TACTICAL 3K / GPP PROGRAM';
    if(ageFromIntake(intake) && ageFromIntake(intake)<18) return 'RAZ — YOUTH PERFORMANCE PROGRAM';
    if(/one[- ]?arm\s*(?:pull|chin)|marathon|back squat|overhead press/i.test(g)) return 'RAZ — ADVANCED HYBRID PERFORMANCE PROGRAM';
    return 'RAZ — PERFORMANCE PROGRAM';
  }

  function renderOverview(ws, intake, week1) {
    ws.views=[{showGridLines:false}];
    [28,34,16,48].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,1,4,overviewTitle(intake),NAVY,16);
    mergeTitle(ws,2,4,'EXACT LIVE PRODUCTION ACCEPTANCE — 4-WEEK BLOCK',NAVY_2,10,'FFDCE7F7');
    let row=4;
    ['ATHLETE / PROGRAM','DETAIL','',''].forEach((v,i)=>{const c=ws.getRow(row).getCell(i+1);c.value=v;fill(c,HEADER);font(c,{size:10,bold:true,color:WHITE});align(c,{horizontal:'center'});});
    row++;
    for(const [k,v] of profileRows(intake)){
      const a=ws.getRow(row).getCell(1), b=ws.getRow(row).getCell(2);
      a.value=k; b.value=v; fill(a,LABEL); font(a,{size:10,bold:true}); align(a);
      font(b,{size:10}); align(b); ws.mergeCells(row,2,row,4); ws.getRow(row).height=34; row++;
    }
    row++;
    mergeTitle(ws,row,4,'PROGRAM RULES',DAY_BAND,10,'FF0B1324'); row++;
    for(const rule of programRules(intake)){
      ws.mergeCells(row,1,row,4); const c=ws.getRow(row).getCell(1); c.value='• '+rule; font(c,{size:10}); align(c); ws.getRow(row).height=32; row++;
    }
  }

'''
s = s[:start] + new_overview + s[end:]

start = s.index('  function renderWarmup(')
end = s.index('  function weekIntent(', start)
new_warmup = r'''  function splitWarmupDose(raw) {
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
        items=same.map(x=>({exercise:x.exercise.replace(/^\s*\[(?:WARMUP|חימום)\]\s*/i,''),sets:x.sets||'1',reps:x.reps||'N/A',rest:x.rest||'N/A',note:x.notes||'Session-specific preparation'}));
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

'''
s = s[:start] + new_warmup + s[end:]

start = s.index('  function weekIntent(')
end = s.index('  async function buildParitySpreadsheet(', start)
new_week = r'''  function weekTitle(n) {
    return n===1?'WEEK 1 — FOUNDATION':n===2?'WEEK 2 — BUILD':n===3?'WEEK 3 — SPECIFICITY':'WEEK 4 — CONSOLIDATE / EXPRESS';
  }
  function applyTrackingValidation(cell, kind) {
    cell.dataValidation = kind==='status'
      ? {type:'list',allowBlank:true,formulae:['"Not Started,In Progress,Complete"']}
      : {type:'list',allowBlank:true,formulae:['",✓"']};
  }
  function renderWeek(ws, intake, week) {
    ws.views=[{showGridLines:false,state:'frozen',ySplit:4}];
    [29,23,9,17,14,16,50,13,38,14,9].forEach((w,i)=>ws.getColumn(i+1).width=w);
    mergeTitle(ws,1,11,weekTitle(week.week),NAVY,16);
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
        setHyperlink(ws.getRow(row).getCell(9),r.exercise,'Open demo',true);
        applyTrackingValidation(ws.getRow(row).getCell(10),'status');
        applyTrackingValidation(ws.getRow(row).getCell(11),'done');
        ws.getRow(row).height=34; row++;
      }
      row++;
    });
  }

'''
s = s[:start] + new_week + s[end:]
p.write_text(s)

# C) Source-level zero-credit regression for exact approved structure.
Path('phase14/test/spreadsheet_approved_parity.test.js').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url),'utf8');

test('approved spreadsheet has exact six-tab production structure',()=>{
  assert.match(src,/addWorksheet\('Overview'\)/);
  assert.match(src,/addWorksheet\('Warm-Up'\)/);
  assert.match(src,/addWorksheet\(`Week \$\{w\.week\}`\)/);
  assert.doesNotMatch(src,/addWorksheet\(['"]QA Checklist['"]\)/);
});

test('approved week sheets use one 11-column header and simple day bands',()=>{
  assert.match(src,/WEEK 1 — FOUNDATION/);
  assert.match(src,/WEEK 4 — CONSOLIDATE \/ EXPRESS/);
  assert.match(src,/Exact live production prescription in the approved client template\. Day names are section bands, not a permanent data column\./);
  assert.match(src,/\['Exercise','Load \/ Target','Sets','Reps \/ Duration','Rest','Effort','Coaching Note','Log','Video','Status','Done'\]/);
  assert.match(src,/const DAY_BAND = 'FFD9E5F5'/);
  assert.doesNotMatch(src,/COACH NOTES/);
  assert.doesNotMatch(src,/WARM-UP • Use/);
});

test('approved tracking and hyperlink behaviour is retained',()=>{
  assert.match(src,/Not Started,In Progress,Complete/);
  assert.match(src,/[✓]/);
  assert.match(src,/setHyperlink\(ws\.getRow\(row\)\.getCell\(9\),r\.exercise,'Open demo',true\)/);
  assert.match(src,/setHyperlink\(ws\.getRow\(row\)\.getCell\(2\),item\.exercise,item\.exercise,false\)/);
});

test('approved warm-up sheet remains six columns',()=>{
  assert.match(src,/\[18,32,10,18,12,54\]/);
  assert.match(src,/\['SESSION \/ DAY','EXERCISE','SETS','REPS \/ DURATION','REST','COACHING NOTE'\]/);
  assert.doesNotMatch(src,/\['Section','Movement \/ Target','Dose','Rest','Purpose','Video','Notes'\]/);
});
''')
