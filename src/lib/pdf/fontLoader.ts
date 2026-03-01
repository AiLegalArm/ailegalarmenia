import jsPDF from "jspdf";

// This will be populated with the base64 font data
let armenianFontBase64: string | null = null;
let armenianBoldFontBase64: string | null = null;
let fontLoadPromise: Promise<void> | null = null;

// Function to load a font file as base64
async function loadFontFile(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font from ${url}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  // Convert to base64
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  
  return btoa(binary);
}

// Function to load both Armenian fonts
async function loadArmenianFonts(): Promise<void> {
  const [regular, bold] = await Promise.all([
    armenianFontBase64 ? Promise.resolve(armenianFontBase64) : loadFontFile('/fonts/NotoSansArmenian-Regular.ttf'),
    armenianBoldFontBase64 ? Promise.resolve(armenianBoldFontBase64) : loadFontFile('/fonts/NotoSansArmenian-Bold.ttf'),
  ]);
  armenianFontBase64 = regular;
  armenianBoldFontBase64 = bold;
}

// Initialize font loading
export async function initializePDFFont(): Promise<void> {
  if (!fontLoadPromise) {
    fontLoadPromise = loadArmenianFonts();
  }
  return fontLoadPromise;
}

// Register the Armenian font with jsPDF (regular + bold)
export async function registerArmenianFont(doc: jsPDF): Promise<void> {
  await loadArmenianFonts();
  
  // Regular
  doc.addFileToVFS("NotoSansArmenian-Regular.ttf", armenianFontBase64!);
  doc.addFont("NotoSansArmenian-Regular.ttf", "NotoSansArmenian", "normal");
  
  // Bold (variable font with heavier weight)
  doc.addFileToVFS("NotoSansArmenian-Bold.ttf", armenianBoldFontBase64!);
  doc.addFont("NotoSansArmenian-Bold.ttf", "NotoSansArmenian", "bold");
}

// Set Armenian font on document (normal weight)
export function setArmenianFont(doc: jsPDF): void {
  doc.setFont("NotoSansArmenian", "normal");
}

// Set Armenian font on document (bold weight)
export function setArmenianBoldFont(doc: jsPDF): void {
  doc.setFont("NotoSansArmenian", "bold");
}

// Check if text contains Armenian characters
export function containsArmenian(text: string): boolean {
  // Armenian Unicode range: U+0530–U+058F
  return /[\u0530-\u058F]/.test(text);
}

// Check if text contains Cyrillic (Russian) characters
export function containsCyrillic(text: string): boolean {
  // Cyrillic Unicode range: U+0400–U+04FF
  return /[\u0400-\u04FF]/.test(text);
}
