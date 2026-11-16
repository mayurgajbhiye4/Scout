import { useRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnswerExtras, ChatMessage } from '@/api/chat';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { ThemeProvider } from '@/features/theme';
import { claimKey, type ReferencedSourceItem } from '@/lib/citations';
import { CitationCard } from '../copilot/answer/CitationCard';
import { passageFor } from '../copilot/answer/citationPassage';
import { RelationMap } from '../copilot/answer/RelationMap';
import { ResearchThreads } from '../copilot/answer/ResearchThreads';
import { chatReducer, INITIAL_CHAT_STATE, type ChatState } from '../copilot/chatTurn';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

describe('claimKey', () => {
  // Same fixtures as backend/tests/unit/test_answer_extras.py, so both sides key a sentence alike
  it('matches the backend claim_key', () => {
    expect(claimKey('Depth is **leverage** [1][2].')).toBe('depth is leverage');
    expect(claimKey('  Seams   sit between [modules](https://x.y) [2][3].  ')).toBe('seams sit between modules');
  });
});

describe('MarkdownRenderer claim marks', () => {
  it('wraps each cited sentence with its citation circles and leaves code alone', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'Depth is leverage [1]. Locality matters. Seams sit between modules [2][3].\n\n- A placement. [1] Use `arr[0]`.'}
        markClaims
      />
    );
    const claims = [...container.querySelectorAll<HTMLElement>('.ws-claim')].map((el) => [el.dataset.claim, el.dataset.cites]);
    expect(claims).toEqual([
      ['depth is leverage', '1'],
      ['seams sit between modules', '2,3'],
      ['a placement', '1'],
    ]);
    expect(container.textContent).not.toMatch(/\[[1-3]\]/);
    expect(container.querySelectorAll('.ws-claim button.ws-cite')).toHaveLength(4);
    expect(container.querySelector('code')?.textContent).toBe('arr[0]');
  });
});

describe('chat turn', () => {
  it('keeps the answer extras from the done event', () => {
    const extras: AnswerExtras = { relations: [], threads: [{ kind: 'gap', text: 'No benchmark', question: 'Which benchmark?' }] };
    const user: ChatMessage = { id: 'u', session_id: 's', role: 'user', content: 'q', status: 'sent', created_at: '' };
    let state: ChatState = chatReducer(INITIAL_CHAT_STATE, { type: 'begin', turnId: 't', sessionId: 's' });
    state = chatReducer(state, { type: 'request_started', turnId: 't', sessionId: 's', userMessage: user });
    state = chatReducer(state, { type: 'stream_opened', turnId: 't', createdAt: '' });
    state = chatReducer(state, { type: 'stream_event', turnId: 't', event: { delta: 'Answer.' } });
    state = chatReducer(state, { type: 'stream_event', turnId: 't', event: { done: true, message_id: 'm', extras } });
    expect(state.messages.at(-1)?.answer_extras).toEqual(extras);
  });
});

describe('ResearchThreads', () => {
  const threads: AnswerExtras['threads'] = [
    { kind: 'gap', text: 'No source measures seam placement', question: 'How is seam placement measured?' },
    { kind: 'tension', text: 'The paper and the video disagree', question: 'Which depth metric holds up?' },
    { kind: 'deeper', text: 'Locality', question: 'How does locality limit change?', concept: 'Locality' },
    { kind: 'deeper', text: 'Unknown idea', question: 'What is the unknown idea?', concept: 'Unknown idea' },
  ];

  it('shows each thread as one question to ask, marking gaps and tensions with a word', () => {
    const onAsk = vi.fn();
    render(<ResearchThreads threads={threads!} disabled={false} onAsk={onAsk} />);
    // Nothing but the questions can be pressed
    expect(screen.getAllByRole('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Which depth metric holds up?' }));
    expect(onAsk).toHaveBeenLastCalledWith('Which depth metric holds up?');

    // The statement behind a gap is the word's tooltip and the question's description
    expect(screen.getByTitle('No source measures seam placement')).toHaveTextContent('Gap');
    expect(screen.getByRole('button', { name: 'How is seam placement measured?' })).toHaveAccessibleDescription(
      ': No source measures seam placement'
    );
    expect(screen.getByTitle('The paper and the video disagree')).toHaveTextContent('Tension');
    // A "deeper" thread is just its question
    expect(screen.queryByTitle('Locality')).toBeNull();
  });

  it('cannot be asked while the chat is busy', () => {
    const onAsk = vi.fn();
    render(<ResearchThreads threads={threads!} disabled onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: 'Which depth metric holds up?' }));
    expect(onAsk).not.toHaveBeenCalled();
  });
});

