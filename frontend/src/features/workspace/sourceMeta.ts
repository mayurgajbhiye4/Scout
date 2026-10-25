import type { Source } from '@/api/sources';
import { normalizeSourceTitle } from '@/lib/formatters';

export type SourceKind = 'pdf' | 'youtube' | 'github' | 'web' | 'notes';

export const SOURCE_KINDS: SourceKind[] = ['pdf', 'youtube', 'github', 'web', 'notes'];

export const KIND_META: Record<SourceKind, { label: string }> = {
  pdf: { label: 'PDF' },
  youtube: { label: 'YouTube' },
  github: { label: 'GitHub' },
  web: { label: 'Web' },
  notes: { label: 'Notes' },
};

// The UI has a single accent (teal), so source kinds are told apart by their icon, not a hue.
// Every kind shares one neutral; it stays a hex value because callers append alpha (`${color}1f`).
const KIND_NEUTRAL = { dark: '#a1a1aa', light: '#64748b' };

export function kindColor(_kind: SourceKind, isLight: boolean): string {
  return isLight ? KIND_NEUTRAL.light : KIND_NEUTRAL.dark;
}

export function getSourceKind(source: Pick<Source, 'source_type' | 'canonical_uri' | 'title'>): SourceKind {
  const type = (source.source_type || '').toLowerCase();
  const uri = (source.canonical_uri || '').toLowerCase();
  const title = (source.title || '').toLowerCase();

  if (type === 'youtube' || uri.includes('youtube.com') || uri.includes('youtu.be')) return 'youtube';
  if (type === 'github' || uri.includes('github.com')) return 'github';
  if (type === 'pdf' || uri.endsWith('.pdf') || title.endsWith('.pdf')) return 'pdf';
  if (['markdown', 'txt', 'text', 'docx', 'notion', 'note'].includes(type)) return 'notes';
  return 'web';
}

/** Infers the kind of a raw URL or file name the user is about to ingest. */
export function inferKindFromInput(input: string, fallback: SourceKind): SourceKind {
  const u = input.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('github.com')) return 'github';
  if (u.endsWith('.pdf')) return 'pdf';
  if (/\.(md|txt|json|csv)$/.test(u)) return 'notes';
  return fallback;
}

export function mapToBackendSourceType(kind: SourceKind, urlOrName: string): string {
  const u = (urlOrName || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('github.com')) return 'github';
  if (u.endsWith('.pdf')) return 'pdf';
  if (u.endsWith('.md')) return 'markdown';
  if (u.endsWith('.txt')) return 'txt';
  if (u.endsWith('.docx') || u.endsWith('.doc')) return 'docx';
  if (kind === 'pdf' || kind === 'youtube' || kind === 'github') return kind;
  if (kind === 'notes') return 'txt';
  return 'website';
}

export function getSourceTitle(source: Pick<Source, 'title' | 'canonical_uri'>): string {
  return normalizeSourceTitle(source.title, source.canonical_uri);
}

/** Second line under a source title: the repo owner, the host, or where it came from. */
export function getSourceSubtitle(source: Pick<Source, 'source_type' | 'canonical_uri' | 'title'>): string {
  const uri = source.canonical_uri || '';
  const kind = getSourceKind(source);
  if (!uri || !/^https?:\/\//i.test(uri)) {
    return kind === 'notes' ? 'Uploaded text' : 'Uploaded file';
  }
  try {
    const url = new URL(uri);
    if (kind === 'github') {
      const owner = url.pathname.split('/').filter(Boolean)[0];
      return owner ? `github.com/${owner}` : url.hostname;
    }
    if (kind === 'youtube') return 'YouTube video';
    return url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 ? url.pathname : '');
  } catch {
    return uri;
  }
}

export function getSourceUrl(source: Pick<Source, 'canonical_uri'>): string | null {
  const uri = source.canonical_uri || '';
  return /^https?:\/\//i.test(uri) ? uri : null;
}

export function getChunkCount(source: Source): number {
  return source.chunk_count || Number(source.metadata?.chunk_count) || 0;
}

export type SourceState = 'indexed' | 'ingesting' | 'failed' | 'stale';

export function getSourceState(source: Pick<Source, 'status'>): SourceState {
  switch (source.status) {
    case 'indexed':
    case 'ready':
      return 'indexed';
    case 'pending':
    case 'processing':
      return 'ingesting';
    case 'stale':
      return 'stale';
    default:
      return 'failed';
  }
}
