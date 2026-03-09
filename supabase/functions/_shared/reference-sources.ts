// =============================================================================
// SHARED: Reference Sources Parser & Prompt Builder
// Single source-of-truth for parsing user-selected KB/practice references
// and building the prompt-ready SOURCES block.
// =============================================================================

export type SourceKind = "kb" | "practice";

export interface ParsedSourceRef {
  source: SourceKind;
  docId: string;
  chunkIndex: number;
  title: string;
  meta: Record<string, string>;
  snippetOnly: boolean;
  snippetText: string;
}

export interface ParseResult {
  refs: ParsedSourceRef[];
  rawBlocks: string[];
}

const VALID_SOURCES = new Set<SourceKind>(["kb", "practice"]);
const JSON_FENCE_RE = /```json\s*\n([\s\S]*?)\n```/g;
const SNIPPET_CAP = 1200;

/**
 * Parse referencesText (as assembled by KBSearchPanel) into structured refs.
 * Each ref carries its snippet extracted from the SAME block — no index drift.
 */
export function parseReferencesText(referencesText: string): ParseResult {
  const norm = referencesText.replace(/\r\n/g, "\n");
  const rawBlocks = norm
    .split("\n\n---\n\n")
    .filter((b) => b.trim().length > 0);

  const refs: ParsedSourceRef[] = [];

  for (const block of rawBlocks) {
    const re = new RegExp(JSON_FENCE_RE.source, JSON_FENCE_RE.flags);
    let m: RegExpExecArray | null;

    while ((m = re.exec(block)) !== null) {
      try {
        const obj = JSON.parse(m[1]);
        if (
          typeof obj !== "object" || obj === null ||
          typeof obj.source !== "string" || !VALID_SOURCES.has(obj.source as SourceKind) ||
          typeof obj.docId !== "string" || obj.docId.length === 0 ||
          typeof obj.chunkIndex !== "number" || !Number.isInteger(obj.chunkIndex)
        ) {
          continue; // try next fence in the same block
        }

        const title = typeof obj.title === "string" ? obj.title : "";
        const meta: Record<string, string> = {};
        if (typeof obj.meta === "object" && obj.meta !== null && !Array.isArray(obj.meta)) {
          for (const [k, v] of Object.entries(obj.meta as Record<string, unknown>)) {
            if (v != null && String(v).length > 0) meta[k] = String(v);
          }
        }

        // Snippet = everything in THIS block before the first json fence
        const fenceIdx = block.indexOf("```json");
        let snippetText = fenceIdx > 0 ? block.substring(0, fenceIdx).trim() : "";
        if (snippetText.length > SNIPPET_CAP) {
          snippetText = snippetText.substring(0, SNIPPET_CAP) + "…";
        }

        refs.push({
          source: obj.source as SourceKind,
          docId: obj.docId,
          chunkIndex: obj.chunkIndex,
          title,
          meta,
          snippetOnly: obj.snippet_only === true || obj.chunkIndex === -1,
          snippetText,
        });

        break; // first valid per block
      } catch {
        /* skip malformed JSON, try next fence */
      }
    }
  }

  return { refs, rawBlocks };
}

/**
 * Build the prompt-ready SOURCES block from parsed refs.
 * Returns empty string if no refs.
 */
export function buildUserSourcesBlock(refs: ParsedSourceRef[]): string {
  if (refs.length === 0) return "";

  const lines: string[] = [];

  lines.push("\n## ════════════════════════════════════════════════");
  lines.push("## USER-SELECTED SOURCES (MANDATORY REFERENCE)");
  lines.push("## ════════════════════════════════════════════════\n");
  lines.push(
    "IMPORTANT: You MUST cite these sources in your analysis. " +
    "Each citation must reference the source docId and chunkIndex. " +
    "If these sources are insufficient for a complete analysis, explicitly state which areas lack source coverage.\n"
  );

  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    lines.push(`### Source ${i + 1}: ${r.title}`);
    lines.push(`[docId: ${r.docId}, chunkIndex: ${r.chunkIndex}, type: ${r.source}, snippetOnly: ${r.snippetOnly}]`);
    if (Object.keys(r.meta).length > 0) {
      lines.push(`Meta: ${JSON.stringify(r.meta)}`);
    }
    if (r.snippetText) {
      lines.push(`Content:\n${r.snippetText}`);
    }
    lines.push("");
  }

  lines.push("## ════════════════════════════════════════════════");
  lines.push("## END USER-SELECTED SOURCES");
  lines.push("## ════════════════════════════════════════════════\n");

  return lines.join("\n");
}
