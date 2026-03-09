/**
 * Extracts the meaningful error message from a Supabase FunctionsInvokeError
 * returned when edge function returns non-2xx status.
 */
export function getFunctionsInvokeErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Unknown error";

  const anyErr = error as Record<string, unknown>;

  // 1. Supabase v2.90+ stores parsed body under `context.body` (string or object)
  const ctx = anyErr.context;
  if (ctx && typeof ctx === "object") {
    const ctxObj = ctx as Record<string, unknown>;
    // context.body can be already-parsed JSON object
    if (ctxObj.body && typeof ctxObj.body === "object") {
      const body = ctxObj.body as Record<string, unknown>;
      if (typeof body.error === "string" && body.error.trim()) return body.error;
      if (typeof body.message === "string" && body.message.trim()) return body.message;
    }
    // or it can be raw string
    if (typeof ctxObj.body === "string" && ctxObj.body.trim()) {
      try {
        const parsed = JSON.parse(ctxObj.body);
        if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error;
        if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
      } catch {
        // plain text
        return ctxObj.body;
      }
    }
  }

  // 2. Some versions expose `.body` directly on error (deprecated path)
  if ("body" in anyErr) {
    const directBody = anyErr.body;
    if (directBody && typeof directBody === "object") {
      const body = directBody as Record<string, unknown>;
      if (typeof body.error === "string" && body.error.trim()) return body.error;
      if (typeof body.message === "string" && body.message.trim()) return body.message;
    }
    if (typeof directBody === "string" && directBody.trim()) {
      try {
        const parsed = JSON.parse(directBody);
        if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error;
        if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
      } catch {
        return directBody;
      }
    }
  }

  // 3. Fall back to error.message
  if (typeof anyErr.message === "string" && anyErr.message.trim()) return anyErr.message;

  return "Unknown error";
}

export function isNoDataForExtractionMessage(msg: string): boolean {
  return msg.toLowerCase().includes("no data available");
}
