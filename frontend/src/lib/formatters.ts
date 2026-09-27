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

