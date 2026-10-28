/** A visual-only wave over the undirected map network; it never changes the
 * simulation's edge directions or weights. Times are measured in seconds. */
const EDGE_START = 0.12;
const EDGE_DURATION = 0.7;
const NODE_START_DELAY = 0.08;
const NODE_STAGGER = 0.065;
const NODE_DURATION = 0.7;

interface NetworkEdge {
  source: string;
  target: string;
}

export interface NetworkIntroPlan {
  edges: Array<{ reverse: boolean; start: number }>;
  edgesEnd: number;
}

export function createNetworkIntroPlan(edges: readonly NetworkEdge[], origin: string): NetworkIntroPlan {
  const neighbors = new Map<string, string[]>();
  for (const { source, target } of edges) {
    neighbors.set(source, [...(neighbors.get(source) ?? []), target]);
    neighbors.set(target, [...(neighbors.get(target) ?? []), source]);
  }

  const depth = new Map<string, number>([[origin, 0]]);
  const queue = [origin];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    for (const neighbor of neighbors.get(node) ?? []) {
      if (!depth.has(neighbor)) {
        depth.set(neighbor, depth.get(node)! + 1);
        queue.push(neighbor);
      }
    }
  }

  // Disconnected components still appear after the connected wave rather than
  // being lost; the current Manta graph is fully connected to Tarqui.
  const fallbackDepth = Math.max(0, ...depth.values()) + 1;
  const plannedEdges = edges.map(({ source, target }) => {
    const sourceDepth = depth.get(source) ?? fallbackDepth;
    const targetDepth = depth.get(target) ?? fallbackDepth;
    return {
      reverse: sourceDepth > targetDepth,
      start: EDGE_START + Math.min(sourceDepth, targetDepth) * EDGE_DURATION,
    };
  });
  return {
    edges: plannedEdges,
    edgesEnd: plannedEdges.reduce((end, edge) => Math.max(end, edge.start + EDGE_DURATION), 0),
  };
}

function easeOut(time: number): number {
  const t = Math.max(0, Math.min(1, time));
  return 1 - (1 - t) ** 3;
}

export function edgeIntroProgress(index: number, elapsed: number, plan: NetworkIntroPlan): number {
  const t = Math.max(0, Math.min(1, (elapsed - plan.edges[index].start) / EDGE_DURATION));
  // Ease in and out so each connection starts and arrives without a sudden jump.
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function nodeIntroProgress(index: number, elapsed: number, plan: NetworkIntroPlan): number {
  const start = plan.edgesEnd + NODE_START_DELAY;
  return easeOut((elapsed - start - index * NODE_STAGGER) / NODE_DURATION);
}

export function networkIntroDuration(plan: NetworkIntroPlan, nodeCount: number): number {
  return plan.edgesEnd + NODE_START_DELAY + Math.max(0, nodeCount - 1) * NODE_STAGGER + NODE_DURATION;
}
