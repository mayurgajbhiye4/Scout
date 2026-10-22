/**
 * Central Rate Limit Management & Arcade Event Bus
 * 
 * Provides:
 * - Real-time rate-limit error detection and parsing from Axios & fetch responses
 * - Active countdown timers for UI cooldowns
 * - Retro arcade acoustic cues via soundEffects
 * - React hook and event bus for global modals, toasts, and inline banners
 */

import { useState, useEffect } from 'react';
import { soundEffects } from './soundEffects';

export interface RateLimitAlert {
  id: string;
  scope: string;
  title: string;
  message: string;
  suggestion: string;
  limit: number;
  windowSeconds: number;
  retryAfter: number;
  secondsLeft: number;
  resetTimestamp?: number;
  endpoint?: string;
  category: 'ingestion' | 'chat' | 'knowledge' | 'auth' | 'system';
  timestamp: number;
}

type Listener = (alerts: RateLimitAlert[]) => void;

interface ScopeConfig {
  title: string;
  message: string;
  suggestion: string;
  category: 'ingestion' | 'chat' | 'knowledge' | 'auth' | 'system';
}

const SCOPE_CONFIGS: Record<string, ScopeConfig> = {
  'sources:ingest': {
    title: 'INGESTION COOLDOWN ACTIVE',
    message: 'Source ingestion limit reached (10 sources/min).',
    suggestion: 'Gemini 768-dim vector embeddings and Neo4j entity extraction are cooling down. Ready shortly.',
    category: 'ingestion',
  },
  'sources:read': {
    title: 'SOURCES READ COOLDOWN',
    message: 'Rapid sources querying limit reached (60/min).',
    suggestion: 'Please slow down rapid refresh queries.',
    category: 'ingestion',
  },
  'sources:delete': {
    title: 'SOURCE DELETION COOLDOWN',
    message: 'Rapid source deletion limit reached (20/min).',
    suggestion: 'Please wait before deleting further sources.',
    category: 'ingestion',
  },
  'chat:stream': {
    title: 'AI AGENT REASONING COOLDOWN',
    message: 'Streaming research chat limit reached (15 chats/min).',
    suggestion: 'LangGraph multi-agent reasoning & Gemini quota is cooling down. Ready in seconds.',
    category: 'chat',
  },
  'chat:history': {
    title: 'CHAT HISTORY COOLDOWN',
    message: 'Message log retrieval limit reached (60/min).',
    suggestion: 'Please wait before refreshing message history.',
    category: 'chat',
  },
  'sessions:create': {
    title: 'SESSION CREATION COOLDOWN',
    message: 'Session creation limit reached (20/min).',
    suggestion: 'Please reuse existing research sessions or wait for the cooldown.',
    category: 'chat',
  },
  'sessions:read': {
    title: 'SESSIONS QUERY COOLDOWN',
    message: 'Session listing limit reached (60/min).',
    suggestion: 'Session query cooldown in effect.',
    category: 'chat',
  },
  'sessions:update': {
    title: 'SESSION UPDATE COOLDOWN',
    message: 'Session update limit reached (30/min).',
    suggestion: 'Session title/summary update cooldown active.',
    category: 'chat',
  },
  'sessions:delete': {
    title: 'SESSION DELETION COOLDOWN',
    message: 'Session removal limit reached (20/min).',
    suggestion: 'Please pause before deleting further sessions.',
    category: 'chat',
  },
  'knowledge:curiosity': {
    title: 'CURIOSITY ENGINE COOLDOWN',
    message: 'Curiosity map & proactive prompt generation limit reached (10/min).',
    suggestion: 'Graph traversal and LLM prompt synthesis cooling down.',
    category: 'knowledge',
  },
  'knowledge:interact': {
    title: 'MEMORY INTERACTION COOLDOWN',
    message: 'Graph memory write limit reached (30/min).',
    suggestion: 'Please pause rapid interaction recording.',
    category: 'knowledge',
  },
  'knowledge:graphs': {
    title: 'GRAPH BROWSER COOLDOWN',
    message: 'Knowledge graph aggregation retrieval limit reached (30/min).',
    suggestion: 'Subgraphs query cooldown active.',
    category: 'knowledge',
  },
  'auth:login': {
    title: 'SECURITY LOGIN COOLDOWN',
    message: 'Too many authentication attempts (5/min max).',
    suggestion: 'Account brute-force protection active. Please wait before retrying your credentials.',
    category: 'auth',
  },
  'auth:register': {
    title: 'REGISTRATION COOLDOWN',
    message: 'Too many account registrations (3/min max).',
    suggestion: 'Anti-bot registration protection active.',
    category: 'auth',
  },
  'auth:me': {
    title: 'AUTH VERIFY COOLDOWN',
    message: 'User identity check limit reached (60/min).',
    suggestion: 'Session token validation cooling down.',
    category: 'auth',
  },
  'auth:logout': {
    title: 'LOGOUT COOLDOWN',
    message: 'Logout limit reached (20/min).',
    suggestion: 'Token revocation cooldown active.',
    category: 'auth',
  },
  'users:update': {
    title: 'PROFILE UPDATE COOLDOWN',
    message: 'User settings modification limit reached (15/min).',
    suggestion: 'Profile update cooldown active.',
    category: 'auth',
  },
  'test:extract': {
    title: 'TEST PIPELINE COOLDOWN',
    message: 'Test graph extraction limit reached (10/min).',
    suggestion: 'Test extraction queue cooling down.',
    category: 'system',
  },
  'test:retrieve': {
    title: 'TEST RETRIEVAL COOLDOWN',
    message: 'Test retrieval benchmark limit reached (20/min).',
    suggestion: 'Test query cooling down.',
    category: 'system',
  },
  'test:memory': {
    title: 'TEST MEMORY COOLDOWN',
    message: 'Test memory store limit reached (30/min).',
    suggestion: 'Memory test cooldown active.',
    category: 'system',
  },
  'test:curiosity': {
    title: 'TEST CURIOSITY COOLDOWN',
    message: 'Test curiosity trigger limit reached (10/min).',
    suggestion: 'Curiosity test cooldown active.',
    category: 'system',
  },
  'health:live': {
    title: 'HEALTH CHECK COOLDOWN',
    message: 'Liveness probe query limit reached (120/min).',
    suggestion: 'Health monitor rate limit guard engaged.',
    category: 'system',
  },
  'health:ready': {
    title: 'READINESS CHECK COOLDOWN',
    message: 'Readiness probe query limit reached (60/min).',
    suggestion: 'Health monitor rate limit guard engaged.',
    category: 'system',
  },
  'pipeline:llm': {
    title: 'AI PIPELINE COOLDOWN',
    message: 'Backend AI reasoning pipeline limit reached (30 calls/min).',
    suggestion: 'Direct Gemini API rate limit guard engaged.',
    category: 'system',
  },
  'pipeline:embedding': {
    title: 'EMBEDDING PIPELINE COOLDOWN',
    message: 'Vector embedding generator limit reached (60 calls/min).',
    suggestion: 'Embedding queue cooling down.',
    category: 'system',
  },
  'pipeline:graph_db': {
    title: 'GRAPH DATABASE COOLDOWN',
    message: 'Neo4j knowledge graph query limit reached (60/min).',
    suggestion: 'Graph database capacity protection active.',
    category: 'knowledge',
  },
  'pipeline:rag_retrieval': {
    title: 'RAG RETRIEVAL COOLDOWN',
    message: 'Hybrid semantic search capacity reached (30/min).',
    suggestion: 'Vector distance + cross-encoder reranking cooling down.',
    category: 'system',
  },
};

