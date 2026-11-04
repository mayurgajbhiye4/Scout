import React, { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useRateLimit } from '@/lib/rateLimitManager';
import { cn } from '@/lib/utils';
import { kindColor, type SourceKind } from '../sourceMeta';
import { useTheme } from '@/features/theme';
import { KIND_ICON, type AddSourceApi, type DropResult, type LinkKind } from './addSourceOptions';

// Files the library can read as text; the file picker accepts the same
const TEXT_FILE = /\.(txt|md|markdown|json|csv)$/i;

const LINK_COPY: Record<LinkKind, { title: string; placeholder: string; cta: string }> = {
  youtube: {
    title: 'Add a YouTube video',
    placeholder: 'https://www.youtube.com/watch?v=…',
    cta: 'Add video',
  },
  github: {
    title: 'Add a GitHub repository',
    placeholder: 'https://github.com/owner/repository',
    cta: 'Add repository',
  },
  web: {
    title: 'Add a web page or PDF link',
    placeholder: 'https://arxiv.org/pdf/1706.03762.pdf',
    cta: 'Add link',
  },
};

/** One dialog + one hidden file input, shared by every "add source" affordance in the workspace. */
export function useAddSource(ingest: (kind: SourceKind, input: string, content?: string) => void): AddSourceApi {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { isScopeRateLimited, getScopeSecondsLeft } = useRateLimit();
  const disabled = isScopeRateLimited('sources:ingest');
  const cooldownSec = getScopeSecondsLeft('sources:ingest');
  const [linkKind, setLinkKind] = useState<LinkKind | null>(null);
  const [value, setValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const guard = useCallback(() => {
    if (disabled) {
      return false;
    }
    return true;
  }, [disabled]);

  const openLink = useCallback((kind: LinkKind) => {
    if (!guard()) return;
    setValue('');
    setLinkKind(kind);
  }, [guard]);

  const pickFile = useCallback(() => {
    if (!guard()) return;
    fileRef.current?.click();
  }, [guard]);

  const submit = () => {
    if (!linkKind || !value.trim()) return;
    ingest(linkKind, value.trim());
    setLinkKind(null);
  };

  const readTextFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => ingest('notes', file.name, String(evt.target?.result || ''));
    reader.readAsText(file);
  }, [ingest]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) readTextFile(file);
  };

  const dropSources = useCallback((data: DataTransfer): DropResult => {
    if (!guard()) return { added: 0, skipped: 0 };
    const files = Array.from(data.files);
    if (files.length > 0) {
      const readable = files.filter((f) => TEXT_FILE.test(f.name) || f.type.startsWith('text/'));
      readable.forEach(readTextFile);
      return { added: readable.length, skipped: files.length - readable.length };
    }
    // Links come as a uri-list (lines starting with # are comments) or as plain text
    const uriList = data.getData('text/uri-list');
    const text = (uriList || data.getData('text/plain') || '').trim();
    if (!text) return { added: 0, skipped: 0 };
    const links = text.split(/\s+/).filter((t) => /^https?:\/\/\S+$/i.test(t));
    if (links.length > 0) {
      links.forEach((link) => ingest('web', link));
      return { added: links.length, skipped: 0 };
    }
    ingest('notes', (text.split('\n')[0] ?? text).slice(0, 80), text);
    return { added: 1, skipped: 0 };
  }, [guard, ingest, readTextFile]);

  const copy = linkKind ? LINK_COPY[linkKind] : null;
  const Icon = linkKind ? KIND_ICON[linkKind] : null;

  const element = (
    <>
      <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.json,.csv" onChange={onFile} />
      <Dialog open={Boolean(linkKind)} onOpenChange={(o) => !o && setLinkKind(null)}>
        {copy && Icon && linkKind && (
          <DialogContent className="font-ui w-[92vw] max-w-md rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-dock)] p-6 text-[var(--ws-ink)] shadow-[var(--ws-shadow)]">
            <DialogHeader className="p-0 pr-8">
              <DialogTitle className="flex items-center gap-2.5 text-[15px] font-semibold">
                <Icon size={18} style={{ color: kindColor(linkKind, isLight) }} />
                {copy.title}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex flex-col gap-3 pt-1"
            >
              <input
                autoFocus
                type="url"
                inputMode="url"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={copy.placeholder}
                aria-label={copy.title}
                className="h-10 w-full rounded-full border border-[var(--ws-line)] bg-[var(--ws-canvas)] px-3.5 text-base sm:text-[13px] text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-faint)] outline-none focus:border-[var(--ws-accent)] focus:ring-2 focus:ring-[var(--ws-accent-wash)]"
              />
              <DialogFooter className="gap-2 p-0 pt-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setLinkKind(null)}
                  className="ui-press h-9 rounded-full px-4 text-[13px] font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!value.trim()}
                  className={cn(
                    'ui-press h-9 rounded-full px-4 text-[13px] font-semibold cursor-pointer',
                    value.trim()
                      ? 'bg-[var(--ws-accent)] text-white hover:brightness-110'
                      : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-faint)] cursor-not-allowed'
                  )}
                >
                  {copy.cta}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );

  return { openLink, pickFile, dropSources, disabled, cooldownSec, element };
}
