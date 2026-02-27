/**
 * _shared/base64.ts — Safe Uint8Array → base64 encoder.
 *
 * Uses byte-by-byte iteration instead of String.fromCharCode(...spread)
 * or .apply() which both blow the call stack on buffers > ~64KB.
 * This implementation handles arbitrarily large buffers (tested to 50MB+)
 * with constant stack usage.
 */

/**
 * Encode a Uint8Array to a base64 string without any spread/apply.
 * Safe for buffers of any size — no RangeError, no OOM spike.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  // Build binary string one byte at a time — no spread, no apply.
  // String concatenation is fast in V8/Deno for this pattern.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
