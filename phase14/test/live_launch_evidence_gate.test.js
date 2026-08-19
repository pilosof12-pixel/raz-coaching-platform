import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_AVATARS,
  EXPECTED_SHEETS,
  EXPECTED_WEEKLY_COLUMNS,
  verifyRepeatabilityRuns,
  verifyManualReview,
  verifySpreadsheetReview,
} from '../../scripts/verify_live_launch_evidence.mjs';

const LOGIC_SHA = 'a'.repeat(40);

function successfulRun() {
  return {
    ok: true,
    head_sha: LOGIC_SHA,
    results: CORE_AVATARS.map((id) => ({
      id,
      ok: true,
      status: 'done',
      program_chars: 5000,
    })),
  };
}

function manualReview(score = 9) {
  return {
    logic_sha: LOGIC_SHA,
    avatars: Object.fromEntries(CORE_AVATARS.map((id) => [id, {
      score,
      approved: true,
      notes: 'Manually reviewed against production coaching bar.',
    }])),
  };
}

function spreadsheetReview() {
  return {
    logic_sha: LOGIC_SHA,
    generated_from_live_program: true,
    sheet_order: EXPECTED_SHEETS,
    weekly_columns: EXPECTED_WEEKLY_COLUMNS,
    flexible_schedule_labels: 'Session A/B',
    permanent_day_column: false,
    hyperlinks_checked: true,
    hyperlinks_total: 4,
    hyperlinks_working: 4,
  };
}

test('repeatability requires two successful core-avatar runs on unchanged coaching logic', () => {
  const one = successfulRun();
  const two = successfulRun();
  assert.deepEqual(verifyRepeatabilityRuns(one, two), { logic_sha: LOGIC_SHA });

  two.head_sha = 'b'.repeat(40);
  assert.throws(() => verifyRepeatabilityRuns(one, two), /different coaching logic SHAs/);
});

test('repeatability fails closed when any core live avatar is missing or failed', () => {
  const one = successfulRun();
  const two = successfulRun();
  two.results.find((row) => row.id === 'tactical_3k').ok = false;
  assert.throws(() => verifyRepeatabilityRuns(one, two), /failed for tactical_3k/);
});

test('manual production review requires at least 9 out of 10 for every core avatar', () => {
  assert.doesNotThrow(() => verifyManualReview(manualReview(9), LOGIC_SHA));

  const review = manualReview(9);
  review.avatars.youth_gymnastics.score = 8.9;
  assert.throws(() => verifyManualReview(review, LOGIC_SHA), /production requires at least 9\/10/);
});

test('manual review is invalid if it targets a different logic SHA', () => {
  const review = manualReview(9.5);
  review.logic_sha = 'c'.repeat(40);
  assert.throws(() => verifyManualReview(review, LOGIC_SHA), /not performed on the repeatability logic SHA/);
});

test('empirical XLSX review requires exact sheet order and exact weekly columns', () => {
  assert.doesNotThrow(() => verifySpreadsheetReview(spreadsheetReview(), LOGIC_SHA));

  const badSheets = spreadsheetReview();
  badSheets.sheet_order = ['Overview', 'Warm-Up', 'Week2', 'Week1', 'Week3', 'Week4'];
  assert.throws(() => verifySpreadsheetReview(badSheets, LOGIC_SHA), /sheet order must be exactly/);

  const badColumns = spreadsheetReview();
  badColumns.weekly_columns = ['Day', ...EXPECTED_WEEKLY_COLUMNS];
  assert.throws(() => verifySpreadsheetReview(badColumns, LOGIC_SHA), /weekly columns do not exactly match/);
});

test('empirical XLSX review requires Session A/B, no permanent Day column, and working hyperlinks', () => {
  const badLabels = spreadsheetReview();
  badLabels.flexible_schedule_labels = 'Monday/Thursday';
  assert.throws(() => verifySpreadsheetReview(badLabels, LOGIC_SHA), /Session A\/B/);

  const dayColumn = spreadsheetReview();
  dayColumn.permanent_day_column = true;
  assert.throws(() => verifySpreadsheetReview(dayColumn, LOGIC_SHA), /permanent Day column/);

  const links = spreadsheetReview();
  links.hyperlinks_working = 3;
  assert.throws(() => verifySpreadsheetReview(links, LOGIC_SHA), /hyperlinks failed empirical verification/);
});
