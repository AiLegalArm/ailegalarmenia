/**
 * Shared test utilities for Edge Function tests.
 * Provides mock helpers for Supabase client, JWT headers, and handler invocation.
 * NO real network calls — everything is mocked.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MockQueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface MockAuthResult {
  data: { user: { id: string; email: string } | null };
  error: { message: string } | null;
}

export interface MockSupabaseClient {
  auth: {
    getUser: () => Promise<MockAuthResult>;
  };
  from: (table: string) => MockQueryBuilder;
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<MockQueryResult>;
    };
  };
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<MockQueryResult>;
  _calls: { table: string; method: string; args: unknown[] }[];
}

export interface MockQueryBuilder {
  select: (cols?: string) => MockQueryBuilder;
  insert: (data: unknown) => MockQueryBuilder;
  update: (data: unknown) => MockQueryBuilder;
  delete: () => MockQueryBuilder;
  eq: (col: string, val: unknown) => MockQueryBuilder;
  neq: (col: string, val: unknown) => MockQueryBuilder;
  in: (col: string, vals: unknown[]) => MockQueryBuilder;
  is: (col: string, val: unknown) => MockQueryBuilder;
  or: (conditions: string) => MockQueryBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => MockQueryBuilder;
  limit: (n: number) => MockQueryBuilder;
  single: () => Promise<MockQueryResult>;
  maybeSingle: () => Promise<MockQueryResult>;
  then: (resolve: (value: MockQueryResult) => void) => Promise<void>;
}

// ─── Mock Supabase Client ───────────────────────────────────────────────────

/**
 * Create a mock Supabase client with configurable responses.
 * Tracks all calls for assertion (spy-like behavior).
 */
export function createMockSupabaseClient(opts: {
  /** Auth user to return (null = unauthorized) */
  user?: { id: string; email: string } | null;
  /** Table query responses: { "cases": { data: [...], error: null } } */
  tableResponses?: Record<string, MockQueryResult>;
  /** Default response for unregistered tables */
  defaultResponse?: MockQueryResult;
}): MockSupabaseClient {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const tableResponses = opts.tableResponses || {};
  const defaultResponse: MockQueryResult = opts.defaultResponse || { data: [], error: null };
  const authUser = opts.user === undefined ? null : opts.user;

  function createQueryBuilder(table: string): MockQueryBuilder {
    const response = tableResponses[table] || defaultResponse;

    const builder: MockQueryBuilder = {
      select: (cols?: string) => { calls.push({ table, method: "select", args: [cols] }); return builder; },
      insert: (data: unknown) => { calls.push({ table, method: "insert", args: [data] }); return builder; },
      update: (data: unknown) => { calls.push({ table, method: "update", args: [data] }); return builder; },
      delete: () => { calls.push({ table, method: "delete", args: [] }); return builder; },
      eq: (col: string, val: unknown) => { calls.push({ table, method: "eq", args: [col, val] }); return builder; },
      neq: (col: string, val: unknown) => { calls.push({ table, method: "neq", args: [col, val] }); return builder; },
      in: (col: string, vals: unknown[]) => { calls.push({ table, method: "in", args: [col, vals] }); return builder; },
      is: (col: string, val: unknown) => { calls.push({ table, method: "is", args: [col, val] }); return builder; },
      or: (conditions: string) => { calls.push({ table, method: "or", args: [conditions] }); return builder; },
      order: (col: string, o?: { ascending?: boolean }) => { calls.push({ table, method: "order", args: [col, o] }); return builder; },
      limit: (n: number) => { calls.push({ table, method: "limit", args: [n] }); return builder; },
      single: () => Promise.resolve(response),
      maybeSingle: () => Promise.resolve(response),
      then: (resolve) => Promise.resolve(resolve(response)),
    };
    return builder;
  }

  return {
    auth: {
      getUser: () => Promise.resolve({
        data: { user: authUser },
        error: authUser ? null : { message: "not_authenticated" },
      }),
    },
    from: (table: string) => {
      calls.push({ table, method: "from", args: [table] });
      return createQueryBuilder(table);
    },
    storage: {
      from: (_bucket: string) => ({
        download: (path: string) => {
          calls.push({ table: `storage:${_bucket}`, method: "download", args: [path] });
          return Promise.resolve(defaultResponse);
        },
      }),
    },
    rpc: (fn: string, params?: Record<string, unknown>) => {
      calls.push({ table: `rpc:${fn}`, method: "rpc", args: [params] });
      return Promise.resolve(defaultResponse);
    },
    _calls: calls,
  };
}

// ─── JWT Helpers ────────────────────────────────────────────────────────────

/** Create a fake Authorization header for testing */
export function fakeAuthHeader(userId = "test-user-id"): Record<string, string> {
  // Not a real JWT — just a base64-encoded mock for handler validation
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: userId, role: "authenticated", exp: Date.now() / 1000 + 3600 }));
  const signature = "fake_signature";
  return { Authorization: `Bearer ${header}.${payload}.${signature}` };
}

/** Headers WITHOUT Authorization */
export function noAuthHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

// ─── Call Count Helpers ─────────────────────────────────────────────────────

/** Count calls to a specific table */
export function countTableCalls(client: MockSupabaseClient, table: string): number {
  return client._calls.filter((c) => c.table === table).length;
}

/** Assert no calls were made to a specific table (e.g., no service_role reads) */
export function assertNoCallsTo(client: MockSupabaseClient, table: string): void {
  const count = countTableCalls(client, table);
  if (count > 0) {
    throw new Error(`Expected 0 calls to "${table}", but found ${count}`);
  }
}
