import type { ReactNode } from 'react';
import { introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import Reveal from './Reveal';

// Isometric projection: x runs down to the right, y down to the left, z up. Larger x + y sits closer to the reader,
// so shapes are listed back to front and each one hides what is behind it.
type P3 = readonly [number, number, number];
const COS30 = 0.866;
const iso = ([x, y, z]: P3) => `${((x - y) * COS30).toFixed(1)},${((x + y) * 0.5 - z).toFixed(1)}`;
const points = (...p: P3[]) => p.map(iso).join(' ');

interface BoxProps {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  accent?: boolean;
  delay: number;
}

/** An outlined box: its three visible faces filled with the page colour, so it hides the lines behind it. */
function IsoBox({ x, y, z = 0, w, d, h, accent, delay }: BoxProps) {
  const top = z + h;
  const faces = [
    points([x, y, top], [x + w, y, top], [x + w, y + d, top], [x, y + d, top]),
    points([x, y + d, z], [x + w, y + d, z], [x + w, y + d, top], [x, y + d, top]),
    points([x + w, y, z], [x + w, y + d, z], [x + w, y + d, top], [x + w, y, top]),
  ];
  return (
    <g>
      {faces.map((p, i) => (
        <polygon
          key={i}
          points={p}
          pathLength={1}
          fill="var(--mk-face)"
          stroke={accent ? 'var(--ws-accent)' : 'var(--mk-stroke)'}
          strokeWidth={1}
          strokeLinejoin="round"
          className="ui-reveal-draw"
          style={introDelay(delay + i * 60)}
        />
      ))}
    </g>
  );
}

function IsoLine({ from, to, delay, accent, dashed }: { from: P3; to: P3; delay: number; accent?: boolean; dashed?: boolean }) {
  const [x1, y1] = iso(from).split(',');
  const [x2, y2] = iso(to).split(',');
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={accent ? 'var(--ws-accent)' : 'var(--mk-stroke)'}
      strokeWidth={1}
      strokeLinecap="round"
      strokeDasharray={dashed ? '2 4' : undefined}
      pathLength={dashed ? undefined : 1}
      className={dashed ? 'ui-reveal-fade' : 'ui-reveal-draw'}
      style={introDelay(delay)}
    />
  );
}

/** A circle lying flat at height z, as an ellipse in the projection. */
function isoCircle(cx: number, cy: number, z: number, r: number) {
  const steps = 32;
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    return iso([cx + r * Math.cos(t), cy + r * Math.sin(t), z]);
  }).join(' ');
}

/** A source plate over the chunks it is split into; one chunk, in orange, is on its way to the index. */
function IngestFigure() {
  const chunks = [-64, -48, -32, -16, 0];
  return (
    <g transform="translate(0 10)">
      {chunks.map((z, i) => (
        <IsoBox key={z} x={-75 + (i === 2 ? 22 : 0)} y={-75} z={z} w={150} d={150} h={8} accent={i === 2} delay={120 + i * 90} />
      ))}
      {/* Guides from the source down to the stack */}
      {([[-75, 75], [75, 75], [75, -75]] as const).map(([x, y], i) => (
        <IsoLine key={i} from={[x, y, 40]} to={[x, y, 8]} dashed delay={700 + i * 60} />
      ))}
      <g className="ui-float" style={introDelay(1800)}>
        <IsoBox x={-75} y={-75} z={40} w={150} d={150} h={14} delay={0} />
        {[0, 1, 2, 3, 4].map((i) => (
          <IsoLine
            key={i}
            from={[-48, -48 + i * 22, 54]}
            to={[i === 4 ? 0 : 48, -48 + i * 22, 54]}
            accent={i === 1}
            delay={520 + i * 70}
          />
        ))}
      </g>
    </g>
  );
}

