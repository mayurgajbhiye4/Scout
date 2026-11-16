import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ExternalLink, MapPin, Network } from 'lucide-react';
import type { AnswerExtras } from '@/api/chat';
import type { Source } from '@/api/sources';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import type { ReferencedSourceItem } from '@/lib/citations';
import { KIND_ICON } from '../../canvas/addSourceOptions';
import { getSourceKind, kindColor, type SourceKind } from '../../sourceMeta';
import { passageFor } from './citationPassage';

/** One citation circle in the rendered answer, and the sentence it closes. */
interface Mark {
  el: HTMLElement;
  citation: number;
  /** The cited sentence around the circle; null for a circle that stands on its own. */
  claimEl: HTMLElement | null;
  key: string;
}

/** How long the card waits before closing once the pointer leaves, so it can be reached from its circle. */
const CLOSE_DELAY = 160;

/** The answer's citation circles, in reading order. */
function collectMarks(prose: HTMLElement): Mark[] {
  return [...prose.querySelectorAll<HTMLElement>('button.ws-cite')].map((el) => {
    const claimEl = el.closest<HTMLElement>('.ws-claim');
    return { el, citation: Number(el.dataset.cite), claimEl, key: claimEl?.dataset.claim ?? '' };
  });
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function kindOf(ref: ReferencedSourceItem | undefined, source: Source | undefined): SourceKind | 'graph' {
  if (source) return getSourceKind(source);
  if (ref?.origin === 'graph') return 'graph';
  if (ref?.sourceType === 'youtube') return 'youtube';
  return ref?.sourceType === 'document' ? 'pdf' : 'web';
}

/**
 * Where the card hangs: right under the line its circle is on, across the width of the answer. So it opens next
 * to the sentence it belongs to, lined up with the text rather than with wherever on the line the circle fell.
 */
function underLineOf(circle: HTMLElement, prose: HTMLElement) {
  return {
    getBoundingClientRect: () => {
      const line = circle.getBoundingClientRect();
      const text = prose.getBoundingClientRect();
      return new DOMRect(text.left, line.top, text.width, line.height);
    },
  };
}

/**
 * The passage behind a citation, in a card that opens over the answer right under the circle's line. Nothing
 * shows at rest and nothing in the answer moves. Pointing at a circle, or moving keyboard focus to it, opens its
 * card; the card can be reached with the pointer to use what's in it. Pressing a circle keeps its card open until
 * it is pressed again, Esc, or a press somewhere else.
 */
export function CitationCard({
  proseRef,
  content,
  extras,
  refs,
  sourcesById,
  isLight,
  onHoverSource,
  onSelectSource,
}: {
  proseRef: RefObject<HTMLElement | null>;
  /** The rendered answer text; its circles are collected again whenever it changes. */
  content: string;
  extras?: AnswerExtras | null;
  refs: ReferencedSourceItem[];
  sourcesById: Map<string, Source>;
  isLight: boolean;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
}) {
  const cardId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  // The answer's text block, kept beside its circles: the card is as wide as it
  const [prose, setProse] = useState<HTMLElement | null>(null);
  // The circle pressed to keep its card open, and the one under the pointer or the keyboard focus
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a circle is pressed from the keyboard: focus then goes into the card, to reach what's in it
  const focusCard = useRef(false);
  // Set while Esc hands focus back to a circle: that focus must not open the card again
  const returning = useRef(false);

  const stay = useCallback(() => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
  }, []);
  const leaveSoon = useCallback(() => {
    stay();
    closing.current = setTimeout(() => {
      closing.current = null;
      setHovered(null);
      onHoverSource(null);
    }, CLOSE_DELAY);
  }, [onHoverSource, stay]);
  useEffect(() => stay, [stay]);

  useLayoutEffect(() => {
    const el = proseRef.current;
    setProse(el);
    setMarks(el ? collectMarks(el) : []);
    setPinned(null);
    setHovered(null);
  }, [proseRef, content]);

  const wanted = hovered ?? pinned;
  const active = wanted !== null && wanted < marks.length ? wanted : null;

  // The circle whose card is open is filled and its sentence washed
  useEffect(() => {
    marks.forEach(({ el, citation, claimEl }, i) => {
      const title = refs.find((r) => r.displayIndex === citation)?.sourceTitle;
      const open = i === active;
      el.classList.toggle('is-active', open);
      el.setAttribute('aria-haspopup', 'dialog');
      el.setAttribute('aria-expanded', String(open));
      if (open) el.setAttribute('aria-controls', cardId);
      else el.removeAttribute('aria-controls');
      el.setAttribute('aria-label', title ? `Source ${citation}: ${title}` : `Source ${citation}`);
      claimEl?.classList.remove('is-active');
    });
    if (active !== null) marks[active]?.claimEl?.classList.add('is-active');
  }, [marks, active, refs, cardId]);

  useEffect(() => {
    if (!prose || marks.length === 0) return;
    const indexOf = (target: EventTarget | null) => {
      const el = (target as HTMLElement | null)?.closest?.<HTMLElement>('button.ws-cite');
      return el ? marks.findIndex((m) => m.el === el) : -1;
    };
    const sourceIdOf = (index: number) => {
      const id = refs.find((r) => r.displayIndex === marks[index]?.citation)?.sourceId;
      return id && sourcesById.has(id) ? id : null;
    };
    const enter = (e: Event) => {
      const index = indexOf(e.target);
      if (index < 0) return;
      if (e.type === 'focusin' && returning.current) {
        returning.current = false;
        return;
      }
      stay();
      setHovered(index);
      // The source lights up in the sources list and on the map too
      onHoverSource(sourceIdOf(index));
    };
    const leave = (e: Event) => {
      if (indexOf(e.target) >= 0) leaveSoon();
    };
    const press = (e: MouseEvent) => {
      const index = indexOf(e.target);
      if (index < 0) return;
      // A click with no pointer behind it came from Enter or Space
      const fromKeyboard = e.detail === 0;
      if (pinned === index) {
        // Pressed again: let go of it. From the keyboard that closes it; a pointer still resting on it keeps it open
        setPinned(null);
        if (fromKeyboard) setHovered(null);
        return;
      }
      focusCard.current = fromKeyboard;
      setPinned(index);
    };
    prose.addEventListener('mouseover', enter);
    prose.addEventListener('mouseout', leave);
    prose.addEventListener('focusin', enter);
    prose.addEventListener('focusout', leave);
    prose.addEventListener('click', press);
    return () => {
      prose.removeEventListener('mouseover', enter);
      prose.removeEventListener('mouseout', leave);
      prose.removeEventListener('focusin', enter);
      prose.removeEventListener('focusout', leave);
      prose.removeEventListener('click', press);
    };
  }, [prose, marks, refs, sourcesById, pinned, onHoverSource, stay, leaveSoon]);

  // After a keyboard press, into the card: at once when it is already open (focus had opened it), else as it mounts
  useEffect(() => {
    if (!focusCard.current || pinned === null || pinned !== active || !cardRef.current) return;
    focusCard.current = false;
    cardRef.current.focus();
  }, [pinned, active]);
  const attachCard = useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el;
    if (!el || !focusCard.current) return;
    focusCard.current = false;
    el.focus();
  }, []);

  const mark = active !== null ? marks[active] : undefined;
  const anchor = useMemo(() => (mark && prose ? { current: underLineOf(mark.el, prose) } : null), [mark, prose]);
  if (!mark || !anchor) return null;

  const close = () => {
    stay();
    setPinned(null);
    setHovered(null);
    onHoverSource(null);
  };

  const ref = refs.find((r) => r.displayIndex === mark.citation);
  const source = ref?.sourceId ? sourcesById.get(ref.sourceId) : undefined;
  const passage = passageFor(mark, extras, ref);
  const title = ref?.sourceTitle ?? `Source ${mark.citation}`;
  const host = ref?.url ? hostOf(ref.url) : '';
  const where = host || (passage?.chunkIndex !== undefined ? `passage ${passage.chunkIndex + 1}` : '');
  const kind = kindOf(ref, source);
  const KindIcon = kind === 'graph' ? Network : KIND_ICON[kind];
  const color = kindColor(kind === 'graph' ? 'web' : kind, isLight);
  const noPassage =
    kind === 'graph'
      ? 'This comes from the links between concepts on your knowledge map, not from one passage.'
      : 'No passage was saved for this source.';

  return (
    <Popover
      open
      onOpenChange={(next) => {
        if (next) return;
        // Esc: back to the circle if the keyboard was inside the card
        const inside = cardRef.current?.contains(document.activeElement);
        close();
        if (inside) {
          returning.current = true;
          mark.el.focus();
          returning.current = false;
        }
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        ref={attachCard}
        id={cardId}
        // Keyed by circle, so moving to another one opens a fresh card there instead of sliding this one over
        key={active}
        tabIndex={-1}
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={12}
        // The chat scrolls under it: it follows its line
        updatePositionStrategy="always"
        aria-label={`Passage from source ${mark.citation}: ${title}`}
        className="w-[min(440px,var(--radix-popover-trigger-width))] border-[var(--ws-accent)]/40 p-3.5"
        onMouseEnter={stay}
        onMouseLeave={leaveSoon}
        // Opening on hover or focus must not pull the keyboard out of the answer
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // A press on a circle is handled by its own click, which moves or releases the card
          const target = e.target as HTMLElement | null;
          if (target?.closest('button.ws-cite') && prose?.contains(target)) {
            e.preventDefault();
            return;
          }
          close();
        }}
      >
        <figure className="m-0">
          <figcaption className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
              aria-hidden
            >
              <KindIcon size={12} />
            </span>
            <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--ws-ink)]" title={title}>
              {title}
              {where && <span className="font-normal text-[var(--ws-ink-soft)]"> · {where}</span>}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
              <span className="font-mono text-[11px] text-[var(--ws-ink-faint)]">Source {mark.citation}</span>
              {ref?.url && (
                <a href={ref.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title}`} title="Open source" className="ws-icon-btn">
                  <ExternalLink size={13} />
                </a>
              )}
              {!ref?.url && source && (
                <button type="button" onClick={() => onSelectSource(source.id)} aria-label={`Show ${title} on the map`} title="Show on the map" className="ws-icon-btn">
                  <MapPin size={13} />
                </button>
              )}
            </span>
          </figcaption>
          <blockquote className="m-0 mt-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words rounded-4xl bg-[var(--ws-card)] px-4 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--ws-ink-soft)]">
            {passage ? (
              <>
                {!passage.exact && <span className="mb-1 block text-[11px] text-[var(--ws-ink-faint)]">Nearest passage in this source</span>}
                {passage.quote}
              </>
            ) : (
              noPassage
            )}
          </blockquote>
        </figure>
      </PopoverContent>
    </Popover>
  );
}
