import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'server.phase15.js');
const storagePath = path.join(__dirname, '..', 'storage.js');

function replaceOnce(src, oldText, newText, label) {
  if (src.includes(newText)) return src;
  const count = src.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label} anchor expected once, found ${count}`);
  return src.replace(oldText, newText);
}

let server = fs.readFileSync(serverPath, 'utf8');

server = replaceOnce(
  server,
  'import { normalizeAdvancedHybridWeek4OapConsolidation } from "./engine/advanced_hybrid_oap_consolidation_normalizer.js"; // ADVANCED-HYBRID-OAP-CONSOLIDATION-REPAIR-WIRED',
  'import { normalizeAdvancedHybridWeek4OapConsolidation } from "./engine/advanced_hybrid_oap_consolidation_normalizer.js"; // ADVANCED-HYBRID-OAP-CONSOLIDATION-REPAIR-WIRED\nimport { repairSafeObjectiveLanguage } from "./engine/quality_preserving_fast_repairs.js"; // QUALITY-PRESERVING-FAST-REPAIR-WIRED',
  'quality-preserving import'
);

// Preserve the first full generation at high reasoning. We do not lower reasoning
// or shorten the prompt. The larger ceiling only prevents a high-reasoning call
// from consuming the entire response budget before it can emit the client program.
server = server.replace(
  'const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 24000);',
  'const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 32000); // QUALITY-PRESERVING-HIGH-REASONING-HEADROOM'
);

const deterministicAnchor = '        const qaUnknownSuffix = qaUnknownNames.length ? \'[\' + qaUnknownNames.join(\'|\') + \']\' : \'\';\n        qaTrace.push(`A${attempt}:${repairLabel}${qaUnknownSuffix}`); // QA-DIAGNOSTIC-UNKNOWN-NAMES';
const deterministicReplacement = `        const qaUnknownSuffix = qaUnknownNames.length ? '[' + qaUnknownNames.join('|') + ']' : '';\n\n        // QUALITY-PRESERVING FAST PATH: a false week-over-week wording claim is\n        // objective and may be corrected without changing a single training variable.\n        // We only touch Notes. If the contradiction lives in Load/Reps, or if any\n        // other validator remains, the existing high-reasoning repair path is kept.\n        if (specificCodes.length && specificCodes.every((code) => code === "V34_PROGRESSION_LANGUAGE_MISMATCH")) {\n          const deterministic = repairSafeObjectiveLanguage(program, err.flags);\n          if (deterministic.changed) {\n            try {\n              const recheck = validateRepairableProgramBundle(deterministic.program, intake, {\n                skipSkillCalibration: Boolean(OPENAI_API_KEY),\n              });\n              const repairedProgram = recheck.program;\n              validateClientOutputCleanliness(repairedProgram);\n              qaTrace.push(\`A\${attempt}:\${repairLabel}->DETERMINISTIC_NOTE_REPAIR\`);\n              console.warn(\`generateValidatedProgram: quality-preserving deterministic note repair passed for \${repairLabel}; avoided full regeneration\`);\n              await onProgress("finalizing", attempt, "objective wording mismatch repaired without changing prescription");\n              return repairedProgram;\n            } catch (deterministicErr) {\n              // Keep the objectively improved candidate, then allow the normal\n              // source-grounded model repair to address whatever remains.\n              program = deterministic.program;\n              console.warn("deterministic wording repair did not fully clear QA; preserving repair and continuing normal high-reasoning path:", deterministicErr?.code || deterministicErr?.message);\n            }\n          }\n        }\n\n        qaTrace.push(\`A\${attempt}:\${repairLabel}\${qaUnknownSuffix}\`); // QA-DIAGNOSTIC-UNKNOWN-NAMES`;
server = replaceOnce(server, deterministicAnchor, deterministicReplacement, 'deterministic progression-language repair');

fs.writeFileSync(serverPath, server);

// Supabase production schema predates local progress-only columns. Keep attempt
// and detail in the local-first mirror (the UI still sees them) but do not require
// the legacy durable jobs table to have the newer attempt column.
let storage = fs.readFileSync(storagePath, 'utf8');
storage = replaceOnce(
  storage,
  '      persistEventually("job create",async()=>{ const s=await sb(); await runSupabase("createJob/upsert",()=>s.from("jobs").upsert(row,{onConflict:"id"}),{attempts:1}); });',
  '      persistEventually("job create",async()=>{ const s=await sb(); const durableRow={...row}; delete durableRow.attempt; await runSupabase("createJob/upsert",()=>s.from("jobs").upsert(durableRow,{onConflict:"id"}),{attempts:1}); }); // SUPABASE-LEGACY-JOB-SCHEMA-COMPAT',
  'Supabase createJob compatibility'
);
storage = replaceOnce(
  storage,
  '      persistEventually("job progress",async()=>{ const s=await sb(); await runSupabase("updateJobProgress/update",()=>s.from("jobs").update({stage,attempt,detail,updated_at:now}).eq("id",id),{attempts:1}); });',
  '      persistEventually("job progress",async()=>{ const s=await sb(); await runSupabase("updateJobProgress/update",()=>s.from("jobs").update({stage,detail,updated_at:now}).eq("id",id),{attempts:1}); }); // SUPABASE-LEGACY-JOB-SCHEMA-COMPAT',
  'Supabase updateJobProgress compatibility'
);
fs.writeFileSync(storagePath, storage);

console.log('quality-preserving runtime optimizations applied');
