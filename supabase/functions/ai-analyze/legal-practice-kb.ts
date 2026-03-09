// =============================================================================
// LEGAL PRACTICE KNOWLEDGE BASE - AI USAGE RULES (Version 2)
// =============================================================================
// PURPOSE
// 1) KB (legal practice) is REFERENCE-ONLY: may be used for analogous practice,
//    legal reasoning patterns, and structure templates.
// 2) KB facts must NEVER be mixed with user case facts or treated as evidence.
// 3) Large decisions must be injected into AI prompts in a controlled way:
//    - map layer (decision_map + pointers)
//    - limited top chunks (1–3) with DocID + ChunkIndex
//    - full text remains in KB and can be loaded on-demand by chunk.
// FORMAT RULES (for AI injection)
// - Plain text only (no Markdown markers like ##, ###, **, -, |)
// - Prefer numbered lists (1., 1.1., 1.2.)
// =============================================================================

/**
 * System instruction prepended to AI prompts when KB is used.
 * Keep this in sync with your BASE_SYSTEM_PROMPT constraints.
 */
export const KB_USAGE_INSTRUCTIONS = `
ԿԱՐԵՎՈՐ ԿԱՆՈՆՆԵՐ՝ Իրավական պրակտիկայի գիտելիքի բազայի (KB) օգտագործման համար

1. KB փաստաթղթերը օգտագործվում են ՄԻԱՅՆ որպես հղումային նյութ՝
1.1. Իրավական մտածողության և հիմնավորման օրինաչափություններ
1.2. Դատական մեկնաբանության ընդհանուր մոտեցումներ և թեստեր
1.3. Բողոքների/դատական փաստաթղթերի կառուցվածքային օրինակներ
1.4. Համանման (անալոգ) դատական պրակտիկայի մեջբերումներ, եթե առկա են KB-ում

2. ԱՐԳԵԼՎՈՒՄ Է
2.1. KB փաստերը ներկայացնել որպես օգտատիրոջ գործի փաստեր
2.2. KB փաստերը ներկայացնել որպես ապացույց տվյալ գործով
2.3. Խառնել KB բովանդակությունը օգտատիրոջ տրամադրած գործի նյութերի հետ
2.4. Մեջբերել գործերի համարներ, հոդվածների համարներ կամ փաստական հանգամանքներ, եթե դրանք բացակայում են KB-ում

3. ՊԱՐՏԱԴԻՐ ՊԻՏԱԿԱՎՈՐՈՒՄ
3.1. KB-ից եկած ցանկացած մեջբերում պետք է ներկայացվի առանձին բաժնում՝
«Անալոգ դատական պրակտիկա (KB)»
3.2. Յուրաքանչյուր մեջբերման մոտ պարտադիր նշել
DocID: <id>, Chunk: <N>/<Total>

4. Մեծ ծավալի որոշումներ
4.1. KB-ում կարող է պահպանվել ամբողջական տեքստը
4.2. AI-ին փոխանցելիս թույլատրելի է տալ միայն առավել համարժեք հատվածները (chunk-երով)
4.3. Եթե անհրաժեշտ է շարունակությունը՝ պահանջել DocID + Chunk ձևաչափով
`;

// =============================================================================
// TYPES
// =============================================================================

export type PracticeCategory = "criminal" | "civil" | "administrative" | "echr";
export type CourtType = "first_instance" | "appeal" | "cassation" | "constitutional" | "echr";
export type Outcome = "granted" | "rejected" | "partial" | "remanded" | "discontinued";

export interface AppliedArticles {
  code: string; // e.g., criminal_code, criminal_procedure_code, constitution, echr
  articles: string[]; // e.g., ["103", "107", "284"]
}

export interface DecisionMap {
  legal_question?: string;
  holding?: string;
  tests_or_criteria?: string;
  application_to_facts?: string;
  remedy?: string;
  references?: string[]; // e.g., other case names if present in KB
}

export type KeyParagraphTag = "issue" | "test" | "holding" | "application" | "remedy" | "other";

export interface KeyParagraphPointer {
  tag: KeyParagraphTag;
  chunkIdx: number; // index in content_chunks
  excerpt?: string; // optional short excerpt from chunk (must be from KB, not invented)
}

export interface ChunkIndexMeta {
  idx: number;
  start: number; // start offset in content_text
  end: number; // end offset in content_text
  label?: string;
}

