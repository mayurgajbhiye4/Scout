import { useState } from 'react';
import { cn } from '@/lib/utils';
import amberForest from '@/assets/backgrounds/amber-forest.webp';
import duskButte from '@/assets/backgrounds/dusk-butte.webp';
import orangeRidges from '@/assets/backgrounds/orange-ridges.webp';

/** The backdrop behind each part of the visitor page. `meadow` is the app's own photo on `body`, so it adds no layer. */
export type SceneId = 'meadow' | 'forest' | 'butte' | 'ridges';

const ORDER: SceneId[] = ['meadow', 'forest', 'butte', 'ridges'];

const SCENES: Array<{ id: Exclude<SceneId, 'meadow'>; src: string; position: string }> = [
  { id: 'forest', src: amberForest, position: 'center 45%' },
  { id: 'butte', src: duskButte, position: 'center 60%' },
  { id: 'ridges', src: orangeRidges, position: 'center 70%' },
];

/**
 * Fixed landscapes behind the visitor page's scroll area, one per part of the page, crossfading as the reader
 * scrolls. Each is dimmed by its own scrim (styles/global.css, `.mk-scene`) so outlined figures and text read on
 * it. A photo only loads once the reader is one scene away from it.
 */
export default function SceneBackdrop({ scene }: { scene: SceneId }) {
  const index = ORDER.indexOf(scene);
  const [reached, setReached] = useState(index);
  if (index > reached) setReached(index);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {SCENES.map(({ id, src, position }) => {
        const near = reached >= ORDER.indexOf(id) - 1;
        return (
          <div
            key={id}
            className={cn('mk-scene', `mk-scene--${id}`, scene === id && 'is-on')}
            style={near ? { backgroundImage: `url(${src})`, backgroundPosition: position } : undefined}
          />
        );
      })}
    </div>
  );
}
