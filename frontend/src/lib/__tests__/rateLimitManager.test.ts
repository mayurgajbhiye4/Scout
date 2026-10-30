import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimitManager, parseRateLimitError } from '../rateLimitManager';

describe('RateLimitManager & Arcade Error Parsing', () => {
  beforeEach(() => {
    rateLimitManager.clearAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rateLimitManager.clearAll();
  });

  it('parses standard backend AppException 429 response', () => {
    const errorObj = {
      response: {
        status: 429,
        data: {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded: 10 per 60s for sources:ingest.',
            details: {
              scope: 'sources:ingest',
              limit: 10,
              window_seconds: 60,
              retry_after: 45,
              reset_timestamp: 1774075420,
            },
          },
        },
        headers: {
          'retry-after': '45',
          'x-ratelimit-limit': '10',
          'x-ratelimit-reset': '45',
        },
      },
    };

    const parsed = parseRateLimitError(errorObj);
    expect(parsed).not.toBeNull();
    expect(parsed?.scope).toBe('sources:ingest');
    expect(parsed?.limit).toBe(10);
    expect(parsed?.retryAfter).toBe(45);
    expect(parsed?.secondsLeft).toBe(45);
    expect(parsed?.title).toBe('INGESTION COOLDOWN ACTIVE');
    expect(parsed?.category).toBe('ingestion');
  });

  it('parses fallback scope from url endpoint when details are omitted', () => {
    const errorObj = {
      response: {
        status: 429,
        data: {
          detail: 'Too Many Requests',
        },
        headers: {
          'retry-after': '20',
        },
      },
      config: {
        url: '/api/v1/chat/sessions/123/chat',
      },
    };

    const parsed = parseRateLimitError(errorObj);
    expect(parsed).not.toBeNull();
    expect(parsed?.scope).toBe('chat:stream');
    expect(parsed?.title).toBe('AI AGENT REASONING COOLDOWN');
    expect(parsed?.retryAfter).toBe(20);
    expect(parsed?.category).toBe('chat');
  });

  it('notifies listeners on rate limit hit', () => {
    const listener = vi.fn();
    const unsubscribe = rateLimitManager.subscribe(listener);

    const alert = rateLimitManager.notify({
      scope: 'sessions:create',
      retryAfter: 15,
      limit: 20,
    });

    expect(alert).not.toBeNull();
    expect(rateLimitManager.isScopeActive('sessions:create')).toBe(true);
    expect(rateLimitManager.getCooldownSeconds('sessions:create')).toBe(15);
    expect(listener).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ scope: 'sessions:create' }),
    ]));

    unsubscribe();
  });

  it('allows manual dismissal of active alerts', () => {
    rateLimitManager.notify({
      scope: 'sources:delete',
      retryAfter: 30,
    });
    expect(rateLimitManager.isScopeActive('sources:delete')).toBe(true);

    rateLimitManager.dismiss('sources:delete');
    expect(rateLimitManager.isScopeActive('sources:delete')).toBe(false);
  });

  it('deduplicates alerts for the same scope and updates cooldown', () => {
    rateLimitManager.notify({
      scope: 'sources:ingest',
      retryAfter: 20,
    });
    expect(rateLimitManager.getAlerts().length).toBe(1);

    rateLimitManager.notify({
      scope: 'sources:ingest',
      retryAfter: 50,
    });
    expect(rateLimitManager.getAlerts().length).toBe(1);
    expect(rateLimitManager.getCooldownSeconds('sources:ingest')).toBe(50);
  });
});
