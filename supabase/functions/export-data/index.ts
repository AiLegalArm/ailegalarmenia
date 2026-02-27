import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Tables to export with their export config */
const EXPORT_TABLES: {
  name: string;
  label: string;
  excludeCols?: string[];
  where?: string;
}[] = [
  { name: "knowledge_base", label: "Knowledge Base", excludeCols: ["embedding", "embedding_legacy_768", "tsv"] },
  { name: "legal_practice_kb", label: "Legal Practice KB", excludeCols: ["embedding", "embedding_legacy_768"] },
  { name: "legal_documents", label: "Legal Documents" },
  { name: "legal_chunks", label: "Legal Chunks", excludeCols: ["embedding", "embedding_legacy_768"] },
  { name: "knowledge_base_chunks", label: "KB Chunks" },
  { name: "document_templates", label: "Document Templates" },
  { name: "ai_prompts", label: "AI Prompts" },
  { name: "ai_prompt_versions", label: "AI Prompt Versions" },
  { name: "armenian_dictionary", label: "Armenian Dictionary" },
  { name: "app_settings", label: "App Settings" },
];

function escapeSQL(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body for optional table selection
    let selectedTables: string[] | null = null;
    let format: "sql" | "json" = "sql";
    try {
      const body = await req.json();
      if (body.tables && Array.isArray(body.tables)) {
        selectedTables = body.tables;
      }
      if (body.format === "json") format = "json";
    } catch { /* no body = export all */ }

    const tablesToExport = selectedTables
      ? EXPORT_TABLES.filter((t) => selectedTables!.includes(t.name))
      : EXPORT_TABLES;

    const results: Record<string, { count: number; sql?: string; data?: unknown[] }> = {};
    const sqlParts: string[] = [
      "-- =============================================",
      "-- AI Legal Armenia — Full Data Export",
      `-- Generated: ${new Date().toISOString()}`,
      "-- Run in Cloud View > Run SQL (select Live environment)",
      "-- =============================================",
      "",
    ];

    for (const table of tablesToExport) {
      const { data, error } = await adminClient.from(table.name).select("*");

      if (error) {
        console.error(`Error exporting ${table.name}:`, error.message);
        results[table.name] = { count: 0 };
        continue;
      }

      if (!data || data.length === 0) {
        results[table.name] = { count: 0 };
        continue;
      }

      const exclude = new Set(table.excludeCols || []);

      if (format === "json") {
        results[table.name] = { count: data.length, data };
        continue;
      }

      // Generate SQL
      sqlParts.push(`-- ─── ${table.label} (${table.name}) — ${data.length} records ───`);
      sqlParts.push("");

      for (const row of data) {
        const columns = Object.keys(row).filter(
          (k) => !exclude.has(k)
        );
        const values = columns.map((col) => escapeSQL(row[col]));

        sqlParts.push(
          `INSERT INTO public.${table.name} (${columns.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING;`
        );
      }

      sqlParts.push("");
      results[table.name] = { count: data.length };
    }

    const totalRecords = Object.values(results).reduce((s, r) => s + r.count, 0);

    if (format === "json") {
      return new Response(
        JSON.stringify({ total: totalRecords, tables: results }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        total: totalRecords,
        tables: Object.fromEntries(
          Object.entries(results).map(([k, v]) => [k, v.count])
        ),
        sql: sqlParts.join("\n"),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Export error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
