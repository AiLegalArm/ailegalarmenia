import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

type KBCategory = 
  | "constitution" | "civil_code" | "criminal_code" | "labor_code" 
  | "family_code" | "administrative_code" | "tax_code" | "court_practice" 
  | "legal_commentary" | "other" | "criminal_procedure_code" 
  | "civil_procedure_code" | "administrative_procedure_code" 
  | "administrative_violations_code" | "land_code" | "forest_code" 
  | "water_code" | "urban_planning_code" | "electoral_code" 
  | "state_duty_law" | "citizenship_law" | "public_service_law" 
  | "human_rights_law" | "anti_corruption_body_law" | "corruption_prevention_law" 
  | "mass_media_law" | "education_law" | "healthcare_law" | "echr" 
  | "eaeu_customs_code" | "judicial_code" | "subsoil_code" | "penal_enforcement_code"
  | "cassation_criminal" | "cassation_civil" | "cassation_administrative"
  | "constitutional_court_decisions" | "echr_judgments" | "government_decisions"
  | "central_electoral_commission_decisions" | "prime_minister_decisions";

interface JsonKBItem {
  title: string;
  content_text: string;
  article_number?: string;
  source_name?: string;
  source_url?: string;
  version_date?: string;
}

interface KBImportRequest {
  jsonItems?: JsonKBItem[];
  category: KBCategory;
  clearExisting?: boolean;
  // Legacy TXT support
  textContent?: string;
  codeName?: string;
}

function parseCodeText(text: string, codeName: string, category: string) {
  const articles: Array<{
    title: string; content_text: string; article_number: string;
    category: string; source_name: string;
  }> = [];

  text = text.normalize('NFC');
  const articlePattern = /(?:\u2696\uFE0F?)?\s*(?:\u0540\u0578\u0564\u057E\u0561\u056E)\s*(\d+(?:\.\d+)?)\.\s*([^\n]+)/gi;
  let match;
  const matches: Array<{ index: number; number: string; title: string }> = [];
  while ((match = articlePattern.exec(text)) !== null) {
    matches.push({ index: match.index, number: match[1], title: match[2].trim() });
  }
  if (matches.length === 0) {
    const altPattern = /^(\d+(?:\.\d+)?)\.\s+([^\n]+)/gm;
    while ((match = altPattern.exec(text)) !== null) {
      matches.push({ index: match.index, number: match[1], title: match[2].trim() });
    }
  }
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    let content = text.substring(currentMatch.index, nextMatch ? nextMatch.index : text.length).trim()
      .replace(/\n{3,}/g, '\n\n').trim();
    if (content.length > 50) {
      articles.push({
        title: `${codeName} - \u0540\u0578\u0564\u057E\u0561\u056E ${currentMatch.number}. ${currentMatch.title}`,
        content_text: content, article_number: currentMatch.number,
        category, source_name: codeName,
      });
    }
  }
  return articles;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // Auth guard
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as KBImportRequest;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clear existing if requested
    if (body.clearExisting) {
      await supabase.from("knowledge_base").update({ is_active: false }).eq("is_active", true);
    }

    let rows: Array<Record<string, unknown>> = [];

    if (body.jsonItems && Array.isArray(body.jsonItems)) {
      // JSON mode
      for (const item of body.jsonItems) {
        if (!item.title || !item.content_text) continue;
        rows.push({
          title: String(item.title).normalize('NFC'),
          content_text: String(item.content_text).normalize('NFC').replace(/\u0000/g, ''),
          article_number: item.article_number || null,
          category: body.category,
          source_name: item.source_name || null,
          source_url: item.source_url || null,
          is_active: true,
          version_date: item.version_date || new Date().toISOString().split('T')[0],
        });
      }
    } else if (body.textContent && body.codeName) {
      // Legacy TXT mode
      const normalized = body.textContent.normalize('NFC').replace(/\u0000/g, '');
      const articles = parseCodeText(normalized, body.codeName, body.category);
      rows = articles.map(a => ({
        ...a, is_active: true,
        version_date: new Date().toISOString().split('T')[0],
      }));
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid entries found in the provided data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert in batches
    const batchSize = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from("knowledge_base").insert(batch);
      if (error) { console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "kb-import", msg: "Insert error" })); throw error; }
      inserted += batch.length;
    }

    return new Response(JSON.stringify({
      success: true, imported: inserted, category: body.category,
      sampleTitles: rows.slice(0, 3).map(r => r.title),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "kb-import", msg: error instanceof Error ? error.message : "Import failed" }));
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Import failed",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
