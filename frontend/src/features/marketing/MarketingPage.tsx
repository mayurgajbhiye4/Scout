import { useEffect, useRef, useState, type ReactNode } from 'react';
import { introDelay } from '@/lib/motion';
import ArchitectureFigures from './ArchitectureFigures';
import FeatureBlock from './FeatureBlock';
import FeatureGrid from './FeatureGrid';
import { AnswerMock, MapMock, PaletteMock, SourcesMock } from './FeatureMocks';
import MarketingFooter from './MarketingFooter';
import MarketingNav from './MarketingNav';
import PipelineDiagram from './PipelineDiagram';
import Reveal from './Reveal';
import SceneBackdrop, { type SceneId } from './SceneBackdrop';
import SourceMapDiagram from './SourceMapDiagram';
import SourceTypesRow from './SourceTypesRow';

/** A page-width column for one part of the page; its scene is the landscape behind it. */
function Band({ id, scene, className, children }: { id?: string; scene: SceneId; className?: string; children: ReactNode }) {
  return (
    <div id={id} data-scene={scene} className={className}>
      <div className="mx-auto w-full max-w-[1120px]">{children}</div>
    </div>
  );
}

/**
 * The product page for visitors: the hero, how Dusk works, its features, then a closing call to action. The
 * header floats over it, and the landscape behind changes with the part of the page in view.
 */
export default function MarketingPage({ onStart }: { onStart: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<SceneId>('meadow');

  // The scene is that of the part of the page crossing the middle of the screen
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const next = (entry.target as HTMLElement).dataset.scene as SceneId | undefined;
          if (entry.isIntersecting && next) setScene(next);
        }
      },
      { root, rootMargin: '-50% 0px -50% 0px' }
    );
    root.querySelectorAll('[data-scene]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mk-page font-ui relative flex h-full w-full flex-col overflow-hidden text-[var(--ws-ink)]">
      <SceneBackdrop scene={scene} />
      {/* Starting means logging in first. The header floats over the page, where the workspace's does */}
      <MarketingNav onStart={onStart} />

      <div ref={scrollRef} className="relative flex h-full w-full flex-col overflow-y-auto overflow-x-hidden scroll-smooth scroll-pt-[76px] sidebar-scroll motion-reduce:scroll-auto">
        {/* Top padding clears the floating header (12px inset + 48px bar) */}
        <div id="home" data-scene="meadow" className="flex shrink-0 flex-col px-4 pt-[76px] sm:px-6">
          {/* One hero, top down: the promise, the source types, then a worked example of a cited answer */}
          <main className="mx-auto flex w-full max-w-[1120px] flex-col pb-16 pt-4 sm:pb-24 sm:pt-6">
            <div className="flex flex-col items-center text-center">
              {/* Same pattern as the map's drop heading once signed in: the action, then a faded second line */}
              <h1 className="on-space ui-in-hero font-reading text-balance text-[42px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--ws-ink)] sm:text-[60px]">
                Drop your favourite
                <br />
                <span className="opacity-60">Knowledge.</span>
              </h1>
              <div className="ui-in-up mt-6" style={introDelay(90)}>
                <SourceTypesRow className="justify-center" />
              </div>
            </div>

            <div className="mt-10 sm:mt-12">
              <SourceMapDiagram />
            </div>
          </main>
        </div>

        <Band id="product" scene="forest" className="shrink-0 px-4 py-24 sm:px-6 sm:py-32">
          <ArchitectureFigures />
        </Band>

        <Band id="architecture" scene="forest" className="shrink-0 px-4 py-24 sm:px-6 sm:py-32">
          <Reveal stagger className="mb-16 grid gap-5 md:grid-cols-2 md:gap-12">
            <h2 className="ui-reveal-up text-balance font-reading text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[48px]">
              From source
              <br />
              to cited answer
            </h2>
            <p className="ui-reveal-up max-w-[460px] text-[16px] leading-relaxed text-[var(--ws-ink-soft)] md:pt-3 md:text-[17px]" style={introDelay(120)}>
              Every question takes the same path. Dusk checks its evidence before it writes and tries again when the
              evidence is weak, so each claim traces back to a passage you can open.
            </p>
          </Reveal>
          <PipelineDiagram />
        </Band>

        <Band id="features" scene="butte" className="shrink-0 px-4 py-24 sm:px-6 sm:py-32">
          <h2 className="sr-only">Features</h2>
          <div className="flex flex-col gap-28 sm:gap-36">
            <FeatureBlock
              label="1.0 Sources"
              title={<>Bring any<br />source</>}
              body="Paste a link to a video, a paper, a repo or a page, or drop in your own notes. Dusk reads each one and shows its progress as it goes."
              visualLabel="The source library: five sources, each with its reading status"
              visual={<SourcesMock />}
            />
            <FeatureBlock
              label="2.0 Knowledge map"
              title={<>See how<br />ideas connect</>}
              body="Concepts from every source land on one map, linked by how they relate. Follow a thread across a paper, a talk and the code that implements it."
              visualLabel="A knowledge map of transformer concepts and the relations between them"
              visual={<MapMock />}
            />
            <FeatureBlock
              label="3.0 Copilot"
              title={<>Answers you<br />can check</>}
              body="Ask in plain words. Every answer is cited sentence by sentence, and any citation opens the exact passage it came from."
              visualLabel="A copilot answer with numbered citations, one opened to show its source passage"
              visual={<AnswerMock />}
            />
            <FeatureBlock
              label="4.0 Sessions"
              title={<>Every session,<br />one keystroke</>}
              body="Each line of research keeps its own sources and memory. Press ⌘K to search them all and pick up where you left off."
              visualLabel="The sessions palette, searching past sessions for “attention”"
              visual={<PaletteMock />}
            />
            <FeatureGrid />
          </div>
        </Band>

        <div data-scene="ridges" className="shrink-0">
          <MarketingFooter onStart={onStart} />
        </div>
      </div>
    </div>
  );
}
