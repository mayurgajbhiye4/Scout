import { useTheme } from '@/features/theme';
import { introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { kindColor } from '../sourceMeta';
import { KIND_ICON } from './addSourceOptions';
import { CENTRE, CONCEPTS, MENTIONS, SKETCH_SOURCES, type SketchKind } from './mapSketchLayout';

/**
 * The empty knowledge map drawn as a sketch: "You" in the middle, a source of each type around you, and the concepts
 * they share. `lit` brings one source's corner forward. Used by the empty full-screen map and the empty map orb.
 */
export default function MapSketch({ lit = null, className }: { lit?: SketchKind | null; className?: string }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const sourceAt = (kind: SketchKind) => SKETCH_SOURCES.find((s) => s.kind === kind)!;
  const dim = (kind: SketchKind) => lit !== null && lit !== kind;

  return (
    <svg viewBox="0 0 480 260" className={cn('w-full overflow-visible', className)} role="img" aria-label="A sketch of a knowledge map: sources around you, linked by the concepts they share">
      {/* Spokes from you to each source */}
      {SKETCH_SOURCES.map((s, i) => (
        <line
          key={`spoke-${s.kind}`}
          x1={CENTRE.x}
          y1={CENTRE.y}
          x2={s.x}
          y2={s.y}
          className="ui-in-fade transition-[stroke,opacity] duration-300"
          style={{ ...introDelay(120 + i * 60), stroke: lit === s.kind ? kindColor(s.kind, isLight) : 'var(--ws-line-strong)', opacity: dim(s.kind) ? 0.35 : 1 }}
          strokeWidth={lit === s.kind ? 1.6 : 1}
          strokeDasharray="4 5"
        />
      ))}
      {/* Mentions: source to concept */}
      {MENTIONS.map(([kind, c], i) => {
        const s = sourceAt(kind);
        const concept = CONCEPTS[c]!;
        return (
          <line
            key={`mention-${kind}-${c}`}
            x1={s.x}
            y1={s.y}
            x2={concept.x}
            y2={concept.y}
            pathLength={1}
            className="ui-draw transition-[stroke,opacity] duration-300"
            style={{ ...introDelay(380 + i * 35), stroke: lit === kind ? kindColor(kind, isLight) : 'var(--ws-line)', opacity: dim(kind) ? 0.3 : 1 }}
            strokeWidth={lit === kind ? 1.4 : 1}
          />
        );
      })}
      {/* Concepts, gently drifting */}
      {CONCEPTS.map((c, i) => {
        const shared = MENTIONS.filter(([, idx]) => idx === i).length > 1;
        const touched = lit !== null && MENTIONS.some(([kind, idx]) => idx === i && kind === lit);
        return (
          <g key={`concept-${i}`} className="ui-in-pop" style={introDelay(560 + i * 50)}>
            <circle
              cx={c.x}
              cy={c.y}
              r={shared ? 6 : 4.5}
              className="ui-float transition-[fill,stroke] duration-300"
              style={{ ...introDelay(i * 700), fill: touched ? kindColor(lit!, isLight) : 'var(--ws-card)' }}
              stroke={touched ? kindColor(lit!, isLight) : 'var(--ws-ink-faint)'}
              strokeWidth={1.2}
            />
            {shared && <circle cx={c.x} cy={c.y} r={9.5} fill="none" stroke="var(--ws-line-strong)" strokeWidth={1} />}
          </g>
        );
      })}
      {/* Sources */}
      {SKETCH_SOURCES.map((s, i) => {
        const Icon = KIND_ICON[s.kind];
        const color = kindColor(s.kind, isLight);
        const on = lit === s.kind;
        return (
          <g key={`source-${s.kind}`} className="ui-in-pop" style={{ ...introDelay(240 + i * 70), opacity: dim(s.kind) ? 0.45 : 1, transition: 'opacity 300ms' }}>
            <circle cx={s.x} cy={s.y} r={on ? 21 : 18} className="transition-[r] duration-300" fill="var(--ws-dock)" stroke={color} strokeWidth={on ? 2 : 1.4} />
            <circle cx={s.x} cy={s.y} r={on ? 21 : 18} fill={color} opacity={on ? 0.18 : 0.1} className="transition-[r] duration-300" />
            <Icon x={s.x - 9} y={s.y - 9} width={18} height={18} color={color} strokeWidth={2} aria-hidden />
          </g>
        );
      })}
      {/* You */}
      <g className="ui-in-pop" style={introDelay(60)}>
        <circle cx={CENTRE.x} cy={CENTRE.y} r={26} fill="var(--ws-accent-wash)" stroke="var(--ws-accent)" strokeWidth={1.6} />
        <circle cx={CENTRE.x} cy={CENTRE.y} r={34} fill="none" stroke="var(--ws-accent)" strokeOpacity={0.25} className="ui-pulse-ring" />
        <text x={CENTRE.x} y={CENTRE.y + 4.5} textAnchor="middle" className="fill-[var(--ws-accent-ink)] text-[13px] font-semibold">
          You
        </text>
      </g>
    </svg>
  );
}
