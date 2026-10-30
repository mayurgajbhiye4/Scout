import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CheckCircle, FilePdf, FileText, GithubLogo, Globe, YoutubeLogo, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface DemoSource {
  icon: Icon;
  title: string;
  origin: string;
}

// A worked example of one question; the sources are real and the answer only says what they say.
const SOURCES: DemoSource[] = [
  { icon: FilePdf, title: 'Attention Is All You Need', origin: 'arxiv.org' },
  { icon: YoutubeLogo, title: "Let's build GPT: from scratch, in code", origin: 'Andrej Karpathy' },
  { icon: GithubLogo, title: 'karpathy/nanoGPT', origin: 'github.com' },
  { icon: Globe, title: 'The Illustrated Transformer', origin: 'jalammar.github.io' },
  { icon: FileText, title: 'attention_notes.md', origin: 'Your notes' },
];

const QUESTION = 'Why does attention get expensive on long inputs?';

// Each sentence ends on the source it came from (index into SOURCES)
const ANSWER: Array<{ text: string; cite: number }> = [
  { text: 'Every token attends to every other token, so the attention matrix holds one score per pair of tokens.', cite: 0 },
  { text: 'In nanoGPT that matrix is a T × T tensor for a sequence of length T, so doubling the input quadruples it.', cite: 2 },
  { text: 'That is why the model reads a fixed block of tokens at a time.', cite: 1 },
  { text: 'Your notes point to FlashAttention as a way to cut the memory cost.', cite: 4 },
];

// Column split of the wide layout: sources | knowledge map | answer. The beams are drawn from these.
const COL_SOURCES = 0.3;
const COL_HUB = 0.16;

// Story, after the intro lands: the answer is checked one citation at a time. A pulse runs from the cited
// source along its beam into the map, then on to the answer, where the citation lights. Times in ms.
const STORY_START = 2400;
const BEAT = 1500;
const TO_HUB = 600;
const TO_ANSWER = 900;
const RELEASE = 1200;
const CYCLE = ANSWER.length * BEAT + 1500;

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

interface StoryBeat {
  s: number;
  arrived: boolean;
}

