/**
 * data-sync-to-live — Sync knowledge_base and legal_practice_kb from Test → Live.
 *
 * Directly connects to Live DB using LIVE_SUPABASE_URL + LIVE_SUPABASE_SERVICE_KEY.
 * No need for the function to exist in Live environment.
 *
 * Modes:
 *   - export: Read batch from Test DB, insert directly into Live DB
 *   - export-embeddings: Read embeddings from Test, update in Live DB
 *   - status: Count records in Test
 *
 * Auth: service role Bearer OR admin JWT
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
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  if (internalKey && expectedKey && internalKey === expectedKey) return true;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token && serviceKey && token === serviceKey) return true;

  if (token) {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: userData } = await sb.auth.getUser(token);
    if (userData?.user) {
      const { data: roles } = await getTestClient()
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

function getTestClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getLiveClient() {
  const liveUrl = Deno.env.get("LIVE_SUPABASE_URL");
  const liveKey = Deno.env.get("LIVE_SUPABASE_SERVICE_KEY");
  if (!liveUrl || !liveKey) {
    throw new Error("LIVE_SUPABASE_URL and LIVE_SUPABASE_SERVICE_KEY must be set");
  }
  return createClient(liveUrl, liveKey);
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

// ─── Export: read from Test, insert directly into Live ────────────────────
async function handleExport(table: string, offset: number, batchSize: number) {
  const testDb = getTestClient();
  const liveDb = getLiveClient();
  const columns = table === "knowledge_base" ? KB_COLUMNS : PRACTICE_COLUMNS;

  const { data, error, count } = await testDb
    .from(table)
    .select(columns.join(","), { count: "exact" })
    .range(offset, offset + batchSize - 1)
    .order("created_at", { ascending: true });

  if (error) return json({ error: `Read error: ${error.message}` }, 500);
  if (!data || data.length === 0) {
    return json({ done: true, totalCount: count, offset, synced: 0 });
  }

  // Dedup & insert into Live
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const record of data) {
    try {
      const title = record.title as string;

      // Dedup check in Live
      let existing: unknown[] | null = null;
      if (table === "knowledge_base") {
        const { data: ex } = await liveDb
          .from(table).select("id")
          .eq("title", title)
          .eq("category", record.category as string)
          .limit(1);
        existing = ex;
      } else {
        if (record.content_hash) {
          const { data: ex } = await liveDb
            .from(table).select("id")
            .eq("content_hash", record.content_hash as string)
            .limit(1);
          existing = ex;
        } else {
          const { data: ex } = await liveDb
            .from(table).select("id")
            .eq("title", title)
            .limit(1);
          existing = ex;
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

      const { error: insertError } = await liveDb.from(table).insert(clean);
      if (insertError) {
        errors.push(`${(title || "").substring(0, 50)}: ${insertError.message}`);
      } else {
        inserted++;
      }
    } catch (e) {
      errors.push(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({
    done: false,
    offset,
    batchSize: data.length,
    totalCount: count,
    nextOffset: offset + batchSize,
    importResult: { inserted, skipped, errors: errors.slice(0, 20) },
  });
}

// ─── Export Embeddings: read from Test, update in Live ─────────────────────
async function handleExportEmbeddings(table: string, offset: number, batchSize: number) {
  const testDb = getTestClient();
  const liveDb = getLiveClient();
  const dedupCol = table === "knowledge_base" ? "category" : "practice_category";

  const { data, error, count } = await testDb
    .from(table)
    .select(`title,${dedupCol},content_hash,embedding,embedding_status`, { count: "exact" })
    .not("embedding", "is", null)
    .range(offset, offset + batchSize - 1)
    .order("created_at", { ascending: true });

  if (error) return json({ error: `Read error: ${error.message}` }, 500);
  if (!data || data.length === 0) {
    return json({ done: true, totalCount: count, offset, updated: 0 });
  }

  let updated = 0;
  const errors: string[] = [];

  for (const record of data) {
    try {
      const title = record.title as string;
      const updatePayload = {
        embedding: record.embedding,
        embedding_status: record.embedding_status || "done",
      };

      let result;
      if (table === "knowledge_base") {
        result = await liveDb
          .from(table)
          .update(updatePayload)
          .eq("title", title)
          .eq("category", record.category as string)
          .is("embedding", null);
      } else if (record.content_hash) {
        result = await liveDb
          .from(table)
          .update(updatePayload)
          .eq("content_hash", record.content_hash as string)
          .is("embedding", null);
      } else {
        result = await liveDb
          .from(table)
          .update(updatePayload)
          .eq("title", title)
          .is("embedding", null);
      }

      if (result.error) {
        errors.push(`${(title || "").substring(0, 50)}: ${result.error.message}`);
      } else {
        updated++;
      }
    } catch (e) {
      errors.push(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({
    done: false,
    offset,
    batchSize: data.length,
    totalCount: count,
    nextOffset: offset + batchSize,
    updateResult: { updated, errors: errors.slice(0, 20) },
  });
}

// ─── Status ────────────────────────────────────────────────────────────────
async function handleStatus(table: string) {
  const testDb = getTestClient();

  const { count: total } = await testDb
    .from(table)
    .select("id", { count: "exact", head: true });

  const { count: withEmbedding } = await testDb
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
        const { offset = 0, batchSize = 5 } = body;
        return handleExport(table, offset, batchSize);
      }
      case "export-embeddings": {
        const { offset = 0, batchSize = 3 } = body;
        return handleExportEmbeddings(table, offset, batchSize);
      }
      case "status":
        return handleStatus(table);
      default:
        return json({ error: "Invalid mode. Use: export, export-embeddings, status" }, 400);
    }
  } catch (e) {
    console.error("[data-sync-to-live] error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
