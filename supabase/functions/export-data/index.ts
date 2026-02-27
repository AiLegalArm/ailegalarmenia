import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXPORT_TABLES: {
  name: string;
  label: string;
  excludeCols?: string[];
}[] = [
  { name: "knowledge_base", label: "Knowledge Base", excludeCols: ["embedding", "embedding_legacy_768", "tsv"] },
  { name: "legal_practice_kb", label: "Legal Practice KB", excludeCols: ["embedding", "embedding_legacy_768", "tsv"] },
  { name: "legal_documents", label: "Legal Documents" },
  { name: "legal_chunks", label: "Legal Chunks", excludeCols: ["embedding", "embedding_legacy_768"] },
  { name: "knowledge_base_chunks", label: "KB Chunks" },
  { name: "document_templates", label: "Document Templates" },
  { name: "ai_prompts", label: "AI Prompts" },
  { name: "ai_prompt_versions", label: "AI Prompt Versions" },
  { name: "armenian_dictionary", label: "Armenian Dictionary" },
  { name: "app_settings", label: "App Settings" },
];

const PAGE_SIZE = 500;

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

    let selectedTables: string[] | null = null;
    try {
      const body = await req.json();
      if (body.tables && Array.isArray(body.tables)) {
        selectedTables = body.tables;
      }
    } catch { /* no body = export all */ }

    const tablesToExport = selectedTables
      ? EXPORT_TABLES.filter((t) => selectedTables!.includes(t.name))
      : EXPORT_TABLES;

    // Stream response to avoid memory buildup
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const header = [
            "-- =============================================",
            "-- AI Legal Armenia — Paginated Data Export",
            `-- Generated: ${new Date().toISOString()}`,
            "-- =============================================",
            "",
          ].join("\n");
          controller.enqueue(encoder.encode(header));

          for (const table of tablesToExport) {
            const exclude = new Set(table.excludeCols || []);
            let offset = 0;
            let totalRows = 0;

            controller.enqueue(
              encoder.encode(`\n-- ─── ${table.label} (${table.name}) ───\n`)
            );

            while (true) {
              const { data, error } = await adminClient
                .from(table.name)
                .select("*")
                .range(offset, offset + PAGE_SIZE - 1);

              if (error) {
                controller.enqueue(
                  encoder.encode(`-- ERROR exporting ${table.name}: ${error.message}\n`)
                );
                break;
              }

              if (!data || data.length === 0) break;

              const lines: string[] = [];
              for (const row of data) {
                const columns = Object.keys(row).filter((k) => !exclude.has(k));
                const values = columns.map((col) => escapeSQL(row[col]));
                lines.push(
                  `INSERT INTO public.${table.name} (${columns.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING;`
                );
              }
              controller.enqueue(encoder.encode(lines.join("\n") + "\n"));

              totalRows += data.length;
              if (data.length < PAGE_SIZE) break;
              offset += PAGE_SIZE;
            }

            controller.enqueue(
              encoder.encode(`-- ${table.name}: ${totalRows} records exported\n`)
            );
          }

          controller.enqueue(encoder.encode("\n-- Export complete\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(`-- FATAL: ${err instanceof Error ? err.message : "Unknown"}\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-${new Date().toISOString().slice(0,10)}.sql"`,
      },
    });
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