function KnowledgeMapGlyph() {
  // A small fixed graph: the hub of the diagram reads as a knowledge map, not a logo
  const nodes: Array<[number, number]> = [
    [32, 30], [58, 22], [74, 44], [52, 50], [28, 62], [60, 74], [82, 66],
  ];
  const at = (i: number) => nodes[i] ?? [0, 0];
  const edges: Array<[number, number]> = [[0, 1], [1, 2], [1, 3], [0, 3], [3, 4], [3, 5], [2, 6], [5, 6], [2, 3]];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      {edges.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={at(a)[0]} y1={at(a)[1]} x2={at(b)[0]} y2={at(b)[1]}
          stroke="var(--mk-line-strong)" strokeWidth={1.5}
        />
      ))}
      {nodes.map(([x, y], i) => (
        <circle
          key={i}
          cx={x} cy={y} r={i === 3 ? 6 : 4}
          fill={i === 3 ? 'var(--mk-accent)' : 'var(--mk-surface)'}
          stroke={i === 3 ? 'var(--mk-accent)' : 'var(--mk-ink-faint)'}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

export default function SourceMapDiagram() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<number | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  const [story, setStory] = useState<StoryBeat | null>(null);
  const figureRef = useRef<HTMLElement>(null);
  const beamRefs = useRef<Array<SVGPathElement | null>>([]);
  const pulseRef = useRef<SVGGElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const loopTime = useRef(-STORY_START);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Intro plays once, when about 30% of the diagram is visible
  useEffect(() => {
    const el = figureRef.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  const hubX = size.w * (COL_SOURCES + COL_HUB / 2);
  const hubY = size.h / 2;
  const answerX = size.w * (COL_SOURCES + COL_HUB);
  const beams = SOURCES.map((_, i) => {
    const x = size.w * COL_SOURCES;
    const y = size.h * ((i + 0.5) / SOURCES.length);
    const bend = (hubX - x) * 0.6;
    return `M ${x} ${y} C ${x + bend} ${y}, ${hubX - bend} ${hubY}, ${hubX} ${hubY}`;
  });

  // Story clock. Hovering or focusing a source or citation hands the highlight to the reader, so the story
  // pauses and picks up on a fresh run afterwards. Also pauses off screen and while the tab is hidden.
  useEffect(() => {
    const el = figureRef.current;
    if (!el || !inView || active !== null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (loopTime.current > 0) loopTime.current = 0;

    let raf = 0;
    let last = 0;
    let onScreen = false;
    let beatKey = '';

    const setBeat = (next: StoryBeat | null) => {
      const key = next ? `${next.s}:${next.arrived}` : '';
      if (key === beatKey) return;
      beatKey = key;
      setStory(next);
    };

    const placePulse = (x: number, y: number, opacity: number) => {
      const pulse = pulseRef.current;
      if (!pulse) return;
      pulse.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      pulse.style.opacity = opacity.toFixed(3);
    };

    const rest = () => {
      setBeat(null);
      if (pulseRef.current) pulseRef.current.style.opacity = '0';
      if (hubRef.current) hubRef.current.style.transform = '';
    };

    const frame = (now: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return;
      loopTime.current += Math.min(now - (last || now), 50);
      last = now;
      raf = requestAnimationFrame(frame);
      if (loopTime.current < 0) return;

      const phase = loopTime.current % CYCLE;
      const s = Math.floor(phase / BEAT);
      const bt = phase - s * BEAT;
      const sentence = ANSWER[s];
      if (!sentence) return rest();
      setBeat(bt < RELEASE ? { s, arrived: bt >= TO_ANSWER } : null);

      const beam = beamRefs.current[sentence.cite];
      if (beam && bt < TO_ANSWER + 150) {
        const opacity = Math.min(1, bt / 120, (TO_ANSWER + 150 - bt) / 150);
        if (bt < TO_HUB) {
          const point = beam.getPointAtLength(beam.getTotalLength() * easeInOut(bt / TO_HUB));
          placePulse(point.x, point.y, opacity);
        } else {
          const k = easeInOut(Math.min(1, (bt - TO_HUB) / (TO_ANSWER - TO_HUB)));
          placePulse(hubX + (answerX - hubX) * k, hubY, opacity);
        }
      } else if (pulseRef.current) {
        pulseRef.current.style.opacity = '0';
      }

      // The map takes the pulse in with a small bump
      const k = (bt - (TO_HUB - 100)) / 400;
      if (hubRef.current) hubRef.current.style.transform = k > 0 && k < 1 ? `scale(${1 + 0.06 * Math.sin(Math.PI * k)})` : '';
    };

    const resume = () => {
      if (raf || !onScreen || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      resume();
    });
    observer.observe(el);
    document.addEventListener('visibilitychange', resume);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      rest();
    };
  }, [inView, active, hubX, hubY, answerX]);

  // What is highlighted: the reader's hover wins, otherwise the source the story is checking
  const lit = active ?? (story ? ANSWER[story.s]?.cite ?? null : null);

  const focusProps = (i: number) => ({
    onMouseEnter: () => setActive(i),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(i),
    onBlur: () => setActive(null),
  });

  return (
    <figure ref={figureRef} aria-label="Example: Scout answers a question from five sources" className={cn('mk-motion @container', inView && 'is-in')}>
      <div ref={stageRef} className="relative grid gap-6 @min-[600px]:h-[420px] @min-[600px]:grid-cols-[30%_16%_54%] @min-[600px]:gap-0">
        {/* Beams, wide layout only. Each has a muted base that draws on in the intro, and an accent copy on top
            whose opacity carries the highlight. The pulse rides the beam the story is checking. */}
        {size.w > 0 && (
          <svg className="pointer-events-none absolute inset-0 hidden h-full w-full @min-[600px]:block" width={size.w} height={size.h} aria-hidden>
            {beams.map((d, i) => (
              <g key={i}>
                <path
                  ref={(el) => {
                    beamRefs.current[i] = el;
                  }}
                  d={d}
                  fill="none"
                  strokeWidth={1.25}
                  stroke="var(--mk-line-strong)"
                  pathLength={1}
                  className="mk-in-draw"
                  style={delay(320 + i * 70)}
                />
                <path
                  d={d}
                  fill="none"
                  strokeWidth={1.75}
                  stroke="var(--mk-accent)"
                  className="transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ opacity: lit === i ? 1 : 0 }}
                />
              </g>
            ))}
            <path
              d={`M ${hubX} ${hubY} L ${answerX} ${hubY}`}
              fill="none"
              strokeWidth={1.5}
              stroke="var(--mk-accent)"
              pathLength={1}
              className="mk-in-draw"
              style={delay(900)}
            />
            <g ref={pulseRef} style={{ opacity: 0 }}>
              <circle r={8} fill="var(--mk-accent)" opacity={0.2} />
              <circle r={3.5} fill="var(--mk-accent)" />
            </g>
          </svg>
        )}

        {/* Sources */}
        <ul className="relative flex flex-wrap gap-2 @min-[600px]:grid @min-[600px]:grid-cols-1 @min-[600px]:grid-rows-5 @min-[600px]:gap-0" aria-label="Sources">
          {SOURCES.map((source, i) => {
            const SourceIcon = source.icon;
            return (
              <li key={source.title} className="mk-in-left flex items-center" style={delay(i * 70)}>
                <div
                  className={cn(
                    'flex w-full min-w-0 items-center gap-3 rounded-2xl border bg-[var(--mk-surface)] p-3 transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                    lit === i ? 'border-[var(--mk-accent)]' : 'border-[var(--mk-line)]'
                  )}
                  {...focusProps(i)}
                >
                  {/* 16px chip radius minus 12px padding */}
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[4px] bg-[var(--mk-raised)] text-xs font-semibold tabular-nums text-[var(--mk-ink-soft)]">
                    {i + 1}
                  </span>
                  <SourceIcon size={16} className="shrink-0 text-[var(--mk-ink-soft)]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{source.title}</span>
                    <span className="hidden truncate text-xs text-[var(--mk-ink-faint)] @min-[600px]:block">{source.origin}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Knowledge map hub */}
        <div className="relative flex items-center justify-center">
          <div className="mk-in-pop flex flex-col items-center gap-2" style={delay(640)}>
            <div ref={hubRef} className="h-24 w-24 rounded-full border border-[var(--mk-line-strong)] bg-[var(--mk-surface)] p-3">
              <KnowledgeMapGlyph />
            </div>
            <span className="whitespace-nowrap text-xs font-medium text-[var(--mk-ink-soft)]">Your knowledge map</span>
          </div>
        </div>

        {/* Cited answer */}
        <div className="relative flex items-center">
          <div className="mk-in-card w-full rounded-3xl border border-[var(--mk-line)] bg-[var(--mk-surface)] p-5 @min-[720px]:p-6" style={delay(820)}>
            <p className="mk-in-up text-sm font-medium text-[var(--mk-ink-soft)]" style={delay(970)}>{QUESTION}</p>
            <p className="mt-3 text-sm text-[var(--mk-ink)] @min-[720px]:text-base">
              {ANSWER.map((sentence, s) => (
                <span key={s} className="mk-in-fade" style={delay(1060 + s * 80)}>
                  {sentence.text}
                  <button
                    type="button"
                    {...focusProps(sentence.cite)}
                    aria-label={`Source ${sentence.cite + 1}: ${SOURCES[sentence.cite]?.title ?? ''}`}
                    className={cn(
                      'mk-press mx-1 inline-grid h-5 min-w-5 -translate-y-0.5 place-items-center rounded-[4px] border px-1 align-middle text-xs font-semibold tabular-nums',
                      active === sentence.cite || (story?.arrived && story.s === s)
                        ? 'border-[var(--mk-accent)] bg-[var(--mk-accent)] text-[var(--mk-on-accent)]'
                        : 'border-[var(--mk-line-strong)] text-[var(--mk-accent)]'
                    )}
                  >
                    {sentence.cite + 1}
                  </button>{' '}
                </span>
              ))}
            </p>
            <p className="mk-in-up mt-4 flex items-center gap-2 text-sm text-[var(--mk-ink-soft)]" style={delay(1420)}>
              <CheckCircle size={16} weight="fill" className="text-[var(--mk-accent)]" aria-hidden />
              Every claim checked against your five sources
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}
