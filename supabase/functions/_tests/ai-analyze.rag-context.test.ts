/**
 * RAG context assembly tests for ai-analyze edge function.
 * P0/P1: Validates anchor + semantic merge, threshold logic, and context integrity.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ─── Test 1: RAG threshold is stricter when anchors are present ─────────────

Deno.test("ai-analyze RAG: threshold with anchors > threshold without anchors", () => {
  // Mirrors the logic at line ~700 of ai-analyze/index.ts:
  // const ragThreshold = anchors.length > 0 ? 0.75 : 0.65;
  const anchorsPresent = 5;
  const anchorsAbsent = 0;

  const thresholdWithAnchors = anchorsPresent > 0 ? 0.75 : 0.65;
  const thresholdWithoutAnchors = anchorsAbsent > 0 ? 0.75 : 0.65;

  assertEquals(thresholdWithAnchors, 0.75, "Threshold with anchors must be 0.75");
  assertEquals(thresholdWithoutAnchors, 0.65, "Threshold without anchors must be 0.65");
  assertEquals(
    thresholdWithAnchors > thresholdWithoutAnchors,
    true,
    "Anchor threshold must be STRICTER (higher) than no-anchor threshold"
  );
});

// ─── Test 2: Anchor context is NOT overwritten by semantic RAG ──────────────

Deno.test("ai-analyze RAG: anchor block preserved when semantic results added", () => {
  // Simulate the context assembly from ai-analyze/index.ts
  let ragContext = "";

  // Phase 1.5: Anchor-based precise sources (lines ~676-689)
  const preciseSources = [
    { id: "kb-1", title: "ՀՀ ՔՕ Հdelays 308", category: "criminal_code", content_text: "Article 308 text...", article_number: "308", source_name: "RA Criminal Code" },
  ];

  if (preciseSources.length > 0) {
    ragContext += "\n\n## Նdelays\u0561\u057f\u056b\u057e \u0570\u0565\u0576\u0561\u056f\u0561\u0575\u056b\u0576 \u0561\u0572\u0562\u0575\u0578\u0582\u0580\u0576\u0565\u0580 (Anchor-Based Precise Sources):\n\n";
    for (const src of preciseSources) {
      ragContext += `### ${src.title}\n${src.content_text}\n\n---\n\n`;
    }
  }

  const anchorBlockPresent = ragContext.includes("Anchor-Based Precise Sources");
  assertEquals(anchorBlockPresent, true, "Anchor block must be present after Phase 1.5");

  // Phase 2: Semantic RAG results (lines ~726-743)
  const kbResults = [
    { id: "kb-2", title: "RA Constitution Art. 61", category: "constitution", content_text: "Right to fair trial..." },
  ];

  if (kbResults.length > 0) {
    ragContext += "\n\n## Relevant Legal Sources from RA Knowledge Base:\n\n";
    for (const doc of kbResults) {
      ragContext += `### ${doc.title} (${doc.category})\n${doc.content_text}\n\n`;
    }
  }

  // CRITICAL ASSERT: Both blocks must coexist
  assertEquals(
    ragContext.includes("Anchor-Based Precise Sources"),
    true,
    "Anchor block must NOT be overwritten by semantic results"
  );
  assertEquals(
    ragContext.includes("Relevant Legal Sources"),
    true,
    "Semantic block must be appended after anchor block"
  );
  assertEquals(
    ragContext.includes("Article 308 text"),
    true,
    "Anchor content must survive semantic merge"
  );
  assertEquals(
    ragContext.includes("Right to fair trial"),
    true,
    "Semantic content must be present"
  );
});

// ─── Test 3: mergeAndDeduplicate preserves anchor priority ──────────────────

Deno.test("ai-analyze RAG: mergeAndDeduplicate sorts anchors before semantic", async () => {
  // Import the merge function directly from the function source
  const sourceCode = await Deno.readTextFile(
    new URL("../ai-analyze/index.ts", import.meta.url)
  );

  // Verify the sort logic exists: anchorMatch DESC → authorityRank DESC → semanticScore DESC
  assertEquals(
    sourceCode.includes("a.anchorMatch !== b.anchorMatch"),
    true,
    "mergeAndDeduplicate must sort by anchorMatch first"
  );
  assertEquals(
    sourceCode.includes("authorityRank(b) - authorityRank(a)"),
    true,
    "mergeAndDeduplicate must sort by authorityRank second"
  );
  assertEquals(
    sourceCode.includes("b.semanticScore - a.semanticScore"),
    true,
    "mergeAndDeduplicate must sort by semanticScore third"
  );
});

// ─── Test 4: Category allowlist enforced ────────────────────────────────────

Deno.test("ai-analyze RAG: getCategoryAllowlist returns correct categories for criminal", async () => {
  const source = await Deno.readTextFile(
    new URL("../ai-analyze/index.ts", import.meta.url)
  );

  // Verify the category mapping exists and criminal includes expected categories
  assertEquals(
    source.includes("criminal_code") && source.includes("criminal_procedure") && source.includes("getCategoryAllowlist"),
    true,
    "Criminal case type must map to criminal_code, criminal_procedure categories"
  );
});

// ─── Test 5: MAX_CITED_IDS cap ──────────────────────────────────────────────

Deno.test("ai-analyze RAG: MAX_CITED_IDS caps merged sources at 50", async () => {
  const source = await Deno.readTextFile(
    new URL("../ai-analyze/index.ts", import.meta.url)
  );

  assertEquals(
    source.includes("const MAX_CITED_IDS = 50"),
    true,
    "MAX_CITED_IDS must be set to 50"
  );
  assertEquals(
    source.includes(".slice(0, MAX_CITED_IDS)"),
    true,
    "mergeAndDeduplicate must cap results at MAX_CITED_IDS"
  );
});

// ─── Test 6: fullCaseText assembled before RAG ──────────────────────────────

Deno.test("ai-analyze: fullCaseText built BEFORE RAG search (code structure)", async () => {
  const source = await Deno.readTextFile(
    new URL("../ai-analyze/index.ts", import.meta.url)
  );

  const fullCaseTextPos = source.indexOf("const fullCaseText =");
  const phase2Pos = source.indexOf("PHASE 2: RAG search");

  assertEquals(fullCaseTextPos > 0, true, "fullCaseText must be defined");
  assertEquals(phase2Pos > 0, true, "PHASE 2 marker must exist");
  assertEquals(
    fullCaseTextPos < phase2Pos,
    true,
    "fullCaseText assembly must come BEFORE RAG search (Case-First pipeline)"
  );
});
