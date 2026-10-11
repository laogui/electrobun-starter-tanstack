import type { Node, XYPosition } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isPinnedSticky } from '@/lib/canvasNodePredicates';
import { prefersReducedMotion } from '@/lib/motion';

/** Critically damped spring: fast response, no overshoot. */
const STIFFNESS = 420;
const DAMPING = 2 * Math.sqrt(STIFFNESS);
const REST_DISTANCE = 0.1;
const REST_SPEED = 0.5;
/** Clamp long frames (tab switch, GC pause) so the integrator stays stable. */
const MAX_STEP_S = 1 / 30;

interface SpringState {
  vx: number;
  vy: number;
  x: number;
  y: number;
}

function stepSprings(
  springs: Map<string, SpringState>,
  targets: Map<string, XYPosition>,
  dt: number
): void {
  for (const [id, spring] of springs) {
    const target = targets.get(id);
    if (!target) {
      springs.delete(id);
      continue;
    }
    spring.vx +=
      (-STIFFNESS * (spring.x - target.x) - DAMPING * spring.vx) * dt;
    spring.vy +=
      (-STIFFNESS * (spring.y - target.y) - DAMPING * spring.vy) * dt;
    spring.x += spring.vx * dt;
    spring.y += spring.vy * dt;
    if (
      Math.abs(spring.x - target.x) < REST_DISTANCE &&
      Math.abs(spring.y - target.y) < REST_DISTANCE &&
      Math.abs(spring.vx) < REST_SPEED &&
      Math.abs(spring.vy) < REST_SPEED
    ) {
      springs.delete(id);
    }
  }
}

/**
 * Render-only spring for nodes displaced by drag repulsion. Store positions
 * stay the solved targets; only the nodes handed to React Flow are replaced
 * by their spring positions, so edges follow the animated cards. Unlike a CSS
 * transition, retargeting keeps the current velocity, so a target that moves
 * every pointer frame is followed smoothly instead of restarting the curve.
 *
 * - `active`: while true, top-level nodes whose position changes start a
 *   spring from their last rendered position. Running springs finish even
 *   after it turns false.
 * - `pinnedIds`: nodes under the pointer; they always render at their store
 *   position.
 */
export function useRepelSpring(
  nodes: Node[],
  active: boolean,
  pinnedIds: readonly string[]
): Node[] {
  const springsRef = useRef(new Map<string, SpringState>());
  const lastSeenRef = useRef(new Map<string, XYPosition>());
  const targetsRef = useRef(new Map<string, XYPosition>());
  const rafRef = useRef<number | null>(null);
  // Bumped after each animation step so the render re-reads spring state.
  const [, setFrame] = useState(0);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const displayNodes = (() => {
    const springs = springsRef.current;
    const lastSeen = lastSeenRef.current;
    if (reducedMotion || !(active || springs.size > 0)) {
      lastSeen.clear();
      springs.clear();
      return nodes;
    }

    const pinned = new Set(pinnedIds);
    const targets = new Map<string, XYPosition>();
    for (const node of nodes) {
      if (node.parentId || pinned.has(node.id) || isPinnedSticky(node)) {
        springs.delete(node.id);
        lastSeen.set(node.id, node.position);
        continue;
      }
      const prev = lastSeen.get(node.id);
      if (
        active &&
        prev &&
        !springs.has(node.id) &&
        (prev.x !== node.position.x || prev.y !== node.position.y)
      ) {
        springs.set(node.id, { x: prev.x, y: prev.y, vx: 0, vy: 0 });
      }
      lastSeen.set(node.id, node.position);
      targets.set(node.id, node.position);
    }
    for (const id of springs.keys()) {
      if (!targets.has(id)) {
        springs.delete(id);
      }
    }
    targetsRef.current = targets;

    if (springs.size === 0) {
      return nodes;
    }
    return nodes.map((node) => {
      const spring = springs.get(node.id);
      return spring
        ? { ...node, position: { x: spring.x, y: spring.y } }
        : node;
    });
  })();

  useEffect(() => {
    if (rafRef.current !== null || springsRef.current.size === 0) {
      return;
    }
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(Math.max(now - lastTime, 0) / 1000, MAX_STEP_S);
      lastTime = now;
      stepSprings(springsRef.current, targetsRef.current, dt);
      rafRef.current =
        springsRef.current.size > 0 ? requestAnimationFrame(tick) : null;
      setFrame((f) => f + 1);
    };
    rafRef.current = requestAnimationFrame(tick);
  });

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    []
  );

  return displayNodes;
}
