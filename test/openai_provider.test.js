import { test } from "node:test";
import assert from "node:assert/strict";
import { extractResponseText, runOpenAIResponse } from "../engine/openai_provider.js";

test("extractResponseText reads Responses API message content", () => {
  const payload = {
    output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }],
  };
  assert.equal(extractResponseText(payload), "hello");
});

test("runOpenAIResponse sends reasoning request and returns text", async () => {
  let captured;
  const fetchImpl = async (_url, init) => {
    captured = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return { output: [{ type: "message", content: [{ type: "output_text", text: "PROGRAM" }] }] };
      },
    };
  };
  const out = await runOpenAIResponse({
    apiKey: "test",
    model: "gpt-5.6-luna",
    systemInstruction: "ENGINE",
    userContent: "INTAKE",
    reasoningEffort: "medium",
    fetchImpl,
  });
  assert.equal(out, "PROGRAM");
  assert.equal(captured.model, "gpt-5.6-luna");
  assert.equal(captured.instructions, "ENGINE");
  assert.equal(captured.input, "INTAKE");
  assert.equal(captured.reasoning.effort, "medium");
});

test("runOpenAIResponse surfaces API errors", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    async json() { return { error: { message: "rate limited" } }; },
  });
  await assert.rejects(
    runOpenAIResponse({ apiKey: "test", systemInstruction: "E", userContent: "U", fetchImpl }),
    /rate limited/
  );
});
