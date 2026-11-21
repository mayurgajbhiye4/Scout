import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { SCENES } from './workspaceScenes';

/**
 * The landscape behind the workspace, crossfading to the next on each new turn. Drawn into `body` between its photo
 * and its pixel mesh (`body::before` and `body::after`), so the mesh and every glass panel sit on it as they do on the
 * meadow. The scene coming in fades in over the one going out; only those two and the next one in line load.
 */
export default function WorkspaceBackdrop({ index, previous }: { index: number; previous: number | null }) {
  const next = (index + 1) % SCENES.length;
  // While the workspace is up, the scene is blurred and dimmed and the pixel mesh gives way to a plain scrim, so
  // panels and the text on them read cleanly. The landing page keeps its texture.
  useEffect(() => {
    document.body.classList.add('ws-calm');
    return () => document.body.classList.remove('ws-calm');
  }, []);
  return createPortal(
    <div className="ws-scenes" aria-hidden>
      {SCENES.map(({ id, src, position }, i) => {
        const load = i === index || i === previous || i === next;
        return (
          <div
            key={id}
            className={cn('ws-scene', `ws-scene--${id}`, i === index && 'is-on', i === previous && 'is-under')}
            style={load ? { backgroundImage: `url(${src})`, backgroundPosition: position } : undefined}
          />
        );
      })}
    </div>,
    document.body
  );
}
