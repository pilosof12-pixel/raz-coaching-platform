// Pre-flight for a live acceptance run: everything that can be known before
// spending a credit.
//
// Run #109 spent one of its five slots discovering that "hotel_gym" is not an
// accepted training location. The intake was rejected with a 400 before the
// engine saw it -- a full avatar's worth of a paid run, lost to something a
// single function call answers for free. Nothing here talks to the model; it
// asks only the questions whose answers are already determined.
//
//   node scripts/preflight_avatars.mjs mma,heb,dual,trav,post
//   node scripts/preflight_avatars.mjs            (every avatar the run knows)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateLaunchIntake } from '../intake_validation.js';
import { detectIntakeClarifications, addOptionalQuestions, requiredClarifications } from '../intake_clarification.js';
import { computeEffectiveEquipment } from '../engine/exercise_dictionary.js';
import { stateForWeek, weeksOut, hasEvent, STATE } from '../engine/v68_competition_state.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.join(root, '..', '..', '.github', 'workflows', 'live-three-avatar-acceptance.yml');
const src = fs.readFileSync(WORKFLOW, 'utf8');

// The intakes are read out of the workflow rather than copied, so pre-flight
// cannot pass a definition of the athlete the run will not use.
function avatars() {
  const out = [];
  // Both shapes the workflow uses. Avatars without an event are declared as a
  // plain object literal, and matching only the Object.assign form meant the
  // three oldest avatars -- including the most complex intake in the set --
  // were silently skipped by the tool whose entire job is checking before we
  // spend. A pre-flight that quietly covers half the run is worse than none,
  // because it reports PASS either way.
  const re = /const\s+(\w+)\s*=\s*\{\s*id:\s*'([a-z_0-9]+)'\s*,\s*intake:\s*(?:Object\.assign\(|\{)/g;
  for (const m of src.matchAll(re)) {
    const tail = src.slice(m.index);
    // The event-bearing avatars carry a JSON literal; the plain ones are
    // hand-written JS, so read them by balancing braces from the intake.
    const literal = tail.match(/\{"age"[\s\S]*?"qa_diagnostics":\s*true\}/);
    let intake = null;
    if (literal && literal.index < 400) {
      intake = JSON.parse(literal[0]);
    } else {
      const open = tail.indexOf('intake:');
      const braceAt = tail.indexOf('{', open);
      let depth = 0;
      let end = -1;
      for (let i = braceAt; i < tail.length; i += 1) {
        if (tail[i] === '{') depth += 1;
        else if (tail[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      const body = tail.slice(braceAt, end + 1)
        .replace(/consent\(\)/g, '{"accepted":true}')
        .replace(/\bnow\(\)/g, '""');
      try {
        // eslint-disable-next-line no-new-func
        intake = new Function(`return (${body});`)();
      } catch { continue; }
    }
    if (!intake) continue;
    // Everything in the first Object.assign argument, not only the two fields I
    // happened to look for. The fight camp answers its own weight-class
    // question there -- weight_class_status and weight_vs_class -- and reading
    // just competition_date and event_type made pre-flight declare an avatar
    // unbuildable that builds perfectly. A false alarm costs as much as a false
    // pass: one stops a good run, the other spends on a doomed one.
    const head = tail.slice(0, literal.index);
    const open = head.indexOf('{', head.indexOf('Object.assign('));
    let extra = {};
    if (open >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = open; i < head.length; i += 1) {
        if (head[i] === '{') depth += 1;
        else if (head[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      if (end > open) {
        try {
          // eslint-disable-next-line no-new-func
          extra = new Function('FIGHT_DAY', 'daysBefore', 'weeksFromNow', 'weeksFromNowOnSaturday',
            `return (${head.slice(open, end + 1)});`)(FIGHT_DAY, daysBefore, weeksFromNow, onSaturday) || {};
        } catch { extra = {}; }
      }
    }
    const dated = head.match(/competition_date\s*:\s*([A-Za-z_0-9]+(?:\([^)]*\))?)/);
    const type = head.match(/event_type\s*:\s*'([a-z_]+)'/);
    out.push({ varName: m[1], id: m[2], intake: { ...intake, ...extra }, dateExpr: dated?.[1] || null, eventType: type?.[1] || null });
  }
  return out;
}

const ALIAS = (x) => (
  x.startsWith('hyb') ? 'advanced_hybrid'
    : x.startsWith('you') ? 'youth_gymnastics'
      : x.startsWith('tac') ? 'tactical_3k'
        : x.startsWith('meet') || x.startsWith('peak') ? 'weightlifter_meet_week'
          : x.startsWith('weight') || x.startsWith('lift') ? 'weightlifter_peak'
            : x.startsWith('mma') || x.startsWith('fight') ? 'mma_fight_camp'
              : x.startsWith('foot') || x.startsWith('soccer') || x.startsWith('inseason') ? 'inseason_footballer'
                : x.startsWith('master') || x.startsWith('row') ? 'masters_return'
                  : x.startsWith('heb') || x.startsWith('ivrit') ? 'hebrew_lifter'
                    : x.startsWith('dual') || x.startsWith('hyrox') ? 'dual_event_hyrox'
                      : x.startsWith('trav') || x.startsWith('exec') || x.startsWith('hotel') ? 'travelling_exec'
                        : x.startsWith('post') || x.startsWith('partum') ? 'postpartum_runner'
                          : x
);

const day = 86400000;
const weeksFromNow = (n) => new Date(Date.now() + n * 7 * day).toISOString().slice(0, 10);
const onSaturday = (n) => {
  const d = new Date(Date.now() + n * 7 * day);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
  return d.toISOString().slice(0, 10);
};

// The same names the workflow's own script uses, so the Object.assign head can
// be evaluated exactly as the run evaluates it.
const FIGHT_DAY = onSaturday(4);
const daysBefore = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// Reproduce the date the workflow will actually compute, so the event framing
// checked here is the one the run will use.
function resolveDate(expr) {
  if (!expr) return null;
  if (expr === 'FIGHT_DAY') return onSaturday(4);
  const m = expr.match(/weeksFromNowOnSaturday\((\d+)\)/);
  if (m) return onSaturday(Number(m[1]));
  const w = expr.match(/weeksFromNow\(([\d.\-/\s]+)\)/);
  if (w) return weeksFromNow(Number(eval(w[1]))); // eslint-disable-line no-eval
  return null;
}

const wanted = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean).map(ALIAS);
const all = avatars();
const selected = wanted.length ? all.filter((a) => wanted.includes(a.id)) : all;
if (!selected.length) {
  console.error(`No avatars matched "${process.argv[2]}". Known: ${all.map((a) => a.id).join(', ')}`);
  process.exit(2);
}

let failures = 0;
const problems = [];

for (const a of selected) {
  const intake = { ...a.intake, privacy_consent: { accepted: true } };
  const date = resolveDate(a.dateExpr);
  if (date) intake.competition_date = date;
  if (a.eventType) intake.event_type = a.eventType;

  const notes = [];
  const fail = (msg) => { problems.push(`${a.id}: ${msg}`); notes.push(`FAIL  ${msg}`); failures += 1; };
  const ok = (msg) => notes.push(`ok    ${msg}`);

  // 1. Would the service accept this intake at all? This is the check that was
  //    missing: a rejected intake costs a slot and produces nothing.
  const rejection = validateLaunchIntake(intake);
  if (rejection) fail(`intake rejected before generation: "${rejection}"`);
  else ok('intake accepted by the launch validator');

  // 2. Would the service stop and ask a question first? This gate runs BEFORE
  //    the pass guard and before any model call, and an unanswered required
  //    clarification returns 422 without ever reaching the engine. Pre-flight
  //    did not model it, so it reported PASS for the advanced hybrid and the
  //    run spent a slot discovering that an MMA athlete with an event is asked
  //    about his weight class -- a question no acceptance run can answer.
  const clarifications = addOptionalQuestions(detectIntakeClarifications(intake), intake);
  const blocking = requiredClarifications(clarifications);
  if (blocking.length) {
    fail(`the build stops for ${blocking.length} required clarification(s) before generation: `
      + blocking.map((q) => q.id).join(', ')
      + '. An acceptance run has nobody to answer them, so this avatar can never build.');
  } else ok('no clarification blocks the build');

  // 3. Can the athlete train with anything? An empty kit means every session
  //    the model writes will be refused by the equipment gate.
  const kit = [...computeEffectiveEquipment(intake)];
  if (!kit.length && intake.training_location !== 'home_bodyweight') {
    fail(`no effective equipment at training_location="${intake.training_location}" -- every prescribed movement will be rejected`);
  } else ok(`${kit.length} equipment tokens available`);

  // 4. Does the block frame the event the way the avatar intends? A date that
  //    drifts by a weekday turns competition week into a taper.
  if (hasEvent(intake)) {
    const out = weeksOut(intake);
    const w4 = stateForWeek(intake, 4);
    ok(`event ${date} (${out} weeks out), week 4 = ${w4}`);
    if (/\bIS (?:fight|competition|race) week\b/i.test(String(intake.notes || '')) && w4 !== STATE.COMPETITION_WEEK) {
      fail(`the intake says week 4 is the event week, but the block computes week 4 = ${w4}`);
    }
    // A fixed gym day must not collide with the event itself.
    const days = Array.isArray(intake.available_gym_days) ? intake.available_gym_days : [];
    if (days.length && date) {
      const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00Z`).getUTCDay()];
      if (days.some((d) => String(d).slice(0, 3).toLowerCase() === wd.toLowerCase())) {
        fail(`the event falls on ${wd}, which is one of the athlete's gym days (${days.join(', ')})`);
      } else ok(`event on ${wd}, clear of the gym days (${days.join(', ')})`);
    }
  } else ok('no event: the block is not built backward from a date');

  console.log(`\n${a.id}`);
  for (const n of notes) console.log(`  ${n}`);
}

console.log('\n--- pre-flight ---');
if (failures) {
  console.log(`FAIL: ${failures} problem(s) that would cost a live slot\n`);
  for (const p of problems) console.log(`  * ${p}`);
} else {
  console.log(`PASS: ${selected.length} avatar(s) clear everything knowable offline.`);
  console.log('This does not predict program quality -- only that the run will reach the engine.');
}
process.exitCode = failures ? 1 : 0;
