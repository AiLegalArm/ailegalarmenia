/**
 * Tests for edge-security shared helpers (dual-mode: browser + internal).
 *
 * Covers: CORS allowlist, internal key bypass, auth guards, input size limits.
 * No Armenian glyphs - Unicode escapes only.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  getCorsHeaders,
  handleCors,
  checkInternalAuth,
  checkInputSize,
  getMaxInputChars,
  isValidInternalCall,
  getRequestMode,
  validateBrowserRequest,
  validateInternalRequest,
  buildInternalHeaders,
  isAllowedOrigin,
  parseOriginHostname,
} from "./edge-security.ts";

// ─── Helper to save/restore env ────────────────────────────────────

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = Deno.env.get(key);
    if (vars[key] === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, vars[key]!);
    }
  }
  const restore = () => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, saved[key]!);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
  } catch (e) {
    restore();
    throw e;
  }
}

// ─── CORS TESTS (fail-closed for browser) ──────────────────────────

Deno.test("getCorsHeaders: no ALLOWED_ORIGINS, no wildcard flag -> null", () => {
  return withEnv({ ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: undefined, ALLOWED_ORIGIN_SUFFIXES: undefined, ENV: undefined }, () => {
    const headers = getCorsHeaders("https://evil.com");
    assertEquals(headers, null);
  });
});

Deno.test("getCorsHeaders: no ALLOWED_ORIGINS + ALLOW_WILDCARD_CORS=true + ENV=dev -> '*'", () => {
  return withEnv({ ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: "true", ALLOWED_ORIGIN_SUFFIXES: undefined, ENV: "dev" }, () => {
    const headers = getCorsHeaders("https://evil.com");
    assertExists(headers);
    assertEquals(headers!["Access-Control-Allow-Origin"], "*");
  });
});

Deno.test("getCorsHeaders: allowed origin is reflected", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const headers = getCorsHeaders("https://admin.example.com");
    assertExists(headers);
    assertEquals(headers!["Access-Control-Allow-Origin"], "https://admin.example.com");
    assertEquals(headers!["Vary"], "Origin");
  });
});

Deno.test("getCorsHeaders: disallowed origin -> null", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    assertEquals(getCorsHeaders("https://evil.com"), null);
  });
});

Deno.test("getCorsHeaders: null origin -> null", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    assertEquals(getCorsHeaders(null), null);
  });
});

// ─── SUFFIX MATCHING TESTS ─────────────────────────────────────────

Deno.test("getCorsHeaders: origin matching ALLOWED_ORIGIN_SUFFIXES -> reflected", () => {
  return withEnv({
    ALLOWED_ORIGINS: undefined,
    ALLOW_WILDCARD_CORS: undefined,
    ALLOWED_ORIGIN_SUFFIXES: "lovable.app,lovableproject.com",
    ENV: undefined,
  }, () => {
    const headers = getCorsHeaders("https://id-preview--abc123.lovable.app");
    assertExists(headers);
    assertEquals(headers!["Access-Control-Allow-Origin"], "https://id-preview--abc123.lovable.app");
    assertEquals(headers!["Vary"], "Origin");
  });
});

Deno.test("getCorsHeaders: suffix match for lovableproject.com -> reflected", () => {
  return withEnv({
    ALLOWED_ORIGINS: undefined,
    ALLOW_WILDCARD_CORS: undefined,
    ALLOWED_ORIGIN_SUFFIXES: "lovableproject.com",
    ENV: undefined,
  }, () => {
    const headers = getCorsHeaders("https://my-preview.lovableproject.com");
    assertExists(headers);
    assertEquals(headers!["Access-Control-Allow-Origin"], "https://my-preview.lovableproject.com");
  });
});

Deno.test("getCorsHeaders: evil.com does NOT match suffix -> null", () => {
  return withEnv({
    ALLOWED_ORIGINS: undefined,
    ALLOW_WILDCARD_CORS: undefined,
    ALLOWED_ORIGIN_SUFFIXES: "lovable.app",
    ENV: undefined,
  }, () => {
    assertEquals(getCorsHeaders("https://evil.com"), null);
  });
});

Deno.test("getCorsHeaders: evil-lovable.app does NOT match suffix (no dot boundary) -> null", () => {
  return withEnv({
    ALLOWED_ORIGINS: undefined,
    ALLOW_WILDCARD_CORS: undefined,
    ALLOWED_ORIGIN_SUFFIXES: "lovable.app",
    ENV: undefined,
  }, () => {
    // "evil-lovable.app" does not end with ".lovable.app" and is not "lovable.app"
    assertEquals(getCorsHeaders("https://evil-lovable.app"), null);
  });
});

Deno.test("getCorsHeaders: ALLOW_WILDCARD_CORS=true + ENV=production -> null (denied)", () => {
  return withEnv({
    ALLOWED_ORIGINS: undefined,
    ALLOW_WILDCARD_CORS: "true",
    ALLOWED_ORIGIN_SUFFIXES: undefined,
    ENV: "production",
  }, () => {
    assertEquals(getCorsHeaders("https://anything.com"), null);
  });
});

Deno.test("getCorsHeaders: combined exact + suffix both work", () => {
  return withEnv({
    ALLOWED_ORIGINS: "https://myapp.com",
    ALLOW_WILDCARD_CORS: undefined,
    ALLOWED_ORIGIN_SUFFIXES: "lovable.app",
    ENV: undefined,
  }, () => {
    // Exact match
    const h1 = getCorsHeaders("https://myapp.com");
    assertExists(h1);
    assertEquals(h1!["Access-Control-Allow-Origin"], "https://myapp.com");
    // Suffix match
    const h2 = getCorsHeaders("https://preview--abc.lovable.app");
    assertExists(h2);
    assertEquals(h2!["Access-Control-Allow-Origin"], "https://preview--abc.lovable.app");
    // Neither
    assertEquals(getCorsHeaders("https://evil.com"), null);
  });
});

Deno.test("parseOriginHostname: extracts hostname", () => {
  assertEquals(parseOriginHostname("https://foo.lovable.app"), "foo.lovable.app");
  assertEquals(parseOriginHostname("http://localhost:3000"), "localhost");
  assertEquals(parseOriginHostname("invalid"), null);
});

Deno.test("isAllowedOrigin: suffix matching works", () => {
  return withEnv({
    ALLOWED_ORIGINS: undefined,
    ALLOWED_ORIGIN_SUFFIXES: "lovable.app",
  }, () => {
    assertEquals(isAllowedOrigin("https://preview--abc.lovable.app"), true);
    assertEquals(isAllowedOrigin("https://evil.com"), false);
  });
});

// ─── DUAL-MODE handleCors ──────────────────────────────────────────

Deno.test("handleCors: internal call with valid key, no Origin -> succeeds (internal mode)", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "test-key-123", ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "x-internal-key": "test-key-123" },
    });
    const result = handleCors(req);
    assertEquals(result.errorResponse, undefined);
    assertExists(result.corsHeaders);
    assertEquals((result as { mode: string }).mode, "internal");
  });
});

Deno.test("handleCors: internal call OPTIONS -> 204 with internal mode", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "test-key-123", ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: undefined }, () => {
    const req = new Request("https://example.com/test", {
      method: "OPTIONS",
      headers: { "x-internal-key": "test-key-123" },
    });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 204);
    assertExists(result.corsHeaders);
  });
});

Deno.test("handleCors: no Origin, no internal key -> 403 (fail-closed)", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "secret", ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, async () => {
    const req = new Request("https://example.com/test", { method: "POST" });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 403);
    await result.errorResponse!.text();
  });
});

Deno.test("handleCors: browser call with allowed Origin -> browser mode", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "secret", ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "Origin": "https://app.example.com" },
    });
    const result = handleCors(req);
    assertEquals(result.errorResponse, undefined);
    assertExists(result.corsHeaders);
    assertEquals((result as { mode: string }).mode, "browser");
    assertEquals(result.corsHeaders!["Access-Control-Allow-Origin"], "https://app.example.com");
  });
});

Deno.test("handleCors: browser call from disallowed Origin -> 403", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "secret", ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, async () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "Origin": "https://evil.com" },
    });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 403);
    await result.errorResponse!.text();
  });
});

// ─── isValidInternalCall ───────────────────────────────────────────

Deno.test("isValidInternalCall: valid key -> true", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "my-secret" }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "my-secret" },
    });
    assertEquals(isValidInternalCall(req), true);
  });
});

Deno.test("isValidInternalCall: wrong key -> false", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "my-secret" }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "wrong" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("isValidInternalCall: no key configured -> false", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    const req = new Request("https://example.com", { method: "POST" });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("isValidInternalCall: empty string INTERNAL_INGEST_KEY -> false even if header is empty", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("isValidInternalCall: empty string INTERNAL_INGEST_KEY -> false even if header has value", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "some-key" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

// ─── validateBrowserRequest ────────────────────────────────────────

Deno.test("validateBrowserRequest: no auth header -> 401", async () => {
  const req = new Request("https://example.com", { method: "POST" });
  const result = validateBrowserRequest(req, { "Access-Control-Allow-Origin": "*" });
  assertExists(result);
  assertEquals(result!.status, 401);
  await result!.text();
});

Deno.test("validateBrowserRequest: valid Bearer -> null (pass)", () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer some-token" },
  });
  const result = validateBrowserRequest(req, { "Access-Control-Allow-Origin": "*" });
  assertEquals(result, null);
});

// ─── validateInternalRequest ───────────────────────────────────────

Deno.test("validateInternalRequest: valid key -> null (pass)", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "correct-key", ALLOW_UNAUTH_INGEST: undefined }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "correct-key" },
    });
    assertEquals(validateInternalRequest(req, {}), null);
  });
});

Deno.test("validateInternalRequest: wrong key -> 401", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "correct-key", ALLOW_UNAUTH_INGEST: undefined }, async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "wrong" },
    });
    const result = validateInternalRequest(req, {});
    assertExists(result);
    assertEquals(result!.status, 401);
    await result!.text();
  });
});

Deno.test("validateInternalRequest: no secret configured -> 500", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined, ALLOW_UNAUTH_INGEST: undefined }, async () => {
    const req = new Request("https://example.com", { method: "POST" });
    const result = validateInternalRequest(req, {});
    assertExists(result);
    assertEquals(result!.status, 500);
    await result!.text();
  });
});

Deno.test("validateInternalRequest: ALLOW_UNAUTH_INGEST=true bypass -> null", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined, ALLOW_UNAUTH_INGEST: "true" }, () => {
    const req = new Request("https://example.com", { method: "POST" });
    assertEquals(validateInternalRequest(req, {}), null);
  });
});

// ─── buildInternalHeaders ──────────────────────────────────────────

Deno.test("buildInternalHeaders: includes x-internal-key and Content-Type", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "my-key" }, () => {
    const headers = buildInternalHeaders();
    assertEquals(headers["x-internal-key"], "my-key");
    assertEquals(headers["Content-Type"], "application/json");
  });
});

Deno.test("buildInternalHeaders: merges extra headers", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "my-key" }, () => {
    const headers = buildInternalHeaders({ Authorization: "Bearer token" });
    assertEquals(headers["x-internal-key"], "my-key");
    assertEquals(headers["Authorization"], "Bearer token");
  });
});

// ─── LEGACY checkInternalAuth (backward compat) ────────────────────

Deno.test("checkInternalAuth: correct key -> passes (null)", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "correct-key", ALLOW_UNAUTH_INGEST: undefined }, () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "x-internal-key": "correct-key" },
    });
    assertEquals(checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" }), null);
  });
});

Deno.test("checkInternalAuth: wrong key -> 401", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "correct-key", ALLOW_UNAUTH_INGEST: undefined }, async () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "x-internal-key": "wrong-key" },
    });
    const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
    assertExists(result);
    assertEquals(result!.status, 401);
    await result!.text();
  });
});

// ─── INPUT SIZE LIMIT TESTS ────────────────────────────────────────

Deno.test("checkInputSize: text within limit -> passes (null)", () => {
  return withEnv({ MAX_INPUT_CHARS: "1000" }, () => {
    assertEquals(checkInputSize("A".repeat(999), { "Access-Control-Allow-Origin": "*" }), null);
  });
});

Deno.test("checkInputSize: text exceeds limit -> 413", async () => {
  return withEnv({ MAX_INPUT_CHARS: "500" }, async () => {
    const result = checkInputSize("C".repeat(501), { "Access-Control-Allow-Origin": "*" });
    assertExists(result);
    assertEquals(result!.status, 413);
    const body = await result!.json();
    assertEquals(body.error, "Payload too large");
  });
});

Deno.test("getMaxInputChars: default is 2000000", () => {
  return withEnv({ MAX_INPUT_CHARS: undefined }, () => {
    assertEquals(getMaxInputChars(), 2_000_000);
  });
});

Deno.test("getMaxInputChars: respects env override", () => {
  return withEnv({ MAX_INPUT_CHARS: "50000" }, () => {
    assertEquals(getMaxInputChars(), 50000);
  });
});

// ─── INTEGRATION SCENARIO TESTS ────────────────────────────────────

Deno.test("INTEGRATION: internal call without Origin + valid key -> full success path", () => {
  return withEnv({
    INTERNAL_INGEST_KEY: "prod-secret-key",
    ALLOWED_ORIGINS: "https://myapp.com",
    ALLOW_WILDCARD_CORS: undefined,
  }, () => {
    // Simulate server-to-server call: no Origin, has x-internal-key
    const req = new Request("https://edge.supabase.co/functions/v1/vector-search", {
      method: "POST",
      headers: {
        "x-internal-key": "prod-secret-key",
        "Content-Type": "application/json",
      },
    });
    const result = handleCors(req);
    assertEquals(result.errorResponse, undefined);
    assertExists(result.corsHeaders);
    assertEquals((result as { mode: string }).mode, "internal");

    // Internal auth should also pass
    const authResult = validateInternalRequest(req, result.corsHeaders!);
    assertEquals(authResult, null);
  });
});

Deno.test("INTEGRATION: call without Origin and without key -> 403", async () => {
  return withEnv({
    INTERNAL_INGEST_KEY: "prod-secret-key",
    ALLOWED_ORIGINS: "https://myapp.com",
    ALLOW_WILDCARD_CORS: undefined,
  }, async () => {
    const req = new Request("https://edge.supabase.co/functions/v1/vector-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 403);
    await result.errorResponse!.text();
  });
});

Deno.test("INTEGRATION: browser from disallowed origin -> 403", async () => {
  return withEnv({
    INTERNAL_INGEST_KEY: "prod-secret-key",
    ALLOWED_ORIGINS: "https://myapp.com",
    ALLOW_WILDCARD_CORS: undefined,
  }, async () => {
    const req = new Request("https://edge.supabase.co/functions/v1/vector-search", {
      method: "POST",
      headers: {
        "Origin": "https://attacker.com",
        "Content-Type": "application/json",
      },
    });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 403);
    await result.errorResponse!.text();
  });
});

// ─── getRequestMode ────────────────────────────────────────────────

Deno.test("getRequestMode: valid internal key -> 'internal'", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "secret-123" }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "secret-123" },
    });
    assertEquals(getRequestMode(req), "internal");
  });
});

Deno.test("getRequestMode: no key -> 'browser'", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "secret-123" }, () => {
    const req = new Request("https://example.com", { method: "POST" });
    assertEquals(getRequestMode(req), "browser");
  });
});

Deno.test("getRequestMode: wrong key -> 'browser'", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "secret-123" }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "wrong" },
    });
    assertEquals(getRequestMode(req), "browser");
  });
});

// ─── buildInternalHeaders: x-request-id ────────────────────────────

Deno.test("buildInternalHeaders: includes x-request-id", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "my-key" }, () => {
    const headers = buildInternalHeaders();
    assertExists(headers["x-request-id"]);
    assertEquals(headers["x-request-id"].startsWith("req_"), true);
  });
});

Deno.test("buildInternalHeaders: x-request-id is unique per call", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "my-key" }, () => {
    const h1 = buildInternalHeaders();
    const h2 = buildInternalHeaders();
    assertEquals(h1["x-request-id"] !== h2["x-request-id"], true);
  });
});

Deno.test("buildInternalHeaders: extraHeaders x-request-id is preserved (not overwritten)", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "my-key" }, () => {
    const headers = buildInternalHeaders({ "x-request-id": "custom-trace-42" });
    assertEquals(headers["x-request-id"], "custom-trace-42");
  });
});

Deno.test("buildInternalHeaders: throws when INTERNAL_INGEST_KEY is missing", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    let threw = false;
    try {
      buildInternalHeaders();
    } catch (e) {
      threw = true;
      assertEquals((e as Error).message.includes("INTERNAL_INGEST_KEY"), true);
    }
    assertEquals(threw, true, "Expected buildInternalHeaders to throw");
  });
});

Deno.test("buildInternalHeaders: throws when INTERNAL_INGEST_KEY is empty string", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    let threw = false;
    try {
      buildInternalHeaders();
    } catch {
      threw = true;
    }
    assertEquals(threw, true, "Expected buildInternalHeaders to throw for empty key");
  });
});

Deno.test("getRequestMode: returns 'browser' when INTERNAL_INGEST_KEY is empty", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "" },
    });
    assertEquals(getRequestMode(req), "browser");
  });
});

Deno.test("getRequestMode: returns 'browser' when INTERNAL_INGEST_KEY is missing even if header present", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-key": "some-value" },
    });
    assertEquals(getRequestMode(req), "browser");
  });
});

// ─── callInternalFunction ──────────────────────────────────────────

Deno.test("callInternalFunction: sends POST with correct headers", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "test-key-abc" }, async () => {
    // Use a local echo-style check: call a non-existent URL and inspect the error
    // Instead we intercept via a minimal server
    const controller = new AbortController();
    const server = Deno.serve({ port: 0, signal: controller.signal, onListen() {} }, (req) => {
      const result = {
        method: req.method,
        hasInternalKey: req.headers.get("x-internal-key") === "test-key-abc",
        hasRequestId: !!req.headers.get("x-request-id"),
        requestIdPrefix: req.headers.get("x-request-id")?.startsWith("req_") ?? false,
        contentType: req.headers.get("content-type"),
      };
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const { callInternalFunction } = await import("./edge-security.ts");
    const port = server.addr.port;
    const res = await callInternalFunction(
      `http://localhost:${port}/test`,
      { foo: "bar" },
    );
    const data = await res.json();

    assertEquals(data.method, "POST");
    assertEquals(data.hasInternalKey, true);
    assertEquals(data.hasRequestId, true);
    assertEquals(data.requestIdPrefix, true);
    assertEquals(data.contentType, "application/json");

    controller.abort();
    await server.finished.catch(() => {});
  });
});

Deno.test({ name: "callInternalFunction: respects timeout", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "test-key" }, async () => {
    const srvController = new AbortController();
    const server = Deno.serve({ port: 0, signal: srvController.signal, onListen() {} }, async () => {
      await new Promise((r) => setTimeout(r, 5000));
      return new Response("too late");
    });

    const { callInternalFunction } = await import("./edge-security.ts");
    const port = server.addr.port;

    let threw = false;
    try {
      await callInternalFunction(
        `http://localhost:${port}/slow`,
        {},
        { timeoutMs: 200 },
      );
    } catch {
      threw = true;
    }

    assertEquals(threw, true, "Expected an error from timeout");

    srvController.abort();
    await server.finished.catch(() => {});
  });
}});
