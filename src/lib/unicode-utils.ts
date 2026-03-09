/**
 * Decode double-escaped Unicode sequences at runtime.
 * Converts literal "\\uXXXX" (6-char sequences in the string) into actual characters.
 * Already-decoded text passes through unchanged. No eval.
 *
 * Examples:
 *   decodeUnicodeEscapes("\\u0531\\u057C\\u0561\\u057B\\u056B\\u0576") => "\u0531\u057C\u0561\u057B\u056B\u0576"
 *   decodeUnicodeEscapes("\u0531\u057C\u0561\u057B\u056B\u0576") => "\u0531\u057C\u0561\u057B\u056B\u0576" (unchanged)
 *   decodeUnicodeEscapes("Hello") => "Hello" (unchanged)
 *   decodeUnicodeEscapes("") => ""
 */
export function decodeUnicodeEscapes(input: string): string {
  if (!input) return input;
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}