export interface LegalPracticeDocument {
  id: string;
  title: string;
  practice_category: PracticeCategory;
  court_type: CourtType;
  outcome: Outcome;
  applied_articles: AppliedArticles[];
  key_violations: string[];
  legal_reasoning_summary: string;
  content_snippet: string;

  // Full text in KB (may be large)
  content_text?: string;

  // Version 2 fields
  content_chunks?: string[];
  chunk_index_meta?: ChunkIndexMeta[];
  decision_map?: DecisionMap;
  key_paragraphs?: KeyParagraphPointer[];

  relevance_rank: number;
}

// =============================================================================
// LABELS (UI + prompt)
// =============================================================================

const CATEGORY_LABELS: Record<PracticeCategory, string> = {
  criminal: "Քրեական",
  civil: "Քաղաքացիական",
  administrative: "Վարչական",
  echr: "ՄԻԵԴ",
};

const COURT_LABELS: Record<CourtType, string> = {
  first_instance: "Առաջին ատյան",
  appeal: "Վերաքննիչ",
  cassation: "Վճռաբեկ",
  constitutional: "Սահմանադրական",
  echr: "ՄԻԵԴ",
};

const OUTCOME_LABELS: Record<Outcome, string> = {
  granted: "Բավարարվել է",
  rejected: "Մերժվել է",
  partial: "Մասնակի",
  remanded: "Վերադարձվել է նոր քննության",
  discontinued: "Կարճվել է",
};

const CODE_LABELS: Record<string, string> = {
  criminal_code: "ՔՕ",
  criminal_procedure_code: "ՔԴՕ",
  civil_code: "Քաղաքացիական օրենսգիրք",
  civil_procedure_code: "Քաղաքացիական դատավարության օրենսգիրք",
  constitution: "Սահմանադրություն",
  echr: "ԵԿՄԻԿ",
  administrative_code: "ՎԴՕ",
};

// =============================================================================
// PUBLIC API
// =============================================================================

export interface FormatKBOptionsV2 {
  // Overall char cap for all KB injection
  maxTotalChars?: number; // default 60000

  // Per document cap for inline injection
  maxInlinePerDocChars?: number; // default 18000

  // If doc is larger than inline cap, chunking rules apply
  chunkSize?: number; // default 8000
  includeFirstChunks?: number; // default 2

  // Additionally include “best” chunks by index if known
  includeKeyParagraphChunks?: boolean; // default true
  maxKeyParagraphChunks?: number; // default 2

  // Emit only the “map layer” + references, no chunks (rarely)
  mapOnly?: boolean; // default false
}

/**
 * Main function: formats KB results for AI prompt consumption (Version 2).
 * Produces plain text, clearly labeled as KB reference-only.
 */
