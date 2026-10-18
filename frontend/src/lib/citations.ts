/**
 * Citation utilities for frontend report rendering and chat source resolution.
 */

export interface ParsedCitation {
  index: number;
  raw: string;
}

export interface ReferencedSourceItem {
  key: string;
  sourceId?: string;
  sourceTitle: string;
  displayIndex: number;
  sourceType: 'youtube' | 'graph' | 'document' | 'web';
  snippets: string[];
  url?: string;
  isExplicitlyCited: boolean;
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

/**
 * Resolves raw message citations into unique, actual referenced sources:
 * 1. Groups duplicate chunks belonging to the same source.
 * 2. If the response text uses numerical citations [1], [2], filters down to only the sources actually referenced.
 * 3. Identifies whether sources come from Normal RAG (YouTube, Docs, Web) or Knowledge Graph relationships.
 * 4. Re-assigns clean sequential display indices.
 */
export function resolveReferencedSources(
  citations: any[] = [],
  markdown: string = ''
): ReferencedSourceItem[] {
  if (!citations || !Array.isArray(citations) || citations.length === 0) {
    return [];
  }

  // 1. Extract citation numbers from markdown [1], [2], etc.
  const parsed = extractCitationsFromMarkdown(markdown || '');
  const citedIndices = new Set(parsed.map((p) => p.index));
  const hasNumericalCitations = citedIndices.size > 0;
  const lowMarkdown = (markdown || '').toLowerCase();

  // 2. Map & group citations by unique source
  const sourceGroups = new Map<
    string,
    {
      sourceId?: string;
      sourceTitle: string;
      sourceType: 'youtube' | 'graph' | 'document' | 'web';
      snippets: Set<string>;
      url?: string;
      indices: Set<number>;
    }
  >();

  for (let i = 0; i < citations.length; i++) {
    const c = citations[i];
    if (!c) continue;

    const sourceId = c.source_id || c.sourceId || c.locator?.source_id;
    const title = (
      c.source_title ||
      c.locator?.source_title ||
      c.title ||
      (c.citation_index ? `Source ${c.citation_index}` : `Source ${i + 1}`)
    ).trim();

    const url = c.canonical_uri || c.url || c.locator?.canonical_uri || c.locator?.url;
    const snippet = c.snippet || c.locator?.snippet || c.content;
    const citationIdx = c.citation_index ?? (i + 1);

    // Grouping key: prefer sourceId if available, otherwise normalized title or URL
    const groupKey = sourceId
      ? `id:${sourceId}`
      : url
      ? `url:${url.toLowerCase().trim()}`
      : `title:${title.toLowerCase().trim()}`;

    if (!sourceGroups.has(groupKey)) {
      // Determine type
      let type: 'youtube' | 'graph' | 'document' | 'web' = 'web';
      const lowTitle = title.toLowerCase();
      const lowUrl = (url || '').toLowerCase();
      const rawType = (c.source_type || c.locator?.source_type || '').toLowerCase();

      if (
        rawType === 'graph' ||
        lowTitle.includes('knowledge graph') ||
        lowTitle.startsWith('graph:')
      ) {
        type = 'graph';
      } else if (
        rawType === 'youtube' ||
        lowTitle.includes('youtube') ||
        lowUrl.includes('youtube') ||
        lowUrl.includes('youtu.be')
      ) {
        type = 'youtube';
      } else if (
        rawType === 'pdf' ||
        rawType === 'docx' ||
        rawType === 'txt' ||
        rawType === 'file' ||
        lowTitle.endsWith('.pdf') ||
        lowTitle.endsWith('.docx') ||
        lowTitle.endsWith('.txt')
      ) {
        type = 'document';
      }

      sourceGroups.set(groupKey, {
        sourceId: sourceId ? String(sourceId) : undefined,
        sourceTitle: title,
        sourceType: type,
        snippets: new Set<string>(),
        url: url || undefined,
        indices: new Set<number>(),
      });
    }

    const group = sourceGroups.get(groupKey)!;
    if (snippet && typeof snippet === 'string' && snippet.trim()) {
      group.snippets.add(snippet.trim());
    }
    if (typeof citationIdx === 'number') {
      group.indices.add(citationIdx);
    }
  }

  // 3. Determine actual referenced sources
  const items: ReferencedSourceItem[] = [];

  for (const [key, group] of sourceGroups.entries()) {
    const isCitedByIndex =
      hasNumericalCitations &&
      Array.from(group.indices).some((idx) => citedIndices.has(idx));
    const isCitedByTitle =
      group.sourceTitle.length > 4 && lowMarkdown.includes(group.sourceTitle.toLowerCase());

    // An item is kept if:
    // a) No explicit numerical citations were used in markdown (so all provided unique context sources grounded it)
    // b) OR it was specifically cited by number [X]
    // c) OR its title was explicitly mentioned in the text
    const shouldKeep = !hasNumericalCitations || isCitedByIndex || isCitedByTitle;

    if (shouldKeep) {
      items.push({
        key,
        sourceId: group.sourceId,
        sourceTitle: group.sourceTitle,
        displayIndex: 0,
        sourceType: group.sourceType,
        snippets: Array.from(group.snippets),
        url: group.url,
        isExplicitlyCited: isCitedByIndex || isCitedByTitle,
      });
    }
  }

  // 4. Assign clean sequential display indices 1, 2, 3...
  return items.map((item, index) => ({
    ...item,
    displayIndex: index + 1,
  }));
}
