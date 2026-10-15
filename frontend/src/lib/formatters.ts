/**
 * Date and status formatting utilities.
 */

import { formatDistanceToNow } from 'date-fns';

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
}

export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
}

export function formatStatusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'Completed';
    case 'researching':
      return 'Researching';
    case 'planning':
      return 'Planning';
    case 'finalizing':
      return 'Finalizing';
    case 'failed':
      return 'Failed';
    case 'queued':
      return 'Queued';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function normalizeSourceTitle(title?: string | null, uri?: string | null): string {
  const isUrlLike = (str?: string | null) => {
    if (!str) return false;
    const trimmed = str.trim();
    return /^https?:\/\//i.test(trimmed) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed);
  };

  const raw = (!title || isUrlLike(title)) ? (uri || title || '') : title;

  if (!raw || !raw.trim()) {
    return 'Untitled Source';
  }

  const trimmed = raw.trim();

  // If title was provided and doesn't look like a URL or filepath, keep it
  if (title && !isUrlLike(title) && !title.includes('://')) {
    return title.trim();
  }

  try {
    let urlObj: URL | null = null;
    try {
      urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } catch {
      urlObj = null;
    }

    if (urlObj) {
      const hostname = urlObj.hostname.replace(/^www\./i, '');
      const pathname = urlObj.pathname.replace(/\/+$/, '');

      // YouTube
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        const v = urlObj.searchParams.get('v');
        if (v) return `YouTube: Video (${v})`;
        const pathParts = pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) return `YouTube: ${pathParts[pathParts.length - 1] ?? ''}`;
        return 'YouTube Video';
      }

      // GitHub
      if (hostname.includes('github.com')) {
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
          if (parts.length === 2) return `${parts[0]} / ${parts[1]}`;
          const last = parts[parts.length - 1] ?? '';
          return `${parts[1]}: ${formatSlug(last)}`;
        }
        if (parts.length === 1) return `GitHub: ${parts[0]}`;
        return 'GitHub Repository';
      }

      // arXiv
      if (hostname.includes('arxiv.org')) {
        const parts = pathname.split('/').filter(Boolean);
        const id = parts[parts.length - 1]?.replace(/\.pdf$/i, '');
        return id ? `arXiv: ${id}` : 'arXiv Paper';
      }

      // Wikipedia
      if (hostname.includes('wikipedia.org')) {
        const parts = pathname.split('/').filter(Boolean);
        const wikiPart = parts[parts.length - 1];
        if (wikiPart) {
          return decodeURIComponent(wikiPart).replace(/_/g, ' ');
        }
      }

      // General Web / Documentation URLs
      const pathSegments = pathname.split('/').filter(Boolean);

      if (pathSegments.length > 0) {
        const lastRaw = pathSegments[pathSegments.length - 1] ?? '';
        let lastSegment = decodeURIComponent(lastRaw);
        lastSegment = lastSegment.replace(/\.(html?|php|asp[x]?|md|pdf|txt)$/i, '');

        if (/^\d+$/.test(lastSegment) && pathSegments.length > 1) {
          const prev = decodeURIComponent(pathSegments[pathSegments.length - 2] ?? '');
          return `${formatSlug(prev)} #${lastSegment}`;
        }

        const formatted = formatSlug(lastSegment);
        if (formatted && formatted.length > 1) {
          return formatted;
        }
      }

      // Fallback: Domain name
      const domainName = hostname.split('.')[0] || hostname;
      return domainName.charAt(0).toUpperCase() + domainName.slice(1);
    }

    // Local file path
    const normalizedPath = trimmed.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || trimmed;
    return formatSlug(filename.replace(/\.[^/.]+$/, ''));
  } catch {
    return trimmed;
  }
}

function formatSlug(slug?: string | null): string {
  if (!slug) return '';
  return slug
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word.toUpperCase() === word && word.length > 1) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Clean and format chat session titles to ensure they are concise, meaningful summaries
 * rather than raw user prompts, cut-off questions, or boilerplate starters.
 */
