export type ParsedMarkdownImage = {
  alt: string;
  rawSrc: string;
};

const markdownImagePattern = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;

export function parseMarkdownImageLiteral(
  literal: string
): ParsedMarkdownImage | null {
  const match = literal.match(markdownImagePattern);
  if (!match) {
    return null;
  }
  const alt = match[1] ?? "";
  const rawSrc = (match[2] ?? "").trim();
  if (!rawSrc) {
    return null;
  }
  return { alt, rawSrc };
}
