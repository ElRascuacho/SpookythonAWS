import { MANTA_EDGES, MANTA_NODES, type NeighborLink } from "./mantaGraph";
import type { CityEdge, CityNode } from "./types";

export type GraphDifficulty = "normal" | "hard" | "extreme" | "dificil" | "difícil" | "extremo";

export const DIFFICULTY_PARTS: Record<GraphDifficulty, 1 | 2 | 3> = {
  normal: 1,
  hard: 2,
  dificil: 2,
  difícil: 2,
  extreme: 3,
  extremo: 3,
};

export interface SubdividedNode extends CityNode {
  parentId: string;
  partIndex: number;
  partsCount: number;
}

export interface DifficultyGraph {
  difficulty: GraphDifficulty;
  partsPerNode: 1 | 2 | 3;
  nodes: SubdividedNode[];
  edges: CityEdge[];
  nodeMap: Record<string, SubdividedNode>;
  adjacencyList: Record<string, NeighborLink[]>;
  parentToChildren: Record<string, string[]>;
  totalPopulation: number;
}

export function createDifficultyGraph(
  difficulty: GraphDifficulty = "normal",
  baseNodes: readonly CityNode[] = MANTA_NODES,
  baseEdges: readonly CityEdge[] = MANTA_EDGES,
): DifficultyGraph {
  const partsPerNode = DIFFICULTY_PARTS[difficulty];
  if (!partsPerNode) throw new Error(`Dificultad de grafo inválida: ${String(difficulty)}`);

  const nodes: SubdividedNode[] = [];
  const edges: CityEdge[] = [];
  const parentToChildren: Record<string, string[]> = {};

  for (const node of baseNodes) {
    const basePop = Math.floor(node.population / partsPerNode);
    const remainder = node.population - basePop * partsPerNode;
    const childIds: string[] = [];

    for (let i = 0; i < partsPerNode; i++) {
      const id = partsPerNode === 1 ? node.id : `${node.id}_${i + 1}`;
      const angle = (2 * Math.PI * i) / partsPerNode;
      childIds.push(id);
      nodes.push({
        ...node,
        id,
        name: partsPerNode === 1 ? node.name : `${node.name} · Sector ${i + 1}`,
        lat: partsPerNode === 1 ? node.lat : Number((node.lat + Math.sin(angle) * 0.0018).toFixed(6)),
        lng: partsPerNode === 1 ? node.lng : Number((node.lng + Math.cos(angle) * 0.0018).toFixed(6)),
        population: basePop + (i < remainder ? 1 : 0),
        parentId: node.id,
        partIndex: i,
        partsCount: partsPerNode,
      });
    }
    parentToChildren[node.id] = childIds;

    if (partsPerNode > 1) {
      const internalWeight = Number(Math.min(0.45, 0.25 + node.betweenness * 0.15).toFixed(4));
      for (let a = 0; a < partsPerNode; a++) {
        for (let b = a + 1; b < partsPerNode; b++) {
          edges.push({
            id: `${node.id}_INT_${a + 1}_${b + 1}`,
            source: childIds[a],
            target: childIds[b],
            weight: internalWeight,
            routeLabel: `Corredor interno ${node.name} (${a + 1} ↔ ${b + 1})`,
          });
        }
      }
    }
  }

  for (const edge of baseEdges) {
    if (partsPerNode === 1) {
      edges.push({ ...edge });
      continue;
    }
    const sourceChildren = parentToChildren[edge.source];
    const targetChildren = parentToChildren[edge.target];
    if (!sourceChildren || !targetChildren) continue;
    for (let i = 0; i < partsPerNode; i++) {
      edges.push({
        id: `${edge.id}_${i + 1}`,
        source: sourceChildren[i],
        target: targetChildren[i],
        weight: edge.weight,
        routeLabel: edge.routeLabel,
      });
    }
  }

  const nodeMap: Record<string, SubdividedNode> = {};
  const adjacencyList: Record<string, NeighborLink[]> = {};
  let totalPopulation = 0;

  for (const node of nodes) {
    nodeMap[node.id] = node;
    adjacencyList[node.id] = [];
    totalPopulation += node.population;
  }

  for (const edge of edges) {
    adjacencyList[edge.source]?.push({
      neighborId: edge.target,
      edgeId: edge.id,
      weight: edge.weight,
      routeLabel: edge.routeLabel,
    });
    adjacencyList[edge.target]?.push({
      neighborId: edge.source,
      edgeId: edge.id,
      weight: edge.weight,
      routeLabel: edge.routeLabel,
    });
  }

  return {
    difficulty,
    partsPerNode,
    nodes,
    edges,
    nodeMap,
    adjacencyList,
    parentToChildren,
    totalPopulation,
  };
}
