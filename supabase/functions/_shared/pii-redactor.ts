// =============================================================================
// PII REDACTOR \u2014 Strips personally identifiable information before logging
// =============================================================================
//
// Patterns cover Armenian (\u0531-\u058F) and Latin/Cyrillic names, phones,
// emails, passport numbers, Armenian SSN (tax ID), and dates of birth.
//
// Usage:
//   import { redactPII, redactForLog } from "../_shared/pii-redactor.ts";
//   console.log(redactForLog("User name: \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576"));
//   // => "User name: [NAME]"
// =============================================================================

/** Placeholder tokens */
const T = {
  NAME: "[NAME]",
  EMAIL: "[EMAIL]",
  PHONE: "[PHONE]",
  PASSPORT: "[PASSPORT]",
  SSN: "[SSN]",
  DOB: "[DOB]",
  ADDRESS: "[ADDRESS]",
} as const;

// ---------------------------------------------------------------------------
// Individual patterns (order matters \u2014 most specific first)
// ---------------------------------------------------------------------------

// Email: standard RFC-like pattern
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Phone: Armenian (+374), Russian (+7), international (+XX...), or local (0XX...)
const PHONE_RE = /(?:\+\d{1,3}[\s\-]?)?\(?\d{2,3}\)?[\s\-]?\d{2,3}[\s\-]?\d{2,4}[\s\-]?\d{0,4}/g;

// Armenian passport: AB1234567 or AM1234567 or \u0531\u0532 1234567
const PASSPORT_AM_RE = /(?:A[BM]|[\u0531-\u0535][\u0531-\u0535])\s?\d{7}/g;

// Russian passport: 1234 567890
const PASSPORT_RU_RE = /\d{4}\s\d{6}/g;

// Armenian SSN / tax ID: 10 digits
const SSN_AM_RE = /\b\d{10}\b/g;

// Date of birth patterns: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
const DOB_RE = /\b\d{2}[.\-\/]\d{2}[.\-\/]\d{4}\b/g;

// Armenian full name: 2-3 consecutive Armenian-script capitalized words
// e.g. \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576 or \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576 \u054D\u0561\u0580\u0563\u057D\u056B
const ARMENIAN_NAME_RE = /[\u0531-\u0556][\u0561-\u0587]+\s+[\u0531-\u0556][\u0561-\u0587]+(?:\s+[\u0531-\u0556][\u0561-\u0587]+)?/g;

// Latin full name: 2-3 consecutive capitalized Latin words (min 2 chars each)
const LATIN_NAME_RE = /[A-Z][a-z]{1,}\s+[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})?/g;

// Cyrillic full name: 2-3 consecutive capitalized Cyrillic words
const CYRILLIC_NAME_RE = /[\u0410-\u042F][\u0430-\u044F]+\s+[\u0410-\u042F][\u0430-\u044F]+(?:\s+[\u0410-\u042F][\u0430-\u044F]+)?/g;

// Armenian address keywords followed by content
// \u0570\u0561\u057D\u0581\u0565 (address), \u0583\u0578\u0572\u0578\u0581 (street), \u0577\u0565\u0576\u0584 (building)
const ADDRESS_AM_RE = /(?:\u0570\u0561\u057D\u0581\u0565|\u0583\u0578\u0572\u0578\u0581|\u0577\u0565\u0576\u0584|\u0562\u0576\.?|\u0570\u0561\u057D\u0581\u0565\u0561\u0563\u056B\u0580)[:\s]*[^\n,]{3,50}/gi;

// ---------------------------------------------------------------------------
// Common legal terms that look like names but aren\u2019t (false-positive guard)
// ---------------------------------------------------------------------------
const LEGAL_TERM_WHITELIST = new Set([
  // Armenian legal terms that start with uppercase
  "Supreme Court",
  "Court of Cassation",
  "Constitutional Court",
  "Criminal Code",
  "Civil Code",
  "Criminal Procedure",
  "Civil Procedure",
  "Administrative Procedure",
  "European Convention",
  "European Court",
  "Human Rights",
  "Republic Armenia",
  "General Jurisdiction",
  "Legal Practice",
  "Knowledge Base",
  "Charge Qualification",
  "Evidence Collector",
  "Evidence Admissibility",
  "Defense Strategy",
  "Procedural Violations",
  "Substantive Violations",
  "Fair Trial",
  "Legal Armenia",
]);

function isLegalTerm(match: string): boolean {
  const trimmed = match.trim();
  for (const term of LEGAL_TERM_WHITELIST) {
    if (trimmed === term || trimmed.startsWith(term)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Core redaction function
// ---------------------------------------------------------------------------

/**
 * Redact PII from a string. Returns a new string with PII replaced by tokens.
 *
 * @param text  Input text (may contain Armenian, Russian, Latin PII)
 * @param opts  Optional overrides for which categories to redact
 */
export function redactPII(
  text: string,
  opts: {
    names?: boolean;
    emails?: boolean;
    phones?: boolean;
    passports?: boolean;
    ssn?: boolean;
    dob?: boolean;
    addresses?: boolean;
  } = {}
): string {
  const {
    names = true,
    emails = true,
    phones = true,
    passports = true,
    ssn = true,
    dob = true,
    addresses = true,
  } = opts;

  let result = text;

  // Order: most specific (low false-positive) first
  if (emails) result = result.replace(EMAIL_RE, T.EMAIL);
  if (passports) {
    result = result.replace(PASSPORT_AM_RE, T.PASSPORT);
    result = result.replace(PASSPORT_RU_RE, T.PASSPORT);
  }
  if (phones) result = result.replace(PHONE_RE, T.PHONE);
  if (ssn) result = result.replace(SSN_AM_RE, T.SSN);
  if (dob) result = result.replace(DOB_RE, T.DOB);
  if (addresses) result = result.replace(ADDRESS_AM_RE, T.ADDRESS);

  // Names last (broadest pattern, highest false-positive risk)
  if (names) {
    result = result.replace(ARMENIAN_NAME_RE, (m) => (isLegalTerm(m) ? m : T.NAME));
    result = result.replace(CYRILLIC_NAME_RE, (m) => (isLegalTerm(m) ? m : T.NAME));
    result = result.replace(LATIN_NAME_RE, (m) => (isLegalTerm(m) ? m : T.NAME));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Redact PII and truncate to a safe length for logging.
 * Use this around every `console.log` that may contain user content.
 */
export function redactForLog(text: string, maxLen = 500): string {
  const redacted = redactPII(text);
  return redacted.length > maxLen ? redacted.substring(0, maxLen) + "...[truncated]" : redacted;
}

/**
 * Redact PII in AI-generated output when user requests anonymized draft.
 * Applies all categories by default.
 */
export function redactAIOutput(text: string): string {
  return redactPII(text, {
    names: true,
    emails: true,
    phones: true,
    passports: true,
    ssn: true,
    dob: true,
    addresses: true,
  });
}

/**
 * Build a safe metadata object for logging, stripping PII from string values.
 */
export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = redactPII(value);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
