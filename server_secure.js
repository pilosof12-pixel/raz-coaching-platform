// Security, privacy and Program Pass bootstrap for the existing server.
// The paid-access gate is feature-flagged so checkout can be integrated and tested
// before production is switched from validation mode to paid mode.

import express from "express";
import crypto from "node:crypto";
import { makeStorage } from "./storage.js";

const TOKEN_RE = /^[a-f0-9]{32}$/i;
const JOB_RE = /^[a-f0-9]{32}$/i;
const NODE_ENV = process.env.NODE_ENV || "development";
const GENERATION_BUILDS_PER_HOUR = Number(process.env.GENERATION_BUILDS_PER_HOUR || 4);
const GENERATION_ADJUSTS_PER_HOUR = Number(process.env.GENERATION_ADJUSTS_PER_HOUR || 12);
const MAX_INTAKE_CHARS = Number(process.env.MAX_INTAKE_CHARS || 30000);
const MAX_FIELD_CHARS = Number(process.env.MAX_FIELD_CHARS || 5000);

// Commercial defaults. These can be changed by environment variable without
// changing the client promise in code, but launch copy should stay in sync.
const ENFORCE_PROGRAM_PASSES = process.env.ENFORCE_PROGRAM_PASSES === "1";
const PROGRAM_PASS_PRICE_AUD = Number(process.env.PROGRAM_PASS_PRICE_AUD || 30);
const PROGRAM_PASS_ACCESS_DAYS = Number(process.env.PROGRAM_PASS_ACCESS_DAYS || 56);
const PROGRAM_PASS_ADJUSTMENTS = Number(process.env.PROGRAM_PASS_ADJUSTMENTS || 6);
const PROGRAM_PASS_ADMIN_SECRET = process.env.PROGRAM_PASS_ADMIN_SECRET || "";

const privacyStore = await makeStorage();
const counters = new Map();

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function rateKey(req, group) {
  return `${group}:${clientIp(req)}`;
}

function consumeHourly(req, group, max) {
  const key = rateKey(req, group);
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  let row = counters.get(key);
  if (!row || now - row.startedAt >= hour) {
    row = { startedAt: now, count: 0 };
    counters.set(key, row);
  }
  row.count += 1;
  return row.count <= max;
}

function tooLarge(value) {
  if (typeof value === "string") return value.length > MAX_FIELD_CHARS;
  if (Array.isArray(value)) return value.some(tooLarge);
  if (value && typeof value === "object") return Object.values(value).some(tooLarge);
  return false;
}

function validConsent(intake) {
  const c = intake?.privacy_consent;
  return Boolean(
    c && c.health_data === true &&
    typeof c.policy_version === "string" && c.policy_version.length > 0 &&
    typeof c.consented_at === "string" && !Number.isNaN(Date.parse(c.consented_at))
  );
}

