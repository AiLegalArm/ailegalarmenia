// =============================================================================
// ZIP-based DOCX parser — extracts word/document.xml from the OOXML ZIP archive
// and parses paragraph/run XML to preserve structure.
// No external dependencies; uses only Deno / Web-standard APIs.
// =============================================================================

export interface DocxParseResult {
  /** Paragraphs joined with \n\n */
  text: string;
  /** Individual paragraphs */
  paragraphs: string[];
  /** Base64 data-URIs for embedded images (word/media/*) */
  images: string[];
  /** Warnings encountered during parsing */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Tiny ZIP reader — supports only Store (0) and Deflate (8) methods.
// DOCX always uses Deflate for XML entries.
// ---------------------------------------------------------------------------

interface ZipEntry {
  filename: string;
  compressedData: Uint8Array;
  compressionMethod: number;
  uncompressedSize: number;
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]) |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    ((buf[offset + 3] << 24) >>> 0)
  );
}

/**
 * Parse ZIP local-file-header entries from raw bytes.
 * We iterate through local headers (PK\x03\x04) sequentially.
 */
function parseZipEntries(data: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= data.length) {
    // Check local file header signature: PK\x03\x04
    if (
      data[offset] !== 0x50 ||
      data[offset + 1] !== 0x4b ||
      data[offset + 2] !== 0x03 ||
      data[offset + 3] !== 0x04
    ) {
      break; // No more local headers
    }

    const compressionMethod = readUint16LE(data, offset + 8);
    const compressedSize = readUint32LE(data, offset + 18);
    const uncompressedSize = readUint32LE(data, offset + 22);
    const filenameLen = readUint16LE(data, offset + 26);
    const extraLen = readUint16LE(data, offset + 28);

    const filenameStart = offset + 30;
    const filenameBytes = data.subarray(filenameStart, filenameStart + filenameLen);
    const filename = new TextDecoder().decode(filenameBytes);

    const dataStart = filenameStart + filenameLen + extraLen;
    const compressedData = data.subarray(dataStart, dataStart + compressedSize);

    entries.push({ filename, compressedData, compressionMethod, uncompressedSize });

    offset = dataStart + compressedSize;

    // Skip optional data descriptor (PK\x07\x08 or raw 12/16 bytes)
    if (offset + 4 <= data.length) {
      if (
        data[offset] === 0x50 &&
        data[offset + 1] === 0x4b &&
        data[offset + 2] === 0x07 &&
        data[offset + 3] === 0x08
      ) {
        offset += 16; // signature + crc32 + compressed + uncompressed (4 bytes each)
      }
    }
  }

  return entries;
}

/**
 * Decompress a single ZIP entry.
 * - Method 0 (Store): return as-is
 * - Method 8 (Deflate): use DecompressionStream (Web standard, available in Deno)
 */
async function decompressEntry(entry: ZipEntry): Promise<Uint8Array> {
  if (entry.compressionMethod === 0) {
    return entry.compressedData;
  }
  if (entry.compressionMethod === 8) {
    // DecompressionStream expects "deflate-raw" for raw deflate (no zlib header)
    const ds = new DecompressionStream("deflate-raw" as CompressionFormat);
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    const writePromise = writer.write(new Uint8Array(entry.compressedData) as unknown as BufferSource).then(() => writer.close());

    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
    }
    await writePromise;

    const result = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      result.set(c, pos);
      pos += c.length;
    }
    return result;
  }
  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
}

// ---------------------------------------------------------------------------
// OOXML paragraph extractor
// ---------------------------------------------------------------------------

/**
 * Extract text runs from <w:p> elements in OOXML document.xml.
 * Handles: <w:t>, <w:br/>, <w:tab/>, paragraph boundaries.
 */
function extractParagraphsFromXml(xml: string): string[] {
  const paragraphs: string[] = [];

  // Match each <w:p ...>...</w:p> block
  const pRegex = /<w:p[\s>]([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[1];
    const runs: string[] = [];

    // Match text runs <w:t ...>text</w:t>
    const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;

    // We also need to handle <w:br/> and <w:tab/> within the paragraph
    // Process in order of appearance by scanning the paragraph content
    let lastIdx = 0;
    const tokens: string[] = [];

    // Unified scan: find w:br, w:tab, w:t in order (br/tab BEFORE t to avoid prefix ambiguity)
    const tokenRegex = /<w:br\s*\/>|<w:tab\s*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let tokenMatch: RegExpExecArray | null;

    while ((tokenMatch = tokenRegex.exec(pContent)) !== null) {
      const full = tokenMatch[0];
      if (full.startsWith("<w:br")) {
        tokens.push("\n");
      } else if (full.startsWith("<w:tab")) {
        tokens.push("\t");
      } else if (full.startsWith("<w:t")) {
        tokens.push(tokenMatch[1] ?? "");
      }
    }

    const paraText = tokens.join("");
    if (paraText.trim().length > 0) {
      paragraphs.push(paraText);
    }
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Image extraction helpers
// ---------------------------------------------------------------------------

function mimeFromFilename(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "bmp": return "image/bmp";
    case "tiff": case "tif": return "image/tiff";
    case "webp": return "image/webp";
    case "emf": case "wmf": return null; // skip vector formats
    default: return null;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  // Delegate to shared safe implementation
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a DOCX file from its raw bytes.
 * Returns extracted text with paragraph breaks and embedded images.
 */
export async function parseDocx(buffer: ArrayBuffer | ArrayBufferLike): Promise<DocxParseResult> {
  const data = new Uint8Array(buffer as ArrayBuffer);
  const warnings: string[] = [];

  // Validate ZIP signature
  if (
    data.length < 4 ||
    data[0] !== 0x50 || data[1] !== 0x4b ||
    data[2] !== 0x03 || data[3] !== 0x04
  ) {
    throw new Error("Invalid DOCX: not a valid ZIP archive");
  }

  const entries = parseZipEntries(data);

  if (entries.length === 0) {
    throw new Error("Invalid DOCX: ZIP archive contains no entries");
  }

  // Find word/document.xml
  const docEntry = entries.find(
    (e) => e.filename === "word/document.xml" || e.filename === "word\\document.xml"
  );

  if (!docEntry) {
    // List available entries for diagnostics
    const names = entries.map((e) => e.filename).join(", ");
    throw new Error(
      `Invalid DOCX: word/document.xml not found. Entries: ${names.slice(0, 200)}`
    );
  }

  // Decompress and decode document.xml
  let documentXml: string;
  try {
    const raw = await decompressEntry(docEntry);
    documentXml = new TextDecoder("utf-8").decode(raw);
  } catch (err) {
    throw new Error(
      `Failed to decompress word/document.xml: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Extract paragraphs
  const paragraphs = extractParagraphsFromXml(documentXml);

  if (paragraphs.length === 0) {
    warnings.push("No text content found in word/document.xml");
  }

  // Extract images from word/media/*
  const images: string[] = [];
  const mediaEntries = entries.filter(
    (e) => e.filename.startsWith("word/media/") || e.filename.startsWith("word\\media\\")
  );

  for (const me of mediaEntries) {
    const mime = mimeFromFilename(me.filename);
    if (!mime) continue; // skip unsupported formats

    try {
      const raw = await decompressEntry(me);
      if (raw.length < 50) continue; // too small to be a real image
      const b64 = uint8ToBase64(raw);
      images.push(`data:${mime};base64,${b64}`);
    } catch {
      warnings.push(`Failed to extract image: ${me.filename}`);
    }
  }

  const text = paragraphs.join("\n\n");

  return { text, paragraphs, images, warnings };
}
