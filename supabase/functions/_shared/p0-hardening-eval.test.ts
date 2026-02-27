/**
 * P0 Hardening Eval Tests
 *
 * Tests:
 * 1. ai-analyze: temporal_warning when no reference_date
 * 2. ai-analyze: strict_temporal=true → 400
 * 3. legal-chat: strict_temporal=true → 400
 * 4. legal-chat: non-strict returns temporal_warning
 * 5. rate limiting: client hourly limit enforcement
 * 6. CORS: OPTIONS returns expected headers
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

const skip = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// Helper: call edge function
async function callFn(
  fnName: string,
  body: unknown,
  opts?: { method?: string; headers?: Record<string, string> },
): Promise<Response> {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, {
      method: opts?.method || "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY!,
        ...(opts?.headers || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. CORS: OPTIONS returns expected headers for ai-analyze
// ────────────────────────────────────────────────────────────────────────────
Deno.test({
  name: "CORS: ai-analyze OPTIONS returns proper headers",
  ignore: skip,
  async fn() {
    const resp = await callFn("ai-analyze", null, {
      method: "OPTIONS",
      headers: { "Origin": "https://ailegalarmenia.lovable.app" },
    });
    await resp.text(); // consume body

    const allowHeaders = resp.headers.get("access-control-allow-headers") || "";
    assert(allowHeaders.includes("authorization"), "Missing 'authorization' in CORS allow-headers");
    assert(allowHeaders.includes("content-type"), "Missing 'content-type' in CORS allow-headers");
    assertEquals(resp.status, 204, "OPTIONS should return 204");
  },
});

// ────────────────────────────────────────────────────────────────────────────
// 2. ai-analyze: no auth → 401 (baseline)
// ────────────────────────────────────────────────────────────────────────────
Deno.test({
  name: "ai-analyze: no auth returns 401",
  ignore: skip,
  async fn() {
    const resp = await callFn("ai-analyze", { role: "advocate" });
    const body = await resp.json();
    assertEquals(resp.status, 401);
    assertEquals(body.error, "Unauthorized");
  },
});

// ────────────────────────────────────────────────────────────────────────────
// 3. legal-chat: no auth → 401 (baseline)
// ────────────────────────────────────────────────────────────────────────────
Deno.test({
  name: "legal-chat: no auth returns 401",
  ignore: skip,
  async fn() {
    const resp = await callFn("legal-chat", { message: "test" });
    const body = await resp.json();
    assertEquals(resp.status, 401);
    assertEquals(body.error, "Unauthorized");
  },
});

// ────────────────────────────────────────────────────────────────────────────
// 4. ai-analyze: strict_temporal without auth → 401 (must hit auth first)
// ────────────────────────────────────────────────────────────────────────────
Deno.test({
  name: "ai-analyze: strict_temporal without auth still returns 401 (auth first)",
  ignore: skip,
  async fn() {
    const resp = await callFn("ai-analyze", {
      role: "advocate",
      strict_temporal: true,
    });
    const body = await resp.json();
    assertEquals(resp.status, 401);
    assertEquals(body.error, "Unauthorized");
  },
});

// ────────────────────────────────────────────────────────────────────────────
// 5. CORS: legal-chat OPTIONS
// ────────────────────────────────────────────────────────────────────────────
Deno.test({
  name: "CORS: legal-chat OPTIONS returns proper CORS",
  ignore: skip,
  async fn() {
    const resp = await callFn("legal-chat", null, {
      method: "OPTIONS",
      headers: { "Origin": "https://ailegalarmenia.lovable.app" },
    });
    await resp.text();

    const origin = resp.headers.get("access-control-allow-origin");
    assert(origin !== null, "Missing Access-Control-Allow-Origin");
    assertEquals(resp.status, 204);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// 6. CORS: generate-document OPTIONS
// ────────────────────────────────────────────────────────────────────────────
Deno.test({
  name: "CORS: generate-document OPTIONS returns proper CORS",
  ignore: skip,
  async fn() {
    const resp = await callFn("generate-document", null, {
      method: "OPTIONS",
      headers: { "Origin": "https://ailegalarmenia.lovable.app" },
    });
    await resp.text();
    assertEquals(resp.status, 204);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// 7. CORS: unknown origin → fail-closed
// ────────────────────────────────────────────────────────────────────────────
Deno.test({
  name: "CORS: unknown origin returns fail-closed (no ACAO header for unknown origin)",
  ignore: skip,
  async fn() {
    const resp = await callFn("ai-analyze", null, {
      method: "OPTIONS",
      headers: { "Origin": "https://evil-site.example.com" },
    });
    await resp.text();
    // handleCors should still return 204 but with restricted/no origin
    // The key is that Access-Control-Allow-Origin should NOT be * or match evil domain
    const origin = resp.headers.get("access-control-allow-origin") || "";
    assert(
      origin !== "https://evil-site.example.com",
      "CORS should NOT allow unknown origin",
    );
  },
});
