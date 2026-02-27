/**
 * rate-limiter.ts — Shared per-user rate limiting and budget caps.
 *
 * Uses api_usage table + role_limits table.
 * Call checkRateLimits() BEFORE calling AI.
 */

import { log, warn } from "./safe-logger.ts";

// ── Pricing map (per 1K tokens) ────────────────────────────────────────────
export const MODEL_PRICING: Record<string, { input_per_1k: number; output_per_1k: number }> = {
  "google/gemini-2.5-flash":      { input_per_1k: 0.000075, output_per_1k: 0.0003 },
  "google/gemini-2.5-flash-lite": { input_per_1k: 0.000025, output_per_1k: 0.0001 },
  "google/gemini-2.5-pro":        { input_per_1k: 0.00125,  output_per_1k: 0.01 },
  "google/gemini-3-flash-preview":{ input_per_1k: 0.0001,   output_per_1k: 0.0004 },
  "google/gemini-3-pro-preview":  { input_per_1k: 0.0015,   output_per_1k: 0.01 },
  "openai/gpt-5":                 { input_per_1k: 0.005,    output_per_1k: 0.015 },
  "openai/gpt-5-mini":            { input_per_1k: 0.0004,   output_per_1k: 0.0016 },
  "openai/gpt-5-nano":            { input_per_1k: 0.0001,   output_per_1k: 0.0004 },
  "openai/gpt-5.2":               { input_per_1k: 0.008,    output_per_1k: 0.024 },
};

/**
 * Compute cost from model + token usage.
 * Returns { cost_usd, cost_unknown }.
 */
export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { cost_usd: number; cost_unknown: boolean } {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return { cost_usd: 0, cost_unknown: true };
  return {
    cost_usd:
      (inputTokens / 1000) * pricing.input_per_1k +
      (outputTokens / 1000) * pricing.output_per_1k,
    cost_unknown: false,
  };
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: "hourly_limit_exceeded" | "monthly_token_exceeded" | "monthly_cost_exceeded";
  message?: string;
  status?: 429 | 402;
}

/**
 * Check rate limits for a user before calling AI.
 * @param supabase - Service-role client
 * @param userId - User ID
 * @param functionName - For audit log context
 * @param corsHeaders - For error responses
 */
export async function checkRateLimits(
  supabase: { from: (t: string) => unknown; rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  userId: string,
  functionName: string,
): Promise<RateLimitResult> {
  const sb = supabase as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
          gte: (col: string, val: string) => {
            select: (cols: string, opts?: { count: string; head: boolean }) => Promise<{ count: number | null; error: unknown }>;
          };
        };
        in: (col: string, vals: string[]) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        };
      };
    };
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  try {
    // 1. Get user's role
    const { data: roleRow } = await sb.from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const userRole = (roleRow as { role: string } | null)?.role || "client";

    // 2. Get limits for this role
    const { data: limits } = await sb.from("role_limits")
      .select("hourly_limit, monthly_token_limit, monthly_cost_limit")
      .eq("role", userRole)
      .maybeSingle();

    if (!limits) {
      // No limits configured — allow by default
      return { allowed: true };
    }

    const { hourly_limit, monthly_token_limit, monthly_cost_limit } = limits as {
      hourly_limit: number;
      monthly_token_limit: number;
      monthly_cost_limit: number;
    };

    // 3. Count hourly requests
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count: hourlyCount, error: hourlyErr } = await sb.from("api_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);

    if (!hourlyErr && hourlyCount !== null && hourlyCount >= hourly_limit) {
      // Log to audit
      await logRateLimitEvent(supabase, userId, functionName, "rate_limit_exceeded", {
        hourly_count: hourlyCount,
        hourly_limit,
      });
      warn("rate-limiter", "Hourly limit exceeded", { userId, hourlyCount, hourly_limit, fn: functionName });
      return {
        allowed: false,
        reason: "hourly_limit_exceeded",
        message: `Rate limit exceeded (${hourlyCount}/${hourly_limit} per hour). Please try again later.`,
        status: 429,
      };
    }

    // 4. Check monthly usage (tokens + cost)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    // Use RPC or raw query for SUM — simplified approach via count
    const { data: monthlyData } = await sb.rpc("get_monthly_usage_summary", {
      _user_id: userId,
      _month_start: monthStartIso,
    });

    if (monthlyData) {
      const { total_tokens, total_cost } = monthlyData as {
        total_tokens: number;
        total_cost: number;
      };

      if (total_tokens >= monthly_token_limit) {
        await logRateLimitEvent(supabase, userId, functionName, "budget_cap_exceeded", {
          total_tokens,
          monthly_token_limit,
          type: "tokens",
        });
        warn("rate-limiter", "Monthly token cap exceeded", { userId, total_tokens, monthly_token_limit });
        return {
          allowed: false,
          reason: "monthly_token_exceeded",
          message: `Monthly token budget exceeded (${total_tokens.toLocaleString()}/${monthly_token_limit.toLocaleString()}).`,
          status: 402,
        };
      }

      if (total_cost >= monthly_cost_limit) {
        await logRateLimitEvent(supabase, userId, functionName, "budget_cap_exceeded", {
          total_cost,
          monthly_cost_limit,
          type: "cost",
        });
        warn("rate-limiter", "Monthly cost cap exceeded", { userId, total_cost, monthly_cost_limit });
        return {
          allowed: false,
          reason: "monthly_cost_exceeded",
          message: `Monthly cost budget exceeded ($${total_cost.toFixed(2)}/$${monthly_cost_limit.toFixed(2)}).`,
          status: 402,
        };
      }
    }

    return { allowed: true };
  } catch (e) {
    // Fail-open: if rate limiter itself fails, allow the request but log
    warn("rate-limiter", "Rate limit check failed, allowing request", e);
    return { allowed: true };
  }
}

async function logRateLimitEvent(
  supabase: { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  userId: string,
  functionName: string,
  eventType: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await (supabase as { from: (t: string) => { insert: (row: unknown) => Promise<unknown> } })
      .from("audit_logs")
      .insert({
        user_id: userId,
        action: eventType,
        table_name: "api_usage",
        details: { function: functionName, ...details },
      });
  } catch {
    // Silent — audit log failure should not block
  }
}
