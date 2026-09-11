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
import { computeEffectiveEquipment } from '../engine/exercise_dictionary.js';
import { stateForWeek, weeksOut, hasEvent, STATE } from '../engine/v68_competition_state.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.join(root, '..', '..', '.github', 'workflows', 'live-three-avatar-acceptance.yml');
const src = fs.readFileSync(WORKFLOW, 'utf8');

// The intakes are read out of the workflow rather than copied, so pre-flight
// cannot pass a definition of the athlete the run will not use.
function avatars() {
  const out = [];
  const re = /const\s+(\w+)\s*=\s*\{\s*id:\s*'([a-z_0-9]+)'\s*,\s*intake:\s*Object\.assign\(/g;
  for (const m of src.matchAll(re)) {
    const tail = src.slice(m.index);
    const literal = tail.match(/\{"age"[\s\S]*?"qa_diagnostics":\s*true\}/);
    if (!literal) continue;
    const intake = JSON.parse(literal[0]);
    // Event fields live in the first Object.assign argument, before the literal.
    const head = tail.slice(0, literal.index);
    const dated = head.match(/competition_date\s*:\s*([A-Za-z_0-9]+(?:\([^)]*\))?)/);
    const type = head.match(/event_type\s*:\s*'([a-z_]+)'/);
    out.push({ varName: m[1], id: m[2], intake, dateExpr: dated?.[1] || null, eventType: type?.[1] || null });
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

  // 2. Can the athlete train with anything? An empty kit means every session
  //    the model writes will be refused by the equipment gate.
  const kit = [...computeEffectiveEquipment(intake)];
  if (!kit.length && intake.training_location !== 'home_bodyweight') {
    fail(`no effective equipment at training_location="${intake.training_location}" -- every prescribed movement will be rejected`);
  } else ok(`${kit.length} equipment tokens available`);

  // 3. Does the block frame the event the way the avatar intends? A date that
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
