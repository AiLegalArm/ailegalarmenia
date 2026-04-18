import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors } from "../_shared/edge-security.ts";

/* ── helpers (same as validate) ─────────────────── */

function parseJsonlRows(text: string): { rows: Record<string, unknown>[]; errors: { row: number; lemma?: string; message: string }[] } {
  const rows: Record<string, unknown>[] = [];
  const errors: { row: number; lemma?: string; message: string }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try { rows.push(JSON.parse(line)); }
    catch { if (errors.length < 500) errors.push({ row: i + 1, message: "Invalid JSON" }); }
  }
  return { rows, errors };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { result.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvRows(text: string): { rows: Record<string, unknown>[]; errors: { row: number; lemma?: string; message: string }[] } {
  const rows: Record<string, unknown>[] = [];
  const errors: { row: number; lemma?: string; message: string }[] = [];
  const lines = text.split("\n");
  if (lines.length < 2) return { rows, errors: [{ row: 1, message: "CSV must have header + data" }] };
  const headers = lines[0].trim().split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  if (!headers.includes("lemma")) return { rows, errors: [{ row: 1, message: "Missing 'lemma' column" }] };
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const values = parseCsvLine(line);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
      rows.push(obj);
    } catch (e) { if (errors.length < 500) errors.push({ row: i + 1, message: `Parse error: ${e}` }); }
  }
  return { rows, errors };
}

function parseArrayField(val: unknown): string[] | null {
  if (val === null || val === undefined || val === "") return null;
  if (Array.isArray(val)) return val.map(String);
  const s = String(val).trim();
  if (!s) return null;
  if (s.startsWith("[")) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch { /* */ } }
  if (s.includes("|")) return s.split("|").map((x: string) => x.trim()).filter(Boolean);
  return [s];
}

interface DictRow {
  lemma: string;
  lemma_norm: string;
  part_of_speech: string | null;
  definition: string | null;
  examples: string[] | null;
  forms: string[] | null;
  source: string | null;
}

// Simple Armenian normalization (mirrors DB normalize_hy)
function normalizeHy(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/[.,;:!?\u00ab\u00bb\u201c\u201d\u2018\u2019"'()\[\]{}\u2014\u2013\u2015\u2012\u2010\-\u2026]+/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/* ── main ────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify admin
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getUser(token);
    if (claimsErr || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.user.id as string;

    const { data: roleData } = await userClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { file_type, content_base64, source, mode = "upsert", batch_size = 300 } = body;

    if (!file_type || !["csv", "jsonl"].includes(file_type)) {
      return new Response(JSON.stringify({ error: "file_type must be csv or jsonl" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!content_base64) {
      return new Response(JSON.stringify({ error: "content_base64 required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const bytes = Uint8Array.from(atob(content_base64), (c) => c.charCodeAt(0));
    const text = new TextDecoder("utf-8").decode(bytes);

    const { rows: rawRows, errors: parseErrors } = file_type === "jsonl" ? parseJsonlRows(text) : parseCsvRows(text);

    // Normalize all rows
    const validRows: { idx: number; row: DictRow }[] = [];
    const allErrors = [...parseErrors];

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const lemma = String(raw.lemma || "").trim();
      if (!lemma || lemma.length > 120) {
        if (allErrors.length < 500) allErrors.push({ row: i + 1, lemma: lemma || undefined, message: lemma ? "Lemma too long" : "Empty lemma" });
        continue;
      }
      validRows.push({
        idx: i + 1,
        row: {
          lemma,
          lemma_norm: normalizeHy(lemma),
          part_of_speech: raw.part_of_speech ? String(raw.part_of_speech).trim() : null,
          definition: raw.definition ? String(raw.definition).trim() : null,
          examples: parseArrayField(raw.examples),
          forms: parseArrayField(raw.forms),
          source: raw.source ? String(raw.source).trim() : (source || null),
        },
      });
    }

    // Create import job
    const { data: job } = await serviceClient.from("dictionary_import_jobs").insert({
      created_by: userId,
      status: "running",
      source: source || null,
      mode,
      file_type,
      total_rows: rawRows.length,
    }).select("id").single();

    const jobId = job?.id;

    // Process in batches
    const safeBatch = Math.min(Math.max(50, Number(batch_size) || 300), 500);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let processed = 0;

    for (let bStart = 0; bStart < validRows.length; bStart += safeBatch) {
      const batch = validRows.slice(bStart, bStart + safeBatch);
      const records = batch.map((b) => b.row);

      if (mode === "upsert") {
        const { data, error } = await serviceClient
          .from("armenian_dictionary")
          .upsert(records, { onConflict: "lemma_norm", ignoreDuplicates: false })
          .select("id");

        if (error) {
          // Try one by one
          for (const entry of batch) {
            const { error: singleErr } = await serviceClient
              .from("armenian_dictionary")
              .upsert([entry.row], { onConflict: "lemma_norm", ignoreDuplicates: false });

            if (singleErr) {
              failed++;
              if (allErrors.length < 500) allErrors.push({ row: entry.idx, lemma: entry.row.lemma, message: singleErr.message });
            } else {
              // Can't distinguish insert vs update in single upsert
              inserted++;
            }
            processed++;
          }
        } else {
          inserted += data?.length ?? batch.length;
          processed += batch.length;
        }
      } else {
        // INSERT mode
        const { data, error } = await serviceClient
          .from("armenian_dictionary")
          .insert(records)
          .select("id");

        if (error) {
          // Try one by one for insert
          for (const entry of batch) {
            const { error: singleErr } = await serviceClient
              .from("armenian_dictionary")
              .insert([entry.row]);

            if (singleErr) {
              if (singleErr.message.includes("duplicate") || singleErr.code === "23505") {
                skipped++;
              } else {
                failed++;
              }
              if (allErrors.length < 500) allErrors.push({ row: entry.idx, lemma: entry.row.lemma, message: singleErr.message });
            } else {
              inserted++;
            }
            processed++;
          }
        } else {
          inserted += data?.length ?? batch.length;
          processed += batch.length;
        }
      }

      // Update job progress
      if (jobId) {
        await serviceClient.from("dictionary_import_jobs").update({
          processed,
          inserted,
          updated,
          skipped,
          failed,
        }).eq("id", jobId);
      }
    }

    // Finalize job
    if (jobId) {
      await serviceClient.from("dictionary_import_jobs").update({
        status: failed > 0 && inserted === 0 ? "failed" : "done",
        processed: processed + parseErrors.length,
        inserted,
        updated,
        skipped,
        failed: failed + parseErrors.length,
        error_report: allErrors.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }

    return new Response(JSON.stringify({
      ok: true,
      job_id: jobId,
      processed: processed + parseErrors.length,
      inserted,
      updated,
      skipped,
      failed: failed + parseErrors.length,
      errors: allErrors.slice(0, 200),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("import-run error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
