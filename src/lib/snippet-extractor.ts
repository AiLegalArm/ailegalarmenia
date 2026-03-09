/**
 * Extract relevant text snippets around keyword matches from a large text.
 * Used to show chunk-level search results instead of whole documents.
 */

export interface TextSnippet {
  text: string;
  position: number;
  /** Pseudo chunk index based on position within the document */
  chunkIndex: number;
}

/**
 * Find the most relevant excerpts from `text` that contain words from `query`.
 *
 * @param text        Full document text
 * @param query       User search query
 * @param maxSnippets Maximum number of snippets to return (default 3)
 * @param contextChars Characters of context around each match (default 200)
 */
export function extractRelevantSnippets(
  text: string,
  query: string,
  maxSnippets = 3,
  contextChars = 200,
): TextSnippet[] {
  if (!text || !query) return [];

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return [];

  const lowerText = text.toLowerCase();
  const positions: number[] = [];

  // Collect match positions for each search word
  for (const word of words) {
    let startFrom = 0;
    let found = 0;
    while (found < 10) {
      const idx = lowerText.indexOf(word, startFrom);
      if (idx === -1) break;
      positions.push(idx);
      startFrom = idx + word.length;
      found++;
    }
  }

  if (positions.length === 0) return [];

  // Sort positions and merge overlapping windows
  positions.sort((a, b) => a - b);

  const snippets: TextSnippet[] = [];
  let lastEnd = -1;

  for (const pos of positions) {
    if (snippets.length >= maxSnippets) break;

    const start = Math.max(0, pos - contextChars);
    const end = Math.min(text.length, pos + contextChars);

    // Skip if this window overlaps with the previous one
    if (start <= lastEnd) continue;

    let snippet = text.substring(start, end).trim();
    if (start > 0) snippet = "\u2026" + snippet;
    if (end < text.length) snippet = snippet + "\u2026";

    snippets.push({
      text: snippet,
      position: pos,
      chunkIndex: Math.floor(pos / 2000), // ~2000 chars per logical chunk
    });
    lastEnd = end;
  }

  return snippets;
}

/**
 * Highlight search terms in a snippet by wrapping them in <mark> tags.
 * Returns an array of {text, highlight} segments for React rendering.
 */
export function highlightTerms(
  snippet: string,
  query: string,
): Array<{ text: string; highlight: boolean }> {
  if (!query) return [{ text: snippet, highlight: false }];

  const words = query
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return [{ text: snippet, highlight: false }];

  const regex = new RegExp(`(${words.join("|")})`, "gi");
  const parts = snippet.split(regex);

  return parts.map((part) => ({
    text: part,
    highlight: regex.test(part),
  }));
}
