import type { ReactNode } from 'react';
import { FileText, Github, Globe, StickyNote, Youtube, type LucideIcon } from 'lucide-react';
import type { SourceKind } from '../sourceMeta';

export type LinkKind = 'youtube' | 'github' | 'web';

export const KIND_ICON: Record<SourceKind, LucideIcon> = {
  pdf: FileText,
  youtube: Youtube,
  github: Github,
  web: Globe,
  notes: StickyNote,
};

/** What a drop added: links, PDF, Word and text files go in; other files (an image, a .doc) are skipped. */
export interface DropResult {
  added: number;
  skipped: number;
}

/** The distinct http(s) links in some text: a uri-list, a pasted URL, or several separated by whitespace. */
export function linksIn(text: string): string[] {
  return [...new Set(text.split(/\s+/).filter((t) => /^https?:\/\/\S+$/i.test(t)))];
}

export interface AddSourceApi {
  openLink: (kind: LinkKind) => void;
  pickFile: () => void;
  /** Adds whatever was dragged in: links (one per line), or PDF, Word, text and Markdown files. Anything else is skipped. */
  dropSources: (data: DataTransfer) => DropResult;
  disabled: boolean;
  cooldownSec: number;
  element: ReactNode;
}

export const ADD_SOURCE_OPTIONS: Array<{ kind: SourceKind; label: string; action: 'youtube' | 'github' | 'web' | 'file' }> = [
  { kind: 'youtube', label: 'YouTube video', action: 'youtube' },
  { kind: 'github', label: 'GitHub repository', action: 'github' },
  { kind: 'web', label: 'Web page', action: 'web' },
  // PDF, Word (.docx), text and Markdown; the picker and the server refuse anything else
  { kind: 'pdf', label: 'File upload', action: 'file' },
];

export function runAddSourceOption(api: AddSourceApi, action: (typeof ADD_SOURCE_OPTIONS)[number]['action']) {
  if (action === 'file') api.pickFile();
  else api.openLink(action);
}
