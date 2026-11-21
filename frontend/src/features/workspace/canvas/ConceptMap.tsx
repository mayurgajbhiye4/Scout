import { useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceNode } from '../useWorkspaceData';
import { layoutConceptMap, type PillBox } from './conceptMapLayout';
import { prettyRelation, relationColor, relationTone, type NodeMark, type ViewLink } from './graphView';
import ShapeSwatch from './ShapeSwatch';

/**
 * The knowledge map: every concept the session's sources cover on one map, drawn like the one on the marketing
 * page. Concepts are pills, relations are straight lines named where there's room, and the most connected concept
 * sits in the middle in orange. The map doesn't pan, zoom or drag: it is laid out once for what's on it, scaled to
 * fit its box, and only changes when its concepts do. Pointing at a concept (or focusing or picking it) lights its
 * relations and opens a card saying what it is.
 */

export type MapNode = WorkspaceNode & {
  /** Mentioned by two or more of the sources on the map */
  shared?: boolean;
};

export interface ConceptMapProps {
  width: number;
  height: number;
  nodes: MapNode[];
  links: ViewLink[];
  nodeMark: (n: MapNode) => NodeMark;
  typeLabel: (n: MapNode) => string;
  isLight: boolean;
  highlight: Set<string> | null;
  /** The concept in focus: hovered here or in the entity list, else the picked one. Its card is open. */
  focusRoot: string | null;
  selectionId: string | null;
  reducedMotion: boolean;
  /** Width at the right edge that something covers (the chat window); the map fits into what's left. */
  insetRight?: number;
  onNodeHover: (node: MapNode | null) => void;
  onNodeClick: (node: MapNode) => void;
  onBackgroundClick: () => void;
}

// Pills are never drawn larger than this, or smaller than their box allows
const MAX_SCALE = 1.15;
// Never squeeze the map narrower than this to clear the inset; past it, the right side may run under the window
const MIN_FIT_WIDTH = 320;

/** How much a concept says on the map, from how connected it is there: hubs, linked concepts, and loose ones. */
type Weight = 'hub' | 'linked' | 'loose';

