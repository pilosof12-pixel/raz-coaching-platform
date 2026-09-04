import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url),'utf8');

test('approved spreadsheet has exact six-tab production structure',()=>{
  assert.match(src,/addWorksheet\('Overview'\)/);
  assert.match(src,/addWorksheet\('Warm-Up'\)/);
  assert.match(src,/addWorksheet\(`Week \$\{w\.week\}`\)/);
  assert.doesNotMatch(src,/addWorksheet\(['"]QA Checklist['"]\)/);
});

test('approved week sheets use one 8-column header and simple day bands',()=>{
  assert.match(src,/WEEK 1 — FOUNDATION/);
  assert.match(src,/WEEK 4 — CONSOLIDATE \/ EXPRESS/);
  assert.match(src,/Exact live production prescription in the approved client template\. Day names are section bands, not a permanent data column\./);
  assert.match(src,/\['Exercise','Load \/ Target','Sets','Reps \/ Duration','Rest','Effort','Coaching Note','Log'\]/);
  assert.match(src,/const DAY_BAND = 'FFD9E5F5'/);
  assert.doesNotMatch(src,/COACH NOTES/);
  assert.doesNotMatch(src,/WARM-UP • Use/);
});

test('the exercise name is the demo link, and nothing tracks alongside it',()=>{
  // The coach asked for the link on the exercise name, no Video column and no
  // Status/Done tracking: the week table ends at Log.
  assert.match(src,/setHyperlink\(ws\.getRow\(row\)\.getCell\(1\),r\.exercise,r\.exercise,false\)/);
  assert.match(src,/setHyperlink\(ws\.getRow\(row\)\.getCell\(2\),item\.exercise,item\.exercise,false\)/);
  assert.doesNotMatch(src,/Not Started,In Progress,Complete/);
  assert.doesNotMatch(src,/'Video'/);
  assert.doesNotMatch(src,/applyTrackingValidation/);
});

test('approved warm-up sheet remains six columns',()=>{
  assert.match(src,/\[18,32,10,18,12,54\]/);
  assert.match(src,/\['SESSION \/ DAY','EXERCISE','SETS','REPS \/ DURATION','REST','COACHING NOTE'\]/);
  assert.doesNotMatch(src,/\['Section','Movement \/ Target','Dose','Rest','Purpose','Video','Notes'\]/);
});
