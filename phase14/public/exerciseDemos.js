// public/exerciseDemos.js
// Browser-side direct-only exercise demo resolver.

(function () {
  // Intake compatibility patch: the engine treats the upper end as the session
  // ceiling and never tries to fill the range with junk volume.
  const sessionSelect = document.getElementById('session_length');
  if (sessionSelect) {
    sessionSelect.innerHTML = [
      ['','Any / coach decides'],
      ['30-45 min','30–45 min'],
      ['45-70 min','45–70 min'],
      ['70-90 min','70–90 min']
    ].map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
  }

  let demos = null;
  let loadPromise = null;

  function load() {
    if (demos) return Promise.resolve(demos);
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch("data/exercise_demos.json", { cache: "no-cache" }).then(res => {
        if (!res.ok) throw new Error("Failed to load exercise_demos.json: " + res.status);
        return res.json();
      }),
      fetch("data/exercise_demo_overrides.json", { cache: "no-cache" }).then(res => res.ok ? res.json() : ({ entries:{} })).catch(() => ({ entries:{} }))
    ]).then(([base, overrides]) => {
      demos = { ...base, entries: { ...(base.entries || {}), ...(overrides.entries || {}) } };
      return demos;
    }).catch((err) => { loadPromise = null; throw err; });
    return loadPromise;
  }

  const HEBREW_TO_ENGLISH = {
    "סקוואט אחורי": "Back Squat", "סקוואט קדמי": "Front Squat", "דדליפט": "Deadlift",
    "דדליפט רומני": "Romanian Deadlift", "לחיצת חזה": "Bench Press", "לחיצת כתפיים": "Overhead Press",
    "מתח": "Pull-up", "דיפ": "Dip", "לחיצת עמידת ידיים על הקיר": "Wall Handstand Push-up",
    "לחיצת עמידת ידיים חופשית": "Freestanding Handstand Push-up", "פרונט לבר": "Front Lever",
    "דגל אנושי": "Human Flag", "פלאנץ": "Planche", "מאסל-אפ": "Muscle-up", "מאסל אפ": "Muscle-up",
    "מתח יד אחת": "One-Arm Pull-up"
  };

  function canonicalLookupName(name) {
    const raw = String(name || "").trim();
    const bilingual = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (bilingual && /[\u0590-\u05FF]/.test(bilingual[1]) && /[A-Za-z]/.test(bilingual[2])) return bilingual[2].trim();
    const noAnnotation = raw.replace(/\s*\([^)]*(?:reps?|sec|hold|rir|rpe|kg|min)[^)]*\)\s*$/i, "").trim();
    if (HEBREW_TO_ENGLISH[noAnnotation]) return HEBREW_TO_ENGLISH[noAnnotation];
    return raw;
  }

  function normalizeExerciseName(name) {
    return String(name || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  }

  // The policy has always documented a fallback for entries with no curated
  // video -- "runtime builds a YouTube search" -- and it was never implemented,
  // so resolve returned nothing and the workbook shipped an exercise with no
  // link at all. Of fifteen exercises in one reviewed program, four resolved.
  // A search link is honest: it always works, and it never claims to be a
  // specific video that nobody chose.
  function searchDemo(name, canonical) {
    const label = String(canonical || name || "").trim();
    if (!label) return null;
    return {
      url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(label + " exercise demo"),
      source: "search",
      channel: null,
      canonical: label
    };
  }

  function resolveExerciseDemo(name) {
    if (!name || !demos?.entries) return null;
    const lookupName = canonicalLookupName(name), key = normalizeExerciseName(lookupName);
    const direct = demos.entries[key];
    if (direct?.demo_url) return { url: direct.demo_url, source: "curated", channel: direct.channel, canonical: direct.canonical };
    for (const v of Object.values(demos.entries)) {
      if (v.aliases?.includes(key) && v.demo_url) return { url: v.demo_url, source: "curated", channel: v.channel, canonical: v.canonical };
    }
    // Known movement, no curated video yet.
    if (direct) return searchDemo(name, direct.canonical);
    for (const v of Object.values(demos.entries)) {
      if (v.aliases?.includes(key)) return searchDemo(name, v.canonical);
    }
    // Unknown movement: the athlete still gets somewhere useful to look.
    return searchDemo(name, lookupName);
  }

  function getPrivacyDisclosure() { return (demos?.policy?.privacy_disclosure) || "Exercise demos open in YouTube."; }
  function hasCuratedDemo(name) { const d = resolveExerciseDemo(name); return !!d && d.source === "curated"; }
  window.ExerciseDemos = { load, normalizeExerciseName, resolveExerciseDemo, hasCuratedDemo, getPrivacyDisclosure };
})();
