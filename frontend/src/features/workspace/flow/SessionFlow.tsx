import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize } from 'lucide-react';
import type { AddSourceApi } from '../canvas/addSourceOptions';
import { useMediaQuery } from '../useWorkspaceData';
import FlowSources, { type FlowRow } from './FlowSources';

// The orb never grows past this, and keeps this much room either side for the beams to bend in.
const ORB_MAX = 760;
const ORB_MIN = 280;
const ORB_SIDE_ROOM = 48;
// Each pulse runs its beam once per period, ms
const PULSE_IN_MS = 1600;
const PULSE_OUT_MS = 1300;
interface Point {
  x: number;
  y: number;
}

interface Geometry {
  w: number;
  h: number;
  rows: Array<{ id: string; from: Point; inView: boolean }>;
  orb: Point;
  orbR: number;
  chat: Point;
}

interface SessionFlowProps {
  rows: FlowRow[];
  /** Row ids whose beam is fully lit: the hovered or selected source. */
  litIds: Set<string>;
  /** Row ids the latest answer cited: their beams stay softly lit. */
  citedIds: Set<string>;
  /** Row ids being read: a pulse runs from each into the map. */
  ingestingIds: Set<string>;
  /** The copilot is researching or writing: a pulse runs from the map into the chat. */
  answering: boolean;
  /** The knowledge map, drawn to fill a circle. */
  map: ReactNode;
  canFit: boolean;
  onFit: () => void;
  /** Where the map puts its title and relationship chips: above the sources. */
  relationsSlot: (el: HTMLDivElement | null) => void;
  /** Where the map puts its legend: under the orb, beside Fit. */
  legendSlot: (el: HTMLDivElement | null) => void;
  /** Where the map puts the picked concept's card: above the chat, which gives up the height it takes. */
  inspectorSlot: (el: HTMLDivElement | null) => void;
  chat: ReactNode;
  selectedSourceId: string | null;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string | null) => void;
  addSource: AddSourceApi;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
}

/**
 * The session as one flow, left to right: the sources it reads feed the knowledge map, and the map feeds the
 * copilot's answers. Beams join them and light for what's actually happening: a source being read pulses into the
 * map, an answer being written pulses out to the chat, and the sources an answer cited stay lit. Below 1024px the
 * three stack in one scroll, without beams.
 */
