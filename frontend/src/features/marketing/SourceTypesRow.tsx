import type { CSSProperties } from 'react';
import { KIND_ICON } from '@/features/workspace/canvas/addSourceOptions';
import type { SourceKind } from '@/features/workspace/sourceMeta';
import Reveal from './Reveal';

const SOURCE_TYPES: Array<{ kind: SourceKind; label: string }> = [
  { kind: 'youtube', label: 'YouTube videos' },
  { kind: 'pdf', label: 'PDFs' },
  { kind: 'github', label: 'GitHub repos' },
  { kind: 'web', label: 'Web pages' },
];

/** The source types Dusk reads, with the workspace's own icons; they light up one at a time, on a loop. */
export default function SourceTypesRow({ className }: { className?: string }) {
  return (
    <Reveal stagger storyDelay={1200} className={`glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl px-6 py-2.5 text-sm text-[var(--ws-ink-soft)] ${className ?? ''}`}>
      <ul className="flex flex-wrap items-center justify-[inherit] gap-x-6 gap-y-3" aria-label="Source types Dusk reads">
        {SOURCE_TYPES.map(({ kind, label }, i) => {
          const TypeIcon = KIND_ICON[kind];
          return (
            <li key={kind} className="source-type flex items-center gap-2" style={{ '--i': i } as CSSProperties}>
              <TypeIcon size={18} aria-hidden />
              {label}
            </li>
          );
        })}
      </ul>
    </Reveal>
  );
}
