// =============================================================================
// DOCX Parser Tests — uses programmatically built minimal DOCX ZIP fixtures
// =============================================================================

import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseDocx } from "./docx-parser.ts";

// ---------------------------------------------------------------------------
// Helpers: build a minimal valid DOCX (ZIP archive) in-memory
// ---------------------------------------------------------------------------

/** CRC32 table */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a stored (uncompressed) ZIP with given file entries */
function buildZip(files: { name: string; content: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDirs: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.content);

    // Local file header (30 bytes + name + data)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(8, 0, true);  // compression: Store
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.content.length, true); // compressed size
    lv.setUint32(22, f.content.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(f.content);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdEntry.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true); // compression: Store
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.content.length, true);
    cv.setUint32(24, f.content.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // local header offset
    cdEntry.set(nameBytes, 46);
    centralDirs.push(cdEntry);

    offset += localHeader.length + f.content.length;
  }

  // End of central directory
  let cdSize = 0;
  for (const cd of centralDirs) cdSize += cd.length;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  // Concatenate
  const totalLen = offset + cdSize + 22;
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  for (const cd of centralDirs) { result.set(cd, pos); pos += cd.length; }
  result.set(eocd, pos);
  return result;
}

function buildDocx(documentXml: string): Uint8Array {
  const enc = new TextEncoder();
  const contentTypes = enc.encode(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '</Types>'
  );
  return buildZip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "word/document.xml", content: enc.encode(documentXml) },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("parseDocx: extracts single paragraph", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs.length, 1);
  assertEquals(result.paragraphs[0], "Hello World");
  assertEquals(result.text, "Hello World");
});

Deno.test("parseDocx: preserves paragraph breaks", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>First paragraph</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Third paragraph</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs.length, 3);
  assertEquals(result.paragraphs[0], "First paragraph");
  assertEquals(result.paragraphs[1], "Second paragraph");
  assertEquals(result.paragraphs[2], "Third paragraph");
  assertEquals(result.text, "First paragraph\n\nSecond paragraph\n\nThird paragraph");
});

Deno.test("parseDocx: handles multiple runs in one paragraph", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p>' +
    '<w:r><w:t xml:space="preserve">Hello </w:t></w:r>' +
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>' +
    '<w:r><w:t xml:space="preserve"> World</w:t></w:r>' +
    '</w:p>' +
    '</w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs.length, 1);
  assertEquals(result.paragraphs[0], "Hello Bold World");
});

Deno.test("parseDocx: handles w:br and w:tab", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>Line1</w:t><w:br/><w:t>Line2</w:t><w:tab/><w:t>Tabbed</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs[0], "Line1\nLine2\tTabbed");
});

Deno.test("parseDocx: Armenian Unicode text (\u0540\u0561\u0575\u0565\u0580\u0565\u0576)", async () => {
  const armenianText = "\u0540\u0561\u0575\u0561\u057d\u057f\u0561\u0576\u056b \u0540\u0561\u0576\u0580\u0561\u057a\u0565\u057f\u0578\u0582\u0569\u0575\u0578\u0582\u0576";
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>' + armenianText + '</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs[0], armenianText);
});

Deno.test("parseDocx: skips empty paragraphs", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>Content</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>' +
    '<w:p><w:r><w:t>More content</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs.length, 2);
  assertEquals(result.text, "Content\n\nMore content");
});

Deno.test("parseDocx: rejects non-ZIP data", async () => {
  const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
  await assertRejects(
    () => parseDocx(garbage.buffer),
    Error,
    "not a valid ZIP archive"
  );
});

Deno.test("parseDocx: rejects ZIP without word/document.xml", async () => {
  const enc = new TextEncoder();
  const zip = buildZip([
    { name: "readme.txt", content: enc.encode("Hello") },
  ]);
  await assertRejects(
    () => parseDocx(zip.buffer),
    Error,
    "word/document.xml not found"
  );
});

Deno.test("parseDocx: extracts embedded PNG image", async () => {
  const enc = new TextEncoder();
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>Doc with image</w:t></w:r></w:p>' +
    '</w:body></w:document>';

  // Minimal PNG: 8-byte signature + IHDR + IEND
  const pngSig = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  // IHDR chunk (13 bytes data)
  const ihdr = new Uint8Array([
    0x00, 0x00, 0x00, 0x0D, // length = 13
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08, 0x02,             // bit depth 8, color type 2 (RGB)
    0x00, 0x00, 0x00,       // compression, filter, interlace
    0x90, 0x77, 0x53, 0xDE, // CRC (precomputed for this IHDR)
  ]);
  // IEND chunk
  const iend = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, // length = 0
    0x49, 0x45, 0x4E, 0x44, // "IEND"
    0xAE, 0x42, 0x60, 0x82, // CRC
  ]);
  // IDAT chunk (minimal: single scanline for 1x1 RGB)
  const idatData = new Uint8Array([
    0x78, 0x01, 0x62, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01
  ]);
  const idatHeader = new Uint8Array([
    0x00, 0x00, 0x00, idatData.length, // length
    0x49, 0x44, 0x41, 0x54, // "IDAT"
  ]);
  const idatCrc = new Uint8Array(4); // simplified CRC placeholder

  const pngBytes = new Uint8Array([
    ...pngSig, ...ihdr, ...idatHeader, ...idatData, ...idatCrc, ...iend
  ]);

  const contentTypes = enc.encode(
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '</Types>'
  );
  const zip = buildZip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "word/document.xml", content: enc.encode(xml) },
    { name: "word/media/image1.png", content: pngBytes },
  ]);

  const result = await parseDocx(zip.buffer);
  assertEquals(result.paragraphs[0], "Doc with image");
  assert(result.images.length >= 1, "Should extract at least one image");
  assert(result.images[0].startsWith("data:image/png;base64,"), "Image should be PNG data URI");
});

Deno.test("parseDocx: warns on empty document", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '</w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs.length, 0);
  assert(result.warnings.length > 0, "Should have warning about empty doc");
});

Deno.test("parseDocx: handles mixed Armenian/Latin/Cyrillic paragraphs", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>\u0540\u0578\u0564\u057e\u0561\u056e 1. \u0538\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u0564\u0580\u0578\u0582\u0575\u0569\u0576\u0565\u0580</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Article 1. General provisions</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>\u0421\u0442\u0430\u0442\u044c\u044f 1. \u041e\u0431\u0449\u0438\u0435 \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u044f</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const docx = buildDocx(xml);
  const result = await parseDocx(docx.buffer);
  assertEquals(result.paragraphs.length, 3);
  assert(result.paragraphs[0].startsWith("\u0540\u0578\u0564\u057e\u0561\u056e"));
  assertEquals(result.paragraphs[1], "Article 1. General provisions");
  assert(result.paragraphs[2].startsWith("\u0421\u0442\u0430\u0442\u044c\u044f"));
});
