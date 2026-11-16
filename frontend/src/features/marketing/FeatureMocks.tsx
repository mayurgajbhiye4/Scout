import { CircleCheck, MessageSquare, Network, Plus, Search } from '@/components/icons';
import { useTheme } from '@/features/theme';
import { KIND_ICON } from '@/features/workspace/canvas/addSourceOptions';
import { kindColor, type SourceKind } from '@/features/workspace/sourceMeta';
import { introDelay, staggerDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Pictures of the app for the visitor page's feature blocks. They copy the workspace's own markup and tokens but
// are not interactive: FeatureBlock hides them from screen readers and labels the figure instead.

function KindBadge({ kind, size = 28 }: { kind: SourceKind; size?: number }) {
  const { theme } = useTheme();
  const color = kindColor(kind, theme === 'light');
  const KindIcon = KIND_ICON[kind];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      <KindIcon size={Math.round(size / 2)} />
    </span>
  );
}

type Status = 'indexed' | 'processing' | 'queued';

const LIBRARY: Array<{ kind: SourceKind; title: string; origin: string; status: Status; detail?: string }> = [
  { kind: 'pdf', title: 'Attention Is All You Need', origin: 'arxiv.org', status: 'indexed', detail: '38 passages' },
  { kind: 'youtube', title: "Let's build GPT: from scratch, in code", origin: 'Andrej Karpathy', status: 'indexed', detail: '112 passages' },
  { kind: 'github', title: 'karpathy/nanoGPT', origin: 'github.com', status: 'processing' },
  { kind: 'web', title: 'The Illustrated Transformer', origin: 'jalammar.github.io', status: 'queued' },
  { kind: 'notes', title: 'attention_notes.md', origin: 'Your notes', status: 'indexed', detail: '6 passages' },
];

function StatusChip({ status, detail }: { status: Status; detail?: string }) {
  if (status === 'processing') {
    return (
      <span className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--ws-accent-ink)]">
        <span className="relative h-1 w-14 overflow-hidden rounded-full bg-[var(--ws-accent-wash)]">
          <span className="mk-indeterminate absolute inset-y-0 left-0 w-1/2 rounded-full bg-[var(--ws-accent)]" />
        </span>
        Reading
      </span>
    );
  }
  if (status === 'queued') return <span className="shrink-0 text-[12px] text-[var(--ws-ink-faint)]">Queued</span>;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--ws-ink-soft)]">
      <CircleCheck size={13} className="text-[var(--ws-accent-ink)]" />
      <span className="hidden sm:inline">{detail}</span>
      <span className="sm:hidden">Indexed</span>
    </span>
  );
}

