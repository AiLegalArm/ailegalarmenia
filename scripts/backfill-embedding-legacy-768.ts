#!/usr/bin/env -S deno run --allow-env --allow-net
/**
 * Backfill `embedding_legacy_768` (dim=768) for all relevant tables.
 *
 * Tables supported (current schema):
 * - public.knowledge_base
 * - public.legal_practice_kb
 * - public.legal_chunks
 *
 * Requirements enforced:
 * - Embeddings are generated from the final stored retrieval text (content_text / chunk_text)
 * - Dimension 768 is validated before writing
 * - Failures are logged and the source record is marked failed/unembedded
 * - Metrics: scanned / embedded_ok / skipped / failed / invalid_dimensions
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import {
  buildChunkEmbeddingText,
  buildEmbeddingText,
  type EmbeddingDoc,
} from "../supabase/functions/_shared/build-embedding-text.ts";
import {
  assertVectorDim,
  hasValidStoredVector,
  mergeJsonObject,
  PRIMARY_EMBEDDING_DIM,
  LEGACY_EMBEDDING_DIM,
} from "../supabase/functions/_shared/embedding-legacy.ts";
import { computeEmbeddingPlan } from "../supabase/functions/_shared/embedding-idempotency.ts";
import {
  buildEmbeddingFingerprintText,
  generateEmbeddings,
} from "../supabase/functions/_shared/embeddings.ts";

const MODEL = "text-embedding-3-small";
const DEFAULT_PAGE_SIZE = 100;

type TableName = "knowledge_base" | "legal_practice_kb" | "legal_chunks";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function getEnvAny(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`${names.join(" or ")} is required`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4, delayMs = 1000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // Non-retryable errors (token limit) -> throw immediately
      if (e && typeof e === "object" && "nonRetryable" in e && (e as { nonRetryable: boolean }).nonRetryable) throw e;
      if (attempt < retries) {
        const jitter = 0.75 + Math.random() * 0.5;
        const wait = Math.round(delayMs * Math.pow(2, attempt) * jitter);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

function vectorToPgString(v: number[]): string {
  return `[${v.join(",")}]`;
}

type Metrics = {
  scanned: number;
  embedded_ok: number;
  skipped: number;
  failed: number;
  invalid_dimensions: number;
  failed_token_limit: number;
  failed_other: number;
  pooled_segments_used: number;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i], i);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function backfillTable(supabase: ReturnType<typeof createClient>, table: TableName): Promise<Metrics> {
  const metrics: Metrics = {
    scanned: 0,
    embedded_ok: 0,
    skipped: 0,
    failed: 0,
    invalid_dimensions: 0,
    failed_token_limit: 0,
    failed_other: 0,
    pooled_segments_used: 0,
  };
  const maxRows = Number(Deno.args.find((a) => a.startsWith("--max="))?.split("=")[1] || "0") || 0;
  const pageSize = Math.min(
    Math.max(Number(Deno.args.find((a) => a.startsWith("--page-size="))?.split("=")[1] || DEFAULT_PAGE_SIZE), 1),
    200,
  );
  const includeInactive = Deno.args.includes("--include-inactive");
  const mode = (Deno.args.find((a) => a.startsWith("--mode="))?.split("=")[1] || "coverage").toLowerCase();
  const writeConcurrency = Math.min(
    Math.max(Number(Deno.args.find((a) => a.startsWith("--write-concurrency="))?.split("=")[1] || "10"), 1),
    25,
  );
  let batchNo = 0;

  while (true) {
    if (maxRows > 0 && metrics.scanned >= maxRows) break;
    batchNo++;

    const selectClause = table === "knowledge_base"
      ? "id,title,content_text,category,article_number,source_name,version_date,content_hash,is_active,embedding,embedding_legacy_768,embedding_status"
      : table === "legal_practice_kb"
      ? "id,title,content_text,description,court_type,court_name,source_name,decision_date,case_number_anonymized,echr_case_id,practice_category,key_violations,applied_articles,legal_reasoning_summary,outcome,facts_hy,judgment_hy,content_hash,is_active,embedding,embedding_legacy_768,embedding_status"
      : "id,doc_id,chunk_text,chunk_type,label,metadata,is_active,embedding,embedding_legacy_768";

    let query = supabase.from(table).select(selectClause).order("id", { ascending: true }).range(0, pageSize - 1);

    if (!includeInactive) query = query.eq("is_active", true);

    if (table === "legal_chunks") {
      // legal_chunks does not have embedding_status columns; backfill missing vectors only.
      query = query.or("embedding_legacy_768.is.null,embedding.is.null");
    } else if (mode === "failed-only") {
      query = query.eq("embedding_status", "failed");
    } else {
      // coverage: missing vectors OR failed status
      query = query.or("embedding_legacy_768.is.null,embedding.is.null,embedding_status.eq.failed");
    }

    const { data: rows, error } = await withRetry(async () => {
      const res = await query;
      if (res.error) throw new Error(res.error.message);
      return res;
    }, 3, 750);
    if (error) throw new Error(`[${table}] select failed: ${error.message}`);
    if (!rows || rows.length === 0) break;

    // For legal_chunks, batch fetch parent titles (to match embed-worker input)
    const titleByDocId: Record<string, string> = {};
    if (table === "legal_chunks") {
      const docIds = [...new Set(rows.map((r) => r.doc_id as string).filter(Boolean))];
      if (docIds.length > 0) {
        const { data: parents, error: parentErr } = await supabase
          .from("legal_documents")
          .select("id,title")
          .in("id", docIds);
        if (parentErr) throw new Error(`[legal_documents] select failed: ${parentErr.message}`);
        for (const p of parents || []) titleByDocId[p.id as string] = String(p.title || "");
      }
    }

    const limitedRows = (maxRows > 0)
      ? rows.slice(0, Math.max(0, maxRows - metrics.scanned))
      : rows;

    // Build embedding inputs (idempotent, aligned with embed-worker hashing)
    const inputs: Array<{
      id: string;
      text: string;
      hash: string;
      needsPrimary: boolean;
      needsLegacy: boolean;
      skipGeneration: boolean;
      segmentsUsed: number;
      meta?: unknown;
    }> = [];
    for (const row of limitedRows) {
      const id = String(row.id);
      let embeddingText = "";

      if (table === "legal_chunks") {
        const parentTitle = titleByDocId[String((row as Record<string, unknown>).doc_id || "")] || undefined;
        embeddingText = buildChunkEmbeddingText({
          chunk_text: String((row as Record<string, unknown>).chunk_text || ""),
          chunk_type: (row as Record<string, unknown>).chunk_type as string | undefined,
          label: (row as Record<string, unknown>).label as string | undefined,
        }, parentTitle);
      } else {
        embeddingText = buildEmbeddingText(row as EmbeddingDoc);
      }

      const fingerprintText = await buildEmbeddingFingerprintText(embeddingText);
      const hash = await sha256Hex(fingerprintText);
      const segmentsUsed = (fingerprintText.match(/\[\[w:/g) || []).length;

      const storedHashRaw = (table === "legal_chunks")
        ? ((row as Record<string, unknown>).metadata as Record<string, unknown> | null | undefined)?.embedding_text_hash
        : (row as Record<string, unknown>).content_hash;
      const storedHashOrNull = (typeof storedHashRaw === "string" && storedHashRaw.trim().length > 0) ? storedHashRaw : null;

      const embeddingRaw = (row as Record<string, unknown>).embedding;
      const legacyRaw = (row as Record<string, unknown>).embedding_legacy_768;
      const hasPrimary = hasValidStoredVector(embeddingRaw, PRIMARY_EMBEDDING_DIM);
      const hasLegacy = hasValidStoredVector(legacyRaw, LEGACY_EMBEDDING_DIM);
      if (embeddingRaw != null && !hasPrimary) metrics.invalid_dimensions++;
      if (legacyRaw != null && !hasLegacy) metrics.invalid_dimensions++;
      const plan = computeEmbeddingPlan({
        storedHash: storedHashOrNull,
        computedHash: hash,
        hasPrimary,
        hasLegacy,
      });

      inputs.push({
        id,
        text: embeddingText,
        hash,
        needsPrimary: plan.needPrimary,
        needsLegacy: plan.needLegacy,
        skipGeneration: plan.skip,
        segmentsUsed,
        meta: (row as Record<string, unknown>).metadata,
      });
    }

    // Generate embeddings (via embeddings-generate edge fn) only for rows that need them.
    const legacyTexts = inputs.filter((i) => i.needsLegacy).map((i) => i.text);
    const primaryTexts = inputs.filter((i) => i.needsPrimary).map((i) => i.text);

    let legacyVectors: number[][] = [];
    let primaryVectors: number[][] = [];
    try {
      legacyVectors = legacyTexts.length > 0
        ? await withRetry(() => generateEmbeddings(legacyTexts, MODEL, LEGACY_EMBEDDING_DIM), 3, 1000)
        : [];
      primaryVectors = primaryTexts.length > 0
        ? await withRetry(() => generateEmbeddings(primaryTexts, MODEL, PRIMARY_EMBEDDING_DIM), 3, 1000)
        : [];

      for (const v of legacyVectors) assertVectorDim(v, LEGACY_EMBEDDING_DIM, "generated_legacy_768");
      for (const v of primaryVectors) assertVectorDim(v, PRIMARY_EMBEDDING_DIM, "generated_primary_1536");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[backfill] table=${table} batch_failed: ${msg}`);
      metrics.failed += inputs.length;
      if (/token limit exceeded|maximum context/i.test(msg)) metrics.failed_token_limit += inputs.length;
      else metrics.failed_other += inputs.length;
      // Mark all as failed/unembedded
      for (const row of limitedRows) {
        const id = String((row as Record<string, unknown>).id);
        try {
          if (table === "legal_chunks") {
            const mergedMeta = mergeJsonObject((row as Record<string, unknown>).metadata, {
              embedding_status: "failed",
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: msg.substring(0, 500),
            });
            await supabase.from(table).update({ metadata: mergedMeta }).eq("id", id);
          } else {
            await supabase.from(table).update({
              embedding_status: "failed",
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: msg.substring(0, 500),
            }).eq("id", id);
          }
        } catch {
          // best-effort
        }
      }
      if (/invalid dimensions/i.test(msg)) metrics.invalid_dimensions++;
      continue;
    }

    // Build update rows (per-record updates to avoid NOT NULL insert issues with upsert)
    const updates: Array<{ id: string; payload: Record<string, unknown>; rawMeta?: unknown }> = [];
    let legacyIdx = 0;
    let primaryIdx = 0;
    for (let idx = 0; idx < inputs.length; idx++) {
      const inputRow = inputs[idx];
      const updatePayload: Record<string, unknown> = {};

      if (!inputRow.skipGeneration) {
        if (inputRow.needsLegacy) {
          const legacyVec = legacyVectors[legacyIdx++];
          updatePayload.embedding_legacy_768 = vectorToPgString(legacyVec);
        }
        if (inputRow.needsPrimary) {
          const primaryVec = primaryVectors[primaryIdx++];
          updatePayload.embedding = vectorToPgString(primaryVec);
        }

        if (inputRow.needsLegacy || inputRow.needsPrimary) {
          metrics.pooled_segments_used += inputRow.segmentsUsed;
        }
      }

      if (table === "legal_chunks") {
        updatePayload.metadata = mergeJsonObject(inputRow.meta, {
          embedding_status: "success",
          embedding_last_attempt: new Date().toISOString(),
          embedding_error: null,
          embedding_text_hash: inputRow.hash,
        });
      } else {
        updatePayload.embedding_status = "success";
        updatePayload.embedding_last_attempt = new Date().toISOString();
        updatePayload.embedding_error = null;
        updatePayload.content_hash = inputRow.hash;
      }

      updates.push({ id: inputRow.id, payload: updatePayload, rawMeta: inputRow.meta });
    }

    const updateResults = await mapWithConcurrency(updates, writeConcurrency, async (u) => {
      const { error } = await supabase.from(table).update(u.payload).eq("id", u.id);
      if (error) throw new Error(error.message);
      return true;
    });

    for (let i = 0; i < updateResults.length; i++) {
      const r = updateResults[i];
      if (r.status === "fulfilled") {
        if (inputs[i].skipGeneration) metrics.skipped++;
        else metrics.embedded_ok++;
      } else {
        metrics.failed++;
        const id = updates[i].id;
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`[backfill] table=${table} id=${id} update_failed: ${msg}`);
        if (/invalid dimensions/i.test(msg)) metrics.invalid_dimensions++;
        if (/token limit exceeded|maximum context/i.test(msg)) metrics.failed_token_limit++;
        else metrics.failed_other++;

        // Best-effort: mark failed in metadata for chunks or embedding_status for docs
        try {
          if (table === "legal_chunks") {
            const mergedMeta = mergeJsonObject(updates[i].rawMeta, {
              embedding_status: "failed",
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: msg.substring(0, 500),
            });
            await supabase.from(table).update({ metadata: mergedMeta }).eq("id", id);
          } else {
            await supabase.from(table).update({
              embedding_status: "failed",
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: msg.substring(0, 500),
            }).eq("id", id);
          }
        } catch {
          // ignore
        }
      }
    }

    metrics.scanned += updates.length;

    console.log(
      `[backfill] table=${table} batch=${batchNo} page_size=${pageSize} scanned=${metrics.scanned}` +
        ` ok=${metrics.embedded_ok} skipped=${metrics.skipped} failed=${metrics.failed}` +
        ` token_limit=${metrics.failed_token_limit} other_fail=${metrics.failed_other}` +
        ` invalid_dims=${metrics.invalid_dimensions} pooled_segments=${metrics.pooled_segments_used}`,
    );
  }

  return metrics;
}

async function main() {
  const supabaseUrl = getEnvAny(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const tablesArg = (Deno.args.find((a) => a.startsWith("--tables="))?.split("=")[1] || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean) as TableName[];

  const tables: TableName[] = tablesArg.length > 0
    ? tablesArg
    : ["knowledge_base", "legal_practice_kb", "legal_chunks"];

  const supabase = createClient(supabaseUrl, serviceKey);

  const totals: Metrics = {
    scanned: 0,
    embedded_ok: 0,
    skipped: 0,
    failed: 0,
    invalid_dimensions: 0,
    failed_token_limit: 0,
    failed_other: 0,
    pooled_segments_used: 0,
  };

  for (const t of tables) {
    console.log(`[backfill] start table=${t}`);
    const m = await backfillTable(supabase, t);
    console.log(
      `[backfill] done table=${t} scanned=${m.scanned} ok=${m.embedded_ok} skipped=${m.skipped} failed=${m.failed}` +
        ` token_limit=${m.failed_token_limit} other_fail=${m.failed_other}` +
        ` invalid_dims=${m.invalid_dimensions} pooled_segments=${m.pooled_segments_used}`,
    );
    totals.scanned += m.scanned;
    totals.embedded_ok += m.embedded_ok;
    totals.skipped += m.skipped;
    totals.failed += m.failed;
    totals.invalid_dimensions += m.invalid_dimensions;
    totals.failed_token_limit += m.failed_token_limit;
    totals.failed_other += m.failed_other;
    totals.pooled_segments_used += m.pooled_segments_used;
  }

  console.log(
    `[backfill] total scanned=${totals.scanned} ok=${totals.embedded_ok} skipped=${totals.skipped} failed=${totals.failed}` +
      ` token_limit=${totals.failed_token_limit} other_fail=${totals.failed_other}` +
      ` invalid_dims=${totals.invalid_dimensions} pooled_segments=${totals.pooled_segments_used}`,
  );
  if (totals.failed > 0) Deno.exit(2);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("[backfill] fatal:", e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  });
}
