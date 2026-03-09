/**
 * temporal-warning.ts — Unified temporal behavior for AI functions.
 *
 * When reference_date is missing or unresolvable:
 * 1. Adds temporal_warning field to response (backward-compatible)
 * 2. Logs to audit_logs with event_type = "temporal_reference_date_missing"
 * 3. If strict_temporal=true, returns 400
 */

import { warn } from "./safe-logger.ts";

export interface TemporalContext {
  referenceDate: string | null;
  dateAssumed: boolean;
  strictTemporal: boolean;
}

export const TEMPORAL_WARNING_TEXT =
  "⚠️ reference_date was not resolved from case data. " +
  "Legal norms may include versions outside the relevant timeframe. " +
  "For accurate temporal filtering, set court_date on the case or pass caseDate explicitly.";

export const TEMPORAL_WARNING_TEXT_HY =
  "⚠️ Գործdelays delays date- delays 延 delays延 Ժdelays mantemporaldate-ight hy-ext " +
  "reference_date-ÁÁ delaysFetch delaysDeadlineCalendarg hy-ext. hy-ext-ight.";

/**
 * Log temporal warning to audit_logs.
 */
export async function logTemporalWarning(
  supabase: { from: (t: string) => { insert: (row: unknown) => Promise<unknown> } },
  userId: string,
  functionName: string,
  caseId?: string | null,
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "temporal_reference_date_missing",
      table_name: "cases",
      record_id: caseId || null,
      details: {
        function: functionName,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Silent — audit failure should not block
  }
  warn("temporal-warning", `reference_date missing in ${functionName}`, { userId, caseId });
}

/**
 * Build a strict_temporal error response.
 */
export function buildStrictTemporalError(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "strict_temporal_violation",
      message:
        "strict_temporal is enabled but reference_date could not be resolved. " +
        "Provide caseDate or ensure the case has court_date set.",
    }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
