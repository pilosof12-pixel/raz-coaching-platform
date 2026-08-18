import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORE_AVATARS = [
  'advanced_hybrid',
  'youth_gymnastics',
  'tactical_3k',
];

export const EXPECTED_SHEETS = [
  'Overview',
  'Warm-Up',
  'Week1',
  'Week2',
  'Week3',
  'Week4',
];

export const EXPECTED_WEEKLY_COLUMNS = [
  'Exercise',
  'Load / Target',
  'Sets',
  'Reps / Duration',
  'Rest',
  'Effort',
  'Coaching Note',
  'Log',
  'Video',
  'Status',
  'Done',
];

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required evidence file: ${file}`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON evidence file ${file}: ${error.message}`);
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedSha(run) {
  return String(run?.logic_sha || run?.head_sha || '').trim();
}

function resultsById(run) {
  return new Map((Array.isArray(run?.results) ? run.results : []).map((row) => [row?.id, row]));
}

export function verifyRepeatabilityRuns(runOne, runTwo) {
  requireCondition(runOne?.ok === true, 'Repeatability run 1 did not complete successfully.');
  requireCondition(runTwo?.ok === true, 'Repeatability run 2 did not complete successfully.');

  const shaOne = normalizedSha(runOne);
  const shaTwo = normalizedSha(runTwo);
  requireCondition(shaOne, 'Repeatability run 1 is missing a logic/head SHA.');
  requireCondition(shaTwo, 'Repeatability run 2 is missing a logic/head SHA.');
  requireCondition(shaOne === shaTwo, `Repeatability runs used different coaching logic SHAs: ${shaOne} vs ${shaTwo}.`);

  for (const avatar of CORE_AVATARS) {
    const one = resultsById(runOne).get(avatar);
    const two = resultsById(runTwo).get(avatar);
    requireCondition(one, `Repeatability run 1 is missing avatar ${avatar}.`);
    requireCondition(two, `Repeatability run 2 is missing avatar ${avatar}.`);
    requireCondition(one.ok === true && one.status === 'done', `Repeatability run 1 failed for ${avatar}.`);
    requireCondition(two.ok === true && two.status === 'done', `Repeatability run 2 failed for ${avatar}.`);
    requireCondition(Number(one.program_chars || 0) > 500, `Repeatability run 1 has no usable program for ${avatar}.`);
    requireCondition(Number(two.program_chars || 0) > 500, `Repeatability run 2 has no usable program for ${avatar}.`);
  }

  return { logic_sha: shaOne };
}

export function verifyManualReview(review, expectedLogicSha) {
  requireCondition(review && typeof review === 'object', 'Manual review evidence is missing.');
  requireCondition(String(review.logic_sha || '').trim() === expectedLogicSha, 'Manual review was not performed on the repeatability logic SHA.');

  const avatars = review.avatars || {};
  for (const avatar of CORE_AVATARS) {
    const item = avatars[avatar];
    requireCondition(item && typeof item === 'object', `Manual review is missing ${avatar}.`);
    const score = Number(item.score);
    requireCondition(Number.isFinite(score), `Manual review score is invalid for ${avatar}.`);
    requireCondition(score >= 9, `Manual review score for ${avatar} is ${score}; production requires at least 9/10.`);
    requireCondition(item.approved === true, `Manual review for ${avatar} is not explicitly approved.`);
    requireCondition(typeof item.notes === 'string' && item.notes.trim().length > 0, `Manual review for ${avatar} requires review notes.`);
  }
}

export function verifySpreadsheetReview(review, expectedLogicSha) {
  requireCondition(review && typeof review === 'object', 'Spreadsheet empirical review evidence is missing.');
  requireCondition(String(review.logic_sha || '').trim() === expectedLogicSha, 'Spreadsheet review was not performed on the repeatability logic SHA.');
  requireCondition(review.generated_from_live_program === true, 'Spreadsheet review must be generated from an accepted live program.');

  requireCondition(Array.isArray(review.sheet_order), 'Spreadsheet review is missing sheet_order.');
  requireCondition(JSON.stringify(review.sheet_order) === JSON.stringify(EXPECTED_SHEETS), `Spreadsheet sheet order must be exactly ${EXPECTED_SHEETS.join(' → ')}.`);

  requireCondition(Array.isArray(review.weekly_columns), 'Spreadsheet review is missing weekly_columns.');
  requireCondition(JSON.stringify(review.weekly_columns) === JSON.stringify(EXPECTED_WEEKLY_COLUMNS), 'Spreadsheet weekly columns do not exactly match the approved 11 column contract.');
  requireCondition(!review.weekly_columns.includes('Day'), 'Spreadsheet must not expose Day as a permanent weekly data column.');
  requireCondition(review.flexible_schedule_labels === 'Session A/B', 'Flexible schedules must empirically export Session A/B labels.');
  requireCondition(review.permanent_day_column === false, 'Spreadsheet empirical review found a permanent Day column.');
  requireCondition(review.hyperlinks_checked === true, 'Spreadsheet hyperlinks were not empirically checked.');
  requireCondition(Number(review.hyperlinks_total || 0) > 0, 'Spreadsheet review did not exercise any actual hyperlinks.');
  requireCondition(Number(review.hyperlinks_working || 0) === Number(review.hyperlinks_total || 0), 'One or more spreadsheet hyperlinks failed empirical verification.');
}

export function verifyLiveLaunchEvidence(evidenceDir) {
  const runOne = readJson(path.join(evidenceDir, 'run-1', 'result.json'));
  const runTwo = readJson(path.join(evidenceDir, 'run-2', 'result.json'));
  const { logic_sha } = verifyRepeatabilityRuns(runOne, runTwo);

  const manualReview = readJson(path.join(evidenceDir, 'manual-review.json'));
  verifyManualReview(manualReview, logic_sha);

  const spreadsheetReview = readJson(path.join(evidenceDir, 'xlsx-review.json'));
  verifySpreadsheetReview(spreadsheetReview, logic_sha);

  return {
    ok: true,
    logic_sha,
    avatars: CORE_AVATARS,
    production_score_floor: 9,
  };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const defaultEvidence = path.resolve(here, '../docs/qa/live-three-avatar/latest');
  const evidenceDir = path.resolve(process.argv[2] || defaultEvidence);
  try {
    const result = verifyLiveLaunchEvidence(evidenceDir);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`LIVE_LAUNCH_GATE_BLOCKED: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
