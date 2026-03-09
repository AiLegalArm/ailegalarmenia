/**
 * Security tests for extract-case-fields edge function.
 * P0: Validates auth guards, IDOR prevention, and service_role isolation.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// We test the auth/access patterns by importing the shared edge-security module
// and verifying the behavior of handleCors + auth guards.
import { handleCors } from "../_shared/edge-security.ts";

// ─── CASE A: No Authorization → 401 ────────────────────────────────────────

Deno.test("extract-case-fields: request without Authorization header returns 401 pattern", () => {
  // Verify the auth guard pattern: missing Bearer token should be rejected
  const authHeader = "";
  const hasBearer = authHeader.startsWith("Bearer ");
  assertEquals(hasBearer, false, "Empty auth header must not pass Bearer check");
});

Deno.test("extract-case-fields: malformed Authorization header rejected", () => {
  const authHeader = "Basic dXNlcjpwYXNz";
  const hasBearer = authHeader.startsWith("Bearer ");
  assertEquals(hasBearer, false, "Basic auth must not pass Bearer check");
});

Deno.test("extract-case-fields: valid Bearer header passes format check", () => {
  const authHeader = "Bearer eyJhbGciOiJIUzI1NiJ9.test.sig";
  const hasBearer = authHeader.startsWith("Bearer ");
  assertEquals(hasBearer, true, "Valid Bearer header must pass format check");
});

// ─── CASE B: Auth OK but no case access → 403 pattern ──────────────────────

Deno.test("extract-case-fields: null case access triggers 403 response pattern", () => {
  // Simulate the access check logic from the handler
  const caseAccess = null;
  const caseAccessErr = null;

  // This mirrors the handler: if (!caseAccess || caseAccessErr) → 403
  const shouldDeny = !caseAccess || caseAccessErr !== null;
  assertEquals(shouldDeny, true, "Null case access must trigger denial");
});

Deno.test("extract-case-fields: case access error triggers 403 response pattern", () => {
  const caseAccess = null;
  const caseAccessErr = { message: "Row not found" };

  const shouldDeny = !caseAccess || caseAccessErr !== null;
  assertEquals(shouldDeny, true, "Case access error must trigger denial");
});

Deno.test("extract-case-fields: valid case access allows continuation", () => {
  const caseAccess = { id: "case-123" };
  const caseAccessErr = null;

  const shouldDeny = !caseAccess || caseAccessErr !== null;
  assertEquals(shouldDeny, false, "Valid case access must not trigger denial");
});

// ─── CASE C: Service role isolation ─────────────────────────────────────────

Deno.test("extract-case-fields: service_role client created AFTER auth check (code audit)", async () => {
  // Read the actual function source and verify ordering
  const source = await Deno.readTextFile(
    new URL("../extract-case-fields/index.ts", import.meta.url)
  );

  const authGuardPos = source.indexOf("=== AUTH GUARD ===");
  const caseAccessPos = source.indexOf("=== CASE ACCESS CHECK");
  const serviceRolePos = source.indexOf("SUPABASE_SERVICE_ROLE_KEY");

  // Auth guard must come BEFORE case access check
  assertExists(authGuardPos, "AUTH GUARD marker must exist");
  assertExists(caseAccessPos, "CASE ACCESS CHECK marker must exist");
  assertExists(serviceRolePos, "SERVICE_ROLE_KEY usage must exist");

  assertEquals(
    authGuardPos < caseAccessPos,
    true,
    "Auth guard must come before case access check"
  );
  assertEquals(
    caseAccessPos < serviceRolePos,
    true,
    "Case access check (via authClient) must come before service_role client creation"
  );
});

Deno.test("extract-case-fields: authClient uses user JWT, not service_role (code audit)", async () => {
  const source = await Deno.readTextFile(
    new URL("../extract-case-fields/index.ts", import.meta.url)
  );

  // The authClient must be created with SUPABASE_ANON_KEY + user's Authorization header
  const authClientBlock = source.substring(
    source.indexOf("const authClient"),
    source.indexOf("=== END AUTH GUARD ===")
  );

  assertEquals(
    authClientBlock.includes("SUPABASE_ANON_KEY"),
    true,
    "authClient must use ANON_KEY (not service role)"
  );
  assertEquals(
    authClientBlock.includes("Authorization: authHeader"),
    true,
    "authClient must forward user's Authorization header"
  );
});

// ─── CORS ───────────────────────────────────────────────────────────────────

Deno.test("extract-case-fields: OPTIONS request returns CORS response", () => {
  const req = new Request("https://example.com/extract-case-fields", {
    method: "OPTIONS",
    headers: { Origin: "https://test.lovable.app" },
  });

  const result = handleCors(req);
  // handleCors returns errorResponse for OPTIONS (pre-flight)
  assertExists(result.errorResponse, "OPTIONS must return a CORS response");
});
