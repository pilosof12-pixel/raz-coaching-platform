// Security and privacy bootstrap for the existing server.
// It patches Express before server.js creates the app so hardening can remain
// isolated from the coaching engine while we validate the launch wrapper.

import express from "express";
import { makeStorage } from "./storage.js";

const TOKEN_RE = /^[a-f0-9]{32}$/i;
const JOB_RE = /^[a-f0-9]{32}$/i;
const NODE_ENV = process.env.NODE_ENV || "development";
const GENERATION_BUILDS_PER_HOUR = Number(process.env.GENERATION_BUILDS_PER_HOUR || 4);
const GENERATION_ADJUSTS_PER_HOUR = Number(process.env.GENERATION_ADJUSTS_PER_HOUR || 12);
const MAX_INTAKE_CHARS = Number(process.env.MAX_INTAKE_CHARS || 30000);
const MAX_FIELD_CHARS = Number(process.env.MAX_FIELD_CHARS || 5000);

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

function securityMiddleware(req, res, next) {
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

  // Public production health checks should reveal only availability.
  if (NODE_ENV === "production" && req.path === "/api/health") {
    const json = res.json.bind(res);
    res.json = () => json({ ok: true });
  }

  // Capability tokens are the authentication credential. Reject malformed values
  // before they ever reach storage lookups or mutation routes.
  const bodyToken = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (bodyToken && !TOKEN_RE.test(bodyToken)) {
    return res.status(400).json({ error: "Invalid personal code." });
  }

  const programMatch = req.path.match(/^\/api\/program\/([^/]+)$/);
  if (programMatch && !TOKEN_RE.test(programMatch[1])) {
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
  }

  if (req.method === "POST" && (req.path === "/api/adjust" || req.path === "/api/set-language")) {
    if (!consumeHourly(req, "adjust", GENERATION_ADJUSTS_PER_HOUR)) {
      return res.status(429).json({ error: "Too many adjustment requests from this connection. Please try again later." });
    }
    if (typeof req.body?.request === "string" && req.body.request.length > MAX_FIELD_CHARS) {
      return res.status(413).json({ error: "The adjustment request is too long." });
    }
  }

  next();
}

// server.js first installs express.json(). Add our middleware immediately after
// that first app.use call, so request bodies are available for validation and the
// middleware still runs before static files and all API routes.
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

// Add privacy routes immediately before the existing server begins listening.
const originalListen = express.application.listen;
express.application.listen = function (...args) {
  if (!this.__privacyRoutesInstalled) {
    this.__privacyRoutesInstalled = true;

    this.delete("/api/client-data", async (req, res) => {
      try {
        const token = String(req.body?.token || "").trim();
        if (!TOKEN_RE.test(token)) return res.status(400).json({ error: "Invalid personal code." });
        await privacyStore.deleteClientData(token);
        // Generic success avoids confirming whether a guessed code existed.
        return res.json({ ok: true });
      } catch (e) {
        console.error("client data deletion failed:", e && e.message);
        return res.status(500).json({ error: "Could not delete the saved data." });
      }
    });
  }

  // Best-effort cleanup at boot and twice daily. The Supabase SQL migration can
  // also schedule its database-side purge function for defense in depth.
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
