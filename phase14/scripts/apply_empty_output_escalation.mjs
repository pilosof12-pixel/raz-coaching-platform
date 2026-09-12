// An empty model response is not a verdict, and repeating the identical request
// is not a reaction to one.
//
// The dual-event block died on OPENAI_EMPTY_OUTPUT after seventeen minutes with
// nothing saved. The transient-retry budget exists for exactly that, and it
// would have re-sent byte-for-byte the same request, with the same reasoning
// effort and the same output ceiling, to the same model -- so a request that
// spent its whole token budget thinking would spend it thinking again.
//
// max_output_tokens in the Responses API covers reasoning AND the written
// answer. At high effort on the hardest intake in the set -- two events, no
// clean Day 0 -- the reasoning can consume the ceiling and leave no room to
// write the program, which the API reports as status "incomplete" with
// incomplete_details.reason "max_output_tokens". Nothing here was reading that
// field, so the one fact that explains the failure was thrown away.
//
// This patch does three things:
//   1. records status and incomplete_details on the error and in the log, so
//      the next empty output says why it was empty;
//   2. lets a caller pass a larger ceiling and a lower effort;
//   3. escalates both on each transient retry, so the second attempt is
//      actually a different request from the first.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');
const before = s;

// 1. The call takes per-attempt overrides.
const sigOld = 'async function runEngineRaw(userContent) {';
const sigNew = `async function runEngineRaw(userContent, engineOptions = {}) {
  const effectiveMaxOutputTokens = Number(engineOptions?.maxOutputTokens || OPENAI_MAX_OUTPUT_TOKENS);
  const effectiveReasoningEffort = String(engineOptions?.reasoningEffort || OPENAI_REASONING_EFFORT); // EMPTY-OUTPUT-ESCALATION`;
if (!s.includes(sigNew)) {
  if (!s.includes(sigOld)) throw new Error('runEngineRaw signature anchor missing');
  s = s.replace(sigOld, sigNew);
}

const bodyOld = `          reasoning: { effort: OPENAI_REASONING_EFFORT },
          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,`;
const bodyNew = `          reasoning: { effort: effectiveReasoningEffort },
          max_output_tokens: effectiveMaxOutputTokens,`;
if (!s.includes(bodyNew)) {
  if (!s.includes(bodyOld)) throw new Error('request body anchor missing');
  s = s.replace(bodyOld, bodyNew);
}

// Report the budget that was actually in force, not the configured default.
const usageOld = `        provider: "openai", model: OPENAI_MODEL, reasoning_effort: OPENAI_REASONING_EFFORT,`;
const usageNew = `        provider: "openai", model: OPENAI_MODEL, reasoning_effort: effectiveReasoningEffort,
        max_output_tokens: effectiveMaxOutputTokens, response_status: data?.status || "",
        incomplete_reason: data?.incomplete_details?.reason || "",`;
if (!s.includes(usageNew)) {
  if (!s.includes(usageOld)) throw new Error('usage anchor missing');
  s = s.replace(usageOld, usageNew);
}

// 2. Say why it was empty.
const emptyOld = `        const emptyOutputError = new Error("OpenAI returned no output_text content.");
        emptyOutputError.code = "OPENAI_EMPTY_OUTPUT";`;
const emptyNew = `        const incompleteReason = String(data?.incomplete_details?.reason || "");
        const ranOutOfRoom = incompleteReason === "max_output_tokens";
        const emptyOutputError = new Error(ranOutOfRoom
          ? "OpenAI spent the whole output budget reasoning and wrote no program (max_output_tokens)."
          : "OpenAI returned no output_text content.");
        emptyOutputError.code = "OPENAI_EMPTY_OUTPUT";
        emptyOutputError.incompleteReason = incompleteReason;
        emptyOutputError.reasoningTokens = reasoning;
        emptyOutputError.maxOutputTokens = effectiveMaxOutputTokens;
        console.warn("OpenAI empty output:", JSON.stringify({
          response_status: data?.status || "", incomplete_reason: incompleteReason,
          reasoning_tokens: reasoning, output_tokens: output, max_output_tokens: effectiveMaxOutputTokens,
          reasoning_effort: effectiveReasoningEffort
        }));`;
