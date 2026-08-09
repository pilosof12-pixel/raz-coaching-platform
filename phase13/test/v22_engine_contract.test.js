import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const engine = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine_instructions.txt'), 'utf8');

test('engine contract has no legacy one-progression hard rule', () => {
  assert.doesNotMatch(engine, /Apply the one-progression-dose-per-block rule/i);
  assert.doesNotMatch(engine, /push one quality, hold the rest at maintenance/i);
  assert.match(engine, /Up to two PRIMARY qualities may receive true progression doses/i);
});

test('sport scheduling does not hard-ban hard-day lifting', () => {
  assert.doesNotMatch(engine, /Hard sport day\s*→\s*gym Low\/none/i);
  assert.match(engine, /deliberate stress consolidation may be appropriate/i);
  assert.match(engine, /24–48 h window is a REVIEW WINDOW/i);
});

test('density dosing is method-specific rather than one fixed percentage band', () => {
  assert.doesNotMatch(engine, /Most density reps live at 40–70% of max-rep capacity/i);
  assert.match(engine, /Per-set reps are method-specific/i);
});
