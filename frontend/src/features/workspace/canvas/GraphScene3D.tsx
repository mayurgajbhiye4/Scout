import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import type { WorkspaceNode } from '../useWorkspaceData';
import { buildFigure, phaseFor, type Figure } from './figures';
import { endpointId, pickLabelled, prettyRelation, truncate, withAlpha, wrapText, type NodeMark, type ViewLink } from './graphView';

/**
 * The knowledge map in 3D (three.js through react-force-graph-3d). Nodes are small animated figures of their entity
 * type (a person, a building, a chip, a book). Only the most connected keep their name at any zoom; the rest are named
 * as the camera nears them or they come into focus, and only the focused one shows its description. Links are arrows,
 * labelled with their relation while in focus. Loaded lazily by GraphCanvas, so three.js stays out of the main bundle.
 */

export type SceneNode = WorkspaceNode & { r: number };
type FGNode = NodeObject<SceneNode>;
type FGLink = LinkObject<SceneNode, ViewLink>;
type Point = { x: number; y: number; z: number };

export interface ScenePalette {
  ink: string;
  inkSoft: string;
  line: string;
  accent: string;
  /** Behind labels, so they stay readable over links */
  labelBg: string;
}

export interface GraphSceneProps {
  width: number;
  height: number;
  nodes: SceneNode[];
  links: ViewLink[];
  nodeMark: (n: SceneNode) => NodeMark;
  linkColor: (l: ViewLink) => string;
  palette: ScenePalette;
  highlight: Set<string> | null;
  focusRoot: string | null;
  selectionId: string | null;
  /** How many nodes keep their name at any zoom */
  labelBudget: number;
  reducedMotion: boolean;
  onNodeHover: (node: SceneNode | null) => void;
  onNodeClick: (node: SceneNode) => void;
  onBackgroundClick: () => void;
}

export interface GraphSceneHandle {
  zoomBy: (factor: number) => void;
  fit: () => void;
  /** Throws the layout away and lays the graph out again from scratch. */
  relayout: () => void;
}

const FONT = "'Geist Variable', ui-sans-serif, system-ui, sans-serif";
// nodeVal is chosen so the library's sphere of radius cbrt(val) * REL_SIZE matches each node's r: arrows then end
// on the node's surface instead of its centre.
const REL_SIZE = 4;
// Up to this many links, relation names always show; past it, only on the focused ones
const MAX_ALWAYS_LABELLED = 12;
// Nodes this close to the camera are named whatever the budget; flying to a node (110 back) names its neighbours
const REVEAL_DIST = 170;

// Last settled positions seed the layout, so refetches, chip changes and remounts don't scatter the map.
// Shared by every scene; a relayout clears it.
const sharedPositions = new Map<string, Point>();

/** Keeps figures, and the names under them, from overlapping. d3-force's own collide is 2D only. */
function collide3d(radius: (n: FGNode) => number, strength = 0.35) {
  let nodes: FGNode[] = [];
  const force = () => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const dz = (b.z ?? 0) - (a.z ?? 0);
        const min = radius(a) + radius(b);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * strength * 0.5;
        a.vx = (a.vx ?? 0) - dx * push;
        a.vy = (a.vy ?? 0) - dy * push;
        a.vz = (a.vz ?? 0) - dz * push;
        b.vx = (b.vx ?? 0) + dx * push;
        b.vy = (b.vy ?? 0) + dy * push;
        b.vz = (b.vz ?? 0) + dz * push;
      }
    }
  };
  return Object.assign(force, {
    initialize: (next: FGNode[]) => {
      nodes = next;
    },
  });
}

interface NodeParts {
  figure: Figure;
  phase: number;
  halo: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  label: SpriteText;
  desc: SpriteText | null;
}

