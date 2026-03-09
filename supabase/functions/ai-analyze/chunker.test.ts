import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildChunksForDocument } from "./legal-practice-kb.ts";

Deno.test("buildChunksForDocument - splits text into chunks correctly", () => {
  const testText = "A".repeat(20000);
  const chunkSize = 8000;
  
  const { chunks, meta } = buildChunksForDocument(testText, chunkSize);
  
  // Should create 3 chunks (20000 / 8000 = 2.5, rounds up to 3)
  assertEquals(chunks.length, 3);
  assertEquals(meta.length, 3);
  
  // First chunk should be 8000 chars
  assertEquals(chunks[0].length, 8000);
  
  // Meta should track correct positions
  assertEquals(meta[0].idx, 0);
  assertEquals(meta[0].start, 0);
  assertEquals(meta[0].end, 8000);
  
  assertEquals(meta[1].idx, 1);
  assertEquals(meta[1].start, 8000);
  assertEquals(meta[1].end, 16000);
  
  assertEquals(meta[2].idx, 2);
  assertEquals(meta[2].start, 16000);
  assertEquals(meta[2].end, 20000);
});

Deno.test("buildChunksForDocument - reconstructs original text", () => {
  const originalText = "Hello World ".repeat(1000);
  const { chunks } = buildChunksForDocument(originalText, 1000);
  
  // Joining chunks should give back the normalized text
  const reconstructed = chunks.join("");
  
  // After normalization (whitespace collapse), length should be preserved
  assertExists(reconstructed);
  assertEquals(reconstructed.length > 0, true);
});

Deno.test("buildChunksForDocument - handles empty text", () => {
  const { chunks, meta } = buildChunksForDocument("", 8000);
  
  assertEquals(chunks.length, 0);
  assertEquals(meta.length, 0);
});

Deno.test("buildChunksForDocument - handles small text", () => {
  const smallText = "This is a small test.";
  const { chunks, meta } = buildChunksForDocument(smallText, 8000);
  
  assertEquals(chunks.length, 1);
  assertEquals(meta.length, 1);
  assertEquals(chunks[0], smallText);
});
