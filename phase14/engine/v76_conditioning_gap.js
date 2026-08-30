// engine/v76_conditioning_gap.js
//
// Supplemental conditioning must name the quality it is filling.
//
// The endurance cluster's rule: hard sparring already supplies repeated severe
// efforts, so adding brutal circuits after live work because the athlete
// "needs cardio" duplicates the same stress while degrading technical quality.
// Supplemental conditioning should target the missing quality -- aerobic base,
// repeat-effort recovery, high aerobic power, or a specific pacing limit --
// rather than reproducing sport fatigue.
//
// So the rule is not "no conditioning". It is that hard conditioning has to be
// filling a gap, and a sport already supplying six or seven hard sessions a
// week rarely leaves one.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, sportSessionsPerWeek, eventType } from './v68_competition_state.js';

// Work that reproduces what hard sparring already does.
const GLYCOLYTIC = /\b(?:circuit|metcon|complex|burpee|assault bike|air ?dyne|battle rope|shuttle|hiit|interval|amrap|emom|conditioning finisher|sprint)\b/i;
// Work that fills a genuine gap at low cost.
const LOW_COST_AEROBIC = /\b(?:zone ?2|easy (?:jog|run|bike|row|spin)|aerobic|steady state|recovery spin|easy movement)\b/i;
// Short alactic work: the cluster lists it as a distinct, cheap quality.
const ALACTIC = /\b(?:prowler|sled|hill sprint|10 ?m|15 ?m|20 ?m|short sprint|acceleration)\b/i;

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' '); }

// A stated deficit is what licenses hard supplemental conditioning.
export function statedConditioningGap(intake = {}) {
  const source = txt([intake.notes, intake.current_numbers, intake.secondary_goals, intake.primary_goals]).toLowerCase();
  if (/\b(?:gas(?:ses)? out|poor cardio|conditioning is (?:a )?(?:weak|limit)|fade(?:s)? in (?:the )?(?:later|third|second) round|aerobic (?:base|capacity) is (?:low|poor|lacking)|struggle[sd]? to recover between rounds)\b/.test(source)) {
    return 'stated';
  }
  return null;
}

export function governsConditioning(intake = {}, now = Date.now()) {
  if (eventType(intake) !== 'combat') return false;
  const profile = competitionProfile(intake, now);
  if (!profile) return false;
  return profile.weeks.some((w) => w.state !== STATE.NORMAL);
}

export function collectConditioningFlags(program, intake = {}, now = Date.now()) {
  if (!governsConditioning(intake, now)) return [];
  const sport = sportSessionsPerWeek(intake);
  const gap = statedConditioningGap(intake);
  const flags = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const state = stateForWeek(intake, week, now);
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      if (!GLYCOLYTIC.test(name)) continue;
      // Alactic sled work and easy aerobic work are not the problem.
      if (ALACTIC.test(name) || LOW_COST_AEROBIC.test(name)) continue;

      if (gap && state !== STATE.COMPETITION_WEEK) continue; // licensed by a stated deficit

      flags.push({
        code: 'V76_CONDITIONING_DUPLICATES_SPORT',
        week, exercise: name, sportSessions: sport,
        detail: `Week ${week} adds ${name} for an athlete already doing ${sport} sport sessions a week`
          + `${gap ? ', and this is competition week' : ' with no stated conditioning deficit'}. `
          + `Hard sparring already supplies repeated severe efforts; supplemental conditioning should fill a missing quality -- aerobic base, repeat-effort recovery, or short alactic power -- rather than reproduce sport fatigue.`,
      });
    }
  }
  return flags;
}

export function buildConditioningBrief(intake = {}, now = Date.now()) {
  if (!governsConditioning(intake, now)) return '';
  const sport = sportSessionsPerWeek(intake);
  const gap = statedConditioningGap(intake);
  const lines = [
    `* CONDITIONING FILLS A GAP, IT DOES NOT DUPLICATE THE SPORT: this athlete already trains ${sport} sport sessions a week.`,
    '  Hard sparring and live wrestling already supply repeated severe efforts. Do not add intervals, circuits or finishers because the sport is metabolically demanding -- that reproduces the same stress and degrades technical quality.',
    '  Name the missing quality before adding anything: aerobic base, recovery between rounds, high aerobic power, or short alactic power. Easy aerobic work and brief sled accelerations are cheap and often the only supplement worth its cost.',
  ];
  lines.push(gap
    ? '  The athlete has stated a conditioning deficit, so targeted supplemental work is justified -- but not in competition week, and not as a hard circuit after live work.'
    : '  No conditioning deficit is stated, so the default is none beyond easy aerobic movement and short alactic work.');
  return lines.join('\n');
}