function linkKey(l: FGLink) {
  return `${endpointId(l.source)}|${endpointId(l.target)}|${l.relationship}`;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const GraphScene3D = forwardRef<GraphSceneHandle, GraphSceneProps>(function GraphScene3D(
  {
    width,
    height,
    nodes,
    links,
    nodeMark,
    linkColor: baseLinkColor,
    palette,
    highlight,
    focusRoot,
    selectionId,
    labelBudget,
    reducedMotion,
    onNodeHover,
    onNodeClick,
    onBackgroundClick,
  },
  ref
) {
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);

  // Bumping the layout version drops the shared positions and lays the graph out from scratch
  const [layoutVersion, setLayoutVersion] = useState(0);
  const graphData = useMemo(() => {
    // Reading the position cache only seeds the simulation; it never drives what React renders
    const seeded: FGNode[] = nodes.map((n) => ({ ...n, ...sharedPositions.get(n.id) }));
    return { nodes: seeded, links: links.map((l) => ({ ...l })) as FGLink[] };
    // layoutVersion: a relayout needs fresh, unpositioned node objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, layoutVersion]);

  const nodesById = useMemo(() => new Map(graphData.nodes.map((n) => [n.id, n])), [graphData]);
  const labelAllLinks = graphData.links.filter((l) => !l.quiet).length <= MAX_ALWAYS_LABELLED;
  const labelled = useMemo(() => pickLabelled(nodes, labelBudget), [nodes, labelBudget]);

  const linkInFocus = useCallback(
    (l: FGLink) => !highlight || (highlight.has(endpointId(l.source)) && highlight.has(endpointId(l.target))),
    [highlight]
  );

  // ── Focus styling, applied to cached three.js objects so hover never rebuilds the scene ──
  const focusRef = useRef({ highlight, focusRoot, selectionId, labelled, labelAllLinks, linkInFocus, accent: palette.accent });
  // Layout effects run before the graph library applies new props, so objects it builds read the current focus
  useLayoutEffect(() => {
    focusRef.current = { highlight, focusRoot, selectionId, labelled, labelAllLinks, linkInFocus, accent: palette.accent };
  });
  // Nodes near the camera, named whatever the budget
  const nearRef = useRef(new Set<string>());

  const nodePartsRef = useRef(new Map<string, NodeParts>());
  const linkLabelsRef = useRef(new Map<string, { sprite: SpriteText; link: FGLink }>());

  const styleNode = useCallback((id: string, parts: NodeParts) => {
    const { highlight: hl, focusRoot: root, selectionId: sel, labelled: named, accent } = focusRef.current;
    const inFocus = !hl || hl.has(id);
    const lit = id === root || id === sel;
    const { figure } = parts;
    figure.setOpacity(inFocus ? 0.96 : 0.1);
    figure.primary.emissive.set(lit ? accent : '#000000');
    figure.primary.emissiveIntensity = lit ? 0.55 : 0;
    figure.root.scale.setScalar(id === sel ? 1.3 : 1);
    if (parts.halo) parts.halo.material.opacity = inFocus ? 0.08 : 0.02;
    // Named: the budget's nodes, the focused neighbourhood, and whatever the camera is close to
    parts.label.visible = lit || Boolean(hl?.has(id)) || named.has(id) || nearRef.current.has(id);
    parts.label.material.opacity = inFocus ? 1 : 0.18;
    if (parts.desc) parts.desc.visible = lit;
  }, []);

  const styleLinkLabel = useCallback((sprite: SpriteText, link: FGLink) => {
    const { highlight: hl, labelAllLinks: all, linkInFocus: focused } = focusRef.current;
    const inFocus = focused(link);
    // A mention is named only while it's in focus; relations always are, unless there are too many to read
    sprite.visible = all && !link.quiet ? true : Boolean(hl) && inFocus;
    sprite.material.opacity = !hl || inFocus ? 1 : 0.1;
  }, []);

  useEffect(() => {
    nodePartsRef.current.forEach((parts, id) => styleNode(id, parts));
    linkLabelsRef.current.forEach(({ sprite, link }) => styleLinkLabel(sprite, link));
  }, [highlight, focusRoot, selectionId, labelled, labelAllLinks, styleNode, styleLinkLabel]);

  // ── Names reveal as the camera nears them: checked when the camera moves and while the layout runs ──
  const graphDataRef = useRef(graphData);
  useLayoutEffect(() => {
    graphDataRef.current = graphData;
  });
  const revealFrame = useRef(0);
  const updateReveal = useCallback(() => {
    revealFrame.current = 0;
    const fg = fgRef.current;
    if (!fg) return;
    const cam = fg.camera().position;
    const prev = nearRef.current;
    const next = new Set<string>();
    for (const n of graphDataRef.current.nodes) {
      if (n.x === undefined || n.y === undefined || n.z === undefined) continue;
      if (Math.hypot(cam.x - n.x, cam.y - n.y, cam.z - n.z) < REVEAL_DIST) next.add(n.id);
    }
    nearRef.current = next;
    for (const id of new Set([...prev, ...next])) {
      if (prev.has(id) === next.has(id)) continue;
      const parts = nodePartsRef.current.get(id);
      if (parts) styleNode(id, parts);
    }
  }, [styleNode]);
  const scheduleReveal = useCallback(() => {
    if (!revealFrame.current) revealFrame.current = requestAnimationFrame(updateReveal);
  }, [updateReveal]);
  useEffect(() => {
    type Dispatcher = { addEventListener?: (type: string, fn: () => void) => void; removeEventListener?: (type: string, fn: () => void) => void };
    const controls = fgRef.current?.controls() as Dispatcher | undefined;
    controls?.addEventListener?.('change', scheduleReveal);
    scheduleReveal();
    return () => {
      controls?.removeEventListener?.('change', scheduleReveal);
      cancelAnimationFrame(revealFrame.current);
      revealFrame.current = 0;
    };
  }, [scheduleReveal]);

  // A new accessor rebuilds every node, so it only changes with the marks or the theme
  const nodeThreeObject = useMemo(() => {
    nodePartsRef.current = new Map();
    return (n: FGNode) => {
      const { shape, color } = nodeMark(n);
      const group = new THREE.Group();

      const figure = buildFigure(shape, n.r, color);
      group.add(figure.root);

      // Concepts more than one source mentions get a faint shell: they bridge clusters
      let halo: NodeParts['halo'] = null;
      if (!n.isSource && n.sourceIds.length > 1) {
        halo = new THREE.Mesh(
          new THREE.IcosahedronGeometry(n.r * 1.9, 1),
          new THREE.MeshBasicMaterial({ color: palette.ink, wireframe: true, transparent: true, depthWrite: false })
        );
        group.add(halo);
      }

      const label = new SpriteText(truncate(n.label, n.isSource ? 34 : 28), n.isSource ? 4.6 : 4, palette.ink);
      label.fontFace = FONT;
      label.fontWeight = n.isSource || n.isUser ? '700' : '600';
      label.strokeWidth = 0.9;
      label.strokeColor = palette.labelBg;
      label.material.depthWrite = false;
      label.material.transparent = true;
      const below = -(n.r * 1.5 + 4.2);
      label.position.set(0, below, 0);
      group.add(label);

      let desc: SpriteText | null = null;
      if (n.description) {
        desc = new SpriteText(wrapText(n.description, 38, 2).join('\n'), 2.6, palette.inkSoft);
        desc.fontFace = FONT;
        desc.backgroundColor = palette.labelBg;
        desc.padding = [2.4, 1.2];
        // Pill ends on one line; on two, as round as the corners allow without touching the text
        desc.borderRadius = 3.2;
        desc.material.depthWrite = false;
        desc.position.set(0, below - 3.6 - desc.scale.y / 2, 0);
        group.add(desc);
      }

      const parts: NodeParts = { figure, phase: phaseFor(n.id), halo, label, desc };
      nodePartsRef.current.set(n.id, parts);
      styleNode(n.id, parts);
      return group;
    };
  }, [nodeMark, palette, styleNode]);

  // ── Idle motion: each figure moves a little, and more while it's the focused or selected node ──
  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const { focusRoot: root, selectionId: sel } = focusRef.current;
      const t = now / 1000;
      nodePartsRef.current.forEach((parts, id) => parts.figure.animate?.(t + parts.phase, id === root || id === sel ? 1 : 0));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  const linkThreeObject = useMemo(() => {
    linkLabelsRef.current = new Map();
    return (l: FGLink) => {
      const sprite = new SpriteText(prettyRelation(l.relationship), 2.8, baseLinkColor(l));
      sprite.fontFace = FONT;
      sprite.fontWeight = '600';
      sprite.backgroundColor = palette.labelBg;
      sprite.padding = [1.6, 0.5];
      // Half the label's height (2.8 text + 2 × 0.5 padding): a full pill
      sprite.borderRadius = 1.9;
      sprite.material.depthWrite = false;
      sprite.material.transparent = true;
      linkLabelsRef.current.set(linkKey(l), { sprite, link: l });
      styleLinkLabel(sprite, l);
      return sprite;
    };
  }, [baseLinkColor, palette, styleLinkLabel]);

  // Labels ride the middle of the link, on the curve when it bends
  const linkPositionUpdate = useCallback((obj: THREE.Object3D, { start, end }: { start: Point; end: Point }, link: object) => {
    const curve = (link as { __curve?: THREE.Curve<THREE.Vector3> | null }).__curve;
    if (curve) obj.position.copy(curve.getPoint(0.5));
    else obj.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  }, []);

  const linkColor = useCallback(
    (l: FGLink) => {
      const base = baseLinkColor(l);
      if (!highlight) return withAlpha(base, l.quiet ? 0.12 : 0.7);
      if (!linkInFocus(l)) return withAlpha(base, 0.05);
      return l.quiet ? withAlpha(base, 0.8) : base;
    },
    [baseLinkColor, highlight, linkInFocus]
  );

  const nodeTooltip = useCallback((n: FGNode) => {
    const type = n.isSource ? 'Source' : n.isUser ? 'You' : n.type;
    return `<div class="ws-tip"><strong>${escapeHtml(n.label)}</strong><span>${escapeHtml(type)}</span>${
      n.description ? `<p>${escapeHtml(n.description)}</p>` : ''
    }</div>`;
  }, []);

  const linkTooltip = useCallback(
    (l: FGLink) => {
      const from = nodesById.get(endpointId(l.source))?.label ?? '';
      const to = nodesById.get(endpointId(l.target))?.label ?? '';
      return `<div class="ws-tip"><strong>${escapeHtml(from)}</strong> <em>${escapeHtml(prettyRelation(l.relationship))}</em> <strong>${escapeHtml(to)}</strong>${
        l.description ? `<p>${escapeHtml(l.description)}</p>` : ''
      }</div>`;
    },
    [nodesById]
  );

  // ── Forces: a source's mentions sit close around it, relations get room for their labels (more around hubs),
  // bigger maps push apart harder, and nothing overlaps ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force('charge');
    charge?.strength?.(-90 - 20 * Math.sqrt(graphData.nodes.length));
    charge?.distanceMax?.(420);
    const degreeOf = (end: unknown) => nodesById.get(endpointId(end))?.degree ?? 0;
    fg.d3Force('link')?.distance?.((l: FGLink) =>
      l.quiet ? 30 : 46 + 4 * Math.min(6, Math.sqrt(Math.max(degreeOf(l.source), degreeOf(l.target))))
    );
    fg.d3Force('collide', collide3d((n) => n.r * 1.6 + 6));
    fg.d3ReheatSimulation();
  }, [graphData, nodesById]);

  // ── Camera ──
  const ms = reducedMotion ? 0 : 700;
  const fit = useCallback(() => fgRef.current?.zoomToFit(ms, 40), [ms]);
  // Fitting a layout that hasn't spread out yet would park the camera inside it
  const fitIfSpread = useCallback(() => {
    const box = fgRef.current?.getGraphBbox();
    if (box && Math.hypot(box.x[1] - box.x[0], box.y[1] - box.y[0], box.z[1] - box.z[0]) > 60) fit();
  }, [fit]);

  // Fit once per data load: roughly as soon as there's a shape to frame (the library's starting camera sits far
  // back), then again once the layout settles
  const fittedRef = useRef(false);
  useEffect(() => {
    fittedRef.current = false;
    const early = setTimeout(fitIfSpread, reducedMotion ? 0 : 450);
    return () => clearTimeout(early);
  }, [graphData, fitIfSpread, reducedMotion]);
  const handleEngineStop = useCallback(() => {
    for (const n of graphData.nodes) {
      if (n.x !== undefined && n.y !== undefined && n.z !== undefined) sharedPositions.set(n.id, { x: n.x, y: n.y, z: n.z });
    }
    if (!fittedRef.current) {
      fittedRef.current = true;
      fit();
    }
  }, [fit, graphData]);

  const flyTo = useCallback(
    (n: FGNode) => {
      const fg = fgRef.current;
      if (!fg || n.x === undefined || n.y === undefined || n.z === undefined) return;
      const target = { x: n.x, y: n.y, z: n.z };
      const dist = Math.hypot(n.x, n.y, n.z);
      const back = 110;
      const position = dist < 1 ? { x: n.x, y: n.y, z: n.z + back } : { x: n.x * (1 + back / dist), y: n.y * (1 + back / dist), z: n.z * (1 + back / dist) };
      fg.cameraPosition(position, target, ms);
      // The camera's tween doesn't always tell the controls; name what's near once it lands
      setTimeout(scheduleReveal, ms + 50);
    },
    [ms, scheduleReveal]
  );

  // Fly to whatever was just selected (from the dock, the chat, the inspector or the map)
  useEffect(() => {
    const n = selectionId ? nodesById.get(selectionId) : undefined;
    if (n) flyTo(n);
  }, [selectionId, nodesById, flyTo]);

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (factor: number) => {
        const fg = fgRef.current;
        if (!fg) return;
        const cam = fg.camera().position;
        const target = (fg.controls() as { target?: THREE.Vector3 }).target ?? new THREE.Vector3();
        const next = cam.clone().sub(target).divideScalar(factor).add(target);
        fg.cameraPosition({ x: next.x, y: next.y, z: next.z }, { x: target.x, y: target.y, z: target.z }, reducedMotion ? 0 : 250);
      },
      fit,
      relayout: () => {
        sharedPositions.clear();
        setLayoutVersion((v) => v + 1);
      },
    }),
    [fit, reducedMotion]
  );

  return (
    <ForceGraph3D<FGNode, FGLink>
      ref={fgRef}
      width={width}
      height={height}
      graphData={graphData}
      backgroundColor="rgba(0,0,0,0)"
      showNavInfo={false}
      controlType="orbit"
      nodeId="id"
      nodeRelSize={REL_SIZE}
      nodeVal={(n) => (n.r / REL_SIZE) ** 3}
      nodeLabel={nodeTooltip}
      nodeThreeObject={nodeThreeObject}
      linkLabel={linkTooltip}
      linkColor={linkColor}
      linkWidth={(l) => (highlight && linkInFocus(l) ? 0.9 : l.quiet ? 0 : 0.35)}
      linkCurvature="curvature"
      linkThreeObjectExtend
      linkThreeObject={linkThreeObject}
      linkPositionUpdate={linkPositionUpdate}
      linkDirectionalArrowLength={(l) => (!l.quiet || (highlight && linkInFocus(l)) ? 3.6 : 0)}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={linkColor}
      linkDirectionalParticles={(l) => (!reducedMotion && highlight && linkInFocus(l) ? 2 : 0)}
      linkDirectionalParticleWidth={1.4}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleColor={() => palette.accent}
      onNodeHover={(n) => onNodeHover(n ?? null)}
      onNodeClick={(n) => onNodeClick(n)}
      onBackgroundClick={onBackgroundClick}
      onEngineTick={scheduleReveal}
      onEngineStop={handleEngineStop}
      warmupTicks={reducedMotion ? 200 : 40}
      cooldownTicks={reducedMotion ? 0 : 200}
      d3VelocityDecay={0.3}
    />
  );
});

export default GraphScene3D;