const WEIGHT_TEXT: Record<Weight, string> = {
  hub: 'text-[14px] font-semibold text-[var(--ws-ink)]',
  linked: 'text-[13px] font-medium text-[var(--ws-ink)]',
  loose: 'text-[13px] font-normal text-[var(--ws-ink-soft)]',
};
const WEIGHT_DOT: Record<Weight, string> = {
  hub: 'h-2 w-2 bg-[var(--ws-ink-soft)]',
  linked: 'h-1.5 w-1.5 bg-[var(--ws-ink-faint)]',
  loose: 'h-1.5 w-1.5 bg-[var(--ws-ink-faint)] opacity-60',
};
// The map is laid out for the box's rough shape, so resizing a little doesn't move anything
const ASPECT_STEP = 0.4;
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.6;
const CARD_W = 264;
const CARD_GAP = 10;
// Roughly how tall a card gets, to find it a place that covers as little of what it's about as possible
const CARD_H = 136;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function ConceptMap({
  width,
  height,
  nodes,
  links,
  nodeMark,
  typeLabel,
  isLight,
  highlight,
  focusRoot,
  selectionId,
  reducedMotion,
  insetRight = 0,
  onNodeHover,
  onNodeClick,
  onBackgroundClick,
}: ConceptMapProps) {
  // The part of the box left in view: the map is laid out for and centred in it
  const fitWidth = Math.max(Math.min(width, MIN_FIT_WIDTH), width - insetRight);
  const aspect = Math.round(clamp(fitWidth / Math.max(1, height), MIN_ASPECT, MAX_ASPECT) / ASPECT_STEP) * ASPECT_STEP;
  const layout = useMemo(() => layoutConceptMap(nodes, links, aspect), [nodes, links, aspect]);

  const scale = layout.width > 0 ? Math.min(fitWidth / layout.width, height / layout.height, MAX_SCALE) : 1;
  const left = (fitWidth - layout.width * scale) / 2;
  const top = (height - layout.height * scale) / 2;

  // Each concept's relations on the map: the most connected read heaviest, and ones with none step back
  const weights = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of links) {
      counts.set(l.source, (counts.get(l.source) ?? 0) + 1);
      counts.set(l.target, (counts.get(l.target) ?? 0) + 1);
    }
    const max = Math.max(0, ...counts.values());
    const weightOf = (id: string): Weight => {
      const n = counts.get(id) ?? 0;
      if (n === 0) return 'loose';
      return n >= 3 && n >= max * 0.6 ? 'hub' : 'linked';
    };
    return new Map(nodes.map((n) => [n.id, weightOf(n.id)]));
  }, [links, nodes]);

  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!(e.target as Element).closest('[data-pill]')) onBackgroundClick();
  };

  const map = useMemo(() => {
    const isLit = (l: ViewLink) => focusRoot !== null && (l.source === focusRoot || l.target === focusRoot);
    // Lit lines are drawn last, over the rest
    const edges = [...layout.edges].sort((a, b) => Number(isLit(a.link)) - Number(isLit(b.link)));
    return (
      <>
        <svg
          aria-hidden
          className={cn('pointer-events-none absolute left-0 top-0 overflow-visible', !reducedMotion && 'ui-in-fade')}
          width={layout.width}
          height={layout.height}
        >
          {edges.map(({ key, link, x1, y1, x2, y2 }) => {
            const lit = isLit(link);
            const stroke = lit ? 'var(--ws-accent)' : 'var(--ws-line-strong)';
            // Which way the relation reads, shown only while it's in focus so the map stays quiet at rest
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const wing = (turn: number) => `${x2 - 7 * Math.cos(angle + turn)} ${y2 - 7 * Math.sin(angle + turn)}`;
            return (
              <g key={key} className="transition-opacity duration-200" style={{ opacity: highlight !== null && !lit ? 0.25 : 1 }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={lit ? 1.75 : 1.25} strokeLinecap="round" />
                {lit && (
                  <path
                    d={`M ${wing(0.45)} L ${x2} ${y2} L ${wing(-0.45)}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* A relation's name shows only while one of its concepts is pointed at or picked, so the map stays quiet */}
        {layout.edges.map(({ key, link, label }) => {
          if (!isLit(link)) return null;
          const tone = relationTone(link.relationship);
          return (
            <span
              key={key}
              title={link.description}
              className={cn(
                'absolute z-[3] grid h-5 -translate-x-1/2 -translate-y-1/2 place-items-center whitespace-nowrap rounded-full border border-[var(--ws-accent)]/50 bg-[var(--ws-solid)] px-2 text-[11px] leading-none text-[var(--ws-ink)]',
                !reducedMotion && 'ui-in-fade'
              )}
              style={{
                left: label.x,
                top: label.y,
                // Agreement and opposition keep their color; every other relation is as quiet as its line
                color: tone === 'neutral' ? undefined : relationColor(link.relationship, isLight),
                '--d': '260ms',
              } as CSSProperties}
            >
              {prettyRelation(link.relationship)}
            </span>
          );
        })}

        {nodes.map((node, i) => {
          const box = layout.pills.get(node.id);
          if (!box) return null;
          const selected = node.id === selectionId;
          const weight = weights.get(node.id) ?? 'loose';
          const dimmed = highlight !== null ? !highlight.has(node.id) : weight === 'loose' && !selected;
          return (
            <button
              key={node.id}
              type="button"
              data-pill
              aria-pressed={selected}
              aria-describedby={node.id === focusRoot ? 'concept-map-card' : undefined}
              onMouseEnter={() => onNodeHover(node)}
              onMouseLeave={() => onNodeHover(null)}
              onFocus={() => onNodeHover(node)}
              onBlur={() => onNodeHover(null)}
              onClick={() => onNodeClick(node)}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h, '--d': `${Math.min(i, 20) * 35}ms` } as CSSProperties}
              className={cn(
                // Plain text and a dot; a halo in the panel's color keeps lines from running through the words
                'ui-press absolute z-[2] flex cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-left transition-[background-color,color,opacity] duration-200',
                !reducedMotion && 'ui-in-pop',
                selected
                  ? 'bg-[var(--ws-accent)] text-[14px] font-semibold text-[var(--ws-on-accent)] shadow-[0_0_0_4px_var(--ws-accent-wash)]'
                  : cn(WEIGHT_TEXT[weight], 'hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] [text-shadow:0_0_4px_var(--ws-solid),0_0_10px_var(--ws-solid)]'),
                dimmed && 'opacity-45'
              )}
            >
              <span aria-hidden className={cn('shrink-0 rounded-full', selected ? 'h-2 w-2 bg-[var(--ws-on-accent)]' : WEIGHT_DOT[weight])} />
              <span className="sr-only">{typeLabel(node)}: </span>
              <span className="min-w-0 truncate">{node.label}</span>
            </button>
          );
        })}
      </>
    );
  }, [focusRoot, highlight, isLight, layout, nodes, onNodeClick, onNodeHover, reducedMotion, selectionId, typeLabel, weights]);

  const cardNode = focusRoot ? nodes.find((n) => n.id === focusRoot) : undefined;
  const cardBox = cardNode ? layout.pills.get(cardNode.id) : undefined;

  return (
    <div className="absolute inset-0 select-none overflow-hidden" onClick={onClick}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: layout.width, height: layout.height, transform: `translate(${left}px, ${top}px) scale(${scale})` }}
      >
        {map}
      </div>
      {cardNode && cardBox && (
        <ConceptCard
          // Keyed by concept, so moving to another one opens a fresh card rather than sliding this one over
          key={cardNode.id}
          node={cardNode}
          mark={nodeMark(cardNode)}
          typeLabel={typeLabel(cardNode)}
          style={cardPlace(
            cardBox,
            // What the card must not sit on: the concepts lit along with its own
            nodes.flatMap((n) => (n.id !== cardNode.id && highlight?.has(n.id) ? [layout.pills.get(n.id)!] : [])),
            { left, top, scale, width: fitWidth, height }
          )}
          animate={!reducedMotion}
        />
      )}
    </div>
  );
}

interface MapView {
  left: number;
  top: number;
  scale: number;
  width: number;
  height: number;
}

/**
 * Beside its pill, on whichever side covers least of the concepts it's related to: under it, over it, then right
 * and left. Always inside the map.
 */
function cardPlace(box: PillBox, related: PillBox[], view: MapView): CSSProperties {
  const onScreen = (b: PillBox) => ({
    x: view.left + b.x * view.scale,
    y: view.top + b.y * view.scale,
    w: b.w * view.scale,
    h: b.h * view.scale,
  });
  const pill = onScreen(box);
  const others = related.map(onScreen);
  const w = Math.min(CARD_W, view.width - 16);
  const h = Math.min(CARD_H, view.height - 16);
  const midX = pill.x + pill.w / 2 - w / 2;
  const midY = pill.y + pill.h / 2 - h / 2;
  const sides = [
    { x: midX, y: pill.y + pill.h + CARD_GAP },
    { x: midX, y: pill.y - CARD_GAP - h },
    { x: pill.x + pill.w + CARD_GAP, y: midY },
    { x: pill.x - CARD_GAP - w, y: midY },
  ];
  let best = { x: 8, y: 8, cost: Infinity };
  for (const side of sides) {
    const x = clamp(side.x, 8, Math.max(8, view.width - w - 8));
    const y = clamp(side.y, 8, Math.max(8, view.height - h - 8));
    const covers = (b: { x: number; y: number; w: number; h: number }) =>
      Math.max(0, Math.min(x + w, b.x + b.w) - Math.max(x, b.x)) * Math.max(0, Math.min(y + h, b.y + b.h) - Math.max(y, b.y));
    // Sitting on its own pill (pushed back in from an edge) is worst of all
    const cost = covers(pill) * 4 + others.reduce((sum, b) => sum + covers(b), 0);
    if (cost < best.cost) best = { x, y, cost };
  }
  // Anchored by its near edge, so a card shorter or taller than the guess still sits against its pill
  return best.y + h <= pill.y + 1
    ? { left: best.x, bottom: view.height - (best.y + h), width: w }
    : { left: best.x, top: best.y, width: w };
}

/** What a concept is, at a glance: its type, name, description, and how much of the map touches it. */
function ConceptCard({
  node,
  mark,
  typeLabel,
  style,
  animate,
}: {
  node: MapNode;
  mark: NodeMark;
  typeLabel: string;
  style: CSSProperties;
  animate: boolean;
}) {
  const mentions = new Set(node.sourceIds).size;
  const mentioned = `Mentioned in ${mentions} ${mentions === 1 ? 'source' : 'sources'}`;
  return (
    <div
      id="concept-map-card"
      role="tooltip"
      style={style}
      className={cn(
        // Opaque, unlike the glass around it: it opens over the map and has to read against whatever is under it
        'pointer-events-none absolute z-[4] flex flex-col rounded-4xl border border-[var(--ws-line-strong)] bg-[var(--ws-solid)] px-4 py-[13px] text-left text-[var(--ws-ink)] shadow-[var(--ws-shadow)]',
        animate && 'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
    >
      <span className="flex w-full items-center gap-1.5 text-[11px] font-medium leading-4 text-[var(--ws-ink-soft)]">
        <ShapeSwatch shape={mark.shape} color={mark.color} size={12} />
        <span className="min-w-0 truncate">{typeLabel}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[var(--ws-ink-faint)]">
          {node.shared && <span>Shared</span>}
          {node.degree > 0 && (
            <span className="flex items-center gap-0.5 tabular-nums">
              <Link2 size={11} aria-hidden />
              {node.degree}
              <span className="sr-only"> connections</span>
            </span>
          )}
        </span>
      </span>
      <span className="mt-1 w-full text-[13.5px] font-semibold leading-[18px] [overflow-wrap:anywhere]">{node.label}</span>
      <span className="mt-0.5 line-clamp-4 w-full text-[12px] leading-4 text-[var(--ws-ink-soft)] [overflow-wrap:anywhere]">
        {node.description ?? mentioned}
      </span>
      {node.description && <span className="mt-1.5 text-[11px] leading-4 text-[var(--ws-ink-faint)]">{mentioned}</span>}
    </div>
  );
}
