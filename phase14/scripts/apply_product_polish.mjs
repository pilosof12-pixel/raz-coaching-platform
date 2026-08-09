import fs from 'node:fs';

function read(p){return fs.readFileSync(p,'utf8');}
function write(p,s){fs.writeFileSync(p,s); console.log('patched',p);}
function replaceOnce(s,from,to,label){const n=s.split(from).length-1;if(n===0){if(s.includes(to))return s;throw new Error(`${label}: anchor missing`);}if(n!==1)throw new Error(`${label}: expected one anchor, found ${n}`);return s.replace(from,to);}

// 1) Register private QA route in the readable server source. The Phase 15 runtime
// builder starts from this source, so the route survives every deploy rebuild.
{
  const p='phase14/server.js'; let s=read(p);
  s=replaceOnce(s,'import { makeStorage } from "./storage.js";','import { makeStorage } from "./storage.js";\nimport { registerAdminQaRoutes } from "./admin_qa_routes.js";','admin import');
  s=replaceOnce(s,'const app = express();','const app = express();\nregisterAdminQaRoutes(app, store);','admin register');
  write(p,s);
}

// 2) Premium workbook: warm-up protocol gets its own sheet and warm-up rows are
// removed from weekly working tables. This keeps the week tabs compact.
{
  const p='phase14/public/spreadsheet.js'; let s=read(p);
  const fn=`\n  function renderWarmupProtocol(ws, week, options = {}) {\n    const isHebrew = !!options.isHebrew;\n    ws.views = [{ showGridLines: false, rightToLeft: isHebrew }];\n    ws.getColumn(1).width = 14; ws.getColumn(2).width = 72; ws.getColumn(3).width = 46;\n    ws.mergeCells('A1:C2');\n    const title=ws.getCell('A1'); title.value=isHebrew?'פרוטוקול חימום':'WARM-UP PROTOCOL';\n    styleCell(title,{fill:'FF000000',font:{name:'Calibri',size:18,bold:true,color:{argb:'FF18D3C5'}},alignment:{horizontal:isHebrew?'right':'left',vertical:'middle'},border:'FF000000'});\n    ws.getCell('A4').value=isHebrew?'יום':'Day'; ws.getCell('B4').value=isHebrew?'חימום / רמפה':'Warm-up / Ramp'; ws.getCell('C4').value=isHebrew?'הערות':'Notes';\n    for(let c=1;c<=3;c++) styleCell(ws.getRow(4).getCell(c),{fill:'FF18D3C5',font:{name:'Calibri',size:10,bold:true,color:{argb:'FF000000'}},border:'FF18D3C5'});\n    const rows=(week?.rows||[]).slice(1).filter(r=>/^\\s*\\[WARMUP\\]/i.test(r[1]||''));\n    let er=5;\n    for(const row of rows){\n      setTextCell(ws.getRow(er).getCell(1),row[0]||'');\n      setTextCell(ws.getRow(er).getCell(2),String(row[1]||'').replace(/^\\s*\\[WARMUP\\]\\s*/i,''));\n      setTextCell(ws.getRow(er).getCell(3),row[7]||'');\n      for(let c=1;c<=3;c++) styleCell(ws.getRow(er).getCell(c),{fill:'FF111515',font:{name:'Calibri',size:9,color:{argb:'FFFFFFFF'}},alignment:{horizontal:c===1?'center':(isHebrew?'right':'left'),vertical:'middle',wrapText:true},border:'FF293332'});\n      ws.getRow(er).height=42; er++;\n    }\n    if(!rows.length){ws.getCell('A5').value=isHebrew?'לא נדרש פרוטוקול חימום נפרד.':'No separate warm-up rows were generated for this block.'; ws.mergeCells('A5:C6');}\n  }\n`;
  s=replaceOnce(s,'\n  async function buildStrengthSpreadsheet(text, intake = {}) {',fn+'\n  async function buildStrengthSpreadsheet(text, intake = {}) {','warmup function');
  s=replaceOnce(s,'    const dataRows = wk.rows.slice(1);','    const dataRows = wk.rows.slice(1).filter((row) => !/^\\s*\\[WARMUP\\]/i.test(row[1] || ""));','week warmup filter');
  s=replaceOnce(s,'    workbook.created = new Date();\n\n    // One styled sheet per week. No PASTE tabs.','    workbook.created = new Date();\n\n    const warmup = workbook.addWorksheet(isHebrew ? "פרוטוקול חימום" : "Warm-Up Protocol", { views: [{ showGridLines: false, rightToLeft: isHebrew }] });\n    renderWarmupProtocol(warmup, weeks[0], { isHebrew });\n\n    // One styled sheet per week. No PASTE tabs.','warmup sheet call');
  s=s.replace('console.warn("Exercise demos failed to load, falling back to search:", e);','console.warn("Exercise demos failed to load; direct links will remain unavailable:", e);');
  write(p,s);
}

// 3) Accurate footer disclosure and links to the new privacy/terms pages.
{
  const p='phase14/public/index.html'; let s=read(p);
  const old='RAZ Performance · Your data stays private to your program. &copy; <span id="yr"></span> Raz Pilosof';
  const neu='RAZ Performance · Training data is used to generate, save and improve your program and may be reviewed internally for quality assurance. <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · &copy; <span id="yr"></span> Raz Pilosof';
  s=replaceOnce(s,old,neu,'privacy footer'); write(p,s);
}

// 4) Remove the unnecessary durable write before generation for brand-new clients.
// The validated final program is still durably persisted before client completion.
{
  const p='phase14/scripts/build_phase15_runtime.mjs'; let s=read(p);
  const old='    if (isNewToken) {\\\n      await store.upsertClient(token, intakeJSON, "", startedAt);\\\n    } else {\\';
  const neu='    if (isNewToken) {\\\n      // Defer new-client durable persistence until the validated program exists.\\\n    } else {\\';
  s=replaceOnce(s,old,neu,'new-client pre-persist'); write(p,s);
}

// 5) Expand static QA so deployment-sensitive files cannot silently break.
{
  const p='.github/workflows/phase15-static-qa.yml'; let s=read(p);
  const addPaths=[
    "      - 'phase14/storage.js'","      - 'phase14/admin_qa_routes.js'","      - 'phase14/public/spreadsheet.js'","      - 'phase14/public/privacy.html'","      - 'phase14/public/terms.html'","      - 'phase14/scripts/apply_product_polish.mjs'"
  ];
  const anchor="      - 'phase14/engine/phase15_planner.js'";
  if(!s.includes("phase14/storage.js")) s=s.replace(anchor,anchor+'\n'+addPaths.join('\n'));
  const syntaxAnchor='          runcheck syntax_planner node --check engine/phase15_planner.js';
  if(!s.includes('runcheck syntax_storage')) s=s.replace(syntaxAnchor,syntaxAnchor+'\n          runcheck syntax_storage node --check storage.js\n          runcheck syntax_admin node --check admin_qa_routes.js\n          runcheck syntax_spreadsheet node --check public/spreadsheet.js\n          runcheck grep_warmup_tab grep -q \'Warm-Up Protocol\' public/spreadsheet.js\n          runcheck grep_admin_route grep -q \'registerAdminQaRoutes\' server.js');
  write(p,s);
}