export function formatKBResultsForAI_V2(documents: LegalPracticeDocument[], options?: FormatKBOptionsV2): string {
  if (!documents || documents.length === 0) return "";

  const maxTotalChars = options?.maxTotalChars ?? 60_000;
  const maxInlinePerDocChars = options?.maxInlinePerDocChars ?? 18_000;
  const chunkSize = options?.chunkSize ?? 8_000;
  const includeFirstChunks = options?.includeFirstChunks ?? 2;

  const includeKeyParagraphChunks = options?.includeKeyParagraphChunks ?? true;
  const maxKeyParagraphChunks = options?.maxKeyParagraphChunks ?? 2;

  const mapOnly = options?.mapOnly ?? false;

  let budgetLeft = maxTotalChars;
  let out = "";

  out += "====================================================================\n";
  out += "ԱՆԱԼՈԳ ԴԱՏԱԿԱՆ ՊՐԱԿՏԻԿԱ (KB)\n";
  out += "Սա հղումային նյութ է։ Չի հանդիսանում տվյալ գործի փաստ կամ ապացույց։\n";
  out += "KB փաստերը խստիվ արգելվում է խառնել օգտատիրոջ գործի փաստերի հետ։\n";
  out += "====================================================================\n\n";

  for (let i = 0; i < documents.length; i++) {
    if (budgetLeft <= 0) {
      out += "ՆՇՈՒՄ: KB ներարկման սահմանաչափը լցված է։ Մնացած արդյունքները չեն ներառվել։\n";
      break;
    }

    const doc = documents[i];

    const header = buildDocHeader(doc, i + 1);
    const headerSafe = capText(header, budgetLeft);
    out += headerSafe.text;
    budgetLeft -= headerSafe.text.length;
    if (budgetLeft <= 0) break;

    const mapLayer = buildMapLayer(doc);
    const mapSafe = capText(mapLayer, Math.min(budgetLeft, Math.max(0, maxInlinePerDocChars)));
    out += mapSafe.text;
    budgetLeft -= mapSafe.text.length;
    if (budgetLeft <= 0) break;

    if (mapOnly) {
      out += "\n--------------------------------------------------------------------\n\n";
      budgetLeft -= "\n--------------------------------------------------------------------\n\n".length;
      continue;
    }

    // Determine full text source
    const fullText = resolveFullText(doc);
    if (!fullText) {
      const note = "ՆՇՈՒՄ: Այս փաստաթղթի համար content_text/content_chunks չեն տրամադրվել KB-ում։\n\n";
      const noteSafe = capText(note, budgetLeft);
      out += noteSafe.text;
      budgetLeft -= noteSafe.text.length;
      out += "--------------------------------------------------------------------\n\n";
      budgetLeft -= "--------------------------------------------------------------------\n\n".length;
      continue;
    }

    // If small enough, include inline full text (still labeled)
    const inlineCap = Math.min(maxInlinePerDocChars, budgetLeft);
    const inlineCheck = capText(fullText, inlineCap);

    if (inlineCheck.truncated) {
      // Too big: use chunks
      const chunks = resolveChunks(doc, fullText, chunkSize);

      const metaBlock = buildChunkMetaBlock(doc, chunks.length, includeFirstChunks, includeKeyParagraphChunks);
      const metaSafe = capText(metaBlock, budgetLeft);
      out += metaSafe.text;
      budgetLeft -= metaSafe.text.length;
      if (budgetLeft <= 0) break;

      // Select chunk indexes to include:
      // 1) key_paragraph chunks (issue/test/holding etc), if available
      // 2) first chunks (1..includeFirstChunks)
      const selected = selectChunkIndexes(
        doc,
        chunks.length,
        includeFirstChunks,
        includeKeyParagraphChunks,
        maxKeyParagraphChunks,
      );

      for (const chunkIdx of selected) {
        if (budgetLeft <= 0) break;

        const label = buildChunkLabel(doc.id, chunkIdx, chunks.length);
        const labelSafe = capText(label, budgetLeft);
        out += labelSafe.text;
        budgetLeft -= labelSafe.text.length;
        if (budgetLeft <= 0) break;

        const chunkText = chunks[chunkIdx] ?? "";
        const chunkSafe = capText(chunkText + "\n\n", budgetLeft);
        out += chunkSafe.text;
        budgetLeft -= chunkSafe.text.length;
      }

      const onDemand = buildOnDemandInstruction(doc.id, chunks.length);
      const onDemandSafe = capText(onDemand, budgetLeft);
      out += onDemandSafe.text;
      budgetLeft -= onDemandSafe.text.length;
    } else {
      // Fits inline
      const block = buildInlineFullTextBlock(doc.id, fullText, inlineCap);
      const blockSafe = capText(block, budgetLeft);
      out += blockSafe.text;
      budgetLeft -= blockSafe.text.length;
    }

    const sep = "\n--------------------------------------------------------------------\n\n";
    const sepSafe = capText(sep, budgetLeft);
    out += sepSafe.text;
    budgetLeft -= sepSafe.text.length;
  }

  out += "====================================================================\n";
  out += "KB հատվածի ավարտ\n";
  out += "====================================================================\n";

  return out;
}

/**
 * Creates/refreshes chunks + chunk index meta for a document.
 * Intended for ingestion/backfill on server-side.
 */
export function buildChunksForDocument(
  contentText: string,
  chunkSize: number = 8000,
): { chunks: string[]; meta: ChunkIndexMeta[] } {
  const normalized = normalizeText(contentText);
  const chunks: string[] = [];
  const meta: ChunkIndexMeta[] = [];

  let start = 0;
  let idx = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const slice = normalized.slice(start, end);

    chunks.push(slice);
    meta.push({ idx, start, end });

    idx++;
    start = end;
  }

  return { chunks, meta };
}

/**
 * Build a conservative KB search query (does not invent article numbers).
 */
