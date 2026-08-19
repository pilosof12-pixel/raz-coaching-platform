from pathlib import Path

p = Path('phase14/engine/phase15_planner.js')
s = p.read_text()
old = """  const readinessRanked = gymDayReadiness(intake, { gymDays: days }).days.map(x => x.day);
  const cleanDays = readinessRanked.filter(d => days.includes(d));"""
new = """  const readinessScores = gymDayReadiness(intake, { gymDays: days }).days;
  // Preserve the legacy same-day clean list for existing placement rules. Readiness
  // ranking is intentionally scoped only to the advanced OAP neural exposure.
  const cleanDays = days.filter(d => !sport[d]);
  const dayKeyOf = (label) => String(label || '').trim().slice(0, 3).toLowerCase();
  const readinessScoreFor = (label) => readinessScores.find(x => x.day === dayKeyOf(label));
  const readinessRanked = readinessScores.map(x => days.find(d => dayKeyOf(d) === x.day)).filter(Boolean);
  const oapReadinessDays = readinessRanked;"""
if old not in s:
    raise SystemExit('readiness ranking anchor not found')
s = s.replace(old, new, 1)

old2 = """  if (oapGoal && oap!=null && oap>=2 && cleanDays.length) { const d=cleanDays[0]; for (const x of days) sessions[x]=sessions[x].filter(v=>v!=='OAP_STRICT'); sessions[d].unshift('OAP_STRICT'); }"""
new2 = """  if (oapGoal && oap!=null && oap>=2 && oapReadinessDays.length) {
    const current = days.find(x => sessions[x].includes('OAP_STRICT'));
    const best = readinessScoreFor(oapReadinessDays[0]);
    const currentScore = readinessScoreFor(current);
    const shouldMove = !current || !currentScore || !best || (best.score - currentScore.score >= 1);
    if (shouldMove) {
      const d = oapReadinessDays[0];
      for (const x of days) sessions[x]=sessions[x].filter(v=>v!=='OAP_STRICT');
      sessions[d].unshift('OAP_STRICT');
    }
  }"""
if old2 not in s:
    raise SystemExit('OAP placement anchor not found')
p.write_text(s.replace(old2, new2, 1))

sp = Path('phase14/engine/skill_progressions.js')
ss = sp.read_text()
equip_old = 'case "pull_up_bar": return /pull[-\\s]?up bar|chin[-\\s]?up bar|monkey bar|doorframe|door frame|calisthenics|outdoor[_\\s]?park|\\bpull[-\\s]?up\\b/.test(text);'
equip_new = 'case "pull_up_bar": return /pull[-\\s]?up bar|chin[-\\s]?up bar|monkey bar|doorframe|door frame|calisthenics|outdoor[_\\s]?park|bodyweight station|\\bpull[-\\s]?up\\b/.test(text);'
if equip_old not in ss:
    raise SystemExit('pull-up equipment inference anchor not found')
ss = ss.replace(equip_old, equip_new, 1)
oap_parse_old = '    one_arm_pull_up: firstIntAfter(t, /(\\d+)\\s*one[-\\s]?arm\\s*pull/),'
oap_parse_new = '    one_arm_pull_up: firstIntAfter(t, /(\\d+)\\s*one[-\\s]?arm\\s*pull/) || firstIntAfter(t, /one[-\\s]?arm\\s*pull[-\\s]?ups?[^0-9]{0,24}(\\d+)/),'
if oap_parse_old not in ss:
    raise SystemExit('OAP benchmark parser anchor not found')
sp.write_text(ss.replace(oap_parse_old, oap_parse_new, 1))

wu = Path('phase14/engine/specific_warmup_enrichment.js')
ws = wu.read_text()
ramp_anchor = "export function rampText(exercise, load) {\n"
ramp_guard = "export function rampText(exercise, load) {\n  if (/backpack\\s+carry|ruck|loaded\\s+march|farmer(?:'s)?\\s+carry|suitcase\\s+carry/i.test(String(exercise || ''))) return '';\n"
if ramp_anchor not in ws:
    raise SystemExit('warm-up ramp anchor not found')
