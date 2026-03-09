/**
 * _shared/map-reduce-summarizer.ts — Hybrid Map-Reduce summarizer for large documents.
 *
 * When a document exceeds THRESHOLD chars, it is split into chunks,
 * each chunk is summarized by a fast model (Gemini Flash), then all
 * summaries are combined into a single condensed overview.
 *
 * This enables AI analysis of documents with 100K-500K+ characters
 * that would otherwise be truncated to 8-15K chars.
 */

import { callText } from "./openai-router.ts";

/** Threshold in chars above which Map-Reduce is triggered (440k chars ≈ 110k tokens) */
const MAP_REDUCE_THRESHOLD = 440_000;

/** Max chars per chunk for the "map" phase */
const CHUNK_SIZE = 12_000;

/** Overlap between chunks to preserve context at boundaries */
const CHUNK_OVERLAP = 500;

/** Max concurrent summarization calls */
const CONCURRENCY = 4;

/** Max summary chars per chunk */
const MAX_SUMMARY_PER_CHUNK = 2000;

const MAP_SYSTEM = [
  "You are AI LEGAL ARMENIA document summarizer.",
  "",
  "TASK: Read the following fragment of a legal document and produce a factual summary of 10-25 key points.",
  "Output language: SAME as the input document (Armenian/Russian/English).",
  "",
  "STRICT RULES:",
  "1) Preserve ALL legal references: article numbers, case numbers, dates, court names.",
  "2) Preserve ALL party names, roles, procedural actions.",
  "3) Preserve ALL deadlines, dates, chronological events.",
  "4) Preserve ALL violations, claims, legal arguments.",
  "5) Do NOT add information not in the fragment.",
  "6) Do NOT evaluate or analyze \u2014 only summarize factually.",
  "7) Use numbered bullet points.",
  "8) Preserve key data from tables/structured content.",
  "9) Mask PII (addresses, phones, personal IDs) with '***'.",
].join("\n");

const REDUCE_SYSTEM = [
  "You are AI LEGAL ARMENIA document summarizer.",
  "",
  "TASK: You receive multiple summaries of consecutive parts of ONE legal document.",
  "Combine them into a single coherent structured summary.",
  "Output language: SAME as the input summaries.",
  "",
  "RULES:",
  "1) Merge duplicates \u2014 do not repeat the same fact.",
  "2) Maintain chronological order.",
  "3) Preserve ALL legal references, article numbers, case numbers, dates.",
  "4) Preserve ALL party roles and procedural actions.",
  "5) Structure output into logical sections:",
  "   a) Parties and roles",
  "   b) Facts and chronology",
  "   c) Legal issues and claims",
  "   d) Key evidence and documents mentioned",
  "   e) Procedural history / stages",
  "6) Total length proportional to document complexity.",
  "7) Do NOT add analysis \u2014 only structured factual summary.",
].join("\n");

/**
 * Split text into overlapping chunks.
 */
function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

/**
 * Summarize a single chunk (map phase).
 */
async function summarizeChunk(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number
): Promise<string> {
  try {
    const result = await callText("map-reduce-summarize", [
      { role: "system", content: MAP_SYSTEM },
      {
        role: "user",
        content: `[Fragment ${chunkIndex + 1}/${totalChunks}]\n\n${chunkText}`,
      },
    ]);
    return result.text.substring(0, MAX_SUMMARY_PER_CHUNK);
  } catch (err) {
    console.error(`[map-reduce] Chunk ${chunkIndex + 1}/${totalChunks} failed:`, (err as Error).message);
    // Return a fallback: first 1500 chars of the original chunk
    return `[Summary failed for fragment ${chunkIndex + 1}]\n${chunkText.substring(0, 1500)}`;
  }
}

/**
 * Run tasks with limited concurrency.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

export interface MapReduceResult {
  /** The condensed summary of the entire document */
  summary: string;
  /** Whether Map-Reduce was actually used (false if text was short enough) */
  wasReduced: boolean;
  /** Number of chunks processed */
  chunksProcessed: number;
  /** Original text length */
  originalLength: number;
  /** Total latency in ms */
  latencyMs: number;
}

/**
 * Summarize a large text using Map-Reduce if it exceeds the threshold.
 * If text is short enough, returns it as-is (no summarization).
 *
 * @param text - The full document text
 * @param maxDirectLength - If text is shorter than this, return as-is (default: MAP_REDUCE_THRESHOLD)
 */
export async function mapReduceSummarize(
  text: string,
  maxDirectLength: number = MAP_REDUCE_THRESHOLD
): Promise<MapReduceResult> {
  const t0 = Date.now();

  if (text.length <= maxDirectLength) {
    return {
      summary: text,
      wasReduced: false,
      chunksProcessed: 0,
      originalLength: text.length,
      latencyMs: Date.now() - t0,
    };
  }

  const estimatedChunks = Math.ceil(text.length / (CHUNK_SIZE - CHUNK_OVERLAP));
  console.log(`[map-reduce] Starting: ${text.length} chars -> ~${estimatedChunks} chunks`);

  const chunks = splitIntoChunks(text);
  const tasks = chunks.map((chunk, i) => () => summarizeChunk(chunk, i, chunks.length));
  const summaries = await runWithConcurrency(tasks, CONCURRENCY);

  console.log(
    `[map-reduce] Map phase complete: ${summaries.length} summaries, total ${summaries.join("").length} chars`
  );

  // For small number of chunks, no reduce phase needed
  if (summaries.length <= 2) {
    return {
      summary: summaries.join("\n\n"),
      wasReduced: true,
      chunksProcessed: chunks.length,
      originalLength: text.length,
      latencyMs: Date.now() - t0,
    };
  }

  // REDUCE phase: combine all summaries
  const combinedSummaries = summaries
    .map((s, i) => `[Part ${i + 1}/${summaries.length}]\n${s}`)
    .join("\n\n---\n\n");

  const reduceResult = await callText("map-reduce-summarize", [
    { role: "system", content: REDUCE_SYSTEM },
    { role: "user", content: combinedSummaries },
  ]);

  const latencyMs = Date.now() - t0;
  console.log(
    `[map-reduce] Complete: ${text.length} chars -> ${reduceResult.text.length} chars in ${latencyMs}ms`
  );

  return {
    summary: reduceResult.text,
    wasReduced: true,
    chunksProcessed: chunks.length,
    originalLength: text.length,
    latencyMs,
  };
}
