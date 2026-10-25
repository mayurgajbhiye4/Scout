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

export interface AddSourceApi {
  openLink: (kind: LinkKind) => void;
  pickFile: () => void;
  disabled: boolean;
  cooldownSec: number;
  element: ReactNode;
}

export const ADD_SOURCE_OPTIONS: Array<{ kind: SourceKind; label: string; action: 'youtube' | 'github' | 'web' | 'file' }> = [
  { kind: 'youtube', label: 'YouTube video', action: 'youtube' },
  { kind: 'github', label: 'GitHub repository', action: 'github' },
  { kind: 'web', label: 'Web page or PDF link', action: 'web' },
  { kind: 'notes', label: 'Text or Markdown file', action: 'file' },
];

export function runAddSourceOption(api: AddSourceApi, action: (typeof ADD_SOURCE_OPTIONS)[number]['action']) {
  if (action === 'file') api.pickFile();
  else api.openLink(action);
}
