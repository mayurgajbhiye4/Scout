import * as THREE from 'three';
import type { NodeShape } from './graphView';

/**
 * Each entity type as a small low-poly figure of what it is: a person, a building, a chip, a book. Every figure fits
 * inside a sphere of radius r, so arrows still end at its surface and no type looks bigger than another. Its meshes
 * share one material, so focus styling stays one change per node.
 */

export interface Figure {
  root: THREE.Group;
  /** The figure's body; focus lights it through its emissive */
  primary: THREE.MeshLambertMaterial;
  /** Fades the whole figure, e.g. out of focus */
  setOpacity: (opacity: number) => void;
  /** Idle motion. t in seconds, already offset per node; energy 0 at rest, 1 while the node is lit. */
  animate?: (t: number, energy: number) => void;
}

// Many nodes share a radius, so geometries are shared too; they're small and never disposed
const geometryCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geometryCache.get(key);
  if (!g) {
    g = make();
    geometryCache.set(key, g);
  }
  return g;
}

/** A stable phase in [0, 2π) per node, so neighbours don't move in step. */
export function phaseFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 6283) / 1000;
}

export function buildFigure(shape: NodeShape, r: number, color: string): Figure {
  const primary = new THREE.MeshLambertMaterial({ color, transparent: true });
  const root = new THREE.Group();
  const fades = (...materials: THREE.Material[]) => (opacity: number) => materials.forEach((m) => (m.opacity = opacity));
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material = primary) => {
    const m = new THREE.Mesh(geometry, material);
    root.add(m);
    return m;
  };

  switch (shape) {
    case 'person': {
      // Head over rounded shoulders; breathes
      const head = mesh(cached(`head:${r}`, () => new THREE.SphereGeometry(r * 0.38, 16, 12)));
      head.position.y = r * 0.42;
      const torso = mesh(
        cached(`torso:${r}`, () => new THREE.SphereGeometry(r * 0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2))
      );
      torso.scale.set(1, 1.05, 0.8);
      torso.position.y = -r * 0.62;
      return {
        root,
        primary,
        setOpacity: fades(primary),
        animate: (t, energy) => {
          const amp = r * (0.03 + 0.07 * energy);
          head.position.y = r * 0.42 + Math.sin(t * 1.6) * amp;
          torso.scale.y = 1.05 + Math.sin(t * 1.6 - 0.6) * (0.02 + 0.04 * energy);
        },
      };
    }

    case 'building': {
      // A stepped tower with rows of windows that light in turn
      const tower = mesh(cached(`tower:${r}`, () => new THREE.BoxGeometry(r * 0.75, r * 1.5, r * 0.75)));
      tower.position.set(r * 0.12, 0, 0);
      const wing = mesh(cached(`wing:${r}`, () => new THREE.BoxGeometry(r * 0.5, r * 0.85, r * 0.6)));
      wing.position.set(-r * 0.5, -r * 0.32, 0);
      const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6), transparent: true });
      const pane = cached(`pane:${r}`, () => new THREE.PlaneGeometry(r * 0.16, r * 0.16));
      const windows: Array<{ material: THREE.MeshBasicMaterial; offset: number; glow: number }> = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) {
          // Each pane has its own material, so it can twinkle on its own
          const material = lit.clone();
          const w = mesh(pane, material);
          w.position.set(r * (0.12 + (col - 0.5) * 0.32), r * (0.48 - row * 0.32), r * 0.376);
          windows.push({ material, offset: row * 2 + col, glow: 1 });
        }
      }
      // A window's opacity is the figure's times its own glow
      let base = 1;
      const paint = () => windows.forEach((w) => (w.material.opacity = base * w.glow));
      return {
        root,
        primary,
        setOpacity: (opacity) => {
          primary.opacity = base = opacity;
          paint();
        },
        animate: (t, energy) => {
          for (const w of windows) w.glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.9 + energy * 1.6) + w.offset * 1.7));
          paint();
        },
      };
    }

    case 'chip': {
      // A flat chip with pins down two sides; turns slowly
      const pivot = new THREE.Group();
      root.add(pivot);
      const body = new THREE.Mesh(cached(`chip:${r}`, () => new THREE.BoxGeometry(r * 1.2, r * 0.28, r * 1.2)), primary);
      pivot.add(body);
      const pin = cached(`pin:${r}`, () => new THREE.BoxGeometry(r * 0.22, r * 0.08, r * 0.12));
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Mesh(pin, primary);
          p.position.set(side * r * 0.7, -r * 0.06, r * (-0.42 + i * 0.28));
          pivot.add(p);
        }
      }
      pivot.rotation.x = 0.45;
      return {
        root,
        primary,
        setOpacity: fades(primary),
        animate: (t, energy) => {
          pivot.rotation.y = t * (0.25 + 0.9 * energy);
        },
      };
    }

    case 'book': {
      // An open book; its middle page lifts and settles
      const cover = cached(`cover:${r}`, () => new THREE.BoxGeometry(r * 0.78, r * 0.06, r * 1.1).translate(r * 0.39, 0, 0));
      const left = mesh(cover);
      left.rotation.z = Math.PI - 0.32;
      const right = mesh(cover);
      right.rotation.z = 0.32;
      const pageMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5), transparent: true });
      const page = mesh(cached(`page:${r}`, () => new THREE.BoxGeometry(r * 0.72, r * 0.02, r * 1).translate(r * 0.36, 0, 0)), pageMaterial);
      const tilt = new THREE.Group();
      tilt.rotation.x = 0.5;
      tilt.add(left, right, page);
      root.add(tilt);
      return {
        root,
        primary,
        setOpacity: fades(primary, pageMaterial),
        animate: (t, energy) => {
          const lift = 0.5 + 0.5 * Math.sin(t * (0.8 + energy));
          page.rotation.z = 0.32 + lift * (0.35 + 1.6 * energy);
        },
      };
    }

    case 'square':
      mesh(cached(`box:${r}`, () => new THREE.BoxGeometry(r * 1.55, r * 1.55, r * 1.55)));
      return { root, primary, setOpacity: fades(primary) };

    default:
      mesh(cached(`sphere:${r}`, () => new THREE.SphereGeometry(r, 24, 16)));
      return { root, primary, setOpacity: fades(primary) };
  }
}
