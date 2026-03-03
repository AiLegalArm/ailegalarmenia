/**
 * norm-ref-extractor (shared module)
 *
 * Extracts Armenian legal norm references from text using RegExp.
 * Pure, deterministic, no external dependencies.
 */

export interface NormAnchor {
  act_name?: string;
  article?: string;
  part?: string;
  raw: string;
  context_snippet?: string;
}

// ─── PATTERNS ───────────────────────────────────────────────────────
// Armenian act abbreviations + article patterns
// All Armenian chars as Unicode escapes per project standard.

const PATTERNS: { re: RegExp; act: string }[] = [
  // \u0540\u0540 \u0554\u0555 = \u0540\u0540 \u0554\u0555 (RA Criminal Code)
  {
    re: /\u0540\u0540\s+\u0554\u0555\s+(\d+)-?\u0580?\u0564?\s*\u0570\u0578\u0564\u057e\u0561\u056e/gi,
    act: "\u0540\u0540 \u0554\u0555",
  },
  // \u0554\u0534\u0555 = \u0554\u0534\u0555 (Criminal Procedure Code)
  {
    re: /\u0554\u0534\u0555\s+(\d+)-?\u0580?\u0564?\s*\u0570\u0578\u0564\u057e\u0561\u056e/gi,
    act: "\u0554\u0534\u0555",
  },
  // \u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0561\u0576 = Constitution
  {
    re: /\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0561\u0576\s+(\d+)-?\u0580?\u0564?\s*\u0570\u0578\u0564\u057e\u0561\u056e/gi,
    act: "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },
  // \u0535\u053f\u0544\u054b? = ECHR
  {
    re: /\u0535\u053f\u0544\u054b?\s+(\d+)-?\u0580?\u0564?\s*\u0570\u0578\u0564\u057e\u0561\u056e/gi,
    act: "\u0535\u053f\u0544\u054b",
  },
  // \u0540\u0555 = \u0540\u0555 (Law)
  {
    re: /\u0540\u0555\s+(\d+)/gi,
    act: "\u0540\u0555",
  },
  // Generic: \u0570\u0578\u0564\u057e\u0561\u056e <number> with optional \u0574\u0561\u057d (part)
  {
    re: /[\u0540\u0570]\u0578\u0564\u057e\u0561\u056e\u056b?\s+(\d+(?:\.\d+)?)(?:\s+\u0574\u0561\u057d\u056b?\s+(\d+))?/gi,
    act: "",
  },
  // Reversed: <number>-\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e
  {
    re: /(\d+)-?\u0580?\u0564?\s+[\u0540\u0570]\u0578\u0564\u057e\u0561\u056e/gi,
    act: "",
  },
];

// ─── EXTRACTION ─────────────────────────────────────────────────────

export function extractNormRefs(text: string): NormAnchor[] {
  if (!text || text.trim().length === 0) return [];

  const results: NormAnchor[] = [];
  const seen = new Set<string>();

  for (const { re, act } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const article = m[1];
      const part = m[2] || undefined;
      const raw = m[0];
      const dedupKey = `${raw}|${article}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const start = Math.max(0, m.index - 400);
      const end = Math.min(text.length, m.index + raw.length + 400);
      const context_snippet = text.slice(start, end);

      results.push({
        act_name: act || undefined,
        article,
        part,
        raw,
        context_snippet,
      });
    }
  }

  return results;
}
