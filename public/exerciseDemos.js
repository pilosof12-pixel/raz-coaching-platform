// public/exerciseDemos.js
// Browser-side exercise demo resolver.

(function () {
  let demos = null;
  let loadPromise = null;

  function load() {
    if (demos) return Promise.resolve(demos);
    if (loadPromise) return loadPromise;
    loadPromise = fetch("data/exercise_demos.json", { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load exercise_demos.json: " + res.status);
        return res.json();
      })
      .then((json) => { demos = json; return demos; })
      .catch((err) => { loadPromise = null; throw err; });
    return loadPromise;
  }

  function normalizeExerciseName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function resolveExerciseDemo(name) {
    if (!name) return null;
    const key = normalizeExerciseName(name);
    if (demos && demos.entries) {
      const direct = demos.entries[key];
      if (direct && direct.demo_url) {
        return { url: direct.demo_url, source: "curated", channel: direct.channel, canonical: direct.canonical };
      }
      for (const k in demos.entries) {
        const v = demos.entries[k];
        if (v.aliases && v.aliases.indexOf(key) !== -1 && v.demo_url) {
          return { url: v.demo_url, source: "curated", channel: v.channel, canonical: v.canonical };
        }
      }
    }
    const q = encodeURIComponent(name + " exercise demo");
    return { url: "https://www.youtube.com/results?search_query=" + q, source: "search", channel: null, canonical: name };
  }

  function getPrivacyDisclosure() {
    return (demos && demos.policy && demos.policy.privacy_disclosure) ||
      "Exercise demos open in YouTube. To keep them out of your watch history, open them in incognito/private mode.";
  }

  window.ExerciseDemos = { load, normalizeExerciseName, resolveExerciseDemo, getPrivacyDisclosure };
})();
