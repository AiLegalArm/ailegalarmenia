/**
 * ocr-process CONTRACT tests — normalized schema & no runtime crashes.
 *
 * Run:
 *   deno test --allow-net --allow-env --allow-read supabase/functions/ocr-process/ocr-process.contract.test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
const ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY");
const TEST_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const TEST_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");
const OCR_URL = `${SUPABASE_URL}/functions/v1/ocr-process`;

// ── auth helper ─────────────────────────────────────────────────────────

let _token: string | null = null;

async function getToken(): Promise<string | null> {
  if (_token) return _token;
  if (!SUPABASE_URL || !ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) return null;

  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    },
  );
  if (!res.ok) {
    await res.text();
    return null;
  }
  const d = await res.json();
  _token = d.access_token ?? null;
  return _token;
}

function skip(): boolean {
  if (!SUPABASE_URL) {
    console.warn("SKIP: SUPABASE_URL not set");
    return true;
  }
  return false;
}

// ── helpers ─────────────────────────────────────────────────────────────

function assertNormalizedSchema(data: Record<string, unknown>) {
  assertEquals(typeof data.ok, "boolean", "ok must be boolean");
  assertEquals(typeof data.text, "string", "text must be string");
  if (data.warnings !== undefined) {
    assertEquals(Array.isArray(data.warnings), true, "warnings must be array");
  }
  if (data.usage) {
    const u = data.usage as Record<string, unknown>;
    assertExists(u.provider, "usage.provider required");
    assertExists(u.model, "usage.model required");
    assertEquals(typeof u.input_tokens, "number");
    assertEquals(typeof u.output_tokens, "number");
    assertEquals(typeof u.cost_usd, "number");
  }
}

// ── 1) 401 without Authorization ────────────────────────────────────────

Deno.test("contract: no auth → 401 + normalized schema", async () => {
  if (skip()) return;

  const res = await fetch(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUrl: "https://example.com/test.pdf",
      fileName: "test.pdf",
    }),
  });

  assertEquals(res.status, 401, `Expected 401, got ${res.status}`);
  const data = await res.json();
  assertEquals(data.ok, false);
  assertNormalizedSchema(data);
});

// ── 2) 400 unsupported file type (valid auth) ──────────────────────────

Deno.test("contract: unsupported file → 400 + no ReferenceError", async () => {
  if (skip()) return;

  const token = await getToken();
  if (!token) {
    console.warn("SKIP: no test credentials");
    return;
  }

  const res = await fetch(OCR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY!,
    },
    body: JSON.stringify({
      fileUrl: "https://example.com/virus.exe",
      fileName: "virus.exe",
    }),
  });

  // Must NOT be 500 (would indicate ReferenceError / crash)
  assertEquals(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assertEquals(data.ok, false);
  assertNormalizedSchema(data);
  // warnings should mention unsupported type
  assertEquals(Array.isArray(data.warnings), true);
});

// ── 3) Usage logging resilience (no crash when usage missing) ───────────

Deno.test("contract: missing fileUrl → 400 + no crash from usage logging", async () => {
  if (skip()) return;

  const token = await getToken();
  if (!token) {
    console.warn("SKIP: no test credentials");
    return;
  }

  const res = await fetch(OCR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY!,
    },
    body: JSON.stringify({ fileName: "test.pdf" }), // missing fileUrl
  });

  assertEquals(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assertEquals(data.ok, false);
  assertNormalizedSchema(data);
  // x-request-id must be present even on error
  assertExists(res.headers.get("x-request-id"), "x-request-id must be present");
});
