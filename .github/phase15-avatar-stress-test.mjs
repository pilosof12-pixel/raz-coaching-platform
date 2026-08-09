import fs from 'node:fs';
import { resolveExerciseDemo } from '../phase14/data/lib/exerciseDemos.js';

const base = process.env.BASE_URL || 'https://raz-coaching-platform.onrender.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const avatars = [
  {
    id: 'gymnastics_fighter',
    name: 'Advanced gymnastics + BJJ hybrid',
    intake: {
      language: 'en',
      primary_goals: [
        'Planche: progress from a clean Advanced Tuck Planche 12 second hold toward a controlled Straddle Planche',
        'Weighted dip loaded endurance: progress from +60 kg x 8 clean reps toward +60 kg x 15 clean reps'
      ],
      secondary_goals: [
        'Improve lower body strength without adding excessive fatigue around BJJ',
        'Improve aerobic base with low fatigue Zone 2 work'
      ],
      maintenance_goals: [
        'Maintain pulling strength and shoulder health',
        'Maintain modest trunk and hip general physical preparation when time allows'
      ],
      current_numbers: [
        'Advanced Tuck Planche: 12 seconds clean on parallettes',
        'Tuck Planche: 25 seconds clean',
        'Weighted Dip: +60 kg x 8 clean reps',
        'Weighted Dip external load 1RM: +90 kg',
        'Front Squat: 150 kg x 3',
        'Weighted Chin-up: +55 kg x 5'
      ].join('\n'),
      days_per_week: 3,
      session_duration_minutes: 70,
      gym_availability_mode: 'flexible',
      available_gym_days: [],
      sport: 'BJJ',
      sport_schedule: [
        { day: 'Tue', intensity: 'hard' },
        { day: 'Thu', intensity: 'moderate' },
        { day: 'Sat', intensity: 'hard' }
      ],
      same_day_gap_hours: 6,
      training_location: 'commercial_gym',
      equipment: 'barbell, plates, rack, bench, dumbbells, cable stack, dip bars, pull-up bar, parallettes, bands, bike, rower',
      split_preference: 'full_body',
      pain: 'Mild recurrent wrist irritation in deep wrist extension. Planche on parallettes is well tolerated. Barbell pressing and dips are well tolerated. No current lower back pain.',
      mobility: { active: false },
      sleep_hours: '7-8',
      recovery_rating: 'Good',
      notes: 'Advanced athlete. Do not regress planche below demonstrated Advanced Tuck level. Primary goals are equal priority. Weighted dip goal is fixed-load rep performance, not only 1RM. Keep sessions concise and compatible with BJJ. Two Zone 2 exposures are desirable. Optional low-cost GPP is welcome only if it does not displace primary work.'
    }
  },
  {
    id: 'street_lifter_mma',
    name: 'Street lifting + human flag + MMA hybrid',
    intake: {
      language: 'en',
      primary_goals: [
        'Weighted Chin-up maximum strength: progress current +70 kg external-load 1RM toward +90 kg 1RM',
        'Human Flag: progress from a clean Tuck Human Flag 12 second hold toward a controlled Straddle Human Flag'
      ],
      secondary_goals: [
        'Improve aerobic conditioning and day to day energy with low fatigue Zone 2',
        'Maintain lower body strength and power for MMA without chasing squat PRs'
      ],
      maintenance_goals: [
        'Maintain weighted dip strength around +55 kg x 5',
        'Maintain shoulder and trunk robustness with minimal useful accessory work'
      ],
      current_numbers: [
        'Weighted Chin-up external load 1RM: +70 kg',
        'Weighted Chin-up: +50 kg x 4 clean reps',
        'Tuck Human Flag: 12 seconds clean per side',
        'Weighted Dip: +55 kg x 5',
        'Front Squat: 140 kg x 5',
        'Broad jump: 2.55 m'
      ].join('\n'),
      days_per_week: 4,
      session_duration_minutes: 70,
      gym_availability_mode: 'flexible',
      available_gym_days: [],
      sport: 'MMA / kickboxing',
      sport_schedule: [
        { day: 'Mon', intensity: 'hard' },
        { day: 'Wed', intensity: 'moderate' },
        { day: 'Fri', intensity: 'hard' },
        { day: 'Sat', intensity: 'moderate' }
      ],
      same_day_gap_hours: 6,
      training_location: 'commercial_gym',
      equipment: 'barbell, plates, rack, bench, dumbbells, cable stack, pull-up bar, dip bars, stall bars, bands, bike, rower, boxes',
      split_preference: 'full_body',
      pain: 'Occasional medial elbow irritation if weighted pulling volume becomes excessive. Heavy chin-ups are tolerated when volume is controlled. No current back or shoulder pain.',
      mobility: { active: false },
      sleep_hours: '6-7',
      recovery_rating: 'Average',
      notes: 'Concurrent advanced athlete. Weighted Chin-up is a true max-strength goal and should remain the anchor lift. Human Flag needs direct skill exposure matched to demonstrated Tuck level, not generic pulling only. Keep MMA interference low. Two meaningful Zone 2 sessions are desirable. Low-cost trunk or carry work may be used if there is recovery and time headroom.'
    }
  }
];

