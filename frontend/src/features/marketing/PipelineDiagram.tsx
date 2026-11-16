import { staggerDelay, introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { AGENT_STAGE, PIPELINE_STAGES as STAGES } from './pipelineStages';
import Reveal from './Reveal';

/**
 * The pipeline from source to cited answer, left to right on wide screens and top to bottom on phones. A pulse
 * runs along it on a loop once it is in view (`.mk-pipe-pulse`), and an arc shows the agent's retry back to
 * retrieval.
 */
export default function PipelineDiagram() {
  return (
    <Reveal stagger storyDelay={1400}>
      <figure aria-label="Dusk's pipeline, from source to cited answer" className="@container">
        <div className="relative @min-[760px]:mt-14">
          {/* The track the stages sit on: vertical through the icons on phones, horizontal on wide screens */}
          <div
            className="mk-pipe-track absolute bottom-6 left-6 top-6 w-px @min-[760px]:bottom-auto @min-[760px]:left-[calc(100%/12)] @min-[760px]:right-[calc(100%/12)] @min-[760px]:top-6 @min-[760px]:h-px @min-[760px]:w-auto"
            aria-hidden
          >
            <span className="ui-reveal-fade absolute inset-0 bg-[var(--mk-stroke)]" style={introDelay(200)} />
            <span className="mk-pipe-pulse">
              <span className="mk-pipe-dot" />
            </span>
          </div>

          {/* The agent's retry, from the agent back to retrieval, wide screens only */}
          <svg
            className="pointer-events-none absolute -top-9 hidden h-10 @min-[760px]:block"
            style={{ left: `calc(100% * ${AGENT_STAGE - 0.5} / 6)`, width: 'calc(100% / 6)' }}
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d="M 100 40 C 100 8, 0 8, 0 40"
              fill="none"
              stroke="var(--ws-accent)"
              strokeWidth={1.25}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
              className="ui-reveal-fade"
              style={introDelay(900)}
            />
          </svg>
          <span
            className="ui-reveal-fade absolute -top-[52px] hidden -translate-x-1/2 whitespace-nowrap font-mono text-[11px] text-[var(--ws-accent-ink)] @min-[760px]:block"
            style={{ left: `calc(100% * ${AGENT_STAGE} / 6)`, ...introDelay(1000) }}
          >
            up to 2 retries
          </span>

          <ol className="relative grid gap-8 @min-[760px]:grid-cols-6 @min-[760px]:gap-4">

          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const isAgent = i === AGENT_STAGE;
            const isAnswer = i === STAGES.length - 1;
            return (
              <li
                key={stage.title}
                className="ui-reveal-up relative grid grid-cols-[48px_1fr] gap-4 @min-[760px]:flex @min-[760px]:flex-col @min-[760px]:items-center @min-[760px]:gap-4 @min-[760px]:text-center"
                style={staggerDelay(i, 120)}
              >
                <span
                  className={cn(
                    'relative grid h-12 w-12 place-items-center rounded-full border bg-[var(--mk-face)]',
                    isAgent || isAnswer ? 'border-[var(--ws-accent)] text-[var(--ws-accent-ink)]' : 'border-[var(--mk-stroke)] text-[var(--ws-ink-soft)]',
                    isAnswer && 'bg-[var(--ws-accent-wash)]'
                  )}
                  aria-hidden
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 pt-1 @min-[760px]:pt-0">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--ws-ink-faint)]">0{i + 1}</span>
                  <h3 className="mt-1 text-[15px] font-semibold text-[var(--ws-ink)]">{stage.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--ws-ink-soft)]">
                    {stage.body}
                    {isAgent && <span className="@min-[760px]:hidden"> Up to two retries.</span>}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-[var(--ws-ink-faint)]">{stage.tech}</p>
                </div>
              </li>
            );
          })}
          </ol>
        </div>
      </figure>
    </Reveal>
  );
}
