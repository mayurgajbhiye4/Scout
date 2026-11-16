import { useEffect, useState } from 'react';
import cosmosMeadow from '@/assets/backgrounds/cosmos-meadow.jpg';
import amberForest from '@/assets/backgrounds/amber-forest.webp';
import duskButte from '@/assets/backgrounds/dusk-butte.webp';
import orangeRidges from '@/assets/backgrounds/orange-ridges.webp';
import valleyDusk from '@/assets/backgrounds/valley-dusk.webp';

/**
 * The workspace's landscapes, in the order they come round. The meadow is the app's own photo on `body`
 * (styles/global.css), so the rotation starts where every other page already is.
 */
export const SCENES = [
  { id: 'meadow', src: cosmosMeadow, position: 'center' },
  { id: 'forest', src: amberForest, position: 'center 45%' },
  { id: 'butte', src: duskButte, position: 'center 60%' },
  { id: 'ridges', src: orangeRidges, position: 'center 70%' },
  { id: 'valley', src: valleyDusk, position: 'center 65%' },
] as const;

const SCENE_KEY = 'scout_ws_scene';

function readScene(): number {
  try {
    const saved = Number(localStorage.getItem(SCENE_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < SCENES.length ? saved : 0;
  } catch {
    return 0;
  }
}

/** The keys of the sources being read right now and whether an answer is on its way: what moves the scene on. */
export interface WorkspaceActivity {
  ingestingKeys: string[];
  answering: boolean;
}

/** How long each landscape holds while the workspace is busy, fade included. */
export const SCENE_CYCLE_MS = 10000;

const advance = (s: { index: number }) => ({ index: (s.index + 1) % SCENES.length, previous: s.index });

/**
 * Which landscape the workspace shows, and the one it is fading from. While something runs (a source being read, an
 * answer being written) the landscapes keep coming round, one every SCENE_CYCLE_MS, starting the moment it begins;
 * when it's done the workspace stays on whichever one it reached. With reduced motion it moves on once per start
 * instead. Remembered, so a reload keeps the last one.
 */
export function useSceneRotation({ ingestingKeys, answering }: WorkspaceActivity) {
  const active = ingestingKeys.length > 0 || answering;
  const [state, setState] = useState(() => ({
    index: readScene(),
    previous: null as number | null,
    active,
  }));

  // Going from idle to busy moves on straight away. Set from what this render saw, so a repeat render agrees.
  if (state.active !== active) {
    setState(active ? { ...advance(state), active } : { ...state, active });
  }

  useEffect(() => {
    if (!active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setState((s) => ({ ...s, ...advance(s) })), SCENE_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    try {
      localStorage.setItem(SCENE_KEY, String(state.index));
    } catch {
      // storage unavailable (private mode); the workspace just starts on the meadow next time
    }
  }, [state.index]);

  return { index: state.index, previous: state.previous };
}
