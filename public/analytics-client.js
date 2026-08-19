// Anonymous first-party funnel analytics.
// Sends event names only. Never sends personal code, intake fields, program text,
// injury information, URLs with tokens, or other customer content.
(function () {
  const allowed = new Set([
    "intake_started",
    "build_started",
    "build_succeeded",
    "build_failed",
    "return_succeeded",
    "return_failed",
    "adjust_started",
    "adjust_succeeded",
    "adjust_failed",
    "spreadsheet_downloaded",
    "language_switch_succeeded",
  ]);

  const baseFetch = window.fetch.bind(window);
  const jobs = new Map(); // job_id -> build | adjust | language
  let intakeTracked = false;

  function send(event) {
    if (!allowed.has(event)) return;
    try {
      baseFetch("/api/analytics-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  // First meaningful interaction with the intake counts once per page session.
  const intake = document.getElementById("intake-card");
  if (intake) {
    const markIntake = function () {
      if (intakeTracked) return;
      intakeTracked = true;
      send("intake_started");
    };
    intake.addEventListener("input", markIntake, { passive: true });
    intake.addEventListener("change", markIntake, { passive: true });
  }

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = String((init && init.method) || "GET").toUpperCase();

    let startKind = null;
    if (method === "POST" && /\/api\/build(?:\?|$)/.test(url)) startKind = "build";
    else if (method === "POST" && /\/api\/adjust(?:\?|$)/.test(url)) startKind = "adjust";
    else if (method === "POST" && /\/api\/set-language(?:\?|$)/.test(url)) startKind = "language";

    if (startKind === "build") send("build_started");
    if (startKind === "adjust") send("adjust_started");

    let response;
    try {
      response = await baseFetch(input, init);
    } catch (e) {
      if (startKind === "build") send("build_failed");
      if (startKind === "adjust") send("adjust_failed");
      throw e;
    }

    // Do not inspect or recursively track our analytics calls.
    if (/\/api\/analytics-event(?:\?|$)/.test(url)) return response;

    if (startKind) {
      if (!response.ok) {
        if (startKind === "build") send("build_failed");
        if (startKind === "adjust") send("adjust_failed");
      } else {
        try {
          const data = await response.clone().json();
          if (data && data.job_id) jobs.set(String(data.job_id), startKind);
          // Language no-change responses are successful without a job.
          if (startKind === "language" && data && data.status === "nochange") {
            send("language_switch_succeeded");
          }
        } catch (_) {}
      }
      return response;
    }

    const jobMatch = url.match(/\/api\/job\/([a-f0-9]{32})(?:\?|$)/i);
    if (method === "GET" && jobMatch && response.ok) {
      const id = jobMatch[1];
      const kind = jobs.get(id);
      if (kind) {
        try {
          const data = await response.clone().json();
          if (data && data.status === "done") {
            if (kind === "build") send("build_succeeded");
            else if (kind === "adjust") send("adjust_succeeded");
            else if (kind === "language") send("language_switch_succeeded");
            jobs.delete(id);
          } else if (data && data.status === "error") {
            if (kind === "build") send("build_failed");
            else if (kind === "adjust") send("adjust_failed");
            jobs.delete(id);
          }
        } catch (_) {}
      }
      return response;
    }

    // Returning program load. We intentionally do not send the token or URL.
    if (method === "GET" && /\/api\/program\/[a-f0-9]{32}(?:\?|$)/i.test(url)) {
      send(response.ok ? "return_succeeded" : "return_failed");
    }

    return response;
  };

  // Spreadsheet success is easiest to measure at the function boundary because
  // the existing click handler already catches failures and shows the user an error.
  const originalSpreadsheet = window.buildStrengthSpreadsheet;
  if (typeof originalSpreadsheet === "function") {
    window.buildStrengthSpreadsheet = async function (...args) {
      const result = await originalSpreadsheet.apply(this, args);
      send("spreadsheet_downloaded");
      return result;
    };
  }
})();