/** Adding sources: the drop target, and the library filling up with each source's ingest status. */
export function SourcesMock() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div
        className="ui-reveal-fade flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-4xl border border-dashed border-[var(--ws-line-strong)] bg-[var(--ws-card)] p-6 text-center"
        style={introDelay(260)}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--ws-line-strong)] text-[var(--ws-ink-soft)]">
          <Plus size={18} />
        </span>
        <span className="text-[14px] font-medium text-[var(--ws-ink)]">Paste a link, or drop files</span>
        <span className="text-[12.5px] text-[var(--ws-ink-faint)]">YouTube · PDF · GitHub · Web · Markdown, Word, Notion</span>
      </div>
      <ul className="flex flex-col gap-2">
        {LIBRARY.map((source, i) => (
          <li
            key={source.title}
            className="ui-reveal-left flex min-w-0 items-center gap-3 rounded-full border border-[var(--ws-line)] bg-[var(--ws-card)] py-2 pl-2.5 pr-4"
            style={staggerDelay(i, 320)}
          >
            <KindBadge kind={source.kind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-[var(--ws-ink)]">{source.title}</span>
              <span className="block truncate text-[12px] text-[var(--ws-ink-faint)]">{source.origin}</span>
            </span>
            <StatusChip status={source.status} detail={source.detail} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// The knowledge map: concept nodes, and the relations between them as labelled edges
const NODES: Record<string, { x: number; y: number; hub?: boolean }> = {
  Transformer: { x: 380, y: 150, hub: true },
  'Self-attention': { x: 190, y: 82 },
  Softmax: { x: 86, y: 182 },
  'T × T scores': { x: 236, y: 244 },
  nanoGPT: { x: 560, y: 70 },
  FlashAttention: { x: 548, y: 236 },
  'KV cache': { x: 690, y: 152 },
};

const EDGES: Array<[string, string, string?]> = [
  ['Transformer', 'Self-attention', 'uses'],
  ['Self-attention', 'Softmax'],
  ['Self-attention', 'T × T scores', 'builds'],
  ['Transformer', 'nanoGPT', 'implemented in'],
  ['T × T scores', 'FlashAttention', 'reduced by'],
  ['nanoGPT', 'KV cache'],
  ['Transformer', 'FlashAttention'],
];

const pillWidth = (label: string) => label.length * 7.6 + 44;

/** The knowledge map, drawn like the workspace's canvas: outlined concepts, the question's concept in orange. */
export function MapMock() {
  return (
    <div className="flex justify-center overflow-hidden">
      <svg viewBox="0 0 780 300" className="w-full min-w-[620px] max-w-[900px] font-ui">
        {EDGES.map(([a, b], i) => {
          const from = NODES[a];
          const to = NODES[b];
          if (!from || !to) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke="var(--ws-line-strong)"
              strokeWidth={1.25}
              pathLength={1}
              className="ui-reveal-draw"
              style={introDelay(200 + i * 70)}
            />
          );
        })}
        {EDGES.map(([a, b, label], i) => {
          const from = NODES[a];
          const to = NODES[b];
          if (!from || !to || !label) return null;
          const w = label.length * 6.2 + 16;
          const x = (from.x + to.x) / 2;
          const y = (from.y + to.y) / 2;
          return (
            <g key={label} className="ui-reveal-fade" style={introDelay(800 + i * 60)}>
              <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} fill="var(--mk-face)" stroke="var(--ws-line)" />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="var(--ws-ink-faint)">
                {label}
              </text>
            </g>
          );
        })}
        {Object.entries(NODES).map(([label, node], i) => {
          const w = pillWidth(label);
          return (
            <g key={label} className="ui-reveal-pop" style={introDelay(120 + i * 60)}>
              <rect
                x={node.x - w / 2} y={node.y - 17} width={w} height={34} rx={17}
                fill={node.hub ? 'var(--ws-accent-wash)' : 'var(--mk-face)'}
                stroke={node.hub ? 'var(--ws-accent)' : 'var(--ws-line-strong)'}
                strokeWidth={node.hub ? 1.5 : 1.1}
              />
              <circle cx={node.x - w / 2 + 15} cy={node.y} r={3.5} fill={node.hub ? 'var(--ws-accent)' : 'var(--ws-ink-faint)'} />
              <text x={node.x - w / 2 + 27} y={node.y + 4.5} fontSize={13} fontWeight={600} fill="var(--ws-ink)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A copilot answer with its citations, one opened to show the passage it rests on. */
export function AnswerMock() {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3">
      <p
        className="ui-reveal-up max-w-[88%] self-end rounded-4xl bg-[var(--ws-accent-wash)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--ws-ink)] ring-1 ring-[var(--ws-accent)]/25"
        style={introDelay(200)}
      >
        How does nanoGPT compute attention scores?
      </p>
      <div className="ui-reveal-fade flex items-center gap-2 px-1 text-[12.5px] text-[var(--ws-ink-faint)]" style={introDelay(320)}>
        <Network size={13} />
        Research path: searched your library, 4 passages kept, no web needed
      </div>
      <div className="relative rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-card)] px-4 py-3 sm:px-5 sm:py-4">
        <p className="ui-reveal-fade font-reading text-[15.5px] leading-relaxed text-[var(--ws-ink)] sm:text-[17px]" style={introDelay(420)}>
          Each head projects the input into queries, keys and values, then scores every query against every key.
          <Cite n={1} /> nanoGPT does this as one matrix product of queries and transposed keys, scaled by the square
          root of the key size.<Cite n={3} active /> The scores are then masked, so each token only sees the tokens
          before it.<Cite n={3} />
        </p>
        <div
          className="ui-reveal-card mt-4 rounded-4xl border border-[var(--ws-accent)]/40 bg-[var(--mk-face)] p-4 shadow-[var(--ws-shadow-sm)] sm:ml-auto sm:w-[78%]"
          style={introDelay(700)}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <KindBadge kind="github" size={24} />
            <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--ws-ink)]">karpathy/nanoGPT · model.py</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--ws-ink-faint)]">Source 3</span>
          </div>
          <pre className="mt-3 overflow-hidden whitespace-pre-wrap break-words rounded-4xl bg-[var(--ws-card)] px-4 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--ws-ink-soft)]">
            {'att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))\natt = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))'}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Cite({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={cn(
        'font-ui mx-1 inline-grid h-5 min-w-5 -translate-y-0.5 place-items-center rounded-full border px-1 align-middle text-[11.5px] font-semibold tabular-nums',
        active ? 'border-[var(--ws-accent)] bg-[var(--ws-accent)] text-[var(--ws-on-accent)]' : 'border-[var(--ws-line-strong)] text-[var(--ws-accent-ink)]'
      )}
    >
      {n}
    </span>
  );
}

const PALETTE_ROWS: Array<{ title: string; when: string; kind: SourceKind; sources: number }> = [
  { title: 'Why attention gets expensive on long inputs', when: '2h ago', kind: 'pdf', sources: 5 },
  { title: 'nanoGPT training loop, step by step', when: 'Yesterday', kind: 'github', sources: 1 },
  { title: 'FlashAttention vs. standard attention', when: '3d ago', kind: 'web', sources: 2 },
  { title: 'Positional encodings, compared', when: 'Last week', kind: 'youtube', sources: 3 },
];

/** The ⌘K sessions palette, as LandingPage draws it, mid-search. */
export function PaletteMock() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  return (
    <div className="mx-auto flex max-w-[640px] flex-col overflow-hidden rounded-4xl border border-[var(--ws-line)] bg-[var(--mk-face)] text-[var(--ws-ink)]">
      <div className="flex h-14 items-center gap-2.5 border-b border-[var(--ws-line)] px-4">
        <Search size={17} className="shrink-0 text-[var(--ws-ink-faint)]" />
        <span className="text-[15px]">attention</span>
        <span className="mk-caret -ml-2 h-4 w-px bg-[var(--ws-accent)]" />
        <kbd className="ml-auto rounded-lg border border-[var(--ws-line)] px-1.5 font-mono text-[11px] text-[var(--ws-ink-faint)]">⌘K</kbd>
      </div>
      <ul className="flex flex-col gap-0.5 p-2">
        {PALETTE_ROWS.map((row, i) => {
          const KindIcon = KIND_ICON[row.kind];
          const selected = i === 0;
          return (
            <li
              key={row.title}
              className={cn('ui-reveal-up flex items-center gap-3 rounded-xl px-3 py-2.5', selected && 'bg-[var(--ws-card-hover)]')}
              style={staggerDelay(i, 300)}
            >
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                  selected ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30' : 'bg-[var(--ws-canvas)] text-[var(--ws-ink-faint)] ring-1 ring-[var(--ws-line)]'
                )}
              >
                <MessageSquare size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{row.title}</span>
                <span className="flex items-center gap-2 text-[12px] text-[var(--ws-ink-faint)]">
                  {row.when}
                  <span className="flex items-center gap-1">
                    <KindIcon size={12} style={{ color: kindColor(row.kind, isLight) }} />
                    {row.sources === 1 ? '1 source' : `${row.sources} sources`}
                  </span>
                </span>
              </span>
              {selected && <kbd className="hidden shrink-0 rounded-lg border border-[var(--ws-line)] px-1.5 font-mono text-[11px] text-[var(--ws-ink-faint)] sm:inline">↵</kbd>}
            </li>
          );
        })}
      </ul>
      <div className="flex h-11 items-center justify-end border-t border-[var(--ws-line)] px-4 text-[12px] font-medium text-[var(--ws-ink-soft)]">
        <span className="flex items-center gap-1.5">
          <Plus size={14} />
          New research
        </span>
      </div>
    </div>
  );
}
