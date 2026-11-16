import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { AddSourceApi } from '../canvas/addSourceOptions';
import { useMediaQuery } from '../useWorkspaceData';
import FlowSources, { type FlowRow } from './FlowSources';

// Each pulse runs its beam once per period, ms
const PULSE_IN_MS = 1600;
interface Point {
  x: number;
  y: number;
}

interface Geometry {
  w: number;
  h: number;
  rows: Array<{ id: string; from: Point; inView: boolean }>;
  /** Where the sources' beams arrive: the middle of the board's left side */
  boardIn: Point;
}

interface SessionFlowProps {
  rows: FlowRow[];
  /** Row ids whose beam is fully lit: the hovered or selected source. */
  litIds: Set<string>;
  /** Row ids the latest answer cited: their beams stay softly lit. */
  citedIds: Set<string>;
  /** Row ids being read: a pulse runs from each into the map. */
  ingestingIds: Set<string>;
  /** The sources the map is narrowed to; null when it shows the whole session. The other beams dim. */
  scopedIds: Set<string> | null;
  /** The knowledge map, drawn to fill its box. */
  map: ReactNode;
  /** Where the map puts its title: the board's header. */
  headerSlot: (el: HTMLDivElement | null) => void;
  /** Where the map puts its controls and relationship chips: along the board's bottom edge. */
  dockSlot: (el: HTMLDivElement | null) => void;
  /** Width the copilot window covers at the board's right edge, kept clear of the map's controls; 0 when it's folded. */
  rightInset: number;
  selectedSourceId: string | null;
  comparedIds: Set<string>;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string | null) => void;
  onToggleCompare: (id: string) => void;
  addSource: AddSourceApi;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
  sessionId: string | null;
  onSourceRemoved: (sourceId: string) => void;
}

/**
 * The session as one flow, left to right: the sources it reads feed the knowledge map, which runs to the right edge
 * under the floating copilot window. Beams join sources to the map and light for what's actually happening: a source
 * being read pulses into the map, and the sources an answer cited stay lit. Below 1024px the two stack in one scroll,
 * without beams.
 */