function secretMatches(candidate) {
  if (!PROGRAM_PASS_ADMIN_SECRET || !candidate) return false;
  const a = Buffer.from(PROGRAM_PASS_ADMIN_SECRET);
  const b = Buffer.from(String(candidate));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passPublic(pass) {
  if (!pass) return null;
  return {
    status: pass.status,
    active: Boolean(pass.active),
    purchased_at: pass.purchased_at,
    expires_at: pass.expires_at,
    programs_remaining: pass.programs_remaining,
    adjustments_total: pass.adjustments_total,
    adjustments_used: pass.adjustments_used,
    adjustments_remaining: pass.adjustments_remaining,
    price_aud: PROGRAM_PASS_PRICE_AUD,
    access_days: PROGRAM_PASS_ACCESS_DAYS,
  };
}

function paidError(res, status, code, error) {
  return res.status(status).json({ error, code });
}

async function requirePassForAction(token, action, res) {
  const pass = await privacyStore.getProgramPass(token);
  if (!pass) {
    paidError(res, 402, "PROGRAM_PASS_REQUIRED", "A valid Program Pass is required for this action.");
    return null;
  }
  if (!pass.active) {
    const code = pass.status === "expired" ? "PROGRAM_PASS_EXPIRED" : "PROGRAM_PASS_INACTIVE";
    paidError(res, 402, code, pass.status === "expired"
      ? "This Program Pass has expired. Purchase a new Program Pass for a new training block."
      : "This Program Pass is not active.");
    return null;
  }
  if (action === "build" && pass.programs_remaining <= 0) {
    paidError(res, 402, "PROGRAM_ALREADY_USED", "This Program Pass has already generated its program. Purchase a new Program Pass for a new training block.");
    return null;
  }
  if (action === "adjust" && pass.adjustments_remaining <= 0) {
    paidError(res, 402, "ADJUSTMENTS_EXHAUSTED", "All included adjustments have been used. Your current program remains available until the pass expires.");
    return null;
  }
  return pass;
}

async function securityMiddleware(req, res, next) {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    );

    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
    }

    if (NODE_ENV === "production" && req.path === "/api/health") {
      const json = res.json.bind(res);
      res.json = () => json({ ok: true });
    }

    const bodyToken = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (bodyToken && !TOKEN_RE.test(bodyToken)) {
      return res.status(400).json({ error: "Invalid personal code." });
    }

    const programMatch = req.path.match(/^\/api\/program\/([^/]+)$/);
    if (programMatch && !TOKEN_RE.test(programMatch[1])) {
      return res.status(400).json({ error: "Invalid personal code." });
    }
    const passMatch = req.path.match(/^\/api\/pass\/([^/]+)$/);
    if (passMatch && !TOKEN_RE.test(passMatch[1])) {
      return res.status(400).json({ error: "Invalid personal code." });
    }
    const jobMatch = req.path.match(/^\/api\/job\/([^/]+)$/);
    if (jobMatch && !JOB_RE.test(jobMatch[1])) {
      return res.status(400).json({ error: "Invalid job id." });
    }

    if (req.method === "POST" && req.path === "/api/build") {
      const intake = req.body?.intake;
      if (!intake || typeof intake !== "object") {
        return res.status(400).json({ error: "Missing intake." });
      }
      if (!validConsent(intake)) {
        return res.status(400).json({ error: "Privacy consent is required before program generation." });
      }
      let serialized = "";
      try { serialized = JSON.stringify(intake); } catch (_e) {}
      if (!serialized || serialized.length > MAX_INTAKE_CHARS || tooLarge(intake)) {
        return res.status(413).json({ error: "The intake contains too much text. Please shorten the entries and try again." });
      }
      if (!consumeHourly(req, "build", GENERATION_BUILDS_PER_HOUR)) {
        return res.status(429).json({ error: "Too many program generation requests from this connection. Please try again later." });
      }
      if (ENFORCE_PROGRAM_PASSES) {
        if (!bodyToken) return paidError(res, 402, "PROGRAM_PASS_REQUIRED", "Purchase a Program Pass before building a new program.");
        const pass = await requirePassForAction(bodyToken, "build", res);
        if (!pass) return;
        if (await privacyStore.hasPendingJob(bodyToken, "build")) {
          return res.status(409).json({ error: "A program generation is already in progress for this pass." });
        }
      }
    }

    if (req.method === "POST" && (req.path === "/api/adjust" || req.path === "/api/set-language")) {
      if (!consumeHourly(req, "adjust", GENERATION_ADJUSTS_PER_HOUR)) {
        return res.status(429).json({ error: "Too many adjustment requests from this connection. Please try again later." });
      }
      if (typeof req.body?.request === "string" && req.body.request.length > MAX_FIELD_CHARS) {
        return res.status(413).json({ error: "The adjustment request is too long." });
      }
      if (ENFORCE_PROGRAM_PASSES) {
        if (!bodyToken) return paidError(res, 402, "PROGRAM_PASS_REQUIRED", "A valid Program Pass is required for adjustments.");
        const pass = await requirePassForAction(bodyToken, "adjust", res);
        if (!pass) return;
        if (await privacyStore.hasPendingJob(bodyToken, "adjust")) {
          return res.status(409).json({ error: "An adjustment is already in progress for this pass." });
        }
      }
    }

    if (ENFORCE_PROGRAM_PASSES && req.method === "GET" && programMatch) {
      const pass = await privacyStore.getProgramPass(programMatch[1]);
      if (!pass) return paidError(res, 402, "PROGRAM_PASS_REQUIRED", "A valid Program Pass is required to load this saved program.");
      if (!pass.active) return paidError(res, 402, "PROGRAM_PASS_EXPIRED", "This Program Pass has expired. Purchase a new Program Pass for a new training block.");
    }

    next();
  } catch (e) {
    console.error("security middleware failed:", e && e.message);
    return res.status(500).json({ error: "Request validation failed." });
  }
}

