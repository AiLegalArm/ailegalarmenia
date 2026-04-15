#!/usr/bin/env -S deno run --allow-env --allow-net
/**
 * Reports null coverage for `embedding` and `embedding_legacy_768` for:
 * - knowledge_base
 * - legal_practice_kb
 * - legal_chunks
 *
 * Uses Supabase REST via service role key (read-only).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function getEnvAny(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`${names.join(" or ")} is required`);
}

type Table = "knowledge_base" | "legal_practice_kb" | "legal_chunks";

async function countWhere(
  supabase: ReturnType<typeof createClient>,
  table: Table,
  filter: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);
  q = filter(q as unknown as ReturnType<typeof supabase.from>);
  const { count, error } = await q;
  if (error) throw new Error(`[${table}] count failed: ${error.message}`);
  return count || 0;
}

async function main() {
  const supabase = createClient(
    getEnvAny(["SUPABASE_URL", "VITE_SUPABASE_URL"]),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const tables: Table[] = ["knowledge_base", "legal_practice_kb", "legal_chunks"];

  for (const t of tables) {
    const total = await countWhere(supabase, t, (q) => q);
    const legacyNull = await countWhere(supabase, t, (q) => q.is("embedding_legacy_768", null));
    const primaryNull = await countWhere(supabase, t, (q) => q.is("embedding", null));
    console.log(`[coverage] table=${t} total=${total} legacy_null=${legacyNull} primary_null=${primaryNull}`);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("[coverage] fatal:", e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  });
}
