import { useEffect, useState, type CSSProperties } from 'react';
import { AlertTriangle, BrainCircuit, Clock, Layers, MessageSquare, X } from '@/components/icons';
import { useRateLimit, type RateLimitAlert } from '@/lib/rateLimitManager';
import {
  currentAnchorRect,
  recentInteraction,
  trackInteractions,
  type InteractionAnchor,
} from '@/lib/interactionAnchor';
import { cn } from '@/lib/utils';

const POPUP_WIDTH = 300;
const GUTTER = 12;
const GAP = 8;
// Roughly one popup tall: below this much room above the anchor, the popup opens underneath it instead
const ROOM_ABOVE = 120;

const HEADLINE: Record<RateLimitAlert['category'], string> = {
  ingestion: 'Adding sources is paused',
  chat: 'Copilot needs a breather',
  knowledge: 'Knowledge map is cooling down',
  auth: 'Too many sign-in attempts',
  system: 'Too many requests',
};

const CATEGORY_ICON: Record<RateLimitAlert['category'], typeof Clock> = {
  ingestion: Layers,
  chat: MessageSquare,
  knowledge: BrainCircuit,
  auth: AlertTriangle,
  system: Clock,
};

const formatCountdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

type Placement = { style: CSSProperties; from: 'above' | 'below' };

function placeNear(anchor: InteractionAnchor): Placement {
  const rect = currentAnchorRect(anchor);
  const width = Math.min(POPUP_WIDTH, window.innerWidth - GUTTER * 2);
  const centre = rect.left + rect.width / 2;
  const left = Math.min(Math.max(centre - width / 2, GUTTER), window.innerWidth - width - GUTTER);
  if (rect.top >= ROOM_ABOVE) {
    return { from: 'above', style: { left, width, bottom: window.innerHeight - rect.top + GAP } };
  }
  return { from: 'below', style: { left, width, top: rect.bottom + GAP } };
}

/**
 * A small notice that appears beside the control whose request hit a rate limit (the copilot's send box, an add-source
 * form), counts down the cooldown, and leaves when it ends. Requests nobody started, such as background refetches,
 * show theirs in the bottom right corner. Closing it only hides the notice; the cooldown keeps running for the banners
 * and disabled controls that depend on it.
 */
export default function RateLimitPopup() {
  const { alerts } = useRateLimit();
  const [anchors, setAnchors] = useState<Record<string, InteractionAnchor | null>>({});
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  useEffect(() => trackInteractions(), []);

  // A new alert is anchored once, to whatever the person used just before it arrived
  const unanchored = alerts.filter((a) => !(a.id in anchors));
  if (unanchored.length > 0) {
    const next = { ...anchors };
    unanchored.forEach((a) => {
      next[a.id] = recentInteraction();
    });
    setAnchors(next);
  }

  const visible = alerts.filter((a) => a.secondsLeft > 0 && !hidden.has(a.id));
  if (visible.length === 0) return null;

  const hide = (id: string) => setHidden((prev) => new Set(prev).add(id));
  const anchored = visible.filter((a) => anchors[a.id]);
  const cornered = visible.filter((a) => !anchors[a.id]);

  return (
    <>
      {anchored.map((alert) => {
        const placement = placeNear(anchors[alert.id]!);
        return (
          <Notice
            key={alert.id}
            alert={alert}
            onClose={() => hide(alert.id)}
            style={placement.style}
            className={cn('fixed', placement.from === 'above' ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2')}
          />
        );
      })}
      {cornered.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(300px,calc(100vw-2rem))] flex-col gap-2 sm:bottom-6 sm:right-6">
          {cornered.map((alert) => (
            <Notice key={alert.id} alert={alert} onClose={() => hide(alert.id)} className="slide-in-from-bottom-4" />
          ))}
        </div>
      )}
    </>
  );
}

function Notice({
  alert,
  onClose,
  style,
  className,
}: {
  alert: RateLimitAlert;
  onClose: () => void;
  style?: CSSProperties;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[alert.category];
  const percentLeft = Math.min(100, Math.max(0, (alert.secondsLeft / (alert.retryAfter || 60)) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      style={style}
      className={cn(
        'font-ui pointer-events-auto z-[60] overflow-hidden rounded-[14px] border border-[var(--ws-line)] bg-[var(--ws-dock)] text-[var(--ws-ink)] shadow-[var(--ws-shadow)]',
        'animate-in fade-in-0 duration-300',
        className
      )}
    >
      <div className="flex items-start gap-2.5 py-2.5 pl-3 pr-1.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-[var(--ws-danger)]/10 text-[var(--ws-danger)]">
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug">{HEADLINE[alert.category]}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--ws-ink-soft)]">
            Ready again in <span className="font-semibold tabular-nums text-[var(--ws-ink)]">{formatCountdown(alert.secondsLeft)}</span>
            <span className="text-[var(--ws-ink-faint)]"> · {alert.limit} per {alert.windowSeconds}s</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide this notice"
          className="ui-press grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
      {/* Drains as the cooldown runs out */}
      <div className="h-[2px] bg-[var(--ws-line)]" aria-hidden>
        <div className="h-full bg-[var(--ws-danger)] transition-[width] duration-1000 ease-linear" style={{ width: `${percentLeft}%` }} />
      </div>
    </div>
  );
}
