import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArcadeRateLimitModal from '../ArcadeRateLimitModal';
import ArcadeRateLimitBanner from '../ArcadeRateLimitBanner';
import { rateLimitManager } from '@/lib/rateLimitManager';

describe('ArcadeRateLimit UI Components', () => {
  beforeEach(() => {
    rateLimitManager.clearAll();
  });

  it('renders ArcadeRateLimitModal with retro CRT scanline headers and countdown timer when alert is active', () => {
    rateLimitManager.notify({
      scope: 'sources:ingest',
      retryAfter: 35,
      limit: 10,
    });

    render(<ArcadeRateLimitModal />);

    expect(screen.getByText(/SYSTEM COOLDOWN \/\/ RATE LIMIT HIT/i)).toBeInTheDocument();
    expect(screen.getByText(/INGESTION COOLDOWN ACTIVE/i)).toBeInTheDocument();
    expect(screen.getByText(/00:35/i)).toBeInTheDocument();
    expect(screen.getByText(/sources:ingest/i)).toBeInTheDocument();
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

  it('dismisses modal on close button click', () => {
    rateLimitManager.notify({
      scope: 'sessions:create',
      retryAfter: 30,
    });

    render(<ArcadeRateLimitModal />);
    expect(screen.getByText(/SESSION CREATION COOLDOWN/i)).toBeInTheDocument();

    const dismissButton = screen.getByRole('button', { name: /ACKNOWLEDGE/i });
    fireEvent.click(dismissButton);

    expect(rateLimitManager.isScopeActive('sessions:create')).toBe(false);
  });
});