export default function SessionFlow(props: SessionFlowProps) {
  const { rows, litIds, citedIds, ingestingIds, scopedIds, map, headerSlot, dockSlot, rightInset } = props;
  const wide = useMediaQuery('(min-width: 1024px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const stageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const rowRefFns = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const frame = useRef(0);
  // Watches every element a beam is pinned to, rows included: a row can move without its list changing size
  const observer = useRef<ResizeObserver | null>(null);

  const [geo, setGeo] = useState<Geometry | null>(null);

  const measure = useCallback(() => {
    frame.current = 0;
    const stage = stageRef.current;
    const board = boardRef.current;
    const list = listRef.current;
    if (!stage || !board || !list) return;
    const s = stage.getBoundingClientRect();
    const o = board.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const boardY = Math.round(o.top + o.height / 2 - s.top);
    const listTop = l.top - s.top + 12;
    const listBottom = l.bottom - s.top - 12;
    const next: Geometry = {
      w: Math.round(s.width),
      h: Math.round(s.height),
      boardIn: { x: Math.round(o.left - s.left), y: boardY },
      rows: [...rowEls.current.entries()].map(([id, el]) => {
        const r = el.getBoundingClientRect();
        const y = r.top + r.height / 2 - s.top;
        return {
          id,
          from: {
            x: Math.round(r.right - s.left),
            y: Math.round(Math.min(Math.max(y, listTop), listBottom)),
          },
          inView: y >= listTop && y <= listBottom,
        };
      }),
    };
    setGeo((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  // One stable ref callback per row, so re-renders don't churn them
  const rowRef = useCallback(
    (id: string) => {
      let fn = rowRefFns.current.get(id);
      if (!fn) {
        fn = (el: HTMLElement | null) => {
          const prev = rowEls.current.get(id);
          if (prev) observer.current?.unobserve(prev);
          if (el) {
            rowEls.current.set(id, el);
            observer.current?.observe(el);
          } else {
            rowEls.current.delete(id);
          }
          schedule();
        };
        rowRefFns.current.set(id, fn);
      }
      return fn;
    },
    [schedule]
  );

  useEffect(() => {
    if (!wide) return;
    const ro = new ResizeObserver(schedule);
    observer.current = ro;
    [stageRef, listRef, boardRef].forEach((r) => r.current && ro.observe(r.current));
    rowEls.current.forEach((el) => ro.observe(el));
    // Fonts arriving change row heights after the first measure
    document.fonts?.ready.then(schedule);
    schedule();
    // A row can also move without anything around it resizing (the column re-centres), which no observer sees. A light
    // re-check catches that; it only re-renders when something actually moved.
    const settle = window.setInterval(() => {
      if (!document.hidden) schedule();
    }, 400);
    return () => {
      window.clearInterval(settle);
      ro.disconnect();
      observer.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [wide, schedule]);

  useLayoutEffect(() => {
    if (wide) schedule();
  }, [rows, wide, schedule]);

  const beamTo = (from: Point, to: Point) => {
    const bend = (to.x - from.x) * 0.6;
    return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
  };

  // No box of its own: the title, the map (fading out at its edges) and its controls, straight on the canvas
  const board = (
    <div ref={boardRef} className={cn('ws-panel relative flex flex-col px-4 pb-4 pt-3', wide ? 'h-full w-full' : 'h-[640px] shrink-0')}>
      <div ref={headerSlot} className="shrink-0 empty:hidden" />
      <div className="ws-fade-edges relative min-h-0 flex-1">{map}</div>
      <div
        ref={dockSlot}
        className="ws-motion shrink-0 pt-2 transition-[padding] duration-300 ws-ease empty:hidden"
        style={wide && rightInset > 0 ? { paddingRight: rightInset } : undefined}
      />
    </div>
  );

  const sources = (
    <FlowSources
      rows={rows}
      litIds={new Set([...litIds, ...citedIds])}
      selectedSourceId={props.selectedSourceId}
      comparedIds={props.comparedIds}
      onHoverSource={props.onHoverSource}
      onSelectSource={props.onSelectSource}
      onToggleCompare={props.onToggleCompare}
      addSource={props.addSource}
      onRetryPending={props.onRetryPending}
      onDismissPending={props.onDismissPending}
      sessionId={props.sessionId}
      onSourceRemoved={props.onSourceRemoved}
      rowRef={rowRef}
      listRef={listRef}
      onListScroll={schedule}
      wide={wide}
    />
  );

  if (!wide) {
    return (
      <div ref={stageRef} className="sidebar-scroll absolute inset-0 overflow-y-auto px-2 pb-2 pt-[68px]">
        <div className="relative flex min-h-full flex-col gap-8 px-3 py-5">
          {sources}
          {board}
        </div>
      </div>
    );
  }

  return (
    <div ref={stageRef} onAnimationEnd={schedule} className="absolute inset-0 px-8 pb-6 pt-[84px]">
      {/* Beams, under everything they join */}
      {geo && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" width={geo.w} height={geo.h} aria-hidden>
          {/* The sources' beams gather at one point beside the map */}
          <g>
            {geo.rows.map(({ id, from, inView }) => {
              const ghost = id.startsWith('ghost:');
              const d = beamTo(from, geo.boardIn);
              const strength = litIds.has(id) ? 1 : citedIds.has(id) ? 0.45 : 0;
              // A source still being added isn't part of any narrowing yet, and keeps its pulse visible
              const outOfScope = scopedIds !== null && !id.startsWith('pending:') && !scopedIds.has(id);
              return (
                <g key={id} style={{ opacity: inView && !outOfScope ? 1 : 0.25 }} className="transition-opacity duration-300">
                  <path
                    d={d}
                    fill="none"
                    stroke={ghost ? 'var(--ws-accent)' : 'var(--ws-line-strong)'}
                    strokeOpacity={ghost ? 0.5 : undefined}
                    strokeWidth={1.25}
                    strokeDasharray={ghost ? '4 6' : undefined}
                    pathLength={ghost ? undefined : 1}
                    className={ghost ? undefined : 'ui-draw'}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--ws-accent)"
                    strokeWidth={1.75}
                    className="transition-opacity duration-300"
                    style={{ opacity: strength }}
                  />
                  {ingestingIds.has(id) && !reducedMotion && <Pulse d={d} period={PULSE_IN_MS} />}
                </g>
              );
            })}
            <Junction at={geo.boardIn} lit={litIds.size > 0 || ingestingIds.size > 0} />
          </g>
        </svg>
      )}

      <div className="relative grid h-full grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-h-0 py-2">{sources}</div>
        {/* Room on the left for the beams to bend in; on the right the map runs to the edge, under the copilot */}
        <div className="min-h-0 pl-12">{board}</div>
      </div>
    </div>
  );
}

/** Where beams meet the map or the chat: a small node on the line, orange while something flows through it. */
function Junction({ at, lit }: { at: Point; lit: boolean }) {
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={3.5}
      fill="var(--ws-solid)"
      stroke={lit ? 'var(--ws-accent)' : 'var(--ws-line-strong)'}
      strokeWidth={1.25}
      className="transition-[stroke] duration-300"
    />
  );
}

/** A dot that runs along a beam, start to end, once per period, fading in and out at the ends. */
function Pulse({ d, period }: { d: string; period: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const path = pathRef.current;
      const dot = dotRef.current;
      if (!path || !dot || document.hidden) return;
      const t = (now % period) / period;
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const point = path.getPointAtLength(path.getTotalLength() * k);
      dot.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
      dot.style.opacity = Math.min(1, t / 0.12, (1 - t) / 0.12).toFixed(3);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [d, period]);

  return (
    <>
      <path ref={pathRef} d={d} fill="none" stroke="none" />
      <g ref={dotRef} style={{ opacity: 0 }}>
        <circle r={8} fill="var(--ws-accent)" opacity={0.2} />
        <circle r={3.5} fill="var(--ws-accent)" />
      </g>
    </>
  );
}
