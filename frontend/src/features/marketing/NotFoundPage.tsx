import { Link } from 'react-router-dom';
import { Wordmark } from './MarketingNav';
import { introDelay } from '@/lib/motion';

export default function NotFoundPage() {
  return (
    <div className="mk-page flex h-screen w-screen flex-col items-start justify-center gap-6 px-6">
      <div className="mx-auto w-full max-w-[680px]">
        <div className="ui-in-pop w-fit">
          <Wordmark />
        </div>
        <h1 style={introDelay(90)} className="ui-in-up mt-12 text-4xl font-semibold tracking-tight">This page doesn’t exist</h1>
        <p style={introDelay(150)} className="ui-in-up mt-4 text-lg text-[var(--mk-ink-soft)]">The link may be old or mistyped. Your sessions and sources are where you left them.</p>
        <Link
          to="/"
          style={introDelay(210)}
          className="ui-in-up mk-press mt-8 inline-flex rounded-full bg-[var(--mk-accent)] px-3 py-2 text-base font-semibold text-[var(--mk-on-accent)] hover:opacity-90"
        >
          Go to Scout home
        </Link>
      </div>
    </div>
  );
}