export default function SessionFlow(props: SessionFlowProps) {
  const { rows, litIds, citedIds, ingestingIds, answering, map, canFit, onFit, relationsSlot, legendSlot, inspectorSlot, chat } = props;
  const wide = useMediaQuery('(min-width: 1024px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const stageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const rowRefFns = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const frame = useRef(0);
  // Watches every element a beam is pinned to, rows included: a row can move without its list changing size
  const observer = useRef<ResizeObserver | null>(null);

  const [geo, setGeo] = useState<Geometry | null>(null);
  const [orbSize, setOrbSize] = useState(ORB_MIN);

  const measure = useCallback(() => {
    frame.current = 0;
    const stage = stageRef.current;
    const orb = orbRef.current;
    const chatEl = chatRef.current;
    const list = listRef.current;
    if (!stage || !orb || !chatEl || !list) return;
    const s = stage.getBoundingClientRect();
    const o = orb.getBoundingClientRect();
    const c = chatEl.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const orbCentre = {
      x: Math.round(o.left + o.width / 2 - s.left),
      y: Math.round(o.top + o.height / 2 - s.top),
    };
    const listTop = l.top - s.top + 12;
    const listBottom = l.bottom - s.top - 12;
    const next: Geometry = {
      w: Math.round(s.width),
      h: Math.round(s.height),
      orb: orbCentre,
      orbR: Math.round(o.width / 2),
      chat: {
        x: Math.round(c.left - s.left),
        y: Math.round(Math.min(Math.max(orbCentre.y, c.top - s.top + 48), c.bottom - s.top - 48)),
      },
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

  // The orb fills the middle column, short of the room the beams need either side
  useLayoutEffect(() => {
    const el = middleRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - (wide ? ORB_SIDE_ROOM * 2 : 32);
      const h = wide ? el.clientHeight * 0.85 : 400;
      setOrbSize(Math.round(Math.max(ORB_MIN, Math.min(ORB_MAX, w, h))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide]);

  useEffect(() => {
    if (!wide) return;
    const ro = new ResizeObserver(schedule);
    observer.current = ro;
    [stageRef, listRef, orbRef, chatRef].forEach((r) => r.current && ro.observe(r.current));
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
  }, [rows, orbSize, wide, schedule]);

  const beamTo = (from: Point, to: Point) => {
    const bend = (to.x - from.x) * 0.6;
    return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
  };
  const outPath = geo ? beamTo(geo.orb, geo.chat) : '';
  const outLit = answering ? 1 : citedIds.size > 0 ? 0.5 : 0;

  const orb = (
    <div className="flex flex-col items-center">
      <div ref={orbRef} className="glass relative shrink-0 rounded-full border-0" style={{ width: orbSize, height: orbSize }}>
        {map}
        <OrbRim size={orbSize} answering={answering} />
      </div>
      <div className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-2">
        {canFit && (
          <button
            type="button"
            onClick={onFit}
            className="ui-press flex h-8 items-center gap-1.5 rounded-full border border-[var(--ws-line)] glass px-3 text-[12.5px] font-medium text-[var(--ws-ink-soft)] hover:border-[var(--ws-line-strong)] hover:text-[var(--ws-ink)] cursor-pointer"
          >
            <Maximize size={13} /> Fit
          </button>
        )}
        <div ref={legendSlot} className="contents" />
      </div>
    </div>
  );

  const sources = (
    <FlowSources
      rows={rows}
      litIds={new Set([...litIds, ...citedIds])}
      selectedSourceId={props.selectedSourceId}
      onHoverSource={props.onHoverSource}
      onSelectSource={props.onSelectSource}
      addSource={props.addSource}
      onRetryPending={props.onRetryPending}
      onDismissPending={props.onDismissPending}
      rowRef={rowRef}
      listRef={listRef}
      onListScroll={schedule}
      wide={wide}
    />
  );

  if (!wide) {
    return (
      <div ref={stageRef} className="sidebar-scroll absolute inset-0 flex flex-col gap-8 overflow-y-auto px-4 pb-4 pt-[76px]">
        {sources}
        <div ref={middleRef} className="flex shrink-0 justify-center">
          {orb}
        </div>
        <div ref={relationsSlot} className="shrink-0 empty:hidden" />
        <div ref={inspectorSlot} className="flex max-h-[60vh] shrink-0 flex-col empty:hidden" />
        <div
          ref={chatRef}
          className="h-[75vh] min-h-[440px] shrink-0 overflow-hidden rounded-4xl border border-[var(--ws-line)] glass"
        >
          {chat}
        </div>
      </div>
    );
  }

  return (
    <div ref={stageRef} onAnimationEnd={schedule} className="absolute inset-0 px-3 pb-3 pt-[72px]">
      {/* Beams, under everything they join */}
      {geo && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" width={geo.w} height={geo.h} aria-hidden>
          {/* The beams stop at the orb's rim rather than running on into the map */}
          <mask id="flow-beams-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={geo.w} height={geo.h}>
            <rect width={geo.w} height={geo.h} fill="white" />
            <circle cx={geo.orb.x} cy={geo.orb.y} r={geo.orbR} fill="black" />
          </mask>
          <g mask="url(#flow-beams-mask)">
            {geo.rows.map(({ id, from, inView }) => {
              const ghost = id.startsWith('ghost:');
              const d = beamTo(from, geo.orb);
              const strength = litIds.has(id) ? 1 : citedIds.has(id) ? 0.45 : 0;
              return (
                <g key={id} style={{ opacity: inView ? 1 : 0.25 }} className="transition-opacity duration-300">
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
            <path
              d={outPath}
              fill="none"
              stroke="var(--ws-line-strong)"
              strokeWidth={1.5}
              strokeDasharray={citedIds.size || answering ? undefined : '4 6'}
            />
            <path
              d={outPath}
              fill="none"
              stroke="var(--ws-accent)"
              strokeWidth={1.75}
              className="transition-opacity duration-500"
              style={{ opacity: outLit }}
            />
            {answering && !reducedMotion && <Pulse d={outPath} period={PULSE_OUT_MS} />}
          </g>
        </svg>
      )}

      <div className="relative grid h-full grid-cols-[260px_minmax(0,1fr)_380px] xl:grid-cols-[300px_minmax(0,1fr)_420px]">
        <div className="flex min-h-0 flex-col gap-5 py-2 pl-1">
          <div ref={relationsSlot} className="shrink-0 empty:hidden" />
          <div className="min-h-0 flex-1">{sources}</div>
        </div>
        <div ref={middleRef} className="flex min-h-0 items-center justify-center">
          {orb}
        </div>
        {/* The picked concept's card sits on top of the chat, up to about half the column, and the chat takes the rest */}
        <div className="flex min-h-0 flex-col gap-3">
          <div ref={inspectorSlot} className="flex max-h-[48%] min-h-0 shrink-0 flex-col empty:hidden" />
          <div
            ref={chatRef}
            className="min-h-[320px] flex-1 overflow-hidden rounded-4xl border border-[var(--ws-line)] glass"
          >
            {chat}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The orb's edge as a faint teal ring: where the map ends, and where a source can be dropped. Brightens while the
 * copilot answers.
 */
function OrbRim({ size, answering }: { size: number; answering: boolean }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0" width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 1}
        fill="none"
        stroke="var(--ws-accent)"
        strokeWidth={answering ? 2 : 1.25}
        strokeOpacity={answering ? 0.9 : 0.35}
        className="transition-[stroke-opacity,stroke-width] duration-500"
      />
    </svg>
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
