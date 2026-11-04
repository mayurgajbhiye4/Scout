import { SWATCH_PATHS } from './entityTypes';
import type { NodeShape } from './graphView';

/** The node's figure as a small inline SVG, for the legend, inspector and navigator. */
export default function ShapeSwatch({ shape, color, size = 14 }: { shape: NodeShape; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {shape === 'circle' ? (
        <circle cx={6} cy={6} r={4.9} fill={color} />
      ) : shape === 'square' ? (
        <rect x={1.4} y={1.4} width={9.2} height={9.2} rx={1.6} fill={color} />
      ) : (
        <path d={SWATCH_PATHS[shape]} fill={color} fillRule="evenodd" />
      )}
    </svg>
  );
}
