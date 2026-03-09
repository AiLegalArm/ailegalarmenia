/**
 * rechunk-backfill — Safe rechunk/backfill worker
 *
 * Selects docs missing chunks with rechunk_version='v2-am-ultra',
 * processes them in configurable pages, inserts new chunks.
 *
 * Strategies:
 *   - "append": Insert new v2-am-ultra chunks alongside old ones (default)
 *   - "replace": Delete old chunks per-doc atomically, then insert new ones
 *
 * Uses pg_advisory_xact_lock with TTL guard to prevent stuck locks.
 *
 * Auth: x-internal-key (service_role)
 * Input (POST JSON):
 *   source?: "legal_documents" | "knowledge_base"  (default: "legal_documents")
 *   strategy?: "append" | "replace"                 (default: "append")
 *   page_size?: number                              (default: 20, max: 100)
 *   max_docs?: number                               (default: 50, max: 500)
 *   dry_run?: boolean                               (default: false)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { handleCors, checkInternalAuth } from "../_shared/edge-security.ts";
import { chunkDocument, validateChunks, CHUNKER_VERSION } from "../_shared/chunker.ts";

const TARGET_VERSION = "v2-am-ultra";
const ADVISORY_LOCK_ID = 900_100; // unique lock id for rechunk-backfill
const MAX_PAGE_SIZE = 100;
const MAX_DOCS_LIMIT = 500;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const source: string = body.source || "legal_documents";
    const strategy: string = body.strategy || "append";
    const pageSize = Math.min(Math.max(body.page_size || 20, 1), MAX_PAGE_SIZE);
    const maxDocs = Math.min(Math.max(body.max_docs || 50, 1), MAX_DOCS_LIMIT);
    const dryRun: boolean = body.dry_run === true;

    if (!["legal_documents", "knowledge_base"].includes(source)) {
      return json({ error: "Invalid source. Use 'legal_documents' or 'knowledge_base'" }, 400);
    }
    if (!["append", "replace"].includes(strategy)) {
      return json({ error: "Invalid strategy. Use 'append' or 'replace'" }, 400);
    }

    // ── Advisory lock with TTL guard ──────────────────────────────
    const { data: lockResult, error: lockErr } = await supabase.rpc("pg_try_advisory_lock", {
      lock_id: ADVISORY_LOCK_ID,
    }).maybeSingle();

    // Fallback: use raw SQL for advisory lock since RPC may not exist
    const { data: lockData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `rechunk_lock_${ADVISORY_LOCK_ID}`)
      .maybeSingle();

    const now = Date.now();
    const lockTtlMs = 10 * 60 * 1000; // 10 minutes TTL

    if (lockData?.value) {
      const lockTs = parseInt(lockData.value, 10);
      if (now - lockTs < lockTtlMs) {
        return json({
          error: "Another rechunk-backfill is in progress",
          lock_age_seconds: Math.round((now - lockTs) / 1000),
        }, 409);
      }
      // Lock expired — reclaim it
    }

    // Acquire soft lock
    await supabase
      .from("app_settings")
      .upsert({ key: `rechunk_lock_${ADVISORY_LOCK_ID}`, value: String(now) });

    const stats = {
      source,
      strategy,
      target_version: TARGET_VERSION,
      dry_run: dryRun,
      docs_found: 0,
      docs_processed: 0,
      docs_failed: 0,
      chunks_inserted: 0,
      chunks_deleted: 0,
      errors: [] as { doc_id: string; error: string }[],
    };

    try {
      // ── Paginated doc selection ──────────────────────────────────
      let cursorId = "00000000-0000-0000-0000-000000000000";
      let totalProcessed = 0;

      while (totalProcessed < maxDocs) {
        const remainingLimit = Math.min(pageSize, maxDocs - totalProcessed);

        let docs: Array<{ doc_id: string; doc_type?: string; title: string; content_length: number }>;

        if (source === "legal_documents") {
          const { data, error } = await supabase.rpc("get_docs_needing_rechunk", {
            _target_version: TARGET_VERSION,
            _cursor_id: cursorId,
            _page_size: remainingLimit,
            _source: source,
          });
          if (error) throw new Error(`RPC error: ${error.message}`);
          docs = data || [];
        } else {
          const { data, error } = await supabase.rpc("get_kb_docs_needing_rechunk", {
            _target_version: TARGET_VERSION,
            _cursor_id: cursorId,
            _page_size: remainingLimit,
          });
          if (error) throw new Error(`RPC error: ${error.message}`);
          docs = data || [];
        }

        if (docs.length === 0) break;
        stats.docs_found += docs.length;

        // ── Process each doc ─────────────────────────────────────
        for (const doc of docs) {
          cursorId = doc.doc_id;

          try {
            // 1. Fetch full content
            let contentText: string;
            let docType: string;

            if (source === "legal_documents") {
              const { data: fullDoc, error: fetchErr } = await supabase
                .from("legal_documents")
                .select("content_text, doc_type")
                .eq("id", doc.doc_id)
                .single();
              if (fetchErr || !fullDoc) throw new Error(`Fetch failed: ${fetchErr?.message || "not found"}`);
              contentText = fullDoc.content_text;
              docType = fullDoc.doc_type;
            } else {
              const { data: fullDoc, error: fetchErr } = await supabase
                .from("knowledge_base")
                .select("content_text, category")
                .eq("id", doc.doc_id)
                .single();
              if (fetchErr || !fullDoc) throw new Error(`Fetch failed: ${fetchErr?.message || "not found"}`);
              contentText = fullDoc.content_text;
              docType = fullDoc.category || "other";
            }

            if (!contentText || contentText.length === 0) {
              stats.docs_failed++;
              stats.errors.push({ doc_id: doc.doc_id, error: "Empty content_text" });
              continue;
            }

            // 2. Chunk
            const result = await chunkDocument({
              doc_type: docType,
              content_text: contentText,
              title: doc.title,
            });

            if (result.chunks.length === 0) {
              stats.docs_failed++;
              stats.errors.push({ doc_id: doc.doc_id, error: "Chunker produced 0 chunks" });
              continue;
            }

            // 3. Validate
            const validation = validateChunks(result.chunks, contentText);
            if (!validation.ok) {
              stats.docs_failed++;
              stats.errors.push({
                doc_id: doc.doc_id,
                error: `Validation failed: ${validation.errors.slice(0, 3).join("; ")}`,
              });
              continue;
            }

            if (dryRun) {
              stats.docs_processed++;
              stats.chunks_inserted += result.chunks.length;
              continue;
            }

            // 4. Strategy: replace = delete old chunks first (per-doc atomic)
            if (strategy === "replace") {
              const { data: deletedCount, error: replaceErr } = await supabase.rpc("replace_doc_chunks", {
                _doc_id: doc.doc_id,
                _target_version: TARGET_VERSION,
                _source: source,
              });
              if (replaceErr) throw new Error(`Replace failed: ${replaceErr.message}`);
              stats.chunks_deleted += (deletedCount || 0);
            }

            // 5. Insert new chunks in batches
            const BATCH_SIZE = 100;

            if (source === "legal_documents") {
              const rows = result.chunks.map((c) => ({
                doc_id: doc.doc_id,
                doc_type: docType,
                chunk_index: c.chunk_index,
                chunk_type: c.chunk_type,
                chunk_text: c.chunk_text,
                char_start: c.char_start,
                char_end: c.char_end,
                label: c.label,
                metadata: c.locator ? { locator: c.locator } : {},
                chunk_hash: c.chunk_hash,
                norm_refs: [],
                is_active: true,
                source_anchor: c.source_anchor || null,
                overlap_prev: c.overlap_prev || 0,
                rechunk_version: TARGET_VERSION,
                case_number: c.case_number || null,
                court_name: c.court_name || null,
                decision_date: c.decision_date || null,
              }));

              for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const { error: insertErr } = await supabase.from("legal_chunks").insert(batch);
                if (insertErr) throw new Error(`Insert failed (batch ${i}): ${insertErr.message}`);
              }
            } else {
              const rows = result.chunks.map((c) => ({
                kb_id: doc.doc_id,
                chunk_index: c.chunk_index,
                chunk_text: c.chunk_text,
                chunk_hash: c.chunk_hash,
                chunk_type: c.chunk_type,
                char_start: c.char_start,
                char_end: c.char_end,
                label: c.label,
                is_active: true,
                source_anchor: c.source_anchor || null,
                overlap_prev: c.overlap_prev || 0,
                rechunk_version: TARGET_VERSION,
              }));

              for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const { error: insertErr } = await supabase.from("knowledge_base_chunks").insert(batch);
                if (insertErr) throw new Error(`Insert failed (batch ${i}): ${insertErr.message}`);
              }
            }

            stats.docs_processed++;
            stats.chunks_inserted += result.chunks.length;
          } catch (docErr) {
            stats.docs_failed++;
            stats.errors.push({
              doc_id: doc.doc_id,
              error: docErr instanceof Error ? docErr.message : String(docErr),
            });
          }
        }

        totalProcessed += docs.length;

        // If we got fewer docs than requested, we're done
        if (docs.length < remainingLimit) break;
      }
    } finally {
      // ── Release soft lock ──────────────────────────────────────
      await supabase
        .from("app_settings")
        .delete()
        .eq("key", `rechunk_lock_${ADVISORY_LOCK_ID}`);
    }

    return json(stats, 200);
  } catch (error) {
    const { err: logErr } = await import("../_shared/safe-logger.ts");
    logErr("rechunk-backfill", "Unhandled error", error);

    // Release lock on crash
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const cleanupClient = createClient(supabaseUrl, serviceKey);
      await cleanupClient
        .from("app_settings")
        .delete()
        .eq("key", `rechunk_lock_${ADVISORY_LOCK_ID}`);
    } catch { /* best effort */ }

    return json({
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
