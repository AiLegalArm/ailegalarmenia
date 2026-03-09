/**
 * Parse structured source references from inserted reference text blocks.
 *
 * Each block contains:
 *   [Header line]
 *   Snippet text
 *   ```json {"source":"kb","docId":"...","chunkIndex":0,"title":"...","meta":{...}} ```
 *
 * Multiple blocks are separated by "\n\n---\n\n".
 */

export interface SourceRef {
  source: "kb" | "practice";
  docId: string;
  chunkIndex: number;
  title: string;
  meta: Record<string, string>;
  snippetOnly: boolean;
}

export interface ParsedReferences {
  sources: SourceRef[];
  rawBlocks: string[];
}

const VALID_SOURCES = new Set(["kb", "practice"]);

const JSON_FENCE_RE = /```json\s*\n([\s\S]*?)\n```/g;

function validateSourceRef(obj: unknown): SourceRef | null {
  if (typeof obj !== "object" || obj === null) return null;

  const o = obj as Record<string, unknown>;

  if (typeof o.source !== "string" || !VALID_SOURCES.has(o.source)) return null;
  if (typeof o.docId !== "string" || o.docId.length === 0) return null;
  if (typeof o.chunkIndex !== "number" || !Number.isInteger(o.chunkIndex)) return null;

  const title = typeof o.title === "string" ? o.title : "";
  const snippetOnly = o.snippet_only === true || o.chunkIndex === -1;

  let meta: Record<string, string> = {};
  if (typeof o.meta === "object" && o.meta !== null && !Array.isArray(o.meta)) {
    for (const [k, v] of Object.entries(o.meta as Record<string, unknown>)) {
      if (v != null) meta[k] = String(v);
    }
  }

  return {
    source: o.source as "kb" | "practice",
    docId: o.docId,
    chunkIndex: o.chunkIndex,
    title,
    meta,
    snippetOnly,
  };
}

/**
 * Parse a references text blob into structured sources.
 * Malformed blocks are silently skipped; order matches insertion order.
 */
export function parseReferences(text: string): ParsedReferences {
  if (!text || !text.trim()) return { sources: [], rawBlocks: [] };

  const norm = text.replace(/\r\n/g, "\n");
  const rawBlocks = norm.split("\n\n---\n\n").filter((b) => b.trim().length > 0);
  const sources: SourceRef[] = [];

  for (const block of rawBlocks) {
    const re = new RegExp(JSON_FENCE_RE.source, JSON_FENCE_RE.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(block)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        const ref = validateSourceRef(parsed);
        if (ref) {
          sources.push(ref);
          break; // first valid wins
        }
      } catch {
        // Malformed JSON — try next fence
      }
    }
  }

  return { sources, rawBlocks };
}
