import type { SourceKind } from '../sourceMeta';

export type SketchKind = Extract<SourceKind, 'youtube' | 'pdf' | 'github' | 'web'>;

// A sketch of the map the person is about to build: four source types around them, linked through the concepts
// they share. Coordinates are in the SVG's 480 x 260 viewBox.
export const CENTRE = { x: 240, y: 130 };
export const SKETCH_SOURCES: Array<{ kind: SketchKind; x: number; y: number; label: string; action: 'youtube' | 'github' | 'web' | 'file' }> = [
  { kind: 'youtube', x: 92, y: 66, label: 'YouTube video', action: 'youtube' },
  { kind: 'pdf', x: 388, y: 66, label: 'PDF link', action: 'web' },
  { kind: 'github', x: 92, y: 196, label: 'GitHub repo', action: 'github' },
  { kind: 'web', x: 388, y: 196, label: 'Web page', action: 'web' },
];
export const CONCEPTS = [
  { x: 168, y: 34 },
  { x: 312, y: 34 },
  { x: 240, y: 58 },
  { x: 158, y: 132 },
  { x: 322, y: 132 },
  { x: 240, y: 228 },
];
// [source kind, concept index]: the concepts each source mentions. Concepts with two sources are the shared ones.
export const MENTIONS: Array<[SketchKind, number]> = [
  ['youtube', 0], ['youtube', 2], ['youtube', 3],
  ['pdf', 1], ['pdf', 2], ['pdf', 4],
  ['github', 3], ['github', 5],
  ['web', 4], ['web', 5],
];
