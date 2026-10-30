import type { CSSProperties } from 'react';
import { FilePdf, GithubLogo, Globe, YoutubeLogo } from '@phosphor-icons/react';
import Reveal from './Reveal';

const SOURCE_TYPES = [
  { icon: YoutubeLogo, label: 'YouTube videos' },
  { icon: FilePdf, label: 'PDFs' },
  { icon: GithubLogo, label: 'GitHub repos' },
  { icon: Globe, label: 'Web pages' },
];

/** The source types Scout reads; they light up one at a time, on a loop. Needs `mk-*` tokens from an ancestor. */
export default function SourceTypesRow({ className }: { className?: string }) {
  return (
    <Reveal stagger storyDelay={1200} className={`flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[var(--mk-ink-soft)] ${className ?? ''}`}>
      <p className="text-[var(--mk-ink-faint)]">Scout reads</p>
      <ul className="flex flex-wrap items-center justify-[inherit] gap-x-6 gap-y-3" aria-label="Source types Scout reads">
        {SOURCE_TYPES.map(({ icon: TypeIcon, label }, i) => (
          <li key={label} className="mk-type flex items-center gap-2" style={{ '--i': i } as CSSProperties}>
            <TypeIcon size={20} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
