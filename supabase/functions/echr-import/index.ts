/**
 * echr-import — ECHR cases import (no translation).
 *
 * Accepts: JSON array or JSONL (one object per line).
 * Extracts metadata, text content, and inserts into legal_practice_kb.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

import { handleCors } from "../_shared/edge-security.ts";

// ── Recursively extract text from HUDOC nested content ───────────
function extractElementsText(
  elements: Array<{ content?: string; elements?: unknown[] }>,
  parts: string[]
): void {
  for (const el of elements) {
    if (typeof el.content === "string" && el.content.trim()) {
      parts.push(el.content.trim());
    }
    if (Array.isArray(el.elements) && el.elements.length > 0) {
      extractElementsText(
        el.elements as Array<{ content?: string; elements?: unknown[] }>,
        parts
      );
    }
  }
}

function extractCaseText(caseObj: Record<string, unknown>): string {
  const standard = [caseObj.text, caseObj.content_text, caseObj.judgment, caseObj.summary, caseObj.facts]
    .filter((v) => typeof v === "string" && (v as string).trim().length > 0)
    .join("\n\n");
  if (standard.trim()) return standard;

  const hudocContent = caseObj.content;
  if (hudocContent && typeof hudocContent === "object" && !Array.isArray(hudocContent)) {
    const parts: string[] = [];
    for (const docSections of Object.values(hudocContent as Record<string, unknown>)) {
      if (Array.isArray(docSections)) {
        extractElementsText(
          docSections as Array<{ content?: string; elements?: unknown[] }>,
          parts
        );
      }
    }
    if (parts.length > 0) return parts.join("\n\n");
  }

  if (typeof caseObj.__conclusion === "string" && caseObj.__conclusion.trim()) {
    return caseObj.__conclusion;
  }

  return "";
}

function extractViolations(caseObj: Record<string, unknown>): string[] {
  const violations: string[] = [];
  if (Array.isArray(caseObj.conclusion)) {
    for (const c of caseObj.conclusion as Array<{ type?: string; element?: string }>) {
      if (c.type === "violation" && c.element) {
        violations.push(c.element);
      }
    }
  }
  if (violations.length === 0 && typeof caseObj.__conclusion === "string") {
    violations.push(...caseObj.__conclusion.split(";").map((s) => s.trim()).filter(Boolean));
  }
  return violations;
}

function extractArticles(caseObj: Record<string, unknown>): string[] {
  if (Array.isArray(caseObj.article)) {
    return (caseObj.article as string[]).filter((a) => typeof a === "string");
  }
  if (typeof caseObj.__articles === "string") {
    return caseObj.__articles.split(";").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function getStableId(c: Record<string, unknown>): string | null {
  const val = c.itemid || c.application_no || c.appno || c.echr_case_id || c.case_id || c.id;
  return val ? String(val) : null;
}

function mapOutcome(raw: string): string {
  const lower = raw.toLowerCase();
  if (/violation|granted|удовлет|բավ/.test(lower)) return "granted";
  if (/no.violation|rejected|отклон|մերժ/.test(lower)) return "rejected";
  if (/partial|частичн|մաս/.test(lower)) return "partial";
  if (/struck|discontin|прекращ|կարճ/.test(lower)) return "discontinued";
  return "granted";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const practiceCategory: string = body.practiceCategory ?? "echr";

    let batchCases: Record<string, unknown>[] = [];

    if (Array.isArray(body.rawContent)) {
      batchCases = body.rawContent.filter((x: unknown) => x && typeof x === "object") as Record<string, unknown>[];
    } else {
      const rawContent: string = body.rawContent ?? "";
      if (!rawContent.trim()) {
        return new Response(JSON.stringify({ error: "rawContent is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Simple parse
      const trimmed = rawContent.trim();
      if (trimmed.startsWith("[")) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) batchCases = arr.filter((x) => x && typeof x === "object");
        } catch { /* fallthrough to JSONL */ }
      }
      if (batchCases.length === 0) {
        for (const line of trimmed.split("\n")) {
          const l = line.trim();
          if (!l) continue;
          try {
            const parsed = JSON.parse(l);
            if (parsed && typeof parsed === "object") batchCases.push(parsed);
          } catch { /* skip */ }
        }
      }
    }

    if (batchCases.length === 0) {
      return new Response(JSON.stringify({ error: "No valid cases found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let skippedById = 0;
    let skippedByHash = 0;
    let skippedNoText = 0;
    let errors = 0;
    const insertedIds: string[] = [];
    const errorDetails: Array<{ title: string; error: string }> = [];

    // ── Pre-fetch existing echr_case_ids and content_hashes for dedup ──
    const stableIds = batchCases
      .map((c) => getStableId(c))
      .filter((id): id is string => !!id);

    const existingEchrIds = new Set<string>();
    if (stableIds.length > 0) {
      const { data: existing } = await supabaseService
        .from("legal_practice_kb")
        .select("echr_case_id")
        .in("echr_case_id", stableIds);
      if (existing) {
        for (const row of existing) {
          if (row.echr_case_id) existingEchrIds.add(row.echr_case_id);
        }
      }
    }

    // Also collect content hashes for cases without stable IDs
    async function computeHash(text: string): Promise<string> {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    const existingHashes = new Set<string>();
    // Fetch recent content hashes to avoid duplicates for non-ECHR cases
    const { data: hashRows } = await supabaseService
      .from("legal_practice_kb")
      .select("content_hash")
      .not("content_hash", "is", null)
      .limit(10000);
    if (hashRows) {
      for (const row of hashRows) {
        if (row.content_hash) existingHashes.add(row.content_hash);
      }
    }

    // Process cases in parallel (up to 5 concurrently)
    const CONCURRENCY = 5;
    for (let i = 0; i < batchCases.length; i += CONCURRENCY) {
      const chunk = batchCases.slice(i, i + CONCURRENCY);

      const results = await Promise.all(chunk.map(async (caseObj) => {
        try {
          const stableId = getStableId(caseObj);

          // ── Dedup by echr_case_id ──
          if (stableId && existingEchrIds.has(stableId)) {
            const title = String(caseObj.docname || caseObj.title || caseObj.case_name || stableId).slice(0, 200);
            return { ok: true, skipped: true, skipReason: "duplicate_id", title };
          }

          const title = String(
            caseObj.docname || caseObj.title || caseObj.case_name || `ECHR-${stableId ?? "unknown"}`
          ).replace(/^_+/, "").slice(0, 500);

          const rawText = extractCaseText(caseObj);
          const contentText = rawText.replace(/\u0000/g, "").slice(0, 500000);

          if (!contentText) return { ok: true, skipped: true, skipReason: "no_text", title };

          // ── Dedup by content_hash ──
          const contentHash = await computeHash(contentText);
          if (existingHashes.has(contentHash)) {
            return { ok: true, skipped: true, skipReason: "duplicate_hash", title };
          }

          const violations = extractViolations(caseObj);
          const echrArticles = extractArticles(caseObj);

          const outcomeRaw = String(
            caseObj.judgementdate
              ? (violations.length > 0 ? "violation" : "no violation")
              : caseObj.outcome ?? "granted"
          );

          const courtName = String(caseObj.originatingbody_name || caseObj.respondent || caseObj.court_name || "").trim() || null;
          const caseNumber = String(caseObj.appno || caseObj.application_no || caseObj.case_number || "").trim() || null;
          const decisionDateRaw = String(caseObj.judgementdate || caseObj.kpdate || caseObj.decisiondate || caseObj.decision_date || "").trim();
          
          let decisionDate: string | null = null;
          if (decisionDateRaw) {
            const isoMatch = decisionDateRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
            const euMatch = decisionDateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (isoMatch) decisionDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
            else if (euMatch) decisionDate = `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;
          }

          const appliedArticles = echrArticles.length > 0
            ? { sources: [{ act: "ECHR", articles: echrArticles.map(a => ({ article: a, part: "", point: "", context: "" })) }] }
            : null;

          const row: Record<string, unknown> = {
            title,
            content_text: contentText,
            content_hash: contentHash,
            practice_category: practiceCategory,
            court_type: "echr",
            outcome: mapOutcome(outcomeRaw),
            is_anonymized: false,
            visibility: "ai_only",
            is_active: true,
            source_name: String(caseObj.originatingbody_name || caseObj.source_name || "ECHR HUDOC"),
            court_name: courtName,
            case_number_anonymized: caseNumber,
            decision_date: decisionDate,
            applied_articles: appliedArticles,
            key_violations: violations.length > 0 ? violations : null,
            echr_article: echrArticles.length > 0 ? echrArticles : null,
          };

          if (stableId) row.echr_case_id = stableId;

          const { data: ins, error: insertErr } = await supabaseService
            .from("legal_practice_kb")
            .insert(row)
            .select("id")
            .single();
          if (insertErr) throw insertErr;

          // Track new hashes/ids to avoid intra-batch duplicates
          existingHashes.add(contentHash);
          if (stableId) existingEchrIds.add(stableId);

          return { ok: true, insertedId: ins?.id ?? null };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          const caseTitle = String(caseObj.docname || caseObj.title || caseObj.case_name || "Unknown").slice(0, 200);
          console.error("Case error:", caseTitle, errMsg);
          return { ok: false, title: caseTitle, error: errMsg };
        }
      }));

      for (const r of results) {
        processed++;
        if (r.ok && (r as { skipped?: boolean }).skipped) {
          skipped++;
          const reason = (r as { skipReason?: string }).skipReason;
          if (reason === "duplicate_id") skippedById++;
          else if (reason === "duplicate_hash") skippedByHash++;
          else if (reason === "no_text") skippedNoText++;
        } else if (r.ok && (r as { insertedId?: string }).insertedId) {
          inserted++;
          insertedIds.push((r as { insertedId: string }).insertedId);
        } else if (!r.ok) {
          errors++;
          const err = r as { title?: string; error?: string };
          errorDetails.push({ title: err.title || "Unknown", error: err.error || "Unknown error" });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: batchCases.length,
      batchProcessed: processed,
      inserted,
      skipped,
      skippedById,
      skippedByHash,
      skippedNoText,
      errors,
      insertedIds,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("echr-import error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Import failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
