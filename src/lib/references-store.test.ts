import { describe, it, expect, beforeEach } from "vitest";
import {
  getReferencesText,
  setReferencesText,
  appendReferenceBlock,
  clearReferences,
  clearAllReferences,
} from "./references-store";

const SEP = "\n\n---\n\n";
const CASE_A = "case-aaa";
const CASE_B = "case-bbb";

beforeEach(() => {
  clearAllReferences();
});

describe("references-store (per-case)", () => {
  it("starts empty for any caseId", () => {
    expect(getReferencesText(CASE_A)).toBe("");
    expect(getReferencesText(CASE_B)).toBe("");
  });

  it("setReferencesText replaces value for specific case", () => {
    setReferencesText(CASE_A, "block1");
    expect(getReferencesText(CASE_A)).toBe("block1");
    expect(getReferencesText(CASE_B)).toBe("");
  });

  it("appendReferenceBlock appends with separator per case", () => {
    appendReferenceBlock(CASE_A, "A");
    appendReferenceBlock(CASE_A, "B");
    appendReferenceBlock(CASE_B, "X");
    expect(getReferencesText(CASE_A)).toBe("A" + SEP + "B");
    expect(getReferencesText(CASE_B)).toBe("X");
  });

  it("appendReferenceBlock ignores empty/whitespace blocks", () => {
    appendReferenceBlock(CASE_A, "A");
    appendReferenceBlock(CASE_A, "");
    appendReferenceBlock(CASE_A, "   ");
    expect(getReferencesText(CASE_A)).toBe("A");
  });

  it("clearReferences resets only specific case", () => {
    appendReferenceBlock(CASE_A, "A");
    appendReferenceBlock(CASE_B, "B");
    clearReferences(CASE_A);
    expect(getReferencesText(CASE_A)).toBe("");
    expect(getReferencesText(CASE_B)).toBe("B");
  });

  it("clearAllReferences resets everything", () => {
    appendReferenceBlock(CASE_A, "A");
    appendReferenceBlock(CASE_B, "B");
    clearAllReferences();
    expect(getReferencesText(CASE_A)).toBe("");
    expect(getReferencesText(CASE_B)).toBe("");
  });

  it("clearReferences is idempotent", () => {
    clearReferences(CASE_A);
    clearReferences(CASE_A);
    expect(getReferencesText(CASE_A)).toBe("");
  });

  it("_global does not mix with per-case refs", () => {
    appendReferenceBlock("_global", "GlobalRef");
    appendReferenceBlock(CASE_A, "CaseRef");
    expect(getReferencesText("_global")).toBe("GlobalRef");
    expect(getReferencesText(CASE_A)).toBe("CaseRef");
    clearReferences("_global");
    expect(getReferencesText("_global")).toBe("");
    expect(getReferencesText(CASE_A)).toBe("CaseRef");
  });
});
