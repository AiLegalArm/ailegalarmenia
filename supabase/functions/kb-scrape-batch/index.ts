import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors } from "../_shared/edge-security.ts";

const OCR_PROMPT = `You are an expert OCR specialist for Armenian legal documents (Republic of Armenia). Extract ALL visible text from this PDF with maximum fidelity.

HARD RULES:
1) Extract ALL visible text. Do NOT summarize, paraphrase, or reorder.
2) Do NOT invent missing words, numbers, dates, or details.
3) Do NOT correct spelling or grammar\u2014preserve exactly as visible.
4) Preserve document structure (headings, paragraphs, lists, tables).
5) If illegible, mark as [ILLEGIBLE] or [UNCERTAIN: ...].
6) Output raw text only. No JSON, no markdown code blocks, no commentary.

TABLES: Use " | " between columns. Preserve row/column order exactly.
DATES/NUMBERS: Preserve all exactly as written.
STAMPS: [STAMP/SEAL: ...] or [STAMP/SEAL PRESENT: ILLEGIBLE]
SIGNATURES: [SIGNATURE PRESENT]`;

interface ScrapeRequest {
  urls?: string[];
  sitemapUrl?: string;
  category: string;
  sourceName: string;
  limit?: number;
  searchQuery?: string;
}

function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.pdf') || 
         lower.includes('/pdf/') || 
         lower.includes('pdf.arlis.am') ||
         lower.includes('/pdf?') ||
         lower.match(/\/\d+\.pdf/) !== null;
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
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
      console.warn(`Fetch attempt ${attempt}/${maxRetries} failed for ${url}: ${err}`);
      if (attempt === maxRetries) throw new Error(`PDF download failed after ${maxRetries} attempts: ${err}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function scrapeWithGeminiOcr(
  url: string,
  lovableApiKey: string,
): Promise<{ content: string; title: string }> {
  const pdfResponse = await fetchWithRetry(url);


  const pdfBuffer = await pdfResponse.arrayBuffer();
  const bytes = new Uint8Array(pdfBuffer);

  // Limit to 10MB
  if (bytes.length > 10 * 1024 * 1024) {
    throw new Error("PDF too large (>10MB)");
  }

  // Convert to base64
  const { uint8ToBase64 } = await import("../_shared/base64.ts");
  const base64 = uint8ToBase64(bytes);
  const dataUrl = `data:application/pdf;base64,${base64}`;

  console.log(`PDF downloaded: ${Math.round(base64.length / 1024)}KB, sending to Gemini OCR`);

  const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");
  const bypassResult = await callGatewayBypass(
    [
      { role: "system", content: OCR_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract ALL text from this Armenian legal PDF document." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    {
      functionName: "kb-scrape-batch",
      bypassReason: "multimodal",
      timeoutMs: 90000,
    }
  );

  const aiResponse = bypassResult.data;

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    throw new Error(`Gemini OCR failed: ${aiResponse.status} - ${errorText.substring(0, 200)}`);
  }

  const aiResult = await aiResponse.json();
  const extractedText = aiResult.choices?.[0]?.message?.content || "";

  if (!extractedText || extractedText.length < 50) {
    throw new Error("Insufficient text extracted from PDF");
  }

  // Extract title from first meaningful line
  const lines = extractedText.split('\n').filter((l: string) => l.trim().length > 5);
  const title = (lines[0] || 'Untitled').replace(/^#+\s*/, '').trim().substring(0, 500);

  return { content: extractedText, title };
}

async function scrapeWithFirecrawl(
  url: string,
  firecrawlKey: string,
): Promise<{ content: string; title: string }> {
  const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 2000,
    }),
  });

  const scrapeData = await scrapeResponse.json();

  if (!scrapeResponse.ok || !scrapeData.success) {
    throw new Error(scrapeData.error || 'Scrape failed');
  }

  const content = scrapeData.data?.markdown || '';
  const metadata = scrapeData.data?.metadata || {};

  if (!content || content.length < 50) {
    throw new Error('Content too short');
  }

  const title = metadata.title ||
    decodeURIComponent(url.split('/').pop() || '').replace(/[_-]/g, ' ') ||
    'Untitled';

  return { content, title };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // === AUTH GUARD (admin-only) ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // === END AUTH GUARD ===

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlKey && !lovableApiKey) {
      return new Response(
        JSON.stringify({ error: 'No scraping backend configured (need Firecrawl or Lovable API key)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: ScrapeRequest = await req.json();

    let urlsToProcess: string[] = [];

    // Option 1: Use provided URLs directly
    if (body.urls && body.urls.length > 0) {
      urlsToProcess = body.urls;
      console.log(`Using ${urlsToProcess.length} provided URLs`);
    }
    // Option 2: Search
    else if (body.searchQuery && firecrawlKey) {
      console.log('Searching for:', body.searchQuery);
      const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: body.searchQuery,
          limit: body.limit || 20,
        }),
      });
      const searchData = await searchResponse.json();
      if (searchResponse.ok && searchData.data) {
        urlsToProcess = searchData.data.map((r: { url?: string }) => r.url).filter(Boolean);
        console.log(`Found ${urlsToProcess.length} URLs from search`);
      }
    }
    // Option 3: Map website
    else if (body.sitemapUrl && firecrawlKey) {
      console.log('Mapping website:', body.sitemapUrl);
      const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: body.sitemapUrl,
          limit: 5000,
          includeSubdomains: true,
        }),
      });
      const mapData = await mapResponse.json();
      if (!mapResponse.ok) {
        throw new Error(`Map failed: ${mapData.error || 'Unknown error'}`);
      }
      const allLinks = mapData.links || [];
      urlsToProcess = allLinks.filter((url: string) => {
        const lower = url.toLowerCase();
        return lower.endsWith('.pdf') || lower.includes('/pdf/') ||
               lower.includes('/document') || lower.includes('/act/') ||
               lower.includes('/law/') || lower.includes('/decision/') ||
               lower.includes('docid=') || lower.includes('id=');
      });
      if (urlsToProcess.length === 0 && allLinks.length > 0) {
        urlsToProcess = allLinks.slice(0, Math.min(body.limit || 50, allLinks.length));
      }
      console.log(`Found ${urlsToProcess.length} URLs from ${allLinks.length} total`);
    }

    if (urlsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No URLs to process.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batchLimit = body.limit ? Math.min(body.limit, 5000) : urlsToProcess.length;
    const batchUrls = urlsToProcess.slice(0, batchLimit);

    const results: { url: string; status: string; title?: string; error?: string; method?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Process sequentially (1 at a time for PDFs, 2 for HTML) to avoid timeouts
    const PDF_CONCURRENCY = 1;
    const HTML_CONCURRENCY = 3;
    
    // Separate PDF and HTML URLs
    const pdfUrls = batchUrls.filter(u => isPdfUrl(u));
    const htmlUrls = batchUrls.filter(u => !isPdfUrl(u));
    
    console.log(`Processing: ${pdfUrls.length} PDFs (Gemini OCR), ${htmlUrls.length} HTML (Firecrawl)`);

    // Process PDFs with Gemini OCR (1 at a time to avoid memory/timeout issues)
    if (lovableApiKey) {
      for (let i = 0; i < pdfUrls.length; i += PDF_CONCURRENCY) {
        const batch = pdfUrls.slice(i, i + PDF_CONCURRENCY);
        const batchResults = await Promise.all(batch.map(async (url) => {
          try {
            console.log(`[Gemini OCR] ${url}`);
            const { content, title } = await scrapeWithGeminiOcr(url, lovableApiKey);

            const { error: insertError } = await supabase
              .from('knowledge_base')
              .insert({
                title: title.substring(0, 500),
                content_text: content.substring(0, 200000),
                category: body.category,
                source_name: body.sourceName,
                source_url: url,
                is_active: true,
              });

            if (insertError) throw new Error(`DB: ${insertError.message}`);
            successCount++;
            return { url, status: 'success', title: title.substring(0, 100), method: 'gemini-ocr' };
          } catch (error) {
            errorCount++;
            const msg = error instanceof Error ? error.message : 'Unknown';
            console.error(`[Gemini OCR Error] ${url}: ${msg}`);
            return { url, status: 'error', error: msg, method: 'gemini-ocr' };
          }
        }));
        results.push(...batchResults);

        // Delay between PDFs
        if (i + PDF_CONCURRENCY < pdfUrls.length) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    } else {
      // Fallback: use Firecrawl for PDFs too (lower quality)
      pdfUrls.forEach(url => {
        results.push({ url, status: 'error', error: 'No LOVABLE_API_KEY for Gemini OCR', method: 'skipped' });
        errorCount++;
      });
    }

    // Process HTML pages with Firecrawl
    if (firecrawlKey && htmlUrls.length > 0) {
      for (let i = 0; i < htmlUrls.length; i += HTML_CONCURRENCY) {
        const batch = htmlUrls.slice(i, i + HTML_CONCURRENCY);
        const batchResults = await Promise.all(batch.map(async (url) => {
          try {
            console.log(`[Firecrawl] ${url}`);
            const { content, title } = await scrapeWithFirecrawl(url, firecrawlKey);

            const { error: insertError } = await supabase
              .from('knowledge_base')
              .insert({
                title: title.substring(0, 500),
                content_text: content.substring(0, 100000),
                category: body.category,
                source_name: body.sourceName,
                source_url: url,
                is_active: true,
              });

            if (insertError) throw new Error(`DB: ${insertError.message}`);
            successCount++;
            return { url, status: 'success', title: title.substring(0, 100), method: 'firecrawl' };
          } catch (error) {
            errorCount++;
            const msg = error instanceof Error ? error.message : 'Unknown';
            console.error(`[Firecrawl Error] ${url}: ${msg}`);
            return { url, status: 'error', error: msg, method: 'firecrawl' };
          }
        }));
        results.push(...batchResults);

        if (i + HTML_CONCURRENCY < htmlUrls.length) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalUrls: urlsToProcess.length,
        processed: batchUrls.length,
        successCount,
        errorCount,
        pdfCount: pdfUrls.length,
        htmlCount: htmlUrls.length,
        remainingUrls: urlsToProcess.length - batchUrls.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Batch scrape error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