if (!s.includes(emptyNew)) {
  if (!s.includes(emptyOld)) throw new Error('empty-output anchor missing');
  s = s.replace(emptyOld, emptyNew);
}

// 3. Escalate on retry. A retry that sends the same request is not a retry.
const stateOld = `  let transientRetries = 0;
  const MAX_TRANSIENT_RETRIES = 3;`;
const stateNew = `  let transientRetries = 0;
  const MAX_TRANSIENT_RETRIES = 3;
  // Raised per empty output: more room to write, and -- once it is clear the
  // thinking is what is eating the budget -- less room to think.
  let engineOptions = {};`;
if (!s.includes(stateNew)) {
  if (!s.includes(stateOld)) throw new Error('transient-state anchor missing');
  s = s.replace(stateOld, stateNew);
}

const callOld = '      raw = await runEngineRaw(userContent);';
const callNew = '      raw = await runEngineRaw(userContent, engineOptions);';
if (!s.includes(callNew)) {
  if (!s.includes(callOld)) throw new Error('generation call anchor missing');
  s = s.replace(callOld, callNew);
}

const bumpOld = `      transientRetries++;
      attempt--; // this attempt judged nothing, so it does not count as one`;
const bumpNew = `      transientRetries++;
      attempt--; // this attempt judged nothing, so it does not count as one
      if (e?.code === "OPENAI_EMPTY_OUTPUT") {
        const ceiling = Number(engineOptions.maxOutputTokens || OPENAI_MAX_OUTPUT_TOKENS);
        engineOptions = { ...engineOptions, maxOutputTokens: Math.min(96000, Math.round(ceiling * 1.5)) };
        // A second empty response says the reasoning, not the ceiling, is the
        // constraint. Spend the budget on the program instead.
        if (transientRetries >= 2) engineOptions.reasoningEffort = "medium";
        console.warn("generateValidatedProgram: empty output; escalating", JSON.stringify(engineOptions));
      }
      // The transient failures belong in the trace the acceptance artefact
      // records. Without them a build that never reached QA reports only its
      // last error, and the question "did the retry even run?" needs the
      // service logs to answer -- which is how two runs went by without anyone
      // being able to say why the dual-event block produced nothing.
      qaTrace.push(\`T\${transientRetries}:\${aborted ? "request_ceiling" : "empty_output"}\${e?.incompleteReason ? "(" + e.incompleteReason + ")" : ""}\`);`;
if (!s.includes(bumpNew)) {
  if (!s.includes(bumpOld)) throw new Error('transient-bump anchor missing');
  s = s.replace(bumpOld, bumpNew);
}

// 4. A build that never reached QA still has a story, and it was being thrown
// away. The exhaustion path attaches the trace; the transient path did not, so
// the dual-event failure reported one sentence and nothing about the attempts
// behind it.
const exhaustOld = `      if (transientRetries >= MAX_TRANSIENT_RETRIES || Date.now() >= deadline) {
        console.warn(\`generateValidatedProgram: \${reason}, transient budget exhausted (\${transientRetries}/\${MAX_TRANSIENT_RETRIES})\`);
        throw e;
      }`;
const exhaustNew = `      if (transientRetries >= MAX_TRANSIENT_RETRIES || Date.now() >= deadline) {
        const outOfTime = Date.now() >= deadline;
        console.warn(\`generateValidatedProgram: \${reason}, \${outOfTime ? "job budget spent" : "transient budget exhausted"} (\${transientRetries}/\${MAX_TRANSIENT_RETRIES})\`);
        qaTrace.push(\`T\${transientRetries + 1}:\${aborted ? "request_ceiling" : "empty_output"}\${e?.incompleteReason ? "(" + e.incompleteReason + ")" : ""}:\${outOfTime ? "JOB_BUDGET_SPENT" : "TRANSIENT_BUDGET_SPENT"}\`);
        e.qa_trace = qaTrace.slice();
        e.message = \`\${e.message} QA trace: \${qaTrace.join(" -> ")}.\`;
        throw e;
      }`;
if (!s.includes(exhaustNew)) {
  if (!s.includes(exhaustOld)) throw new Error('transient-exhaust anchor missing');
  s = s.replace(exhaustOld, exhaustNew);
}

if (s !== before) fs.writeFileSync(target, s);
console.log('empty-output escalation applied');
