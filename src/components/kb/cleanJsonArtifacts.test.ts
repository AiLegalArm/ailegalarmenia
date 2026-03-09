import { describe, it, expect } from "vitest";

/**
 * Copy of cleanJsonArtifacts logic for isolated testing.
 */
function renderValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(renderValue).filter(Boolean).join(", ");
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    for (const key of ["text", "title", "name", "value", "description"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    const parts = Object.entries(obj)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => {
        const rendered = renderValue(v);
        return rendered ? `${k}: ${rendered}` : "";
      })
      .filter(Boolean);
    return parts.join("; ");
  }
  return String(val);
}

function cleanJsonArtifacts(text: string): string {
  if (!text) return "";

  const trimmed = text.trimStart();
  const shouldTryParse =
    trimmed.length < 5000 &&
    trimmed.startsWith("{") &&
    trimmed.endsWith("}") &&
    /"(?:text|title|value|name|description)"\s*:/.test(trimmed);

  if (shouldTryParse) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return renderValue(parsed);
      }
    } catch { /* not valid JSON, fall through */ }
  }

  return text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t");
}

describe("cleanJsonArtifacts", () => {
  it("extracts text from valid JSON with known key", () => {
    const input = '{"text": "Some legal content"}';
    expect(cleanJsonArtifacts(input)).toBe("Some legal content");
  });

  it("does NOT parse Armenian text with braces", () => {
    const armenian = "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B {\u0570\u0578\u0564\u057E\u0561\u056E 51} \u0570\u0561\u0574\u0561\u0571\u0561\u0575\u0576";
    expect(cleanJsonArtifacts(armenian)).toBe(armenian);
  });

  it("does NOT parse text starting with [ (array)", () => {
    const input = '["item1", "item2"]';
    expect(cleanJsonArtifacts(input)).toBe(input);
  });

  it("does NOT parse JSON without known content keys", () => {
    const input = '{"foo": "bar", "baz": 123}';
    expect(cleanJsonArtifacts(input)).toBe(input);
  });

  it("does NOT parse large JSON-like strings", () => {
    const longText = '{"text": "' + "x".repeat(6000) + '"}';
    expect(cleanJsonArtifacts(longText)).toBe(longText);
  });

  it("unescapes \\n and \\\" in normal text", () => {
    const input = 'Line1\\nLine2 says \\"hello\\"';
    expect(cleanJsonArtifacts(input)).toBe('Line1\nLine2 says "hello"');
  });

  it("returns empty for empty input", () => {
    expect(cleanJsonArtifacts("")).toBe("");
  });

  it("preserves Armenian legal text without braces", () => {
    const text = "\u0540\u0578\u0564\u057E\u0561\u056E 390 \u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u0580\u0584\u056B";
    expect(cleanJsonArtifacts(text)).toBe(text);
  });

  it("handles malformed JSON gracefully", () => {
    const input = '{"text": "unclosed';
    expect(cleanJsonArtifacts(input)).toBe(input);
  });
});
