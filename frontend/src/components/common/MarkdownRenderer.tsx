import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  /** Render the answer's [1][2] source markers as small superscripts instead of bracketed text. */
  citationMarks?: boolean;
}

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: unknown;
}

const CITATION = /\[(\d{1,3})\]/g;

function splitCitations(value: string): MdNode[] {
  const nodes: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(CITATION)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push({ type: 'text', value: value.slice(last, at) });
    nodes.push({
      type: 'citationMark',
      data: { hName: 'sup', hProperties: { className: ['ws-cite'] } },
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

export default function MarkdownRenderer({ content, citationMarks = false }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={citationMarks ? [remarkGfm, remarkCitationMarks] : [remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