export function buildKBSearchQuery_V2(
  caseFacts: string | null,
  legalQuestion: string | null,
  caseType: "criminal" | "civil" | "administrative" | null,
): { query: string; category: string | null } {
  const parts: string[] = [];

  if (caseFacts) {
    // Extract only explicit mentions of "հոդված N"
    const articleMatches = caseFacts.match(/հոդված\s*\d+(\.\d+)?/gi) || [];
    parts.push(...articleMatches);

    const legalTerms = [
      "բողոք",
      "միջնորդություն",
      "ապացույց",
      "թույլատրելիություն",
      "անթույլատրելի",
      "ընթացակարգային խախտում",
      "արդար դատաքննություն",
      "վճռաբեկ",
      "վերաքննիչ",
      "նախաքննություն",
      "մեղադրանք",
    ];

    const lower = caseFacts.toLowerCase();
    for (const term of legalTerms) {
      if (lower.includes(term)) parts.push(term);
    }
  }

  if (legalQuestion) parts.push(legalQuestion.slice(0, 160));

  const query = parts.join(" ").trim() || "դատական պրակտիկա";
  return { query, category: caseType };
}

// =============================================================================
// INTERNAL HELPERS (private)
// =============================================================================

function buildDocHeader(doc: LegalPracticeDocument, ordinal: number): string {
  let s = "";
  s += `Անալոգ ${ordinal}\n`;
  s += `Վերնագիր: ${safeLine(doc.title)}\n`;
  s += `DocID: ${doc.id}\n`;
  s += `Կատեգորիա: ${CATEGORY_LABELS[doc.practice_category] || doc.practice_category}\n`;
  s += `Ատյան: ${COURT_LABELS[doc.court_type] || doc.court_type}\n`;
  s += `Արդյունք: ${OUTCOME_LABELS[doc.outcome] || doc.outcome}\n`;
  s += `Կիրառված հոդվածներ: ${formatAppliedArticles(doc.applied_articles)}\n`;

  if (doc.key_violations && doc.key_violations.length > 0) {
    s += `Հիմնական խախտումներ: ${doc.key_violations.join(", ")}\n`;
  }
  if (doc.legal_reasoning_summary) {
    s += `Իրավական հիմնավորում (կարճ): ${safeLine(doc.legal_reasoning_summary)}\n`;
  }

  s += "\n";
  return s;
}

function buildMapLayer(doc: LegalPracticeDocument): string {
  const m = doc.decision_map;

  // Even if decision_map is missing, we still keep a stable structure
  let s = "";
  s += "KB քարտ (հղումային)\n";
  s += "1. Իրավական հարց\n";
  s += `1.1. ${safeLine(m?.legal_question || "KB-ում չի լրացված")}\n`;
  s += "2. Դիրքորոշում (holding)\n";
  s += `2.1. ${safeLine(m?.holding || "KB-ում չի լրացված")}\n`;
  s += "3. Թեստեր/չափանիշներ\n";
  s += `3.1. ${safeLine(m?.tests_or_criteria || "KB-ում չի լրացված")}\n`;
  s += "4. Դիմում փաստերին (KB-ի ներսում)\n";
  s += `4.1. ${safeLine(m?.application_to_facts || "KB-ում չի լրացված")}\n`;
  s += "5. Արդյունք/լուծում (remedy)\n";
  s += `5.1. ${safeLine(m?.remedy || "KB-ում չի լրացված")}\n`;

  if (m?.references && m.references.length > 0) {
    s += "6. Հղումներ (եթե առկա են KB-ում)\n";
    for (let i = 0; i < Math.min(5, m.references.length); i++) {
      s += `6.${i + 1}. ${safeLine(m.references[i])}\n`;
    }
  }

  // Key paragraph pointers (if any)
  if (doc.key_paragraphs && doc.key_paragraphs.length > 0) {
    s += "7. Հիմնական հատվածների ցուցիչներ (DocID + Chunk)\n";
    const take = doc.key_paragraphs.slice(0, 8);
    for (let i = 0; i < take.length; i++) {
      const p = take[i];
      const excerpt = p.excerpt ? ` — ${safeLine(p.excerpt)}` : "";
      s += `7.${i + 1}. tag=${p.tag}, Chunk=${p.chunkIdx}${excerpt}\n`;
    }
  }

  s += "\n";
  return s;
}