/** Concepts as blocks on a shared floor, linked through the one in orange that the question lands on. */
function MapFigure() {
  // Back to front
  const blocks: Array<BoxProps & { key: string }> = [
    { key: 'b', x: -20, y: -125, w: 40, d: 40, h: 48, delay: 260 },
    { key: 'a', x: -120, y: -20, w: 40, d: 40, h: 36, delay: 320 },
    { key: 'c', x: 70, y: -30, w: 44, d: 44, h: 30, delay: 440 },
    { key: 'd', x: -25, y: 70, w: 40, d: 40, h: 40, delay: 500 },
    { key: 'e', x: 60, y: 60, w: 36, d: 36, h: 24, delay: 560 },
  ];
  const centre = (b: BoxProps): P3 => [b.x + b.w / 2, b.y + b.d / 2, 0];
  const byKey = Object.fromEntries(blocks.map((b) => [b.key, b]));
  const links: Array<[string, string]> = [['a', 'b'], ['c', 'e'], ['d', 'e']];
  const hub = { x: -30, y: -30, w: 60, d: 60, h: 70 };

  return (
    <g transform="translate(0 30)">
      {blocks.map((b, i) => (
        <IsoLine key={`hub-${b.key}`} from={[0, 0, 0]} to={centre(b)} delay={i * 60} />
      ))}
      {links.map(([a, b], i) => {
        const from = byKey[a];
        const to = byKey[b];
        return from && to ? <IsoLine key={`${a}-${b}`} from={centre(from)} to={centre(to)} delay={200 + i * 60} /> : null;
      })}
      {blocks.slice(0, 3).map(({ key, ...b }) => (
        <IsoBox key={key} {...b} />
      ))}
      <g className="ui-float" style={introDelay(1800)}>
        <IsoBox {...hub} accent delay={380} />
        <polygon
          points={isoCircle(0, 0, hub.h, 17)}
          fill="var(--ws-accent-wash)"
          stroke="var(--ws-accent)"
          strokeWidth={1}
          className="ui-reveal-pop"
          style={introDelay(900)}
        />
      </g>
      {blocks.slice(3).map(({ key, ...b }) => (
        <IsoBox key={key} {...b} />
      ))}
    </g>
  );
}

/** Evidence ranked by how well it answers: the strongest, in orange, at the back, falling off to the front. */
function EvidenceFigure() {
  const slats = Array.from({ length: 10 }, (_, i) => i);
  return (
    <g transform="translate(44 30)">
      {slats.map((i) => (
        <IsoBox key={i} x={-60 + i * 16} y={10} w={5} d={110} h={120 - i * 10} accent={i === 0} delay={i * 70} />
      ))}
    </g>
  );
}

interface FigureCardProps {
  title: string;
  caption: string;
  className?: string;
  children: ReactNode;
}

function FigureCard({ title, caption, className, children }: FigureCardProps) {
  return (
    <Reveal stagger className={cn('flex flex-col px-2 py-8 md:px-8 md:py-2', className)}>
      <figure className="flex flex-1 flex-col">
        <svg viewBox="-160 -150 320 300" className="mx-auto aspect-[16/15] w-full max-w-[320px]" role="img" aria-label={title}>
          {children}
        </svg>
        <figcaption className="ui-reveal-up mt-6" style={introDelay(500)}>
          <span className="block text-[15px] font-semibold text-[var(--ws-ink)]">{title}</span>
          <span className="mt-1 block text-[14px] leading-relaxed text-[var(--ws-ink-soft)]">{caption}</span>
        </figcaption>
      </figure>
    </Reveal>
  );
}

/** The opening statement after the hero, with three outlined figures of how Dusk turns sources into answers. */
export default function ArchitectureFigures() {
  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      <Reveal>
        <h2 className="max-w-[860px] text-balance font-reading text-[28px] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--ws-ink)] sm:text-[40px]">
          A research workspace that reads with you.{' '}
          <span className="text-[var(--ws-ink-soft)]">
            Drop in papers, talks, repos and pages. Dusk maps how their ideas connect and answers your questions with
            the sources it used.
          </span>
        </h2>
      </Reveal>

      <div className="grid md:grid-cols-3">
        <FigureCard title="Ingest" caption="Each source is read, split into passages and embedded, so any line of it can be found again.">
          <IngestFigure />
        </FigureCard>
        <FigureCard
          title="Map"
          caption="The ideas in your sources become a knowledge map of concepts and how they relate."
          className="border-t border-[var(--ws-line)] md:border-l md:border-t-0"
        >
          <MapFigure />
        </FigureCard>
        <FigureCard
          title="Answer"
          caption="Evidence is ranked and checked before Dusk writes, and every claim points back to where it came from."
          className="border-t border-[var(--ws-line)] md:border-l md:border-t-0"
        >
          <EvidenceFigure />
        </FigureCard>
      </div>
    </div>
  );
}
