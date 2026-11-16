import { useId } from 'react';
import { CornerDownRight } from 'lucide-react';
import type { ResearchThread } from '@/api/chat';

/** The one word that marks a thread as something the sources leave open or disagree on. */
const KIND_WORD = { gap: 'Gap', tension: 'Tension' } as const;

function ThreadRow({ thread, disabled, onAsk }: { thread: ResearchThread; disabled: boolean; onAsk: (question: string) => void }) {
  const noteId = useId();
  const word = thread.kind !== 'deeper' && thread.text ? KIND_WORD[thread.kind] : null;
  return (
    <li className="ws-thread">
      <button
        type="button"
        onClick={() => onAsk(thread.question)}
        disabled={disabled}
        aria-describedby={word ? noteId : undefined}
        className="ws-thread-ask group"
      >
        <CornerDownRight
          size={13}
          strokeWidth={1.75}
          className="mt-[3px] shrink-0 text-[var(--ws-ink-faint)] transition-colors group-hover:text-[var(--ws-accent-ink)]"
          aria-hidden
        />
        <span className="min-w-0">{thread.question}</span>
      </button>
      {word && (
        <span className="ws-thread-kind" title={thread.text}>
          {word}
          <span id={noteId} className="sr-only">
            : {thread.text}
          </span>
        </span>
      )}
    </li>
  );
}

/**
 * The open ends of the research, as questions to ask next. A gap or a tension carries one small word; what the
 * sources leave open or disagree on is its tooltip and the question's description.
 */
export function ResearchThreads({
  threads,
  disabled,
  onAsk,
}: {
  threads: ResearchThread[];
  disabled: boolean;
  onAsk: (question: string) => void;
}) {
  if (threads.length === 0) return null;
  return (
    <section aria-label="Open threads">
      <ul>
        {threads.map((t) => (
          <ThreadRow key={t.question} thread={t} disabled={disabled} onAsk={onAsk} />
        ))}
      </ul>
    </section>
  );
}