describe('RelationMap', () => {
  it('stays folded into one line until opened, then reads concept, relation, concept with its gloss', () => {
    render(
      <ThemeProvider>
        <RelationMap
          relations={[{ id: 'R1', source: 'Depth', relationship: 'MEASURED_BY', target: 'Caller leverage', note: 'depth only means something to callers' }]}
          findConcept={(label) => (label === 'Depth' ? { id: 'd', name: 'Depth', type: 'Concept' } : null)}
          onFocusConcept={() => {}}
        />
      </ThemeProvider>
    );
    const fold = screen.getByRole('button', { name: '1 connection on your map' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Depth measured by Caller leverage')).toBeNull();
    fireEvent.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Depth measured by Caller leverage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Depth' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Caller leverage' })).toBeNull();
    expect(screen.getByText('depth only means something to callers')).toBeInTheDocument();
  });
});

describe('CitationCard', () => {
  const extras: AnswerExtras = {
    evidence: {
      claims: [
        { key: 'depth is leverage', citation_index: 1, quote: 'A deep module hides a lot behind a small API.', chunk_index: 3 },
        // One sentence, two sources: each citation has its own passage
        { key: 'seams sit between modules', citation_index: 1, quote: 'Modules meet at seams.', chunk_index: 5 },
        // Keyed a little differently than the rendered sentence: still close enough to match
        { key: 'seams sit right between modules', citation_index: 2, quote: 'A seam is where behaviour can vary.' },
        // Same source as the bullet below, but a different sentence: never borrowed for it
        { key: 'something else entirely about caching layers', citation_index: 2, quote: 'Caches trade memory for time.' },
      ],
      sources: { '2': { quote: 'Seams let tests swap one part for another.', chunk_index: 0 } },
    },
  };
  const refs = [
    { key: 'a', displayIndex: 1, sourceId: 's1', sourceTitle: 'Design It Twice', sourceType: 'document', origin: 'library', matchedEntities: [], snippets: [], isExplicitlyCited: true },
    { key: 'b', displayIndex: 2, sourceTitle: 'Seams article', url: 'https://www.example.org/seams', sourceType: 'web', origin: 'web', matchedEntities: [], snippets: [], isExplicitlyCited: true },
    { key: 'c', displayIndex: 3, sourceTitle: 'Old notes', sourceType: 'document', origin: 'library', matchedEntities: [], snippets: ['A snippet saved with the citation.'], isExplicitlyCited: true },
  ] as ReferencedSourceItem[];
  const body = 'Depth is leverage [1]. Seams sit between modules [1][2].\n\n- Tests run fast [2].\n- Notes agree [3].';

  function Harness({ onHoverSource = () => {}, onSelectSource = () => {} }: { onHoverSource?: (id: string | null) => void; onSelectSource?: (id: string) => void }) {
    const proseRef = useRef<HTMLDivElement>(null);
    return (
      <article>
        <div ref={proseRef}>
          <MarkdownRenderer content={body} markClaims />
        </div>
        <CitationCard
          proseRef={proseRef}
          content={body}
          extras={extras}
          refs={refs}
          sourcesById={new Map([['s1', { id: 's1', title: 'Design It Twice', source_type: 'pdf' } as never]])}
          isLight={false}
          onHoverSource={onHoverSource}
          onSelectSource={onSelectSource}
        />
      </article>
    );
  }

  it('shows nothing at rest, and opens by the circle under the pointer', async () => {
    const onHoverSource = vi.fn();
    render(<Harness onHoverSource={onHoverSource} />);
    const circles = screen.getAllByRole('button', { name: /^Source \d/ });
    expect(circles.map((c) => c.textContent)).toEqual(['1', '1', '2', '2', '3']);
    expect(circles[0]).toHaveAccessibleName('Source 1: Design It Twice');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(circles[0]).toHaveAttribute('aria-expanded', 'false');

    fireEvent.mouseOver(circles[0]!);
    let card = await screen.findByRole('dialog', { name: 'Passage from source 1: Design It Twice' });
    expect(within(card).getByText('A deep module hides a lot behind a small API.')).toBeInTheDocument();
    expect(within(card).getByText('· passage 4')).toBeInTheDocument();
    expect(circles[0]).toHaveClass('is-active');
    expect(circles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(circles[0]!.closest('.ws-claim')).toHaveClass('is-active');
    expect(onHoverSource).toHaveBeenLastCalledWith('s1');

    // The two citations of one sentence show their own passages
    fireEvent.mouseOver(circles[1]!);
    expect(await screen.findByText('Modules meet at seams.')).toBeInTheDocument();
    fireEvent.mouseOver(circles[2]!);
    card = await screen.findByRole('dialog', { name: 'Passage from source 2: Seams article' });
    expect(within(card).getByText('A seam is where behaviour can vary.')).toBeInTheDocument();
    expect(within(card).getByText('· example.org')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open Seams article' })).toHaveAttribute('href', 'https://www.example.org/seams');
    expect(circles[0]).not.toHaveClass('is-active');

    // The pointer can travel from the circle onto the card without it closing
    fireEvent.mouseOut(circles[2]!);
    fireEvent.mouseEnter(card);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Leaving both closes it
    fireEvent.mouseLeave(card);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onHoverSource).toHaveBeenLastCalledWith(null);
    expect(circles[2]!.closest('.ws-claim')).not.toHaveClass('is-active');
  });

  it('stays open on a pressed circle, and gives bullets their citations too', async () => {
    const onSelectSource = vi.fn();
    render(<Harness onSelectSource={onSelectSource} />);
    const circles = screen.getAllByRole('button', { name: /^Source \d/ });

    // A bullet whose sentence has no passage of its own gets its source's, and says so
    fireEvent.mouseOver(circles[3]!);
    fireEvent.click(circles[3]!, { detail: 1 });
    fireEvent.mouseOut(circles[3]!);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const card = screen.getByRole('dialog');
    expect(within(card).getByText('Seams let tests swap one part for another.')).toBeInTheDocument();
    expect(within(card).getByText('Nearest passage in this source')).toBeInTheDocument();
    expect(within(card).queryByText('Caches trade memory for time.')).toBeNull();

    // Keyboard focus on another circle shows that one, and the pressed one comes back after it
    fireEvent.focusIn(circles[4]!);
    expect(await screen.findByText('A snippet saved with the citation.')).toBeInTheDocument();
    fireEvent.focusOut(circles[4]!);
    expect(await screen.findByText('Seams let tests swap one part for another.')).toBeInTheDocument();

    // Esc lets go of it
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens from the keyboard with focus inside, and Esc returns to the circle', async () => {
    const onSelectSource = vi.fn();
    render(<Harness onSelectSource={onSelectSource} />);
    const circle = screen.getAllByRole('button', { name: /^Source \d/ })[0]!;
    circle.focus();
    // Enter on a button arrives as a click with no pointer behind it
    fireEvent.click(circle, { detail: 0 });
    const card = await screen.findByRole('dialog');
    await waitFor(() => expect(card).toHaveFocus());
    fireEvent.click(within(card).getByRole('button', { name: 'Show Design It Twice on the map' }));
    expect(onSelectSource).toHaveBeenCalledWith('s1');
    fireEvent.keyDown(card, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(circle).toHaveFocus();
  });

  it('shows nothing for an answer without citations', () => {
    function Plain() {
      const proseRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={proseRef}>
            <MarkdownRenderer content="Hello there." markClaims />
          </div>
          <CitationCard proseRef={proseRef} content="Hello there." refs={[]} sourcesById={new Map()} isLight={false} onHoverSource={() => {}} onSelectSource={() => {}} />
        </>
      );
    }
    render(<Plain />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('falls back from the sentence, to the source, to the saved snippet, to nothing', () => {
    expect(passageFor({ citation: 1, key: 'depth is leverage' }, extras)).toEqual({ quote: 'A deep module hides a lot behind a small API.', chunkIndex: 3, exact: true });
    expect(passageFor({ citation: 2, key: '' }, extras)).toMatchObject({ quote: 'Seams let tests swap one part for another.', exact: false });
    expect(passageFor({ citation: 3, key: 'notes agree' }, extras, refs[2])).toEqual({ quote: 'A snippet saved with the citation.', exact: false });
    expect(passageFor({ citation: 3, key: 'notes agree' }, null)).toBeNull();
  });
});
