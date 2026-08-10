import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { makeStorage, USING_SUPABASE } from "../storage.js";

test("Program Pass records successful build and adjustment usage", { skip: USING_SUPABASE }, async () => {
  const store = await makeStorage();
  const token = crypto.randomBytes(16).toString("hex");
  const now = Date.now();

  try {
    const created = await store.createProgramPass({
      token,
      paymentRef: `test-${token}`,
      purchasedAt: now,
      expiresAt: now + 56 * 24 * 60 * 60 * 1000,
      programCredits: 1,
      adjustmentsTotal: 6,
    });

    assert.equal(created.active, true);
    assert.equal(created.programs_remaining, 1);
    assert.equal(created.adjustments_remaining, 6);

    await store.addHistory(token, "build", "{}", "program", now + 1);
    let pass = await store.getProgramPass(token);
    assert.equal(pass.programs_remaining, 0);
    assert.equal(pass.adjustments_remaining, 6);

    await store.addHistory(token, "adjust", "changed schedule", "updated program", now + 2);
    pass = await store.getProgramPass(token);
    assert.equal(pass.adjustments_used, 1);
    assert.equal(pass.adjustments_remaining, 5);
  } finally {
    await store.deleteClientData(token);
  }
});

test("expired Program Pass becomes inactive", { skip: USING_SUPABASE }, async () => {
  const store = await makeStorage();
  const token = crypto.randomBytes(16).toString("hex");
  const now = Date.now();

  try {
    await store.createProgramPass({
      token,
      paymentRef: `expired-${token}`,
      purchasedAt: now - 10_000,
      expiresAt: now - 1,
      programCredits: 1,
      adjustmentsTotal: 6,
    });
    const pass = await store.getProgramPass(token);
    assert.equal(pass.active, false);
    assert.equal(pass.status, "expired");
  } finally {
    await store.deleteClientData(token);
  }
});
