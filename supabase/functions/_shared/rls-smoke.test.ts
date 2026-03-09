/**
 * RLS smoke test: verifies that anon/auth clients are denied access
 * to server-only tables, while service_role succeeds.
 *
 * Tables tested: encrypted_pii, api_usage, audit_logs
 * Requires: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Skips gracefully when credentials are not available.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const canRun = url.length > 0 && anonKey.length > 0 && serviceKey.length > 0;

function getAnon() { return createClient(url, anonKey); }
function getService() { return createClient(url, serviceKey); }

// ─── encrypted_pii: anon SELECT must return empty or error ─────────

Deno.test({
  name: "RLS: anon SELECT on encrypted_pii returns 0 rows (denied)",
  ignore: !canRun,
  async fn() {
    const { data, error } = await getAnon()
      .from("encrypted_pii")
      .select("id")
      .limit(1);
    if (error) {
      assertExists(error.message);
    } else {
      assertEquals(data?.length ?? 0, 0, "anon must not see encrypted_pii rows");
    }
  },
});

// ─── api_usage: anon INSERT must fail ──────────────────────────────

Deno.test({
  name: "RLS: anon INSERT into api_usage is denied",
  ignore: !canRun,
  async fn() {
    const { error } = await getAnon().from("api_usage").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      service_type: "test",
      model_name: "test",
      request_tokens: 0,
      response_tokens: 0,
      estimated_cost: 0,
    });
    assertExists(error, "anon INSERT into api_usage must be denied");
  },
});

// ─── audit_logs: anon INSERT must fail ─────────────────────────────

Deno.test({
  name: "RLS: anon INSERT into audit_logs is denied",
  ignore: !canRun,
  async fn() {
    const { error } = await getAnon().from("audit_logs").insert({
      action: "rls_test",
      table_name: "test",
    });
    assertExists(error, "anon INSERT into audit_logs must be denied");
  },
});

// ─── service_role: SELECT on encrypted_pii succeeds ────────────────

Deno.test({
  name: "RLS: service_role SELECT on encrypted_pii succeeds",
  ignore: !canRun,
  async fn() {
    const { error } = await getService()
      .from("encrypted_pii")
      .select("id")
      .limit(1);
    assertEquals(error, null, "service_role SELECT on encrypted_pii must succeed");
  },
});

// ─── service_role: INSERT + cleanup on api_usage ───────────────────

Deno.test({
  name: "RLS: service_role INSERT into api_usage succeeds",
  ignore: !canRun,
  async fn() {
    const svc = getService();
    const marker = `rls_smoke_${Date.now()}`;
    const { data, error } = await svc
      .from("api_usage")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        service_type: marker,
        model_name: "test",
        request_tokens: 0,
        response_tokens: 0,
        estimated_cost: 0,
      })
      .select("id")
      .single();
    assertEquals(error, null, "service_role INSERT into api_usage must succeed");
    assertExists(data?.id);
    await svc.from("api_usage").delete().eq("id", data!.id);
  },
});

// ─── service_role: INSERT + cleanup on audit_logs ──────────────────

Deno.test({
  name: "RLS: service_role INSERT into audit_logs succeeds",
  ignore: !canRun,
  async fn() {
    const svc = getService();
    const marker = `rls_smoke_${Date.now()}`;
    const { data, error } = await svc
      .from("audit_logs")
      .insert({
        action: marker,
        table_name: "rls_test",
      })
      .select("id")
      .single();
    assertEquals(error, null, "service_role INSERT into audit_logs must succeed");
    assertExists(data?.id);
    await svc.from("audit_logs").delete().eq("id", data!.id);
  },
});
