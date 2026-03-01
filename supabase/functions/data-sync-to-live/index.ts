/**
 * data-sync-to-live — Sync knowledge_base and legal_practice_kb from Test → Live.
 *
 * Modes:
 *   - export: Read batch from local DB, POST to Live's import endpoint
 *   - import: Receive batch, dedup & insert into local DB
 *   - export-embeddings: Read records with embeddings, POST to Live for update
 *   - update-embeddings: Receive embedding updates, apply to matching records
 *   - status: Count records
 *
 * Auth: x-internal-key OR service role Bearer OR admin JWT
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request): Promise<boolean> {
  // 1. Internal key (edge-to-edge)
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  if (internalKey && expectedKey && internalKey === expectedKey) return true;

  // 2. Service role key as Bearer
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token && serviceKey && token === serviceKey) return true;

  // 3. Admin JWT
  if (token) {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: userData } = await sb.auth.getUser(token);
    if (userData?.user) {
      // Check admin role
      const { data: roles } = await getServiceClient()
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .limit(1);
      if (roles && roles.length > 0) return true;
    }
  }

  return false;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─── Columns ───────────────────────────────────────────────────────────────
const KB_COLUMNS = [
  "title", "content_text", "category", "article_number", "source_url",
  "source_name", "version_date", "is_active", "content_hash",
  "embedding_status", "embedding", "effective_from", "effective_to",
  "current_version",
];

const PRACTICE_COLUMNS = [
  "title", "content_text", "practice_category", "court_type", "outcome",
  "decision_date", "applied_articles", "source_url", "source_name",
  "is_active", "content_hash", "embedding_status", "embedding",
  "decision_map", "key_paragraphs", "content_chunks", "chunk_index_meta",
  "jurisdiction", "echr_case_id",
];

// ─── Export: read batch, send to Live ──────────────────────────────────────
async function handleExport(
  table: string,
  offset: number,
  batchSize: number,
  liveUrl: string,
) {
  const sb = getServiceClient();
  const columns = table === "knowledge_base" ? KB_COLUMNS : PRACTICE_COLUMNS;
  const internalKey = Deno.env.get("INTERNAL_INGEST_KEY")!;

  const { data, error, count } = await sb
    .from(table)
    .select(columns.join(","), { count: "exact" })
    .range(offset, offset + batchSize - 1)
    .order("created_at", { ascending: true });

  if (error) return json({ error: `Read error: ${error.message}` }, 500);
  if (!data || data.length === 0) {
    return json({ done: true, totalCount: count, offset, synced: 0 });
  }

  // Send to Live
  const importUrl = `${liveUrl}/functions/v1/data-sync-to-live`;
  const res = await fetch(importUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalKey,
    },
    body: JSON.stringify({ mode: "import", table, records: data }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return json({ error: `Live import failed: ${res.status} ${errText.substring(0, 500)}` }, 500);
  }

  const result = await res.json();
  return json({
    done: false,
    offset,
    batchSize: data.length,
    totalCount: count,
    nextOffset: offset + batchSize,
    importResult: result,
  });
}

// ─── Import: dedup & insert ────────────────────────────────────────────────
async function handleImport(table: string, records: Record<string, unknown>[]) {
  const sb = getServiceClient();
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const columns = table === "knowledge_base" ? KB_COLUMNS : PRACTICE_COLUMNS;

  for (const record of records) {
    try {
      const title = record.title as string;

      // Dedup check
      let existing: unknown[] | null = null;
      if (table === "knowledge_base") {
        const { data } = await sb
          .from(table)
          .select("id")
          .eq("title", title)
          .eq("category", record.category as string)
          .limit(1);
        existing = data;
      } else {
        if (record.content_hash) {
          const { data } = await sb
            .from(table)
            .select("id")
            .eq("content_hash", record.content_hash as string)
            .limit(1);
          existing = data;
        } else {
          const { data } = await sb
            .from(table)
            .select("id")
            .eq("title", title)
            .limit(1);
          existing = data;
        }
      }

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Clean & insert
      const clean: Record<string, unknown> = {};
      for (const col of columns) {
        if (record[col] !== undefined && record[col] !== null) {
          clean[col] = record[col];
        }
      }

      const { error: insertError } = await sb.from(table).insert(clean);
      if (insertError) {
        errors.push(`${(title || "").substring(0, 50)}: ${insertError.message}`);
      } else {
        inserted++;
      }
    } catch (e) {
      errors.push(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({ inserted, skipped, errors: errors.slice(0, 20) });
}

// ─── Export Embeddings: read records with embeddings, send for update ──────
async function handleExportEmbeddings(
  table: string,
  offset: number,
  batchSize: number,
  liveUrl: string,
) {
  const sb = getServiceClient();
  const internalKey = Deno.env.get("INTERNAL_INGEST_KEY")!;

  const dedupCol = table === "knowledge_base" ? "category" : "practice_category";

  const { data, error, count } = await sb
    .from(table)
    .select(`title,${dedupCol},content_hash,embedding,embedding_status`, { count: "exact" })
    .not("embedding", "is", null)
    .range(offset, offset + batchSize - 1)
    .order("created_at", { ascending: true });

  if (error) return json({ error: `Read error: ${error.message}` }, 500);
  if (!data || data.length === 0) {
    return json({ done: true, totalCount: count, offset, updated: 0 });
  }

  const importUrl = `${liveUrl}/functions/v1/data-sync-to-live`;
  const res = await fetch(importUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalKey,
    },
    body: JSON.stringify({ mode: "update-embeddings", table, records: data }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return json({ error: `Live update failed: ${res.status} ${errText.substring(0, 500)}` }, 500);
  }

  const result = await res.json();
  return json({
    done: false,
    offset,
    batchSize: data.length,
    totalCount: count,
    nextOffset: offset + batchSize,
    updateResult: result,
  });
}

// ─── Update Embeddings: match by title+category, update embedding ──────────
async function handleUpdateEmbeddings(table: string, records: Record<string, unknown>[]) {
  const sb = getServiceClient();
  let updated = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const record of records) {
    try {
      const title = record.title as string;
      let query;

      if (table === "knowledge_base") {
        query = sb
          .from(table)
          .update({
            embedding: record.embedding,
            embedding_status: record.embedding_status || "done",
          })
          .eq("title", title)
          .eq("category", record.category as string)
          .is("embedding", null);
      } else {
        // Match by content_hash or title
        if (record.content_hash) {
          query = sb
            .from(table)
            .update({
              embedding: record.embedding,
              embedding_status: record.embedding_status || "done",
            })
            .eq("content_hash", record.content_hash as string)
            .is("embedding", null);
        } else {
          query = sb
            .from(table)
            .update({
              embedding: record.embedding,
              embedding_status: record.embedding_status || "done",
            })
            .eq("title", title)
            .is("embedding", null);
        }
      }

      const { error: updateError, count } = await query.select("id", { count: "exact", head: true });

      // Use a simpler approach - just do the update
      const { error: err2 } = await query;
      if (err2) {
        errors.push(`${(title || "").substring(0, 50)}: ${err2.message}`);
      } else {
        updated++;
      }
    } catch (e) {
      errors.push(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({ updated, notFound, errors: errors.slice(0, 20) });
}

// ─── Status ────────────────────────────────────────────────────────────────
async function handleStatus(table: string) {
  const sb = getServiceClient();

  const { count: total } = await sb
    .from(table)
    .select("id", { count: "exact", head: true });

  const { count: withEmbedding } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);

  return json({ table, total, withEmbedding });
}

// ─── Main ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await authenticate(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const { mode, table } = body;

    if (!table || !["knowledge_base", "legal_practice_kb"].includes(table)) {
      return json({ error: "Invalid table" }, 400);
    }

    switch (mode) {
      case "export": {
        const { offset = 0, batchSize = 5, liveUrl } = body;
        if (!liveUrl) return json({ error: "liveUrl required" }, 400);
        return handleExport(table, offset, batchSize, liveUrl);
      }
      case "import":
        if (!body.records?.length) return json({ error: "records required" }, 400);
        return handleImport(table, body.records);
      case "export-embeddings": {
        const { offset = 0, batchSize = 5, liveUrl } = body;
        if (!liveUrl) return json({ error: "liveUrl required" }, 400);
        return handleExportEmbeddings(table, offset, batchSize, liveUrl);
      }
      case "update-embeddings":
        if (!body.records?.length) return json({ error: "records required" }, 400);
        return handleUpdateEmbeddings(table, body.records);
      case "status":
        return handleStatus(table);
      default:
        return json({ error: "Invalid mode" }, 400);
    }
  } catch (e) {
    console.error("[data-sync-to-live] error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
