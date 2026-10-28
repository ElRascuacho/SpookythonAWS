export interface RoadNode {
  id: string;
  lat: number;
  lng: number;
}

export interface RoadEdge {
  from: string;
  to: string;
  distanceMeters: number;
}

export interface RoadGraph {
  nodes: readonly RoadNode[];
  edges: readonly RoadEdge[];
}

export interface RoadRoute {
  path: string[];
  distanceMeters: number;
}

type AdjacentEdge = { to: string; distanceMeters: number };

class MinHeap {
  private ids: string[] = [];
  private costs: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: string, cost: number): void {
    this.ids.push(id);
    this.costs.push(cost);
    let index = this.ids.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.isBefore(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): { id: string; cost: number } | null {
    if (this.ids.length === 0) return null;
    const top = { id: this.ids[0], cost: this.costs[0] };
    const lastId = this.ids.pop()!;
    const lastCost = this.costs.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.costs[0] = lastCost;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.ids.length && this.isBefore(left, smallest)) smallest = left;
        if (right < this.ids.length && this.isBefore(right, smallest)) smallest = right;
        if (smallest === index) break;
        this.swap(index, smallest);
        index = smallest;
      }
    }
    return top;
  }

  private isBefore(a: number, b: number): boolean {
    if (this.costs[a] !== this.costs[b]) return this.costs[a] < this.costs[b];
    return this.ids[a] < this.ids[b];
  }

  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}

function buildAdjacency(graph: RoadGraph): Map<string, AdjacentEdge[]> {
  const adjacency = new Map<string, AdjacentEdge[]>();

  for (const node of graph.nodes) {
    if (adjacency.has(node.id)) {
      throw new Error(`Duplicate road node id: ${node.id}`);
    }
    if (!Number.isFinite(node.lat) || !Number.isFinite(node.lng)) {
      throw new Error(`Road node ${node.id} requires finite lat/lng coordinates`);
    }
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!Number.isFinite(edge.distanceMeters) || edge.distanceMeters < 0) {
      throw new RangeError(
        `Road edge ${edge.from}->${edge.to} requires a finite non-negative distance in meters`,
      );
    }
    const outgoing = adjacency.get(edge.from);
    if (!outgoing || !adjacency.has(edge.to)) {
      throw new Error(`Road edge ${edge.from}->${edge.to} references an unknown node`);
    }
    outgoing.push({ to: edge.to, distanceMeters: edge.distanceMeters });
  }

  return adjacency;
}

/**
 * Returns the cheapest directed route between two node ids using Dijkstra.
 * Unknown ids and unreachable destinations yield null; a node routed to itself
 * yields a zero-distance path. Edge distances must be finite and non-negative.
 */
export function shortestRoadRoute(graph: RoadGraph, from: string, to: string): RoadRoute | null {
  const adjacency = buildAdjacency(graph);
  if (!adjacency.has(from) || !adjacency.has(to)) return null;
  if (from === to) return { path: [from], distanceMeters: 0 };

  const distances = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const settled = new Set<string>();
  const queue = new MinHeap();
  queue.push(from, 0);

  while (queue.size > 0) {
    const current = queue.pop()!;
    if (settled.has(current.id)) continue;
    settled.add(current.id);
    if (current.id === to) break;

    const base = distances.get(current.id)!;
    for (const edge of adjacency.get(current.id) ?? []) {
      if (settled.has(edge.to)) continue;
      const candidate = base + edge.distanceMeters;
      const known = distances.get(edge.to);
      if (known === undefined || candidate < known) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, current.id);
        queue.push(edge.to, candidate);
      }
    }
  }

  if (!settled.has(to)) return null;

  const path: string[] = [to];
  let cursor = to;
  while (cursor !== from) {
    const parent = previous.get(cursor);
    if (parent === undefined) return null;
    path.push(parent);
    cursor = parent;
  }
  path.reverse();

  return { path, distanceMeters: distances.get(to)! };
}
