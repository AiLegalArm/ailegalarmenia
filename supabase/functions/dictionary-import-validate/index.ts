import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors } from "../_shared/edge-security.ts";

/* ── helpers ─────────────────────────────────────── */

function parseJsonlRows(text: string): { rows: Record<string, unknown>[]; errors: { row: number; message: string }[] } {
  const rows: Record<string, unknown>[] = [];
  const errors: { row: number; message: string }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      if (errors.length < 200) errors.push({ row: i + 1, message: "Invalid JSON" });
    }
  }
  return { rows, errors };
}

function parseCsvRows(text: string): { rows: Record<string, unknown>[]; errors: { row: number; message: string }[] } {
  const rows: Record<string, unknown>[] = [];
  const errors: { row: number; message: string }[] = [];
  const lines = text.split("\n");
  if (lines.length < 2) return { rows, errors: [{ row: 1, message: "CSV must have header + data" }] };

  const headerLine = lines[0].trim();
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const lemmaIdx = headers.indexOf("lemma");
  if (lemmaIdx === -1) {
    return { rows, errors: [{ row: 1, message: "Missing 'lemma' column in header" }] };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const values = parseCsvLine(line);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx] ?? "";
      });
      rows.push(obj);
    } catch (e) {
      if (errors.length < 200) errors.push({ row: i + 1, message: `Parse error: ${e}` });
    }
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
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseArrayField(val: unknown): string[] | null {
  if (val === null || val === undefined || val === "") return null;
  if (Array.isArray(val)) return val.map(String);
  const s = String(val).trim();
  if (!s) return null;
  // Try JSON parse
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String);
    } catch { /* fall through */ }
  }
  // Pipe-separated
  if (s.includes("|")) return s.split("|").map((x: string) => x.trim()).filter(Boolean);
  return [s];
}

interface NormalizedRow {
  lemma: string;
  part_of_speech: string | null;
  definition: string | null;
  examples: string[] | null;
  forms: string[] | null;
  source: string | null;
}

function normalizeRow(raw: Record<string, unknown>, defaultSource: string | null): { row: NormalizedRow | null; error: string | null } {
  const lemma = String(raw.lemma || "").trim();
  if (!lemma || lemma.length > 120) {
    return { row: null, error: `Invalid lemma: ${lemma ? "too long" : "empty"}` };
  }
  return {
    row: {
      lemma,
      part_of_speech: raw.part_of_speech ? String(raw.part_of_speech).trim() : null,
      definition: raw.definition ? String(raw.definition).trim() : null,
      examples: parseArrayField(raw.examples),
      forms: parseArrayField(raw.forms),
      source: raw.source ? String(raw.source).trim() : defaultSource,
    },
    error: null,
  };
}

/* ── main ────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify admin
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { file_type, content_base64, source, mode } = body;

    if (!file_type || !["csv", "jsonl"].includes(file_type)) {
      return new Response(JSON.stringify({ error: "file_type must be csv or jsonl" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!content_base64) {
      return new Response(JSON.stringify({ error: "content_base64 required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Decode
    const bytes = Uint8Array.from(atob(content_base64), (c) => c.charCodeAt(0));
    const text = new TextDecoder("utf-8").decode(bytes);

    // Parse
    const { rows: rawRows, errors: parseErrors } =
      file_type === "jsonl" ? parseJsonlRows(text) : parseCsvRows(text);

    // Normalize
    const preview: NormalizedRow[] = [];
    const warnings: string[] = [];
    const validationErrors = [...parseErrors];

    for (let i = 0; i < rawRows.length; i++) {
      const { row, error } = normalizeRow(rawRows[i], source || null);
      if (error) {
        if (validationErrors.length < 200) validationErrors.push({ row: i + 1, message: error });
        continue;
      }
      if (row && preview.length < 20) {
        preview.push(row);
      }
    }

    const validCount = rawRows.length - validationErrors.length + parseErrors.length;
    if (rawRows.length === 0) warnings.push("File contains no data rows");
    if (mode === "insert") warnings.push("INSERT mode: duplicates will fail");

    return new Response(JSON.stringify({
      ok: true,
      file_type,
      detected_rows: rawRows.length,
      valid_rows: validCount,
      preview,
      warnings,
      errors: validationErrors,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("validate error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