wu.write_text(ws.replace(ramp_anchor, ramp_guard, 1))

tm = Path('phase14/engine/tactical_manual_acceptance.js')
ms = tm.read_text()
tactical_anchor = "export function validateTacticalManualAcceptanceSemantic(program, intake = {}, suppliedModel = null) {\n  if (!isTacticalIntake(intake)) return { ok: true, skipped: true };\n"
tactical_guard = "export function validateTacticalManualAcceptanceSemantic(program, intake = {}, suppliedModel = null) {\n  if (!isTacticalIntake(intake)) return { ok: true, skipped: true };\n  const rawProgram = String(program || '');\n  if (/ramp\\s+(?:backpack\\s+carry|ruck|loaded\\s+march)[^\\n]*\\b\\d+(?:\\.\\d+)?\\s*kg\\s*x\\s*\\d/i.test(rawProgram)) {\n    fail('TACTICAL_RUCK_WARMUP_MISREPRESENTED', 'Ruck/backpack warm-ups must use walking and ankle/calf preparation or an easy first few minutes under the pack, not strength-style kg x reps ramps.');\n  }\n"
if tactical_anchor not in ms:
    raise SystemExit('tactical warm-up validation anchor not found')
tm.write_text(ms.replace(tactical_anchor, tactical_guard, 1))

ed = Path('phase14/engine/exercise_dictionary.js')
es = ed.read_text()
if '"Controlled Handstand Kick-up"' not in es:
    hand_anchor = '  "Handstand Hold", "Handstand Walk",\n'
    if hand_anchor not in es:
        raise SystemExit('Youth handstand dictionary anchor not found')
    es = es.replace(hand_anchor, '  "Handstand Hold", "Handstand Walk", "Controlled Handstand Kick-up",\n', 1)
if '"Bar Muscle-up Transition Drill"' not in es:
    mu_anchor = '  "Strict Chest-to-Bar Pull-up", "Explosive Hip-to-Bar Pull-up",\n'
    if mu_anchor not in es:
        raise SystemExit('Youth muscle-up dictionary anchor not found')
    es = es.replace(mu_anchor, '  "Strict Chest-to-Bar Pull-up", "Explosive Hip-to-Bar Pull-up", "Bar Muscle-up Transition Drill",\n', 1)
review_mutation = '        out = annotateFamilyRow(out, family, maxPrescribed, note, isHebrew);\n'
if es.count(review_mutation) < 2:
    raise SystemExit('skill advisory client-note anchors not found')
es = es.replace(review_mutation, '', 2)
ed.write_text(es)

cq = Path('phase14/engine/coaching_spec_v1_quality.js')
qs = cq.read_text()
yg_old = """    if (/to failure|amrap|forced rep|grind(?:er|ing)?|until failure/i.test(`${notes} ${exercise?.dose?.reps_raw || ''}`)) {
      fail("""
yg_new = """    const failureText = `${notes} ${exercise?.dose?.reps_raw || ''}`
      .replace(/\\b(?:do not|don't|never)\\s+(?:train\\s+)?to failure\\b/gi, '')
      .replace(/\\bstop[^.\\n]{0,60}before[^.\\n]{0,30}failure\\b/gi, '')
      .replace(/\\bno grinding\\b/gi, '');
    if (/to failure|amrap|forced rep|grind(?:er|ing)?|until failure/i.test(failureText)) {
      fail("""
if yg_old not in qs:
    raise SystemExit('YG-07 failure-language anchor not found')
cq.write_text(qs.replace(yg_old, yg_new, 1))

gf = Path('phase14/test/fixtures/golden_programs.js')
gs = gf.read_text()
y0 = gs.index('function youthWeek(week) {')
y1 = gs.index('export function youthGymnasticsGoldenProgram()', y0)
youth = gs[y0:y1]
youth = youth.replace("['Mon',", "['Session A',").replace("['Thu',", "['Session B',")
youth = youth.replace("'Band-Assisted Bar Muscle-up Transition Drill'", "'Bar Muscle-up Transition Drill'")
youth = youth.replace("'Strict Ring Dip'", "'Ring Dip'").replace("'Strict Pull-up'", "'Pull-up'")
wall_anchor = "    ['Session A', 'Strict Chest-to-Bar Pull-up',"
if wall_anchor not in youth:
    raise SystemExit('Youth golden wall-hold insertion anchor not found')
