/**
 * ocr-process integration tests.
 *
 * Auth strategy:
 *   If TEST_USER_EMAIL + TEST_USER_PASSWORD are set, signs in via Supabase Auth
 *   to obtain a real access_token. Otherwise auth-dependent tests are SKIPPED.
 *
 * Env vars (from .env or shell):
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY
 *   TEST_USER_EMAIL        – email of a pre-created test user
 *   TEST_USER_PASSWORD     – password of that user
 *
 * Run:
 *   deno test --allow-net --allow-env --allow-read supabase/functions/ocr-process/ocr-process.test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
const TEST_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const TEST_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");
const OCR_URL = `${SUPABASE_URL}/functions/v1/ocr-process`;

// ─── Auth helper ────────────────────────────────────────────────────────

let _cachedToken: string | null = null;

async function getTestToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  if (!SUPABASE_URL || !ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.warn(`Auth sign-in failed (${res.status}): ${txt}`);
    return null;
  }

  const data = await res.json();
  _cachedToken = data.access_token ?? null;
  return _cachedToken;
}

function skipIfNoUrl(): boolean {
  if (!SUPABASE_URL) {
    console.warn("SKIP: SUPABASE_URL not set");
    return true;
  }
  return false;
}

// ─── Test: call without auth is rejected ────────────────────────────────

Deno.test("ocr-process: call without Authorization is rejected (401)", async () => {
  if (skipIfNoUrl()) return;

  const response = await fetch(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl: "https://example.com/test.pdf", fileName: "test.pdf" }),
  });

  assertEquals(response.status, 401, `Expected 401, got ${response.status}`);
  const data = await response.json();
  assertEquals(data.ok, false);
});

// ─── Test: OPTIONS preflight works ──────────────────────────────────────

Deno.test("ocr-process: OPTIONS preflight returns 200 with CORS headers", async () => {
  if (skipIfNoUrl()) return;

  const response = await fetch(OCR_URL, { method: "OPTIONS" });
  assertEquals(response.status, 200);
  assertExists(response.headers.get("access-control-allow-origin"));
  await response.text();
});

// ─── Test: error response matches normalized schema ─────────────────────

Deno.test("ocr-process: error response matches normalized schema", async () => {
  if (skipIfNoUrl()) return;

  const response = await fetch(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl: "https://example.com/test.pdf", fileName: "test.pdf" }),
  });

  const data = await response.json();
  assertEquals(typeof data.ok, "boolean", "ok must be boolean");
  assertEquals(typeof data.text, "string", "text must be string");

  if (data.warnings) {
    assertEquals(Array.isArray(data.warnings), true, "warnings must be array");
  }
  if (data.usage) {
    assertExists(data.usage.provider, "usage.provider required");
    assertExists(data.usage.model, "usage.model required");
    assertEquals(typeof data.usage.input_tokens, "number");
    assertEquals(typeof data.usage.output_tokens, "number");
    assertEquals(typeof data.usage.cost_usd, "number");
  }
});

// ─── Test: unsupported file type returns 400 (requires auth) ────────────

Deno.test("ocr-process: unsupported file type returns 400 with valid auth", async () => {
  if (skipIfNoUrl()) return;

  const token = await getTestToken();
  if (!token) {
    console.warn("SKIP: TEST_USER_EMAIL / TEST_USER_PASSWORD not set — cannot obtain auth token");
    return;
  }

  const response = await fetch(OCR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": ANON_KEY!,
    },
    body: JSON.stringify({ fileUrl: "https://example.com/test.exe", fileName: "virus.exe" }),
  });

  assertEquals(response.status, 400, `Expected 400, got ${response.status}`);
  const data = await response.json();
  assertEquals(data.ok, false);
  assertEquals(Array.isArray(data.warnings), true);
});

// ─── Test: missing fileUrl returns 400 (requires auth) ──────────────────

Deno.test("ocr-process: missing fileUrl returns 400 with valid auth", async () => {
  if (skipIfNoUrl()) return;

  const token = await getTestToken();
  if (!token) {
    console.warn("SKIP: TEST_USER_EMAIL / TEST_USER_PASSWORD not set — cannot obtain auth token");
    return;
  }

  const response = await fetch(OCR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": ANON_KEY!,
    },
    body: JSON.stringify({ fileName: "test.pdf" }),
  });

  assertEquals(response.status, 400, `Expected 400, got ${response.status}`);
  const data = await response.json();
  assertEquals(data.ok, false);
});

// ─── Test: x-request-id is returned in response headers ─────────────────

Deno.test("ocr-process: x-request-id header present in error response", async () => {
  if (skipIfNoUrl()) return;

  const response = await fetch(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl: "https://example.com/test.pdf", fileName: "test.pdf" }),
  });

  // Even 401 responses should carry x-request-id
  const reqId = response.headers.get("x-request-id");
  assertExists(reqId, "x-request-id header must be present");
  await response.json(); // consume body
});
