/**
 * Citation utilities for frontend report rendering.
 */

export interface ParsedCitation {
  index: number;
  raw: string;
}

/**
 * Extracts all unique citation numbers [1], [2], etc. from markdown text.
 */
export function extractCitationsFromMarkdown(markdown: string): ParsedCitation[] {
  const regex = /\[(\d+)\]/g;
  const citations: ParsedCitation[] = [];
  const seen = new Set<number>();

  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const num = parseInt(match[1]!, 10);
    if (!seen.has(num)) {
      seen.add(num);
      citations.push({
        index: num,
        raw: match[0],
      });
    }
  }

  return citations.sort((a, b) => a.index - b.index);
}