export function parseRateLimitError(err: any): RateLimitAlert | null {
  if (!err) return null;

  const status = err.response?.status || err.status;
  if (status !== 429) return null;

  const data = err.response?.data || err.data;
  const headers = err.response?.headers || err.headers || {};
  const endpoint = err.config?.url || err.url || '';

  // Extract from backend AppException details
  const details = data?.error?.details || {};
  let scope = details.scope || err.scope;

  // Fallback: match scope from error text or endpoint URL
  if (!scope || scope === 'default') {
    const rawMsg = data?.error?.message || data?.detail || err.message || '';
    const match = typeof rawMsg === 'string' && rawMsg.match(/for\s+([a-zA-Z0-9_:]+)/);
    if (match && match[1]) {
      scope = match[1];
    } else if (endpoint.includes('/chat')) {
      scope = 'chat:stream';
    } else if (endpoint.includes('/sources')) {
      scope = 'sources:ingest';
    } else if (endpoint.includes('/sessions')) {
      scope = 'sessions:create';
    } else if (endpoint.includes('/knowledge')) {
      scope = 'knowledge:curiosity';
    } else if (endpoint.includes('/auth/login')) {
      scope = 'auth:login';
    } else if (endpoint.includes('/auth/register')) {
      scope = 'auth:register';
    } else {
      scope = 'default';
    }
  }

  const limit = details.limit || parseInt(headers['x-ratelimit-limit'] || '15', 10);
  const windowSeconds = details.window_seconds || 60;

  // Retry after calculation
  let retryAfter = details.retry_after;
  if (typeof retryAfter !== 'number') {
    const rawHeader = headers['retry-after'];
    if (rawHeader) {
      retryAfter = parseInt(rawHeader, 10);
    }
  }
  if (!retryAfter || isNaN(retryAfter) || retryAfter <= 0) {
    retryAfter = 30; // sensible default
  }

  const resetTimestamp = details.reset_timestamp || (headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset'], 10) : undefined);
  const cfg = SCOPE_CONFIGS[scope] || {
    title: 'RATE LIMIT COOLDOWN ACTIVE',
    message: data?.error?.message || data?.detail || `Maximum ${limit} requests per ${windowSeconds}s reached for '${scope}'.`,
    suggestion: 'System rate limiter active. Please wait for cooldown to complete.',
    category: 'system' as const,
  };

  return {
    id: `${scope}-${Date.now()}`,
    scope,
    title: cfg.title,
    message: cfg.message,
    suggestion: cfg.suggestion,
    limit,
    windowSeconds,
    retryAfter,
    secondsLeft: retryAfter,
    resetTimestamp,
    endpoint,
    category: cfg.category,
    timestamp: Date.now(),
  };
}

class RateLimitManager {
  private alerts: Map<string, RateLimitAlert> = new Map();
  private listeners: Set<Listener> = new Set();
  private ticker: any = null;

  constructor() {
    this.startTicker();
  }

  private startTicker() {
    if (typeof window === 'undefined') return;
    if (this.ticker) return;

    this.ticker = setInterval(() => {
      if (this.alerts.size === 0) return;

      let changed = false;
      const completedScopes: string[] = [];

      this.alerts.forEach((alert, key) => {
        if (alert.secondsLeft <= 1) {
          completedScopes.push(key);
          changed = true;
        } else {
          alert.secondsLeft -= 1;
          changed = true;
        }
      });

      completedScopes.forEach((key) => {
        this.alerts.delete(key);
      });

      if (completedScopes.length > 0) {
        soundEffects.playCooldownComplete();
      }

      if (changed) {
        this.emit();
      }
    }, 1000);
  }

  public notify(alertOrError: RateLimitAlert | any): RateLimitAlert | null {
    let alert: RateLimitAlert | null = null;
    if (alertOrError && typeof alertOrError.scope === 'string') {
      const scope = alertOrError.scope;
      const cfg = SCOPE_CONFIGS[scope] || {
        title: 'RATE LIMIT COOLDOWN ACTIVE',
        message: alertOrError.message || `Rate limit reached for ${scope}.`,
        suggestion: 'System rate limiter active. Please wait for cooldown to complete.',
        category: 'system' as const,
      };
      const retryAfter = alertOrError.retryAfter || alertOrError.secondsLeft || 30;
      alert = {
        id: alertOrError.id || `${scope}-${Date.now()}`,
        scope,
        title: alertOrError.title || cfg.title,
        message: alertOrError.message || cfg.message,
        suggestion: alertOrError.suggestion || cfg.suggestion,
        limit: alertOrError.limit || 15,
        windowSeconds: alertOrError.windowSeconds || 60,
        retryAfter,
        secondsLeft: alertOrError.secondsLeft || retryAfter,
        resetTimestamp: alertOrError.resetTimestamp,
        endpoint: alertOrError.endpoint,
        category: alertOrError.category || cfg.category,
        timestamp: alertOrError.timestamp || Date.now(),
      };
    } else {
      alert = parseRateLimitError(alertOrError);
    }

    if (!alert) return null;

    // Use scope as unique key so repeated hits update the cooldown rather than stack indefinitely
    this.alerts.set(alert.scope, alert);

    // Trigger retro arcade audio cue
    soundEffects.playRateLimitWarning();

    this.emit();
    return alert;
  }

  public dismiss(scopeOrId: string): void {
    let removed = this.alerts.delete(scopeOrId);
    if (!removed) {
      // Check by ID
      for (const [key, item] of this.alerts.entries()) {
        if (item.id === scopeOrId) {
          this.alerts.delete(key);
          removed = true;
          break;
        }
      }
    }
    if (removed) {
      this.emit();
    }
  }

  public clearAll(): void {
    if (this.alerts.size > 0) {
      this.alerts.clear();
      this.emit();
    }
  }

  public getAlerts(): RateLimitAlert[] {
    return Array.from(this.alerts.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  public isScopeActive(scope: string): boolean {
    const alert = this.alerts.get(scope);
    return Boolean(alert && alert.secondsLeft > 0);
  }

  public getCooldownSeconds(scope: string): number {
    const alert = this.alerts.get(scope);
    return alert ? alert.secondsLeft : 0;
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    const list = this.getAlerts();
    this.listeners.forEach((fn) => fn(list));
  }
}

export const rateLimitManager = new RateLimitManager();

/**
 * React Hook for consuming active rate limits
 */
export function useRateLimit(scope?: string) {
  const [alerts, setAlerts] = useState<RateLimitAlert[]>(() => rateLimitManager.getAlerts());

  useEffect(() => {
    return rateLimitManager.subscribe((newList) => setAlerts([...newList]));
  }, []);

  const currentAlert = scope
    ? alerts.find((a) => a.scope === scope) || null
    : alerts[0] || null;

  const isRateLimited = Boolean(currentAlert && currentAlert.secondsLeft > 0);
  const secondsLeft = currentAlert ? currentAlert.secondsLeft : 0;

  return {
    alerts,
    currentAlert,
    isRateLimited,
    secondsLeft,
    notify: (err: any) => rateLimitManager.notify(err),
    dismiss: (idOrScope: string) => rateLimitManager.dismiss(idOrScope),
    clearAll: () => rateLimitManager.clearAll(),
    isScopeRateLimited: (s: string) => rateLimitManager.isScopeActive(s),
    getScopeSecondsLeft: (s: string) => rateLimitManager.getCooldownSeconds(s),
  };
}
