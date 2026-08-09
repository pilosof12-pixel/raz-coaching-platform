// data/lib/exerciseDemos.js
// ESM direct-only resolver for curated client demo links.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demos = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'exercise_demos.json'), 'utf8'));
const overridePath = path.join(__dirname, '..', 'exercise_demo_overrides.json');
const overrides = fs.existsSync(overridePath)
  ? JSON.parse(fs.readFileSync(overridePath, 'utf8'))
  : { entries: {} };

const mergedEntries = { ...(demos.entries || {}), ...(overrides.entries || {}) };

export function normalizeExerciseName(name) {
  return String(name || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function resolveExerciseDemo(name) {
  if (!name) return null;
  const key = normalizeExerciseName(name);
  const direct = mergedEntries[key];
  if (direct?.demo_url) return { url: direct.demo_url, source: 'curated', channel: direct.channel, canonical: direct.canonical };
  for (const v of Object.values(mergedEntries)) {
    if (v.aliases?.includes(key) && v.demo_url) return { url: v.demo_url, source: 'curated', channel: v.channel, canonical: v.canonical };
  }
  return null;
}

export function getPrivacyDisclosure() { return demos.policy?.privacy_disclosure || null; }
export function hasCuratedDemo(name) { return !!resolveExerciseDemo(name); }
export { mergedEntries as entries };
export const exerciseDemos = { ...demos, entries: mergedEntries };