async function safeJsonFetch(url, options = {}, retries = 5) {
  let last = '';
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, options);
      const text = await r.text();
      last = `status=${r.status} body=${text.slice(0, 160)}`;
      if (!text.trim().startsWith('{')) { await sleep(1200); continue; }
      return { response: r, json: JSON.parse(text) };
    } catch (e) {
      last = String(e?.message || e);
      await sleep(1200);
    }
  }
  throw new Error(`safeJsonFetch failed: ${last}`);
}

function parseWeeks(program) {
  const weeks = [];
  for (let w = 1; w <= 4; w++) {
    const m = program.match(new RegExp(`START_WEEK${w}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${w}_TSV`, 'i'));
    const lines = (m?.[1] || '').split('\n').filter(Boolean);
    weeks.push({ w, block: m?.[1] || '', rows: lines.slice(1).map(x => x.split('\t')) });
  }
  return weeks;
}

function addCheck(report, name, ok, detail = '') {
  report.checks.push({ name, ok: !!ok, detail });
}

function commonChecks(report, program, intake) {
  const weeks = parseWeeks(program);
  const allRows = weeks.flatMap(x => x.rows);
  const week1 = weeks[0].rows;
  addCheck(report, 'four complete week blocks', weeks.every(x => x.rows.length > 0), weeks.map(x => [x.w, x.rows.length]));
  addCheck(report, 'no review/internal placeholders', !/\[REVIEW\]|contact\s+support|placeholder|duplicate skill row removed/i.test(program));
  addCheck(report, 'requested gym-day count present', new Set(week1.map(r => r[0]).filter(Boolean)).size === Number(intake.days_per_week), [...new Set(week1.map(r => r[0]).filter(Boolean))]);
  const working = week1.filter(r => !/^\[WARMUP\]/i.test(r[1] || '') && !/zone.?2/i.test(r[1] || ''));
  const strengthDays = new Set(working.map(r => r[0]));
  addCheck(report, 'every gym day has real strength or skill work', [...new Set(week1.map(r => r[0]).filter(Boolean))].every(d => strengthDays.has(d)), [...strengthDays]);
  const exercises = [...new Set(allRows.map(r => String(r[1] || '').trim()).filter(x => x && !/^\[WARMUP\]/i.test(x)))];
  const missing = exercises.filter(x => !resolveExerciseDemo(x));
  addCheck(report, 'all client working exercises have direct curated demos', missing.length === 0, { missing, checked: exercises });
  const z2 = week1.filter(r => /zone.?2/i.test(`${r[1] || ''} ${r[7] || ''}`));
  const mins = z2.map(r => Number(((r[4] || '').match(/\d+/) || [])[0])).filter(Number.isFinite);
  addCheck(report, 'Zone 2 is meaningful when requested', mins.filter(x => x >= 20).length >= 2, mins);
  const hard = week1.filter(r => /(vo2|threshold|amrap|sprint interval|hard interval)/i.test(`${r[1] || ''} ${r[7] || ''}`));
  addCheck(report, 'no unnecessary hard conditioning interference', hard.length === 0, hard.map(r => [r[0], r[1], r[4]]));
  return { weeks, week1, allRows };
}