function buildInlineFullTextBlock(docId: string, fullText: string, cap: number): string {
  const safe = capText(fullText, cap);
  let s = "";
  s += "Անալոգ դատական պրակտիկա (KB)\n";
  s += `DocID: ${docId}\n`;
  s += "Տեքստ (ամբողջական՝ քանի որ տեղավորվում է)\n";
  s += safe.text;
  s += "\n\n";
  return s;
}

function buildChunkMetaBlock(
  doc: LegalPracticeDocument,
  totalChunks: number,
  includeFirstChunks: number,
  includeKeyParagraphChunks: boolean,
): string {
  let s = "";
  s += "Անալոգ դատական պրակտիկա (KB)\n";
  s += `DocID: ${doc.id}\n`;
  s += "Տեքստը մեծ ծավալի է՝ ներկայացվում է հատվածաբար (chunk-երով)\n";
  s += `Chunk-երի քանակ: ${totalChunks}\n`;
  s += `Լռելյայն տրվող առաջին հատվածներ: 1..${Math.min(includeFirstChunks, totalChunks)}\n`;
  s += `Key հատվածների օգտագործում: ${includeKeyParagraphChunks ? "Այո" : "Ոչ"}\n\n`;
  return s;
}

function buildChunkLabel(docId: string, chunkIdx: number, total: number): string {
  return `--- DocID: ${docId}, Chunk: ${chunkIdx + 1}/${total} ---\n`;
}

function buildOnDemandInstruction(docId: string, totalChunks: number): string {
  let s = "";
  s += "Շարունակություն ստանալու համար նշեք՝\n";
  s += `1. DocID: ${docId}\n`;
  s += `2. Chunk: N (1..${totalChunks})\n\n`;
  return s;
}

function resolveFullText(doc: LegalPracticeDocument): string {
  // Prefer content_text; fallback to snippet
  const t = doc.content_text || doc.content_snippet || "";
  return normalizeText(t);
}

function resolveChunks(doc: LegalPracticeDocument, fullText: string, chunkSize: number): string[] {
  if (doc.content_chunks && doc.content_chunks.length > 0) return doc.content_chunks;
  return chunkText(normalizeText(fullText), chunkSize);
}

function selectChunkIndexes(
  doc: LegalPracticeDocument,
  totalChunks: number,
  includeFirstChunks: number,
  includeKeyParagraphChunks: boolean,
  maxKeyParagraphChunks: number,
): number[] {
  const set = new Set<number>();

  // Key paragraphs first
  if (includeKeyParagraphChunks && doc.key_paragraphs && doc.key_paragraphs.length > 0) {
    // Prioritize tags by value
    const priority: KeyParagraphTag[] = ["issue", "test", "holding", "application", "remedy", "other"];

    const sorted = [...doc.key_paragraphs].sort((a, b) => {
      const pa = priority.indexOf(a.tag);
      const pb = priority.indexOf(b.tag);
      return pa - pb;
    });

    for (const p of sorted) {
      if (set.size >= maxKeyParagraphChunks) break;
      if (p.chunkIdx >= 0 && p.chunkIdx < totalChunks) set.add(p.chunkIdx);
    }
  }

  // Then first N chunks
  for (let i = 0; i < Math.min(includeFirstChunks, totalChunks); i++) set.add(i);

  // Return in ascending order for readability
  return Array.from(set).sort((a, b) => a - b);
}

function formatAppliedArticles(articles: AppliedArticles[]): string {
  if (!articles || articles.length === 0) return "Նշված չէ";
  return articles.map((a) => `${CODE_LABELS[a.code] || a.code}: հոդ. ${a.articles.join(", ")}`).join("; ");
}

function normalizeText(input: string): string {
  if (!input) return "";
  // Light normalization: collapse excessive spaces, keep newlines
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeLine(input: string): string {
  return (input || "").replace(/\s+/g, " ").trim();
}

function chunkText(text: string, chunkSize: number): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}

function capText(text: string, maxChars: number): { text: string; truncated: boolean } {
  const t = (text || "").toString();
  if (maxChars <= 0) return { text: "", truncated: true };
  if (t.length <= maxChars) return { text: t, truncated: false };

  const slice = t.slice(0, maxChars);
  const cutAt = Math.max(
    slice.lastIndexOf("\n\n"),
    slice.lastIndexOf("\n"),
    slice.lastIndexOf(". "),
    slice.lastIndexOf(" "),
  );

  const finalText = (cutAt > 200 ? slice.slice(0, cutAt) : slice).trimEnd();
  return { text: finalText, truncated: true };
}
