// =============================================================================
// SAFE STRUCTURED LOGGER \u2014 Drop-in replacement for console.log/warn/error
// =============================================================================
//
// All user-facing content is PII-redacted and truncated before logging.
// Structured JSON output for machine-parseable log aggregation.
//
// Usage:
//   import { log, warn, err } from "../_shared/safe-logger.ts";
//   log("ocr-process", "File processed", { chars: 1200 });
//   warn("legal-chat", "Slow RAG query", { ms: 3200 });
//   err("ai-analyze", "Gateway error", error);
// =============================================================================

import { redactForLog, redactObject } from "./pii-redactor.ts";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  lvl: LogLevel;
  fn: string;
  msg: string;
  meta?: Record<string, unknown>;
}

/** Max length for any string value in meta before truncation */
const MAX_META_STRING = 500;

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const redacted = redactObject(meta);
  // Truncate long string values
  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === "string" && value.length > MAX_META_STRING) {
      redacted[key] = value.substring(0, MAX_META_STRING) + "...[truncated]";
    }
  }
  return redacted;
}

function emit(level: LogLevel, fn: string, msg: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    lvl: level,
    fn,
    msg: redactForLog(msg, 300),
    ...(meta ? { meta: sanitizeMeta(meta) } : {}),
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

/** Structured info log with PII redaction */
export function log(fn: string, msg: string, meta?: Record<string, unknown>) {
  emit("info", fn, msg, meta);
}

/** Structured warning log with PII redaction */
export function warn(fn: string, msg: string, meta?: Record<string, unknown>) {
  emit("warn", fn, msg, meta);
}

/** Structured error log with PII redaction. Accepts Error objects in meta. */
export function err(fn: string, msg: string, error?: unknown, meta?: Record<string, unknown>) {
  const errorMeta: Record<string, unknown> = { ...meta };
  if (error instanceof Error) {
    errorMeta.error_name = error.name;
    errorMeta.error_message = error.message;
  } else if (error !== undefined) {
    errorMeta.error_raw = String(error).substring(0, 500);
  }
  emit("error", fn, msg, Object.keys(errorMeta).length > 0 ? errorMeta : undefined);
}
