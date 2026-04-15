import {
  DEFAULT_SEGMENT_CONFIG,
  l2Normalize,
  meanPool,
  segmentTextForEmbedding,
  selectTokenWindows,
  type Tokenizer,
} from "../_shared/embedding-segmentation.ts";

Deno.test("segment+pool: meanPool + l2Normalize keeps dimension and normalizes", () => {
  const v = meanPool([
    [3, 4, 0],
    [0, 0, 0],
  ]);
  if (v.length !== 3) throw new Error("wrong dimension");
  const n = l2Normalize(v);
  if (n.length !== 3) throw new Error("wrong dimension after normalize");
  const norm = Math.sqrt(n.reduce((s, x) => s + x * x, 0));
  if (Math.abs(norm - 1) > 1e-9) throw new Error(`expected L2=1, got ${norm}`);
});

Deno.test("segment selection: cap=4 covers start/middle/end and respects bounds", () => {
  const cfg = { ...DEFAULT_SEGMENT_CONFIG, tokenLimit: 7800, windowTokens: 2000, maxSegments: 4 };
  const windows = selectTokenWindows(9000, cfg);
  if (windows.length !== 4) throw new Error(`expected 4 windows, got ${windows.length}`);
  if (windows[0].start !== 0) throw new Error("first window must start at 0");
  if (windows[windows.length - 1].end !== 9000) throw new Error("last window must end at totalTokens");
  for (const w of windows) {
    if (w.start < 0 || w.end > 9000 || w.end <= w.start) throw new Error("invalid window bounds");
    if (w.end - w.start > 2000) throw new Error("window too large");
  }
});

Deno.test("idempotency fingerprint: changes outside selected windows do not affect fingerprint", () => {
  const tokenizer: Tokenizer = {
    encode: (t: string) => t.split(" ").filter(Boolean).map((x) => Number(x)),
    decode: (tokens: number[]) => tokens.join(" "),
  };
  const cfg = { ...DEFAULT_SEGMENT_CONFIG, tokenLimit: 7800, windowTokens: 2000, maxSegments: 4 };

  const baseTokens = Array.from({ length: 9000 }, (_, i) => i);
  const baseText = baseTokens.join(" ");

  // With 9000 tokens and windowTokens=2000, there is a gap [4000..5000) not covered by windows.
  const mutatedTokens = [...baseTokens];
  mutatedTokens[4500] = 999999;
  const mutatedText = mutatedTokens.join(" ");

  const base = segmentTextForEmbedding(baseText, tokenizer, cfg).fingerprintText;
  const mutated = segmentTextForEmbedding(mutatedText, tokenizer, cfg).fingerprintText;

  if (base !== mutated) {
    throw new Error("fingerprint changed despite modification outside selected windows");
  }
});

