/**
 * Force-directed layout, hand-rolled.
 *
 * A graph library would be 100–500 kB to lay out a few hundred nodes. This is
 * the standard three forces — repulsion, spring, centring — on a fixed
 * timestep, which is all a personal knowledge base needs and which keeps the
 * whole app installable over a slow connection.
 *
 * Deterministic on purpose: node positions are seeded from a hash of the id,
 * so reopening the graph shows the same picture rather than a new random one
 * each time. Recognising the shape of your own graph matters more here than
 * squeezing out a marginally better layout.
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Repulsion scales with degree so hubs claim more room. */
  weight: number;
  pinned: boolean;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutOptions {
  repulsion?: number;
  springLength?: number;
  springStrength?: number;
  centring?: number;
  damping?: number;
}

const DEFAULTS = {
  repulsion: 5200,
  springLength: 74,
  springStrength: 0.055,
  centring: 0.012,
  damping: 0.86,
} as const;

/** Stable pseudo-random in [0,1) derived from a string. */
function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function createNodes(
  ids: readonly string[],
  degrees: ReadonlyMap<string, number>,
): Map<string, LayoutNode> {
  const nodes = new Map<string, LayoutNode>();
  // Seed on a circle rather than uniformly in a box: it unfolds faster and
  // avoids the initial "everything explodes outward" frame.
  const radius = 40 + ids.length * 2.2;

  ids.forEach((id, i) => {
    const angle = (i / Math.max(ids.length, 1)) * Math.PI * 2 + hash01(id, 7) * 0.6;
    const jitter = 0.75 + hash01(id, 13) * 0.5;
    nodes.set(id, {
      id,
      x: Math.cos(angle) * radius * jitter,
      y: Math.sin(angle) * radius * jitter,
      vx: 0,
      vy: 0,
      weight: 1 + Math.min(degrees.get(id) ?? 0, 12) * 0.28,
      pinned: false,
    });
  });

  return nodes;
}

/** Advance the simulation one step, in place. Returns total kinetic energy. */
export function step(
  nodes: Map<string, LayoutNode>,
  edges: readonly LayoutEdge[],
  options: LayoutOptions = {},
): number {
  const { repulsion, springLength, springStrength, centring, damping } = {
    ...DEFAULTS,
    ...options,
  };
  const list = [...nodes.values()];

  // Repulsion — every pair. Fine to O(n²) at this scale; a Barnes-Hut tree
  // would only start paying for itself in the thousands of nodes.
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i] as LayoutNode;
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j] as LayoutNode;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        // Exactly coincident nodes have no direction to separate along;
        // nudge them deterministically rather than dividing by zero.
        dx = (hash01(a.id, 3) - 0.5) * 0.1;
        dy = (hash01(a.id, 5) - 0.5) * 0.1;
        d2 = dx * dx + dy * dy || 0.01;
      }
      const d = Math.sqrt(d2);
      const force = (repulsion * a.weight * b.weight) / d2;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Springs along edges.
  for (const edge of edges) {
    const a = nodes.get(edge.from);
    const b = nodes.get(edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const force = (d - springLength) * springStrength;
    const fx = (dx / d) * force;
    const fy = (dy / d) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Centring, so disconnected components don't drift off screen.
  let energy = 0;
  for (const node of list) {
    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx -= node.x * centring;
    node.vy -= node.y * centring;
    node.vx *= damping;
    node.vy *= damping;
    // Clamp: a single huge step turns the layout into confetti.
    node.vx = Math.max(-60, Math.min(60, node.vx));
    node.vy = Math.max(-60, Math.min(60, node.vy));
    node.x += node.vx;
    node.y += node.vy;
    energy += node.vx * node.vx + node.vy * node.vy;
  }

  return energy;
}

/** Run enough steps for a readable starting picture. */
export function settle(
  nodes: Map<string, LayoutNode>,
  edges: readonly LayoutEdge[],
  iterations = 260,
): void {
  for (let i = 0; i < iterations; i += 1) {
    if (step(nodes, edges) < 0.02) break;
  }
}

/** Bounding box of the laid-out nodes, for fit-to-view. */
export function bounds(nodes: Map<string, LayoutNode>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes.values()) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}
