import { Link } from 'react-router-dom';
import Wordmark from '@/components/brand/Wordmark';
import { introDelay } from '@/lib/motion';

export default function NotFoundPage() {
  return (
    <div className="font-ui flex h-screen w-screen flex-col items-start justify-center gap-6 bg-[var(--ws-canvas)] px-6 text-[var(--ws-ink)]">
      <div className="mx-auto w-full max-w-[680px]">
        <div className="ui-in-pop w-fit">
          <Wordmark />
        </div>
        <h1 style={introDelay(90)} className="ui-in-up mt-12 text-balance text-4xl font-semibold tracking-[-0.03em]">This page doesn’t exist</h1>
        <Link
          to="/"
          style={introDelay(150)}
          className="ui-in-up ui-press mt-8 inline-flex h-10 items-center rounded-full bg-[var(--ws-accent)] px-4 text-[14px] font-semibold text-[var(--ws-on-accent)] hover:brightness-110"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
