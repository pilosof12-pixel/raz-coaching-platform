// scripts/corpus.mjs
//
// One list of "which delivered program belongs to which athlete".
//
// This used to live inside grade_delivered.mjs. It moved here the first time a
// second sweep needed it, because the alternative -- matching a fixture to an
// avatar by its filename -- silently pairs every program with the wrong
// intake, and a grader handed the wrong intake reports confident nonsense
// rather than an error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const fixturePath = (f) => path.join(root, '..', 'test', 'fixtures', f);
export const readFixture = (f) => fs.readFileSync(fixturePath(f), 'utf8');
const json = (f) => JSON.parse(readFixture(f));

const A = json('acceptance_intakes.json');
const C = json('competition_avatars.json');
const H = json('hard_avatars.json');
const day = 86400000;
export const saturday = (w) => {
  const d = new Date(Date.now() + w * 7 * day);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};

export const LIFTER = { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet', event_priority: 'A' };
export const MEET = { ...C.weightlifter_meet_week, competition_date: saturday(1) };
export const FIGHTER = { ...C.mma_fight_camp, competition_date: saturday(3) };

// Coach-scored programs first, so the known answers sit at the top of a report.
export const CORPUS = [
  ['run101_weightlifter_peak.txt', LIFTER, 8.2],
  ['run81_tactical_3k.txt', A.tactical_3k, 7.6],
  ['run113_mma_camp_delivered.txt', FIGHTER, 8.9],
  ['run81_advanced_hybrid.txt', A.advanced_hybrid, 7.9],
  ['advanced_hybrid-program.txt', A.advanced_hybrid, null],
  ['run88_advanced_hybrid.txt', A.advanced_hybrid, null],
  ['run77_advanced_hybrid_defective.txt', A.advanced_hybrid, null],
  ['tactical_3k-program.txt', A.tactical_3k, null],
  ['run84_tactical_3k.txt', A.tactical_3k, null],
  ['run114_tactical_3k.txt', A.tactical_3k, null],
  ['weightlifter_peak-program.txt', LIFTER, null],
  ['run92_weightlifter_flat.txt', LIFTER, null],
  ['run96_weightlifter_intensification.txt', LIFTER, null],
  ['run114_weightlifter_peak.txt', LIFTER, null],
  ['weightlifter_meet_week-program.txt', MEET, null],
  ['mma_fight_camp-program.txt', FIGHTER, null],
  ['run97_mma_camp_delivered.txt', FIGHTER, null],
  ['run92_mma_fight_camp_pre_rules.txt', FIGHTER, null],
  ['inseason_footballer-program.txt', H.inseason_footballer, null],
  ['run100_inseason_footballer.txt', H.inseason_footballer, null],
  ['run101_inseason_footballer.txt', H.inseason_footballer, null],
  ['run115_inseason_footballer.txt', H.inseason_footballer, null],
  ['masters_return-program.txt', H.masters_return, null],
  ['run100_masters_return.txt', H.masters_return, null],
  ['run101_masters_return.txt', H.masters_return, null],
];
