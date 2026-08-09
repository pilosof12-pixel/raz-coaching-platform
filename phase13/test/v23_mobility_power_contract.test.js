import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const engine = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine_instructions.txt'), 'utf8');

test('fatigue model avoids mystical fixed CNS and spinal clocks', () => {
  assert.match(engine, /not as one mystical "CNS score"/i);
  assert.match(engine, /24–48 hour adjacency is a REVIEW WINDOW/i);
  assert.doesNotMatch(engine, /two or more hard live sparring sessions.*drop maximal-effort gym work first/i);
});

test('volume landmarks are dynamic heuristics', () => {
  assert.match(engine, /DYNAMIC heuristic/i);
  assert.doesNotMatch(engine, /Per main movement pattern .*8–16 hard sets/i);
  assert.match(engine, /Per-set size is METHOD-SPECIFIC/i);
});

test('pain routing is not a pain-number formula', () => {
  assert.match(engine, /0–10 pain score is context, not a mechanical-load formula/i);
  assert.doesNotMatch(engine, /Pain about 4–5\/10/i);
  assert.match(engine, /Preserve the healthy side/i);
});

test('mobility is task-triggered and test-retest based', () => {
  assert.match(engine, /MOBILITY FOR STRENGTH \/ SPORT/i);
  assert.match(engine, /Retest the SAME task\/proxy/i);
  assert.match(engine, /must not displace a named-goal direct exposure/i);
});

test('plyometrics are quality-first and sport-aware', () => {
  assert.match(engine, /PLYOMETRICS \/ EXPLOSIVE POWER/i);
  assert.match(engine, /Quality over fatigue/i);
  assert.match(engine, /sport already supplies jumps, shots, sprawls or explosive contacts/i);
});
