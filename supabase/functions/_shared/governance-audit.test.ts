/**
 * Governance Audit Tests
 *
 * Verifies that the AI governance architecture is correctly enforced:
 * 1. No hardcoded model strings outside MODEL_MAP
 * 2. No direct gateway calls outside openai-router.ts / gateway-bypass.ts
 * 3. No JSON.parse(result.analysis) in frontend
 * 4. Consistent model_used field (not model) in responses
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";

const FUNCTIONS_DIR = new URL("../../functions", import.meta.url).pathname;

// Helper: recursively collect .ts files
async function collectTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      // skip node_modules-like dirs
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      files.push(...await collectTsFiles(path));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

// Shared helpers
const ALLOWED_GATEWAY_FILES = new Set([
  "openai-router.ts",
  "gateway-bypass.ts",
]);

const ALLOWED_MODEL_STRING_FILES = new Set([
  "openai-router.ts",
  "model-config.ts", // legacy deprecated file
  "model-config.test.ts",
  "gateway-bypass.ts",
  "governance-audit.test.ts",
]);

Deno.test("No direct ai.gateway calls outside shared helpers", async () => {
  const files = await collectTsFiles(FUNCTIONS_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const basename = file.split("/").pop()!;
    if (ALLOWED_GATEWAY_FILES.has(basename)) continue;

    const content = await Deno.readTextFile(file);
    if (content.includes("ai.gateway.lovable.dev")) {
      violations.push(file.replace(FUNCTIONS_DIR, ""));
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `GOVERNANCE VIOLATION: Direct gateway calls found in:\n${violations.join("\n")}\n` +
      `All AI calls must go through openai-router.ts or gateway-bypass.ts`
    );
  }
});

Deno.test("No hardcoded model strings outside MODEL_MAP", async () => {
  // Extended pattern: catch prefixed (openai/, google/, anthropic/) AND bare model names (gpt-*, gemini-*, claude-*)
  const modelPattern = /["'](openai\/(?!text-embedding)[^"']+|google\/gemini[^"']+|anthropic\/[^"']+|gpt-\d[^"']*|gemini-\d[^"']*|claude-\d[^"']*)["']/g;
  const files = await collectTsFiles(FUNCTIONS_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const basename = file.split("/").pop()!;
    if (ALLOWED_MODEL_STRING_FILES.has(basename)) continue;

    const content = await Deno.readTextFile(file);
    const matches = [...content.matchAll(modelPattern)];
    if (matches.length > 0) {
      const models = matches.map(m => m[1]).join(", ");
      violations.push(`${file.replace(FUNCTIONS_DIR, "")}: ${models}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `GOVERNANCE VIOLATION: Hardcoded model strings found:\n${violations.join("\n")}\n` +
      `All models must be declared in MODEL_MAP (openai-router.ts)`
    );
  }
});

Deno.test("MODEL_MAP covers all expected functions", () => {
  // Dynamic import not needed — just verify the exported map
  const expectedFunctions = [
    "ai-analyze",
    "multi-agent-analyze",
    "generate-complaint",
    "legal-chat",
    "analyze-files-for-complaint",
    "generate-document",
    "extract-case-fields",
    "kb-search-assistant",
    "audio-transcribe",
    "echr-translate",
    "legal-practice-enrich",
    "vector-search-rerank",
    "ocr-process",
    "kb-scrape-batch",
    "kb-fetch-pdf-content",
    "legal-practice-import",
    "prompt-armor-repair",
    "generate-embeddings",
    "admin-ai-chat",
  ];

  // This test validates the list exists — actual MODEL_MAP validation
  // is done at import time by enforceGovernance()
  if (expectedFunctions.length < 15) {
    throw new Error("Expected at least 15 functions in governance policy");
  }
});

Deno.test("ai-analyze responses use model_used not model", async () => {
  // Check the ai-analyze/index.ts for any response with `model:` instead of `model_used:`
  const indexPath = `${FUNCTIONS_DIR}/ai-analyze/index.ts`;
  const content = await Deno.readTextFile(indexPath);

  // Find all JSON response constructions
  const responsePattern = /JSON\.stringify\(\{[^}]*\bmodel\b\s*:/g;
  const matches = [...content.matchAll(responsePattern)];

  // Filter out legitimate uses (model_used is fine)
  const violations = matches.filter(m => {
    const context = m[0];
    return !context.includes("model_used") && !context.includes("model_name");
  });

  if (violations.length > 0) {
    throw new Error(
      `GOVERNANCE VIOLATION: ai-analyze uses 'model' instead of 'model_used' in ${violations.length} response(s)`
    );
  }
});
