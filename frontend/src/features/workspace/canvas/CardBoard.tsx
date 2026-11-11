import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link2, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceNode } from '../useWorkspaceData';
import { layoutCards, type CardBox } from './cardLayout';
import { prettyRelation, type NodeMark, type ViewLink } from './graphView';
import ShapeSwatch from './ShapeSwatch';

/**
 * The knowledge map as a board of connected cards. Each source, concept (and you) is a card; they read left to
 * right along their relations, joined by right-angled connectors. Mentions are faint dotted lines, relations are
 * dashed arrows in their relation's color, named while there are few of them or while they're in focus. The board
 * pans by dragging and zooms with the wheel.
 */

export type BoardNode = WorkspaceNode & {
  /** Mentioned by two or more of the sources on the map */
  shared?: boolean;
};

export interface CardBoardProps {
  width: number;
  height: number;
  nodes: BoardNode[];
  links: ViewLink[];
  nodeMark: (n: BoardNode) => NodeMark;
  typeLabel: (n: BoardNode) => string;
  linkColor: (l: ViewLink) => string;
  highlight: Set<string> | null;
  focusRoot: string | null;
  selectionId: string | null;
  /** Changes when the map shows something else (another scope or relationship): the board fits itself again. */
  viewKey: string;
  reducedMotion: boolean;
  onNodeHover: (node: BoardNode | null) => void;
  onNodeClick: (node: BoardNode) => void;
  onBackgroundClick: () => void;
}

