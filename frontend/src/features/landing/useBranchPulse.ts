import { useEffect, useRef } from 'react';

const START_DELAY = 2400; // let the home intro land first
const TRAVEL = 1800; // root node to last question
const CYCLE = 4000; // travel plus rest
const LIT = 900; // how long a node glows after the pulse passes it
const TRAIL = 40;

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * Story for the home question branch: a pulse leaves the root node, runs down the spine and lights each
 * question's node as it passes, then the branch rests. Starts and ends on the static design, and pauses
 * while off screen, while the tab is hidden, while `paused` is set and under reduced motion.
 */
export function useBranchPulse(section: HTMLElement | null, paused: boolean) {
  // Loop time survives pauses so the intro delay only applies once per mount.
  const loopTime = useRef(-START_DELAY);

  useEffect(() => {
    if (!section || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const pulse = section.querySelector<HTMLElement>('.home-branch-pulse');
    const trail = section.querySelector<HTMLElement>('.home-branch-trail');
    if (!pulse || !trail) return;

    if (loopTime.current > 0) loopTime.current = 0; // resume on a fresh run
    let nodes: HTMLElement[] = [];
    let ys: number[] = [];
    let passedAt: (number | undefined)[] = [];
    let prevPhase = Infinity;
    let raf = 0;
    let last = 0;
    let onScreen = false;

    const measure = () => {
      nodes = Array.from(section.querySelectorAll<HTMLElement>('.home-branch-node'));
      const top = section.getBoundingClientRect().top;
      ys = nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return r.top + r.height / 2 - top;
      });
      passedAt = nodes.map(() => undefined);
    };

    const rest = () => {
      pulse.style.opacity = '0';
      trail.style.opacity = '0';
      for (const n of nodes) n.style.removeProperty('--lit');
    };

    const frame = (now: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return;
      loopTime.current += Math.min(now - (last || now), 50);
      last = now;
      raf = requestAnimationFrame(frame);
      if (loopTime.current < 0) return;

      const phase = loopTime.current % CYCLE;
      if (phase < prevPhase) measure();
      prevPhase = phase;
      if (ys.length < 2) return rest();

      const y0 = ys[0]!;
      const y = y0 + (ys[ys.length - 1]! - y0) * easeInOut(Math.min(1, phase / TRAVEL));
      const opacity = phase < TRAVEL ? Math.min(1, phase / 200) : Math.max(0, 1 - (phase - TRAVEL) / 250);
      pulse.style.opacity = trail.style.opacity = opacity.toFixed(3);
      pulse.style.transform = `translateY(${(y - 3.5).toFixed(2)}px)`;
      trail.style.transform = `translateY(${(y - TRAIL).toFixed(2)}px)`;

      nodes.forEach((node, i) => {
        if (passedAt[i] === undefined && y >= ys[i]! - 0.5) passedAt[i] = phase;
        const at = passedAt[i];
        const k = at === undefined ? 1 : (phase - at) / LIT;
        const lit = k >= 1 ? 0 : k < 0.15 ? k / 0.15 : 1 - easeInOut((k - 0.15) / 0.85);
        node.style.setProperty('--lit', lit.toFixed(3));
      });
    };

    const resume = () => {
      if (raf || !onScreen || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      resume();
    });
    observer.observe(section);
    document.addEventListener('visibilitychange', resume);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      rest();
      prevPhase = Infinity;
    };
  }, [section, paused]);
}
