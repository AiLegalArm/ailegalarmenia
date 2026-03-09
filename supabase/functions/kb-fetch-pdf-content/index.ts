import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";
import { callGatewayBypass } from "../_shared/gateway-bypass.ts";

const OCR_PROMPT = `You are an expert OCR specialist for Armenian legal documents (Republic of Armenia). Your task is to extract ALL visible text from the provided PDF/images with maximum fidelity, preserving evidentiary integrity.

SCOPE
- Input formats: PDF files, scanned documents, photographs of documents (single-page or multi-page).
- Languages: Armenian (hy), Russian (ru), English (en).
- Content types: printed text, handwriting, stamps/seals, marginalia, headers/footers, page numbers, tables, form fields, watermarks (only if readable).

CRITICAL: SKIP METADATA HEADER TABLES
Many Arlis.am legal PDFs contain a metadata/navigation table at the very top of the document (before the actual legal text begins). These tables typically contain:
- Garbled/corrupted text (e.g., "Zuuupp", "Su Zulu", "puugu", "u[", "\u2229 u", "Ulq\u03B9")
- Columns with dates, status codes, publication references
- Navigation links like "\u053f\u0561\u057a\u0565\u0580 \u0561\u0575\u056c \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580\u056b \u0570\u0565\u057f" or "\u0553\u0578\u0583\u0578\u056d\u0578\u0572\u0576\u0565\u0580 \u0587 \u056b\u0576\u056f\u0578\u0580\u057a\u0578\u0580\u0561\u0581\u056b\u0561\u0576\u0565\u0580"
- Registration numbers like "\u0540\u054C\u0413\u054F", "\u0540\u054C\u0531\u0413\u0546\u054A\u054F", "\u0540\u054C\u054A\u054F"
YOU MUST COMPLETELY SKIP these metadata header tables. Start extraction from the actual legal document title/heading (usually in ALL CAPS Armenian text).

HARD RULES (NON-NEGOTIABLE)
1) Extract ALL visible text of the LEGAL CONTENT. Do NOT summarize, paraphrase, reorder, interpret, or "clean up" content.
2) Do NOT invent missing words, article numbers, dates, names, case numbers, or any other details.
3) Do NOT correct spelling, typos, grammar, or orthography\u2014preserve exactly as visible, even if erroneous.
4) Do NOT translate or normalize language; preserve HY/RU/EN exactly as written.
5) Preserve document structure and reading order as closely as possible.
6) If any fragment is illegible or uncertain, mark it explicitly as [ILLEGIBLE] or [UNCERTAIN: ...] without guessing.
7) Output MUST be raw text only (no JSON, no markdown, no explanations, no extra metadata beyond the inline tags defined here).
8) Do NOT anonymize or redact anything. OCR is a faithful transcription step only.

EXTRACTION INSTRUCTIONS

A) PAGE ORDER & DELIMITERS
- Process pages sequentially as they appear.
- Before each page, output exactly:
  === PAGE {N} ===
  (N starts at 1.)

B) LAYOUT & STRUCTURE
- Preserve headings, paragraphs, numbered lists, bullet points, and indentation where evident.
- Preserve line breaks where meaningful (addresses, headings, form fields, legal clauses).
- Preserve section labels and field labels exactly.
- Form fields: If a field is clearly present (label + blank line/box/cell) but not filled, output [EMPTY FIELD] ONLY for that field.

C) TABLES (LEGAL CONTENT ONLY)
- Represent tables in plain text with stable separators:
  - Use " | " between columns when columns are clear.
  - Preserve row order, column order, and cell contents exactly.
- Wrap each table as:
  TABLE START:
  (table text)
  TABLE END:
- If table structure is unclear, output row-by-row without inventing columns.
- REMINDER: Skip metadata/navigation tables at the top of the document.

D) HANDWRITTEN / ANNOTATIONS
- If handwriting is present, include it at the exact position where it appears:
  [HANDWRITTEN: ...]
- If partially unclear:
  [HANDWRITTEN: [UNCERTAIN: ...]]
- Do NOT interpret or standardize handwriting\u2014transcribe as-is.

E) STAMPS / SEALS / SIGNATURES
- If a stamp/seal contains readable text, extract it inline:
  [STAMP/SEAL: ...]
- If a stamp/seal is present but unreadable:
  [STAMP/SEAL PRESENT: ILLEGIBLE]
- If a signature is present, do NOT transcribe it; output:
  [SIGNATURE PRESENT]

F) DATES / NUMBERS / LEGAL REFERENCES
- Preserve all numbers exactly (case numbers, article numbers, dates, sums), including original formatting (e.g., DD.MM.YYYY).
- Preserve legal references exactly as written (e.g., "\u0570\u0578\u0564.", "\u0570\u0578\u0564\u057e\u0561\u056e", "Article", "\u0554\u0580\u0534\u0555", "\u0554\u053f", etc.).
- Preserve punctuation, quotation marks, and special characters.

G) WATERMARKS / OVERLAPS
- If a watermark text is readable, extract it once per page where visible as:
  [WATERMARK: ...]
- If overlapped text becomes unclear, use [UNCERTAIN: ...] rather than guessing.

H) QUALITY FLAGS (INLINE ONLY)
- Use only when quality directly impacts accuracy:
  [BLUR], [LOW CONTRAST], [CUT OFF], [SKEWED], [OVERLAPPED], [DAMAGED]
- Place flags near the affected fragment.

OUTPUT REQUIREMENT
Return ONLY the extracted raw document text with the page delimiters and inline tags above. No preambles, no postscript, no commentary.`;

