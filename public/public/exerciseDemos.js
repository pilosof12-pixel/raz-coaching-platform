// public/exerciseDemos.js
// Browser-side exercise demo resolver. Loads JSON via fetch, exposes window.ExerciseDemos.

window.ExerciseDemos = (function () {
  let demos = null;

  async function load() {
    if (demos) return demos;
    const res = await fetch('data/exercise_demos.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load exercise_demos.json: ' + res.status);
    demos = await res.json();
    return demos;
  }

  function normalizeExerciseName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function resolveExerciseDemo(name) {
    if (!demos) throw new Error('ExerciseDemos.load() must be awaited before resolve');
    if (!name) return null;
    const key = normalizeExerciseName(name);

    const direct = demos.entries[key];
    if (direct?.demo_url) {
      return { url: direct.demo_url, source: 'curated', channel: direct.channel, canonical: direct.canonical };
    }
    for (const [, v] of Object.entries(demos.entries)) {
      if (v.aliases?.includes(key) && v.demo_url) {
        return { url: v.demo_url, source: 'curated', channel: v.channel, canonical: v.canonical };
      }
    }
    const q = encodeURIComponent(`${name} exercise demo`);
    return { url: `https://www.youtube.com/results?search_query=${q}`, source: 'search', channel: null, canonical: name };
  }

  function getPrivacyDisclosure() {
    return demos?.policy?.privacy_disclosure || 'Exercise demos open in YouTube. To keep them out of your watch history, open them in incognito/private mode.';
  }

  return { load, normalizeExerciseName, resolveExerciseDemo, getPrivacyDisclosure };
})();
