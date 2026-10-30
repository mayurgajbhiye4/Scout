import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** The wrapper stays put and its `.mk-in-*` children rise in by their own `--d` delays instead. */
  stagger?: boolean;
  /** Once revealed, adds `is-live` after this many ms so looping stories start; `is-paused` while off screen. */
  storyDelay?: number;
}

/** Rises 32px and fades in the first time it enters the viewport; never replays. */
export default function Reveal({ children, className, stagger, storyDelay }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [onScreen, setOnScreen] = useState(false);
  const [live, setLive] = useState(false);
  const hasStory = storyDelay !== undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el || (visible && !hasStory)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.some((entry) => entry.isIntersecting);
        setOnScreen(intersecting);
        if (intersecting) setVisible(true);
        if (intersecting && !hasStory) observer.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, hasStory]);

  useEffect(() => {
    if (!visible || !hasStory || live) return;
    const timer = setTimeout(() => setLive(true), storyDelay);
    return () => clearTimeout(timer);
  }, [visible, hasStory, live, storyDelay]);

  return (
    <div
      ref={ref}
      className={cn(
        stagger ? 'mk-motion' : 'mk-reveal',
        visible && (stagger ? 'is-in' : 'is-visible'),
        live && 'is-live',
        live && !onScreen && 'is-paused',
        className
      )}
    >
      {children}
    </div>
  );
}
