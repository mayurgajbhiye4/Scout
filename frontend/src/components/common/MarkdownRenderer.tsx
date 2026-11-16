import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { claimKey } from '@/lib/citations';

interface MarkdownRendererProps {
  content: string;
  /** Render the answer's [1][2] source markers as small numbered circles instead of bracketed text. */
  citationMarks?: boolean;
  /**
   * Also make each circle a button (`<button class="ws-cite" data-cite="2">`) and wrap each cited sentence, with
   * its circles, in `<span class="ws-claim" data-claim="<claimKey>" data-cites="1,2">`, so the passage behind a
   * citation can be shown for the sentence it closes. Implies `citationMarks`.
   */
  markClaims?: boolean;
}

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: unknown;
}

const CITATION = /\[(\d{1,3})\]/g;

/** The circles are plain while an answer is still streaming, and buttons once its passages can be shown. */
function splitCitations(value: string, interactive = false): MdNode[] {
  const nodes: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(CITATION)) {
    const at = match.index ?? 0;
    // The circles carry their own spacing, so the space written before a marker goes
    const before = value.slice(last, at).trimEnd();
    if (before) nodes.push({ type: 'text', value: before });
    nodes.push({
      type: 'citationMark',
      data: interactive
        ? { hName: 'button', hProperties: { type: 'button', className: ['ws-cite'], dataCite: match[1], ariaLabel: `Source ${match[1]}` } }
        : { hName: 'span', hProperties: { className: ['ws-cite'] } },
      children: [{ type: 'text', value: match[1] }],
    });
    last = at + match[0].length;
  }
  if (last === 0) return [{ type: 'text', value }];
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
  return nodes;
}

/** Text nodes only, so code spans and blocks keep their brackets (`arr[0]`). */
function remarkCitationMarks() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text' && child.value) return splitCitations(child.value);
      walk(child);
      return [child];
    });
  };
  return walk;
}

/** A run of markers with the space before them: the circles carry their own spacing. */
const CITATION_RUN = /\s*(?:\[\d{1,3}\])+/g;

/** A last word up to this long stays on one line with the circles after it, so a circle never wraps alone. */
const MAX_KEPT_WORD = 24;

/** The claim's text and its circles, with the last word and the circles in a span that doesn't wrap. */
function claimChildren(claim: string, marks: MdNode[]): MdNode[] {
  const at = claim.trimEnd().lastIndexOf(' ') + 1;
  const lastWord = claim.slice(at);
  if (lastWord.length > MAX_KEPT_WORD) return [{ type: 'text', value: claim }, ...marks];
  const kept: MdNode = {
    type: 'citeRun',
    data: { hName: 'span', hProperties: { className: ['ws-cite-run'] } },
    children: [{ type: 'text', value: lastWord }, ...marks],
  };
  return at > 0 ? [{ type: 'text', value: claim.slice(0, at) }, kept] : [kept];
}

/** Where a sentence ends inside a run of text. */
const SENTENCE_END = /[.!?]\s+/g;

function splitClaims(value: string): MdNode[] {
  const nodes: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(CITATION_RUN)) {
    const at = match.index ?? 0;
    const segment = value.slice(last, at);
    // The claim is the sentence the markers close: from the last sentence end before them
    let start = 0;
    for (const end of segment.matchAll(SENTENCE_END)) start = (end.index ?? 0) + end[0].length;
    const lead = segment.slice(0, start);
    const claim = segment.slice(start);
    const marks = splitCitations(match[0].trim(), true);
    if (lead) nodes.push({ type: 'text', value: lead });
    if (claim.trim()) {
      const cites = [...match[0].matchAll(CITATION)].map((m) => m[1]).join(',');
      nodes.push({
        type: 'claim',
        data: { hName: 'span', hProperties: { className: ['ws-claim'], dataClaim: claimKey(claim), dataCites: cites } },
        children: claimChildren(claim, marks),
      });
    } else {
      // Markers with no sentence of their own in this text run (right after bold text, say): just the circles
      nodes.push(...marks);
    }
    last = at + match[0].length;
  }
  if (last === 0) return [{ type: 'text', value }];
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
  return nodes;
}

/** Text nodes only, so code spans and blocks keep their brackets (`arr[0]`). */
function remarkMarkClaims() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text' && child.value) return splitClaims(child.value);
      walk(child);
      return [child];
    });
  };
  return walk;
}

export default function MarkdownRenderer({ content, citationMarks = false, markClaims = false }: MarkdownRendererProps) {
  let citationPlugin: (() => (node: MdNode) => void)[] = [];
  if (markClaims) citationPlugin = [remarkMarkClaims];
  else if (citationMarks) citationPlugin = [remarkCitationMarks];
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm, ...citationPlugin]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