// server.js first installs express.json(). Add our middleware immediately after
// that first app.use call so bodies are available but all routes remain protected.
const originalUse = express.application.use;
let middlewareInjected = false;
express.application.use = function (...args) {
  const result = originalUse.apply(this, args);
  if (!middlewareInjected) {
    middlewareInjected = true;
    originalUse.call(this, securityMiddleware);
  }
  return result;
};

const originalListen = express.application.listen;
express.application.listen = function (...args) {
  if (!this.__privacyRoutesInstalled) {
    this.__privacyRoutesInstalled = true;

    // Customer-facing pass status. The token itself is the credential.
    this.get("/api/pass/:token", async (req, res) => {
      try {
        const token = String(req.params.token || "").trim();
        if (!TOKEN_RE.test(token)) return res.status(400).json({ error: "Invalid personal code." });
        const pass = await privacyStore.getProgramPass(token);
        if (!pass) return res.status(404).json({ error: "Program Pass not found." });
        return res.json({ pass: passPublic(pass) });
      } catch (e) {
        console.error("program pass status failed:", e && e.message);
        return res.status(500).json({ error: "Could not load Program Pass status." });
      }
    });

    // Provider-neutral server-to-server provisioning hook. A payment provider
    // webhook can call this after verified payment. Until checkout is wired, it is
    // also useful for staging passes. Never expose PROGRAM_PASS_ADMIN_SECRET client-side.
    this.post("/api/internal/program-pass", async (req, res) => {
      try {
        if (!secretMatches(req.headers["x-program-pass-secret"])) {
          return res.status(404).json({ error: "Not found." });
        }
        const paymentRef = String(req.body?.payment_ref || "").trim();
        if (!paymentRef || paymentRef.length > 200) {
          return res.status(400).json({ error: "A valid payment reference is required." });
        }
        const purchasedAt = Date.now();
        const expiresAt = purchasedAt + PROGRAM_PASS_ACCESS_DAYS * 24 * 60 * 60 * 1000;
        const token = crypto.randomBytes(16).toString("hex");
        const pass = await privacyStore.createProgramPass({
          token,
          paymentRef,
          purchasedAt,
          expiresAt,
          programCredits: 1,
          adjustmentsTotal: PROGRAM_PASS_ADJUSTMENTS,
        });
        return res.status(201).json({ token, pass: passPublic(pass) });
      } catch (e) {
        console.error("program pass provisioning failed:", e && e.message);
        return res.status(500).json({ error: "Could not provision Program Pass." });
      }
    });

    this.delete("/api/client-data", async (req, res) => {
      try {
        const token = String(req.body?.token || "").trim();
        if (!TOKEN_RE.test(token)) return res.status(400).json({ error: "Invalid personal code." });
        await privacyStore.deleteClientData(token);
        return res.json({ ok: true });
      } catch (e) {
        console.error("client data deletion failed:", e && e.message);
        return res.status(500).json({ error: "Could not delete the saved data." });
      }
    });
  }

  privacyStore.purgeExpiredOperationalData().catch((e) => {
    console.warn("retention cleanup failed:", e && e.message);
  });
  const cleanupTimer = setInterval(() => {
    privacyStore.purgeExpiredOperationalData().catch((e) => {
      console.warn("retention cleanup failed:", e && e.message);
    });
  }, 12 * 60 * 60 * 1000);
  cleanupTimer.unref?.();

  return originalListen.apply(this, args);
};

await import("./server.js");
