import fs from "node:fs";

const BASE = process.env.LIVE_BASE || "https://raz-coaching-platform.onrender.com";
const outDir = "stress-output";
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonFetch(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

async function waitForDeployment() {
  const deadline = Date.now() + 10 * 60 * 1000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await jsonFetch("/api/health");
      console.log("health", JSON.stringify(last));
      if (
        last?.ok &&
        last?.mode === "openai" &&
        /^gpt-/i.test(String(last?.model || "")) &&
        last?.ai_configured !== false &&
        last?.openai_execution_path === "deterministic-skeleton-v5-quality" &&
        Number(last?.openai_compact_developer_chars || 0) > 4407
      ) return last;
    } catch (e) {
      console.log("health wait:", e.message);
    }
    await sleep(5000);
  }
  throw new Error(`Live deployment did not report the one-rung-safe v5 build in time. Last health: ${JSON.stringify(last)}`);
}

const AVATARS = {
  gymnastics_advanced: {
    primary_goals: ["Full Planche", "Full Front Lever", "One-Arm Pull-Up"],
    secondary_goals: ["Maintain general lower-body strength"],
    experience: "advanced",
    days_per_week: "5",
    session_length: "75",
    bodyweight: "78 kg",
    equipment: "Full commercial gym with pull-up bars, cable stacks, free weights, rings and parallettes.",
    training_location: "commercial_gym",
    language: "en",
    split_preference: "coach_decide",
    current_numbers: "Tuck planche 15s. Advanced tuck front lever 10s. 18 strict pull-ups. Weighted pull-up +45 kg x3. Assisted one-arm pull-up with light assistance. 10 strict ring dips. Back squat 150 kg x3.",
    injuries: "none",
    sport: "BJJ",
    sport_schedule: [{ day: "Tue", intensity: "moderate" }, { day: "Sat", intensity: "moderate" }],
    notes: "Gymnastics skills are the priority. Do not waste time on beginner progressions. Wants strength work alongside skill work, but recovery for skill quality matters most.",
  },
};

async function build(name, intake) {
  const started = Date.now();
  const accepted = await jsonFetch("/api/build", {
    method: "POST",
    body: JSON.stringify({ intake }),
  });
  if (!accepted.job_id) throw new Error(`${name}: no job_id returned`);
  console.log(`${name}: accepted job ${accepted.job_id}`);

  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(2500);
    const job = await jsonFetch(`/api/job/${accepted.job_id}`);
    if (job.status === "done") {
      const secs = Math.round((Date.now() - started) / 100) / 10;
      const program = job.program || "";
      const result = { name, secs, token: job.token, violations: job?._meta?.violations ?? null, length: program.length, program };
      fs.writeFileSync(`${outDir}/${name}.txt`, program);
      console.log(`RESULT ${name}: ${secs}s, len=${program.length}, violations=${result.violations}`);
      console.log(`PROGRAM_BEGIN ${name}\n${program}\nPROGRAM_END ${name}`);
      return result;
    }
    if (job.status === "error") throw new Error(`${name}: ${job.error || "unknown build error"}`);
  }
  throw new Error(`${name}: timed out waiting for job`);
}

const health = await waitForDeployment();
const results = [];
for (const [name, intake] of Object.entries(AVATARS)) results.push(await build(name, intake));
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify({ health, results: results.map(({ program, ...r }) => r) }, null, 2));
console.log("STRESS_SUMMARY", JSON.stringify({ health, results: results.map(({ program, ...r }) => r) }));