youth = youth.replace(wall_anchor, "    ['Session A', 'Wall Handstand Hold', 'BW', '2', '15-25 sec', '60-90s', '5-6', 'Wall-supported line and shoulder-capacity work. Keep it crisp and stop well before fatigue.', ''],\n" + wall_anchor, 1)
gf.write_text(gs[:y0] + youth + gs[y1:])

sheet = Path('phase14/public/spreadsheet.js')
xs = sheet.read_text()
text_anchor = '  function setTextCell(cell,value){ cell.value=value==null?"":String(value); cell.numFmt="@"; return cell.value; }\n'
text_new = '  function setTextCell(cell,value){ cell.value=value==null?"":String(value); cell.numFmt = "@"; return cell.value; }\n  function isHebrewProgram(text,intake){ return /[\\u0590-\\u05FF]/.test(String(text||"")+" "+JSON.stringify(intake||{})); }\n'
if text_anchor not in xs:
    raise SystemExit('spreadsheet text-cell anchor not found')
xs = xs.replace(text_anchor, text_new, 1)
render_anchor = '    renderQa(wb.addWorksheet("QA Checklist"),weeks,text,intake);\n    const buffer=await wb.xlsx.writeBuffer();'
render_new = '    renderQa(wb.addWorksheet("QA Checklist"),weeks,text,intake);\n    const isHebrew=isHebrewProgram(text,intake);\n    wb.worksheets.forEach(ws=>{ ws.views=(ws.views&&ws.views.length?ws.views:[{}]).map(v=>({...v, rightToLeft: isHebrew})); });\n    const buffer=await wb.xlsx.writeBuffer();'
if render_anchor not in xs:
    raise SystemExit('spreadsheet workbook render anchor not found')
sheet.write_text(xs.replace(render_anchor, render_new, 1))

t = Path('phase14/test/v34_coaching_architecture.test.js')
ts = t.read_text()
marker = "// 4. Handstand reduced-support"
extra = """const plannerIntake = (gymDays, sportSchedule) => ({
  days_per_week: gymDays.length,
  available_gym_days: gymDays,
  primary_goals: ['4 One arm pullups'],
  current_numbers: 'One-Arm Pull-up: 2 strict reps each arm',
  sport_schedule: sportSchedule,
});
const oapDay = (brief) => {
  const line = brief.split('\\n').find((l) => /OAP_STRICT/.test(l));
  return line ? line.trim().replace(/^\\*\\s*/, '').split(':')[0] : null;
};

test('[V34-3c] readiness placement actually reaches the planner and honours hysteresis', async () => {
  const { buildDeterministicBrief } = await import('../engine/phase15_planner.js');
  const { gymDayReadiness } = await import('../engine/v34_readiness.js');
  const better = plannerIntake(['Mon', 'Wed'], [{ day: 'Tue', intensity: 'hard' }]);
  const betterScores = gymDayReadiness(better, { gymDays: ['Mon', 'Wed'] }).days;
  assert.equal(betterScores[0].day, 'mon');
  assert.ok(betterScores[0].score - betterScores[1].score >= 1);
  assert.equal(oapDay(buildDeterministicBrief(better)), 'Mon');
  const mirrored = plannerIntake(['Mon', 'Wed'], [{ day: 'Sun', intensity: 'hard' }]);
  assert.equal(oapDay(buildDeterministicBrief(mirrored)), 'Wed');
  const tied = plannerIntake(['Mon', 'Wed'], []);
  const tiedScores = gymDayReadiness(tied, { gymDays: ['Mon', 'Wed'] }).days;
  assert.equal(tiedScores[0].score - tiedScores[1].score, 0);
  assert.equal(oapDay(buildDeterministicBrief(tied)), 'Wed');
});

"""
if marker not in ts:
    raise SystemExit('test insertion marker not found')
t.write_text(ts.replace(marker, extra + marker, 1))
