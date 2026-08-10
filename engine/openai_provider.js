// OpenAI Responses API adapter for the coaching engine.
// Kept dependency-free so production does not need the OpenAI SDK package.

export function extractResponseText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  const chunks = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || item.type !== "message") continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part && part.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("");
}

export async function runOpenAIResponse({
  apiKey,
  model = "gpt-5.6-luna",
  systemInstruction,
  userContent,
  reasoningEffort = "medium",
  maxOutputTokens = 49152,
  fetchImpl = globalThis.fetch,
}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  if (typeof fetchImpl !== "function") throw new Error("Global fetch is unavailable.");

  const body = {
    model,
    instructions: systemInstruction,
    input: userContent,
    reasoning: { effort: reasoningEffort },
    max_output_tokens: maxOutputTokens,
    text: { verbosity: "high" },
  };

  const resp = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = payload?.error?.message || `OpenAI HTTP ${resp.status}`;
    throw new Error(msg);
  }
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI returned no output text.");
  return text;
}