export function formatSessionTitle(rawTitle?: string | null): string {
  if (!rawTitle || !rawTitle.trim()) {
    return 'Untitled Session';
  }

  let text = rawTitle.trim();

  // Fix common unicode glitches (e.g.  or bad apostrophes)
  text = text.replace(/[\uFFFD\u0080-\u009F]/g, "'");

  // Remove common starter prompt boilerplate
  const starterReplacements: [RegExp, string][] = [
    [/^extract key insights,?\s*chapters,?\s*and fact-check arguments from this lecture video:?\s*/i, 'Lecture Insights: '],
    [/^synthesize methodology and empirical conclusions from the uploaded pdf paper\.?\s*/i, 'Paper Synthesis: '],
    [/^analyze repository architecture and summarize technical design tradeoffs:?\s*/i, 'Repo Architecture: '],
    [/^index this documentation site and explain core api patterns:?\s*/i, 'API Patterns: '],
    [/^identify emerging breakthroughs and paradigm shifts in\s*/i, 'Breakthroughs in '],
    [/^synthesize consensus and conflicting findings across\s*/i, 'Consensus across '],
    [/^summarize this video in \d+ lines?:?\s*/i, 'Video Summary: '],
    [/^summarize this in \d+ lines?:?\s*/i, 'Summary: '],
    [/^(can you please explain to me|can you explain to me|can you explain)\s*/i, ''],
    [/^tell me more about\s*/i, ''],
    [/^what is this repo about\??/i, 'Repository Overview'],
  ];

  for (const [pattern, replacement] of starterReplacements) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement).trim();
      break;
    }
  }

  // Strip URLs if raw URLs are embedded in title
  text = text.replace(/https?:\/\/\S+/gi, '').trim();

  // If title was stripped down completely
  if (!text) {
    return 'Research Session';
  }

  // Strip trailing cut-off punctuation and prepositions (e.g., "to", "of", "and", "in", "for", "with", "from")
  text = text.replace(/\s+(to|of|and|in|on|for|with|from|about|the|a|an|vs|by|at)$/i, '').trim();
  text = text.replace(/[:,\-.?!]+$/, '').trim();

  // Enforce a brief title length (max ~38 characters) without cutting words mid-way
  const MAX_TITLE_LEN = 38;
  if (text.length > MAX_TITLE_LEN) {
    const cut = text.slice(0, MAX_TITLE_LEN);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 18) {
      text = cut.slice(0, lastSpace).trim();
    } else {
      text = cut.trim();
    }
    text = text.replace(/[:,\-.?!]+$/, '').trim();
  }

  // Capitalize first character if needed
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text || 'Research Session';
}

/**
 * Derive an initial brief title when creating a session from user prompt and attached sources.
 */
export function deriveInitialSessionTitle(
  prompt: string,
  attachedSources?: Array<{ title?: string; type?: string; urlOrName?: string }>
): string {
  // 1. If there's an attached source with a meaningful title, use it as anchor
  if (attachedSources && attachedSources.length > 0) {
    const firstSource = attachedSources[0];
    if (firstSource) {
      const sourceTitle = normalizeSourceTitle(firstSource.title, firstSource.urlOrName);
      if (sourceTitle && sourceTitle !== 'Untitled Source') {
        const cleanSource = sourceTitle.length > 25 ? sourceTitle.slice(0, 25).trim() + '...' : sourceTitle;
        const lowerPrompt = prompt.toLowerCase();
        if (lowerPrompt.includes('summary') || lowerPrompt.includes('summarize')) {
          return `${cleanSource}: Summary`;
        }
        if (lowerPrompt.includes('insight') || lowerPrompt.includes('chapter')) {
          return `${cleanSource}: Insights`;
        }
        if (lowerPrompt.includes('architect') || lowerPrompt.includes('code')) {
          return `${cleanSource}: Architecture`;
        }
        return `${cleanSource} Analysis`;
      }
    }
  }

  // 2. Otherwise format and condense the prompt
  if (prompt && prompt.trim()) {
    const formatted = formatSessionTitle(prompt);
    if (formatted && formatted !== 'Untitled Session') {
      return formatted;
    }
  }

  return 'Research Session';
}

/**
 * Provide an informative fallback summary if session.session_summary is not yet generated.
 */
export function getSmartSessionFallbackSummary(session: {
  title?: string | null;
  mode?: string;
}): string {
  const cleanTitle = formatSessionTitle(session.title);
  if (session.mode === 'deep_research' || session.mode === 'research') {
    return `Autonomous multi-step deep research and grounded synthesis on ${cleanTitle.toLowerCase()}.`;
  }
  return `Conversational grounded retrieval and research insights for ${cleanTitle.toLowerCase()}.`;
}

