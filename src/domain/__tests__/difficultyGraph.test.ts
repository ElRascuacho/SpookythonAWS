import { describe, expect, test } from "bun:test";
import { createDifficultyGraph, DIFFICULTY_PARTS, type GraphDifficulty } from "../difficultyGraph";
import { MANTA_EDGES, MANTA_NODES, TOTAL_MANTA_POPULATION } from "../mantaGraph";

describe("difficultyGraph", () => {
  test("subdivides each node into 1, 2 or 3 parts while preserving parent and total population", () => {
    for (const difficulty of ["normal", "difícil", "extremo", "hard", "extreme"] as GraphDifficulty[]) {
      const expectedParts = DIFFICULTY_PARTS[difficulty];
      const graph = createDifficultyGraph(difficulty);

      expect(graph.partsPerNode).toBe(expectedParts);
      expect(graph.nodes).toHaveLength(MANTA_NODES.length * expectedParts);
      expect(graph.totalPopulation).toBe(TOTAL_MANTA_POPULATION);
      expect(graph.nodes.reduce((sum, node) => sum + node.population, 0)).toBe(TOTAL_MANTA_POPULATION);

      for (const parent of MANTA_NODES) {
        const childIds = graph.parentToChildren[parent.id];
        expect(childIds).toHaveLength(expectedParts);
        const childPopSum = childIds.reduce((sum, id) => sum + graph.nodeMap[id].population, 0);
        expect(childPopSum).toBe(parent.population);
      }
    }
  });

  test("preserves original identifiers in normal mode and generates unique IDs when subdivided", () => {
    const normal = createDifficultyGraph("normal");
    expect(normal.nodes.map((n) => n.id)).toEqual(MANTA_NODES.map((n) => n.id));
    expect(normal.edges.map((e) => e.id)).toEqual(MANTA_EDGES.map((e) => e.id));

    for (const difficulty of ["difícil", "extremo"] as const) {
      const graph = createDifficultyGraph(difficulty);
      const nodeIds = graph.nodes.map((n) => n.id);
      const edgeIds = graph.edges.map((e) => e.id);

      expect(new Set(nodeIds).size).toBe(nodeIds.length);
      expect(new Set(edgeIds).size).toBe(edgeIds.length);
      for (const original of MANTA_NODES) {
        expect(nodeIds).not.toContain(original.id);
      }
    }
  });

  test("builds coherent internal and external edges and keeps the full graph connected", () => {
    for (const difficulty of ["normal", "difícil", "extremo"] as const) {
      const graph = createDifficultyGraph(difficulty);

      for (const edge of graph.edges) {
        expect(graph.nodeMap[edge.source]).toBeDefined();
        expect(graph.nodeMap[edge.target]).toBeDefined();
        expect(edge.source).not.toBe(edge.target);
        expect(edge.weight).toBeGreaterThan(0);
      }

      if (graph.partsPerNode > 1) {
        for (const parent of MANTA_NODES) {
          const children = graph.parentToChildren[parent.id];
          for (let a = 0; a < children.length; a++) {
            const neighbors = graph.adjacencyList[children[a]].map((link) => link.neighborId);
            for (let b = a + 1; b < children.length; b++) {
              expect(neighbors).toContain(children[b]);
            }
          }
        }
      }

      const visited = new Set<string>();
      const queue = [graph.nodes[0].id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const link of graph.adjacencyList[current]) {
          if (!visited.has(link.neighborId)) queue.push(link.neighborId);
        }
      }
      expect(visited.size).toBe(graph.nodes.length);
    }
  });

  test("is deterministic, pure, and never mutates original Manta graph structures", () => {
    const nodesSnapshot = JSON.stringify(MANTA_NODES);
    const edgesSnapshot = JSON.stringify(MANTA_EDGES);

    const firstHard = createDifficultyGraph("difícil");
    const secondHard = createDifficultyGraph("difícil");
    const firstExtreme = createDifficultyGraph("extremo");
    const secondExtreme = createDifficultyGraph("extremo");

    expect(firstHard).toEqual(secondHard);
    expect(firstExtreme).toEqual(secondExtreme);
    expect(firstHard.nodes[0]).not.toBe(secondHard.nodes[0]);

    firstHard.nodes[0].population = 999999;
    expect(JSON.stringify(MANTA_NODES)).toBe(nodesSnapshot);
    expect(JSON.stringify(MANTA_EDGES)).toBe(edgesSnapshot);
    expect(() => createDifficultyGraph("invalid" as GraphDifficulty)).toThrow();
  });
});
