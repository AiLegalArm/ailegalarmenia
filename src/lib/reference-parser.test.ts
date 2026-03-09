import { describe, it, expect } from "vitest";
import { parseReferences, type SourceRef } from "./reference-parser";

const mkBlock = (json: Record<string, unknown>, header = "[Test]", snippet = "Some text") =>
  `${header}\n${snippet}\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\``;

describe("parseReferences", () => {
  it("returns empty for empty input", () => {
    expect(parseReferences("")).toEqual({ sources: [], rawBlocks: [] });
    expect(parseReferences("  ")).toEqual({ sources: [], rawBlocks: [] });
  });

  it("parses a single KB reference", () => {
    const json = { source: "kb", docId: "abc-123", chunkIndex: 2, title: "Art 51", meta: { article: "51" } };
    const text = mkBlock(json);
    const result = parseReferences(text);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toEqual<SourceRef>({
      source: "kb",
      docId: "abc-123",
      chunkIndex: 2,
      title: "Art 51",
      meta: { article: "51" },
      snippetOnly: false,
    });
  });

  it("parses a practice reference with snippet_only", () => {
    const json = { source: "practice", docId: "def-456", chunkIndex: -1, title: "Case X", meta: { court: "cassation" }, snippet_only: true };
    const text = mkBlock(json);
    const result = parseReferences(text);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].snippetOnly).toBe(true);
    expect(result.sources[0].chunkIndex).toBe(-1);
  });

  it("parses multiple blocks separated by ---", () => {
    const b1 = mkBlock({ source: "kb", docId: "a", chunkIndex: 0, title: "A", meta: {} });
    const b2 = mkBlock({ source: "practice", docId: "b", chunkIndex: 1, title: "B", meta: { outcome: "granted" } });
    const text = b1 + "\n\n---\n\n" + b2;
    const result = parseReferences(text);
    expect(result.sources).toHaveLength(2);
    expect(result.rawBlocks).toHaveLength(2);
    expect(result.sources[0].docId).toBe("a");
    expect(result.sources[1].docId).toBe("b");
  });

  it("skips blocks with invalid source", () => {
    const text = mkBlock({ source: "unknown", docId: "x", chunkIndex: 0, title: "T", meta: {} });
    expect(parseReferences(text).sources).toHaveLength(0);
  });

  it("skips blocks with missing docId", () => {
    const text = mkBlock({ source: "kb", docId: "", chunkIndex: 0, title: "T", meta: {} });
    expect(parseReferences(text).sources).toHaveLength(0);
  });

  it("skips blocks with non-integer chunkIndex", () => {
    const text = mkBlock({ source: "kb", docId: "x", chunkIndex: NaN, title: "T", meta: {} });
    expect(parseReferences(text).sources).toHaveLength(0);
    const text2 = mkBlock({ source: "kb", docId: "x", chunkIndex: 1.5, title: "T", meta: {} });
    expect(parseReferences(text2).sources).toHaveLength(0);
  });

  it("skips malformed JSON", () => {
    const text = "[Header]\nSnippet\n```json\n{broken json\n```";
    expect(parseReferences(text).sources).toHaveLength(0);
    expect(parseReferences(text).rawBlocks).toHaveLength(1);
  });

  it("skips blocks without JSON fence", () => {
    const text = "[Header]\nJust plain text, no JSON";
    const result = parseReferences(text);
    expect(result.sources).toHaveLength(0);
    expect(result.rawBlocks).toHaveLength(1);
  });

  it("coerces non-string meta values to strings", () => {
    const text = mkBlock({ source: "kb", docId: "x", chunkIndex: 0, title: "T", meta: { num: 42, flag: true } });
    const result = parseReferences(text);
    expect(result.sources[0].meta).toEqual({ num: "42", flag: "true" });
  });

  it("strips null meta values", () => {
    const text = mkBlock({ source: "kb", docId: "x", chunkIndex: 0, title: "T", meta: { a: "ok", b: null } });
    const result = parseReferences(text);
    expect(result.sources[0].meta).toEqual({ a: "ok" });
  });

  it("infers snippetOnly from chunkIndex=-1 even without snippet_only field", () => {
    const text = mkBlock({ source: "practice", docId: "x", chunkIndex: -1, title: "T", meta: {} });
    expect(parseReferences(text).sources[0].snippetOnly).toBe(true);
  });

  it("preserves insertion order", () => {
    const blocks = ["a", "b", "c"].map((id) =>
      mkBlock({ source: "kb", docId: id, chunkIndex: 0, title: id, meta: {} })
    );
    const result = parseReferences(blocks.join("\n\n---\n\n"));
    expect(result.sources.map((s) => s.docId)).toEqual(["a", "b", "c"]);
  });

  it("parses with \\r\\n line endings", () => {
    const json = { source: "kb", docId: "crlf-1", chunkIndex: 0, title: "CRLF", meta: {} };
    const text = `[Header]\r\nSnippet\r\n\`\`\`json\r\n${JSON.stringify(json)}\r\n\`\`\``;
    const result = parseReferences(text);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].docId).toBe("crlf-1");
  });

  it("handles multiple json fences, first valid wins", () => {
    const bad = `\`\`\`json\n{broken}\n\`\`\``;
    const good = { source: "practice", docId: "multi-1", chunkIndex: 0, title: "OK", meta: {} };
    const goodFence = `\`\`\`json\n${JSON.stringify(good)}\n\`\`\``;
    const ignored = { source: "kb", docId: "multi-2", chunkIndex: 1, title: "Ignored", meta: {} };
    const ignoredFence = `\`\`\`json\n${JSON.stringify(ignored)}\n\`\`\``;
    const block = `[Header]\nText\n${bad}\n${goodFence}\n${ignoredFence}`;
    const result = parseReferences(block);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].docId).toBe("multi-1");
  });
});
