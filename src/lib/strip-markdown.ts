/**
 * Strip markdown formatting from text for plain-text display.
 */
export function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')   // bold+italic
    .replace(/\*\*(.*?)\*\*/g, '$1')         // bold
    .replace(/\*(.*?)\*/g, '$1')             // italic
    .replace(/^#{1,6}\s+/gm, '')             // headers
    .replace(/^[-*]\s/gm, '\u2022 ')         // list items
    .replace(/^>\s?/gm, '')                  // blockquotes
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) =>   // inline/block code - keep content
      m.replace(/`/g, ''))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^---+$/gm, '')                 // horizontal rules
    .replace(/\n{3,}/g, '\n\n');             // excessive newlines
}