export interface CardBoardHandle {
  zoomBy: (factor: number) => void;
  fit: () => void;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
// Fitting never shrinks cards past reading size; a bigger map starts at its sources and pans from there
const MIN_FIT = 0.7;
const PAD = 28;
// Kept clear along the bottom for the zoom control
const CONTROL_ROOM = 60;
// Up to this many relations, their names always show; past it, only on the ones in focus
const MAX_ALWAYS_LABELLED = 14;
// Past this many cards the entrance is skipped: that many blurs at once stutter
const MAX_ANIMATED = 40;
const DRAG_SLOP = 4;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const CardBoard = forwardRef<CardBoardHandle, CardBoardProps>(function CardBoard(
  {
    width,
    height,
    nodes,
    links,
    nodeMark,
    typeLabel,
    linkColor,
    highlight,
    focusRoot,
    selectionId,
    viewKey,
    reducedMotion,
    onNodeHover,
    onNodeClick,
    onBackgroundClick,
  },
  ref
) {
  const layout = useMemo(() => layoutCards(nodes, links), [nodes, links]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  // Moves made for the user (fit, zoom buttons, bringing a card into view) glide; their own drags and wheel don't
  const [glide, setGlide] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Once the user has moved the board it's theirs: resizes and refetches leave it where they put it
  const touched = useRef(false);

  const fitView = useCallback((): View => {
    if (layout.width === 0 || layout.height === 0) return { x: 0, y: 0, k: 1 };
    const room = height - PAD - CONTROL_ROOM;
    const k = clamp(Math.min((width - PAD * 2) / layout.width, room / layout.height), MIN_FIT, 1);
    const w = layout.width * k;
    return { x: w <= width - PAD * 2 ? (width - w) / 2 : PAD, y: PAD + (room - layout.height * k) / 2, k };
  }, [layout, width, height]);

  const lastViewKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return;
    if (lastViewKey.current !== viewKey) {
      lastViewKey.current = viewKey;
      touched.current = false;
    }
    if (!touched.current) setView(fitView());
  }, [viewKey, width, height, fitView]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    touched.current = true;
    setView((v) => {
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (factor) => {
        setGlide(true);
        zoomAt(factor, width / 2, height / 2);
      },
      fit: () => {
        touched.current = false;
        setGlide(true);
        setView(fitView());
      },
    }),
    [fitView, height, width, zoomAt]
  );

  // The wheel zooms about the pointer. Bound by hand: React's wheel listener is passive and can't stop the page scrolling.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setGlide(false);
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // A card picked elsewhere (the entity list, the concept card's arrows) comes into view if it's off the board
  useEffect(() => {
    const box = selectionId ? layout.cards.get(selectionId) : undefined;
    if (!box || width <= 0 || height <= 0) return;
    // A frame later, so it starts from wherever a fit in the same update has put the board
    const frame = requestAnimationFrame(() => {
      setGlide(true);
      setView((v) => {
        const left = v.x + box.x * v.k;
        const top = v.y + box.y * v.k;
        if (left >= PAD / 2 && top >= PAD / 2 && left + box.w * v.k <= width - PAD / 2 && top + box.h * v.k <= height - PAD / 2) return v;
        touched.current = true;
        return { k: v.k, x: width / 2 - (box.x + box.w / 2) * v.k, y: height / 2 - (box.y + box.h / 2) * v.k };
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectionId, layout, width, height]);

  // ── Dragging the board. The pointer is only captured once it has really moved, so a click still reaches its card ──
  const drag = useRef<{ pointerId: number; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-board-control]')) return;
    dragged.current = false;
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      d.moved = true;
      dragged.current = true;
      touched.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setGlide(false);
      setDragging(true);
      onNodeHover(null);
    }
    setView((v) => ({ ...v, x: d.viewX + dx, y: d.viewY + dy }));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    // The click that ends a drag isn't a pick
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (!(e.target as Element).closest('[data-card], [data-board-control]')) onBackgroundClick();
  };

  const animate = !reducedMotion && nodes.length <= MAX_ANIMATED;
  const content = useMemo(() => {
    const relationCount = layout.edges.filter((e) => !e.link.quiet).length;
    const isLit = (l: ViewLink) => focusRoot !== null && (l.source === focusRoot || l.target === focusRoot);
    // Lit connectors are drawn last, over the rest
    const edges = [...layout.edges].sort((a, b) => Number(isLit(a.link)) - Number(isLit(b.link)));
    return (
      <>
        <svg
          aria-hidden
          className={cn('pointer-events-none absolute left-0 top-0 overflow-visible', animate && 'ui-in-fade')}
          width={layout.width}
          height={layout.height}
        >
          {edges.map(({ key, link, d, end }) => {
            const lit = isLit(link);
            const dim = highlight !== null && !lit;
            const color = link.quiet ? (lit ? 'var(--ws-accent)' : 'var(--ws-line-strong)') : linkColor(link);
            const strokeWidth = lit ? 1.75 : link.quiet ? 1 : 1.25;
            return (
              <g key={key} className="transition-opacity duration-200" style={{ opacity: dim ? 0.14 : link.quiet && !lit ? 0.8 : 1 }}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={link.bridge ? undefined : link.quiet ? '1.5 5' : '6 4'}
                />
                {!link.quiet && (
                  <path
                    d={`M ${end.x - 6} ${end.y - 3.5} L ${end.x} ${end.y} L ${end.x - 6} ${end.y + 3.5}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {layout.edges.map(({ key, link, label }) => {
          if (link.quiet) return null;
          const lit = isLit(link);
          if (!lit && relationCount > MAX_ALWAYS_LABELLED) return null;
          const color = linkColor(link);
          return (
            <span
              key={key}
              title={link.description}
              className={cn(
                'absolute z-[1] max-w-[112px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border bg-[var(--ws-solid)] px-2 py-0.5 text-[10.5px] font-medium leading-4 transition-opacity duration-200',
                highlight !== null && !lit && 'opacity-20'
              )}
              style={{ left: label.x, top: label.y, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
            >
              {prettyRelation(link.relationship)}
            </span>
          );
        })}

        {nodes.map((node) => {
          const box = layout.cards.get(node.id);
          if (!box) return null;
          return (
            <Card
              key={node.id}
              node={node}
              box={box}
              mark={nodeMark(node)}
              typeLabel={typeLabel(node)}
              selected={node.id === selectionId}
              lit={highlight?.has(node.id) ?? false}
              dim={highlight !== null && !highlight.has(node.id)}
              animate={animate}
              onHover={onNodeHover}
              onClick={(n) => {
                if (!dragged.current) onNodeClick(n);
              }}
            />
          );
        })}
      </>
    );
  }, [animate, focusRoot, highlight, layout, linkColor, nodeMark, nodes, onNodeClick, onNodeHover, selectionId, typeLabel]);

  const moving = glide && !reducedMotion && !dragging;
  return (
    <div
      ref={viewportRef}
      className={cn('absolute inset-0 touch-none select-none overflow-hidden', dragging ? 'cursor-grabbing' : 'cursor-grab')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transition: moving ? 'transform 350ms var(--ui-ease)' : undefined,
        }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) setGlide(false);
        }}
      >
        {content}
      </div>

      <div
        data-board-control
        role="group"
        aria-label="Zoom"
        className="glass absolute bottom-4 left-4 flex h-8 cursor-default items-center rounded-full px-1 text-[var(--ws-ink-soft)]"
      >
        <ZoomButton label="Zoom out" disabled={view.k <= MIN_ZOOM} onClick={() => { setGlide(true); zoomAt(1 / 1.25, width / 2, height / 2); }}>
          <Minus size={13} />
        </ZoomButton>
        <button
          type="button"
          aria-label={`Zoom ${Math.round(view.k * 100)}%, reset to 100%`}
          title="Reset to 100%"
          onClick={() => {
            setGlide(true);
            zoomAt(1 / view.k, width / 2, height / 2);
          }}
          className="ui-press h-6 min-w-[42px] rounded-full px-1 text-[11.5px] font-medium tabular-nums hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
        >
          {Math.round(view.k * 100)}%
        </button>
        <ZoomButton label="Zoom in" disabled={view.k >= MAX_ZOOM} onClick={() => { setGlide(true); zoomAt(1.25, width / 2, height / 2); }}>
          <Plus size={13} />
        </ZoomButton>
      </div>
    </div>
  );
});

export default CardBoard;

function ZoomButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="ui-press grid h-6 w-6 place-items-center rounded-full hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:opacity-40 cursor-pointer disabled:cursor-default"
    >
      {children}
    </button>
  );
}

interface CardProps {
  node: BoardNode;
  box: CardBox;
  mark: NodeMark;
  typeLabel: string;
  selected: boolean;
  lit: boolean;
  dim: boolean;
  animate: boolean;
  onHover: (node: BoardNode | null) => void;
  onClick: (node: BoardNode) => void;
}

/** One node of the map. Sources and you are one-line pills; a concept card adds its type and what it is. */
function Card({ node, box, mark, typeLabel, selected, lit, dim, animate, onHover, onClick }: CardProps) {
  const pill = node.isSource || node.isUser;
  const style = { left: box.x, top: box.y, width: box.w, height: box.h, '--d': `${box.col * 60}ms` } as CSSProperties;
  const shell = cn(
    'glass ui-press absolute z-[2] text-left text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)]',
    animate && 'ui-in-up',
    node.isUser ? 'cursor-default' : 'cursor-pointer',
    lit && !selected && 'border-[var(--ws-line-strong)]',
    selected && 'border-[var(--ws-accent)] shadow-[0_0_0_1px_var(--ws-accent),0_0_24px_var(--ws-accent-wash)] hover:border-[var(--ws-accent)]',
    dim && 'opacity-35'
  );
  const handlers = {
    onMouseEnter: () => onHover(node),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(node),
    onBlur: () => onHover(null),
    onClick: () => onClick(node),
  };

  if (pill) {
    return (
      <button
        type="button"
        data-card
        aria-pressed={node.isUser ? undefined : selected}
        title={node.label}
        style={style}
        className={cn(shell, 'flex items-center gap-2 rounded-full px-4')}
        {...handlers}
      >
        <ShapeSwatch shape={mark.shape} color={mark.color} size={13} />
        <span className="sr-only">{typeLabel}: </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{node.label}</span>
        {node.isSource && (
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--ws-ink-faint)]">
            {node.degree} {node.degree === 1 ? 'concept' : 'concepts'}
          </span>
        )}
      </button>
    );
  }

  const mentions = new Set(node.sourceIds).size;
  return (
    <button
      type="button"
      data-card
      aria-pressed={selected}
      title={node.description ? `${node.label}: ${node.description}` : node.label}
      style={style}
      className={cn(shell, 'flex flex-col rounded-4xl px-4 py-[13px]')}
      {...handlers}
    >
      <span className="flex w-full items-center gap-1.5 text-[11px] font-medium leading-4 text-[var(--ws-ink-soft)]">
        <ShapeSwatch shape={mark.shape} color={mark.color} size={12} />
        <span className="min-w-0 truncate">{typeLabel}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[var(--ws-ink-faint)]">
          {node.shared && (
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--ws-ink-soft)]" title="Mentioned by more than one source">
              <span className="sr-only">Shared</span>
            </span>
          )}
          {node.degree > 0 && (
            <span className="flex items-center gap-0.5 tabular-nums" title={`${node.degree} connections`}>
              <Link2 size={11} aria-hidden />
              {node.degree}
            </span>
          )}
        </span>
      </span>
      <span className="mt-1 w-full truncate text-[13.5px] font-semibold leading-[18px]">{node.label}</span>
      <span className="mt-0.5 line-clamp-2 w-full text-[12px] leading-4 text-[var(--ws-ink-soft)]">
        {node.description ?? `Mentioned in ${mentions} ${mentions === 1 ? 'source' : 'sources'}`}
      </span>
    </button>
  );
}
