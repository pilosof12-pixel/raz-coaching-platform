// data/lib/exerciseDemos.js
// Node-side direct-only resolver for curated client demo links.
const fs = require('fs');
const path = require('path');

const demos = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'exercise_demos.json'), 'utf8')
);
const overridePath = path.join(__dirname, '..', 'exercise_demo_overrides.json');
const overrides = fs.existsSync(overridePath)
  ? JSON.parse(fs.readFileSync(overridePath, 'utf8'))
  : { entries: {} };

const mergedEntries = { ...(demos.entries || {}), ...(overrides.entries || {}) };

function normalizeExerciseName(name) {
  return String(name || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function resolveExerciseDemo(name) {
  if (!name) return null;
  const key = normalizeExerciseName(name);
  const direct = mergedEntries[key];
  if (direct?.demo_url) return { url: direct.demo_url, source: 'curated', channel: direct.channel, canonical: direct.canonical };
  for (const v of Object.values(mergedEntries)) {
    if (v.aliases?.includes(key) && v.demo_url) return { url: v.demo_url, source: 'curated', channel: v.channel, canonical: v.canonical };
  }
  return null;
}

function getPrivacyDisclosure() { return demos.policy?.privacy_disclosure || null; }
function hasCuratedDemo(name) { return !!resolveExerciseDemo(name); }

module.exports = { normalizeExerciseName, resolveExerciseDemo, hasCuratedDemo, getPrivacyDisclosure, demos: { ...demos, entries: mergedEntries } };