function avatarSpecific(report, avatar, parsed) {
  const rows = parsed.week1;
  if (avatar.id === 'gymnastics_fighter') {
    const planche = rows.filter(r => /planche/i.test(r[1] || '') && !/^\[WARMUP\]/i.test(r[1] || ''));
    const advanced = planche.filter(r => /advanced tuck|straddle|full planche/i.test(r[1] || ''));
    addCheck(report, 'planche stays at demonstrated advanced level', advanced.length >= 1 && !planche.some(r => /^\s*Tuck Planche$/i.test(r[1] || '') || /planche lean/i.test(r[1] || '')), planche.map(r => [r[0], r[1], r[3], r[4]]));
    addCheck(report, 'primary planche gets at least two direct weekly exposures', new Set(planche.map(r => r[0])).size >= 2, planche.map(r => [r[0], r[1]]));

    const dips = rows.filter(r => /weighted dip/i.test(r[1] || ''));
    const reps = dips.map(r => Number(((r[4] || '').match(/\d+/) || [])[0])).filter(Number.isFinite);
    const loads = dips.map(r => Number(((r[2] || '').match(/\d+(?:\.\d+)?/) || [])[0])).filter(Number.isFinite);
    addCheck(report, 'weighted dip fixed-load endurance remains specific', dips.length >= 2 && reps.some(x => x >= 6) && loads.some(x => x >= 50 && x <= 70), dips.map(r => [r[0], r[1], r[2], r[3], r[4], r[6]]));
    addCheck(report, 'weighted dip uses strength reserve plus volume tracks', reps.some(x => x <= 5) && reps.some(x => x >= 6), dips.map(r => [r[0], r[2], r[4]]));
    const badWrist = rows.filter(r => /planche/i.test(r[1] || '') && /floor/i.test(`${r[1] || ''} ${r[7] || ''}`) && !/parallettes?/i.test(`${r[1] || ''} ${r[7] || ''}`));
    addCheck(report, 'wrist limitation respected', badWrist.length === 0, badWrist.map(r => [r[0], r[1], r[7]]));
  }

  if (avatar.id === 'street_lifter_mma') {
    const chins = rows.filter(r => /weighted chin/i.test(r[1] || ''));
    const chinReps = chins.map(r => Number(((r[4] || '').match(/\d+/) || [])[0])).filter(Number.isFinite);
    const chinLoads = chins.map(r => Number(((r[2] || '').match(/\+?\s*(\d+(?:\.\d+)?)/) || [])[1])).filter(Number.isFinite);
    addCheck(report, 'weighted chin max-strength anchor is present', chins.length >= 1 && chinReps.some(x => x <= 5) && chinLoads.some(x => x >= 45), chins.map(r => [r[0], r[2], r[3], r[4], r[6]]));
    addCheck(report, 'weighted chin volume is controlled for elbow recovery', chins.reduce((sum, r) => sum + (Number(((r[3] || '').match(/\d+/) || [])[0]) || 0), 0) <= 10, chins.map(r => [r[0], r[3], r[4]]));

    const flag = rows.filter(r => /human flag/i.test(r[1] || '') && !/^\[WARMUP\]/i.test(r[1] || ''));
    const direct = flag.filter(r => /tuck human flag|one-leg human flag|straddle human flag|full human flag/i.test(r[1] || ''));
    addCheck(report, 'human flag gets direct skill exposure', direct.length >= 1, flag.map(r => [r[0], r[1], r[3], r[4]]));
    addCheck(report, 'human flag is not replaced by generic pulling', new Set(direct.map(r => r[0])).size >= 2 || direct.length >= 2, direct.map(r => [r[0], r[1]]));
  }
}

const suite = {
  timestamp: new Date().toISOString(),
  base,
  execution_path_expected: 'deterministic-skeleton-v4',
  avatars: [],
  ok: false
};

const { response: hr, json: health } = await safeJsonFetch(base + '/api/health', {}, 6);
if (!hr.ok || health?.openai_execution_path !== 'deterministic-skeleton-v4') {
  throw new Error(`v4 runtime not live: ${JSON.stringify(health)}`);
}
suite.health = health;

for (const avatar of avatars) {
  const report = { id: avatar.id, name: avatar.name, intake: avatar.intake, checks: [], program: '', ok: false };
  const started = Date.now();
  try {
    const { response: br, json: build } = await safeJsonFetch(base + '/api/build', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intake: avatar.intake })
    }, 5);
    addCheck(report, 'build accepted', br.status === 202 && !!build.job_id, build);
    if (!build.job_id) throw new Error('build not accepted');
    report.job_id = build.job_id;
    report.token = build.token;

    let job = null;
    for (let i = 0; i < 190; i++) {
      await sleep(2000);
      try { ({ json: job } = await safeJsonFetch(base + '/api/job/' + encodeURIComponent(build.job_id), {}, 3)); }
      catch (_) { continue; }
      if (job.status === 'done' || job.status === 'error') break;
    }
    report.seconds = Math.round((Date.now() - started) / 1000);
    if (!job || job.status !== 'done' || !job.program) throw new Error(job?.error || 'generation did not complete');
    report.program = job.program;
    addCheck(report, 'program generated', report.program.length > 500, `chars=${report.program.length}; seconds=${report.seconds}`);
    const parsed = commonChecks(report, report.program, avatar.intake);
    avatarSpecific(report, avatar, parsed);
    report.score = { passed: report.checks.filter(x => x.ok).length, total: report.checks.length };
    report.quality_percent = Math.round(100 * report.score.passed / report.score.total);
    report.ok = report.checks.every(x => x.ok);
  } catch (e) {
    report.error = String(e?.stack || e);
    report.score = { passed: report.checks.filter(x => x.ok).length, total: report.checks.length };
    report.quality_percent = report.score.total ? Math.round(100 * report.score.passed / report.score.total) : 0;
  }
  suite.avatars.push(report);
}

suite.ok = suite.avatars.every(x => x.ok);
suite.average_quality_percent = Math.round(suite.avatars.reduce((s, x) => s + x.quality_percent, 0) / suite.avatars.length);
fs.writeFileSync('.github/phase15-avatar-stress-result.json', JSON.stringify(suite, null, 2));
for (const a of suite.avatars) fs.writeFileSync(`.github/phase15-avatar-${a.id}-program.txt`, a.program || a.error || '');
console.log(JSON.stringify({ ok: suite.ok, average_quality_percent: suite.average_quality_percent, avatars: suite.avatars.map(a => ({ id: a.id, ok: a.ok, score: a.score, quality_percent: a.quality_percent, seconds: a.seconds, error: a.error })) }, null, 2));
if (!suite.ok) process.exitCode = 1;