interface FetchRequest {
  kbIds: string[];
  batchSize?: number;
  delayMs?: number;
  model?: string;
  forceRescrape?: boolean;
}

async function fetchPdfBuffer(url: string): Promise<Uint8Array> {
  // Try direct fetch first
  try {
    const resp = await directFetch(url);
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > 100) return new Uint8Array(buf);
  } catch (directErr) {
    console.warn(`Direct fetch failed for ${url}: ${directErr}`);
  }

  // Fallback: use Firecrawl to scrape the PDF page
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (firecrawlKey) {
    console.log(`Trying Firecrawl for ${url}`);
    const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        waitFor: 3000,
      }),
    });
    const scrapeData = await scrapeResp.json();
    if (scrapeResp.ok && scrapeData.success && scrapeData.data?.markdown) {
      // Return markdown text as buffer (will be used as text, not PDF OCR)
      return new TextEncoder().encode(`__FIRECRAWL_TEXT__${scrapeData.data.markdown}`);
    }
  }

  throw new Error(`Cannot download PDF from ${url} (blocked by server)`);
}

async function directFetch(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
        },
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error("unreachable");
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // === AUTH GUARD ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const body = await req.json();

    // ── Mode A: Direct base64 PDF extraction (used by bulk import) ──
    if (body.base64Content && typeof body.base64Content === "string") {
      const dataUrl = `data:application/pdf;base64,${body.base64Content}`;
      const bypassResult = await callGatewayBypass(
        [
          { role: "system", content: OCR_PROMPT },
          { role: "user", content: [
            { type: "text", text: `Extract ALL text from this Armenian legal PDF document titled: "${body.fileName || "document"}"` },
            { type: "image_url", image_url: { url: dataUrl } }
          ]}
        ],
        {
          functionName: "kb-fetch-pdf-content",
          bypassReason: "multimodal_pdf",
          timeoutMs: 120000,
          maxRetries: 1,
        }
      );

      const content = (bypassResult.data?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || "";
      if (!content || content.length < 50) {
        throw new Error("Insufficient text extracted from PDF");
      }

      return new Response(JSON.stringify({ success: true, content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mode B: Batch KB ID processing (original flow) ──
    const { kbIds, batchSize = 5, delayMs = 2000, forceRescrape = false } = body as FetchRequest;

    if (!kbIds || !Array.isArray(kbIds) || kbIds.length === 0) {
      return new Response(JSON.stringify({ 
        error: "kbIds array is required (or provide base64Content for direct PDF extraction)" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get KB records with PDF links
    const { data: kbRecords, error: fetchError } = await supabase
      .from("knowledge_base")
      .select("id, title, source_url, content_text")
      .in("id", kbIds)
      .not("source_url", "is", null);

    if (fetchError) {
      throw new Error(`Failed to fetch KB records: ${fetchError.message}`);
    }

    if (!kbRecords || kbRecords.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: "No records with PDF links found",
        processed: 0,
        errors: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${kbRecords.length} KB records with PDF links`);

    let processed = 0;
    let errors = 0;
    const results: Array<{ id: string; success: boolean; error?: string; wordCount?: number }> = [];

    // Process in batches
    for (let i = 0; i < kbRecords.length; i += batchSize) {
      const batch = kbRecords.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (record) => {
        try {
          const pdfUrl = record.source_url;
          if (!pdfUrl) {
            return { id: record.id, success: false, error: "No PDF URL" };
          }

          // Skip if content already has substantial text (already scraped) — unless force rescrape
          if (!forceRescrape && record.content_text && record.content_text.length > 500 && !record.content_text.startsWith('#')) {
            return { id: record.id, success: true, wordCount: record.content_text.split(/\s+/).length, skipped: true };
          }

          console.log(`Fetching PDF: ${pdfUrl}`);

          const pdfBytes = await fetchPdfBuffer(pdfUrl);
          
          // Check if Firecrawl returned text directly
          const textDecoder = new TextDecoder();
          const prefix = textDecoder.decode(pdfBytes.subarray(0, 20));
          
          let extractedText: string;
          let tokensUsed = 0;
          
          if (prefix.startsWith('__FIRECRAWL_TEXT__')) {
            // Firecrawl already extracted text — use directly
            extractedText = textDecoder.decode(pdfBytes).substring('__FIRECRAWL_TEXT__'.length);
            console.log(`Firecrawl text for ${record.id}: ${extractedText.length} chars`);
          } else {
            // Binary PDF — send to Gemini OCR
            if (pdfBytes.length > 10 * 1024 * 1024) {
              throw new Error("PDF too large (>10MB)");
            }

            const { uint8ToBase64 } = await import("../_shared/base64.ts");
            const base64 = uint8ToBase64(pdfBytes);
            const dataUrl = `data:application/pdf;base64,${base64}`;

            console.log(`PDF ${record.id} converted, size: ${Math.round(base64.length / 1024)}KB`);

            const aiBypass = await callGatewayBypass(
              [
                { role: "system", content: OCR_PROMPT },
                { 
                  role: "user", 
                  content: [
                    { type: "text", text: `Extract ALL text from this Armenian legal PDF document titled: "${record.title}"` },
                    { type: "image_url", image_url: { url: dataUrl } }
                  ]
                }
              ],
              {
                functionName: "kb-fetch-pdf-content",
                bypassReason: "multimodal_pdf_batch",
                timeoutMs: 120000,
                maxRetries: 1,
              }
            );

            extractedText = (aiBypass.data?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || "";
            const usage = aiBypass.data?.usage as { total_tokens?: number } | undefined;
            tokensUsed = usage?.total_tokens || 0;
          }
          
          if (!extractedText || extractedText.length < 50) {
            throw new Error("Insufficient text extracted");
          }

          // Update KB record with extracted content
          const { error: updateError } = await supabase
            .from("knowledge_base")
            .update({ 
              content_text: extractedText.substring(0, 200000),
              updated_at: new Date().toISOString()
            })
            .eq("id", record.id);

          if (updateError) {
            throw new Error(`Failed to update record: ${updateError.message}`);
          }

          const wordCount = extractedText.split(/\s+/).length;
          console.log(`Updated KB ${record.id}: ${wordCount} words extracted`);

          // Log API usage
          if (tokensUsed > 0) {
            await supabase.rpc("log_api_usage", {
              _service_type: "kb_pdf_extraction",
              _model_name: "google/gemini-2.5-flash",
              _tokens_used: tokensUsed,
              _estimated_cost: tokensUsed * 0.0000005,
              _metadata: { kb_id: record.id, word_count: wordCount }
            });
          }

          return { id: record.id, success: true, wordCount };

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Error processing ${record.id}:`, errorMsg);
          return { id: record.id, success: false, error: errorMsg };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          processed++;
        } else {
          errors++;
        }
      }

      // Delay between batches to avoid rate limits
      if (i + batchSize < kbRecords.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      errors,
      total: kbRecords.length,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("kb-fetch-pdf-content error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Processing failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
