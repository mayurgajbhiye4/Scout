import type { WorkspaceNode } from '../useWorkspaceData';
import type { NodeShape } from './graphView';

// The map is the one place the UI uses categorical color; teal stays reserved for focus and selection.
// Every entity type has its own figure AND color, so identity never rests on color alone. The four hues
// (violet, yellow, magenta, green) were validated all-pairs for color-vision deficiency on both canvas
// surfaces; no fifth hue clears those floors, so "Paper & architecture" is told apart by its book, in ink.
const VIOLET = { light: '#7c3aed', dark: '#8b5cf6' };
const YELLOW = { light: '#eda100', dark: '#c98500' };
const MAGENTA = { light: '#e87ba4', dark: '#d55181' };
const GREEN = { light: '#008300', dark: '#008300' };
const INK = { light: '#334155', dark: '#e4e4e7' };
const GREY = { light: '#94a3b8', dark: '#71717a' };

export interface TypeStyle {
  label: string;
  shape: NodeShape;
  dark: string;
  light: string;
}

export const TYPE_PALETTE: Array<TypeStyle & { match: string[] }> = [
  { match: ['concept', 'idea', 'method', 'technique'], label: 'Concept', shape: 'circle', ...VIOLET },
  { match: ['technology', 'aisystem', 'model', 'tool', 'software', 'library', 'framework'], label: 'Technology', shape: 'chip', ...YELLOW },
  { match: ['person', 'author', 'researcher'], label: 'Person', shape: 'person', ...MAGENTA },
  { match: ['organization', 'company', 'platform', 'institution'], label: 'Organization', shape: 'building', ...GREEN },
  { match: ['architecture', 'researchpaper', 'publication', 'paper', 'dataset'], label: 'Paper & architecture', shape: 'book', ...INK },
];
export const OTHER_TYPE: TypeStyle = { label: 'Other', shape: 'circle', ...GREY };

export const SOURCE_GROUP = 'Source';
/** The navigator's groups, in the legend's order */
export const GROUP_ORDER = [SOURCE_GROUP, ...TYPE_PALETTE.map((t) => t.label), OTHER_TYPE.label];

// The figures' silhouettes on a 12-unit grid, each nearly filling it. Window and pin cut-outs use evenodd.
export const SWATCH_PATHS: Record<Exclude<NodeShape, 'circle' | 'square'>, string> = {
  person: 'M6 1.2a2.3 2.3 0 1 1 0 4.6a2.3 2.3 0 1 1 0-4.6ZM1.6 11a4.4 4.4 0 0 1 8.8 0Z',
  building:
    'M4.6 1h5.6v10H1.8V5.2h2.8ZM6 2.6v1.4h1.2V2.6ZM8.2 2.6v1.4h1.2V2.6ZM6 5.4v1.4h1.2V5.4ZM8.2 5.4v1.4h1.2V5.4ZM6 8.2v1.4h1.2V8.2ZM8.2 8.2v1.4h1.2V8.2Z',
  chip: 'M3 3h6v6H3ZM1 4h1.6v1H1ZM1 7h1.6v1H1ZM9.4 4H11v1H9.4ZM9.4 7H11v1H9.4ZM4 1h1v1.6H4ZM7 1h1v1.6H7ZM4 9.4h1V11H4ZM7 9.4h1V11H7Z',
  book: 'M1 2.2c1.9-.2 3.5.2 4.6 1v7.4C4.5 9.8 2.9 9.5 1 9.7ZM11 2.2c-1.9-.2-3.5.2-4.6 1v7.4c1.1-.8 2.7-1.1 4.6-.9Z',
};

export function typeBucket(type: string) {
  const t = (type || '').toLowerCase();
  return TYPE_PALETTE.find((p) => p.match.includes(t)) ?? OTHER_TYPE;
}

/** Which navigator group a node is listed under */
export function groupOf(n: WorkspaceNode) {
  return n.isSource ? SOURCE_GROUP : typeBucket(n.type).label;
}
