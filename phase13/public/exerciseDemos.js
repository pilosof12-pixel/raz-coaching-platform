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


  const HEBREW_TO_ENGLISH = {
    "סקוואט אחורי": "Back Squat",
    "סקוואט קדמי": "Front Squat",
    "דדליפט": "Deadlift",
    "דדליפט רומני": "Romanian Deadlift",
    "לחיצת חזה": "Bench Press",
    "לחיצת כתפיים": "Overhead Press",
    "מתח": "Pull-up",
    "דיפ": "Dip",
    "לחיצת עמידת ידיים על הקיר": "Wall Handstand Push-up",
    "לחיצת עמידת ידיים חופשית": "Freestanding Handstand Push-up",
    "פרונט לבר": "Front Lever",
    "דגל אנושי": "Human Flag",
    "פלאנץ": "Planche",
    "מאסל-אפ": "Muscle-up",
    "מאסל אפ": "Muscle-up",
    "מתח יד אחת": "One-Arm Pull-up"
  };

  function canonicalLookupName(name) {
    const raw = String(name || "").trim();
    // Hebrew-first bilingual output uses "עברית (English Canonical)". Prefer
    // the Latin parenthetical for curated demo lookup instead of discarding it.
    const bilingual = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (bilingual && /[\u0590-\u05FF]/.test(bilingual[1]) && /[A-Za-z]/.test(bilingual[2])) {
      return bilingual[2].trim();
    }
    const noAnnotation = raw.replace(/\s*\([^)]*(?:reps?|sec|hold|rir|rpe|kg|min)[^)]*\)\s*$/i, "").trim();
    if (HEBREW_TO_ENGLISH[noAnnotation]) return HEBREW_TO_ENGLISH[noAnnotation];
    return raw;
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
    const lookupName = canonicalLookupName(name);
    const key = normalizeExerciseName(lookupName);
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
    const q = encodeURIComponent(lookupName + " exercise demo");
    return { url: "https://www.youtube.com/results?search_query=" + q, source: "search", channel: null, canonical: lookupName };
  }

  function getPrivacyDisclosure() {
    return (demos && demos.policy && demos.policy.privacy_disclosure) ||
      "Exercise demos open in YouTube. To keep them out of your watch history, open them in incognito/private mode.";
  }

  window.ExerciseDemos = { load, normalizeExerciseName, resolveExerciseDemo, getPrivacyDisclosure };
})();
