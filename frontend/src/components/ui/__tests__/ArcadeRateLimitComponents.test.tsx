import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import RateLimitPopup from '../RateLimitPopup';
import ArcadeRateLimitBanner from '../ArcadeRateLimitBanner';
import { rateLimitManager } from '@/lib/rateLimitManager';

describe('ArcadeRateLimit UI Components', () => {
  beforeEach(() => {
    rateLimitManager.clearAll();
  });

  it('shows a small popup with the countdown when a limit is hit, in the corner when nothing was pressed', () => {
    rateLimitManager.notify({
      scope: 'sources:ingest',
      retryAfter: 35,
      limit: 10,
    });

    render(<RateLimitPopup />);

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/adding sources is paused/i);
    expect(notice).toHaveTextContent(/0:35/);
    expect(notice.parentElement).toHaveClass('bottom-4', 'right-4');
  });

  it('opens beside the control that started the request', () => {
    render(
      <>
        <button type="button">Send</button>
        <RateLimitPopup />
      </>
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Send' }));
    act(() => {
      rateLimitManager.notify({ scope: 'chat:stream', retryAfter: 20 });
    });

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/copilot needs a breather/i);
    expect(notice).toHaveClass('fixed');
  });

  it('renders ArcadeRateLimitBanner in compact mode with live timer and dismiss', () => {
    rateLimitManager.notify({
      scope: 'chat:stream',
      retryAfter: 25,
      limit: 15,
    });

    render(<ArcadeRateLimitBanner scope="chat:stream" compact />);

    expect(screen.getByText(/COOLDOWN ACTIVE: chat:stream/i)).toBeInTheDocument();
    expect(screen.getByText(/00:25/i)).toBeInTheDocument();
  });

  it('hides the popup on close but keeps the cooldown running', () => {
    rateLimitManager.notify({
      scope: 'sessions:create',
      retryAfter: 30,
    });

    render(<RateLimitPopup />);
    fireEvent.click(screen.getByRole('button', { name: /hide this notice/i }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(rateLimitManager.isScopeActive('sessions:create')).toBe(true);
  });
});
