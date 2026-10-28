import { describe, expect, test } from "bun:test";
import { shortestRoadRoute } from "../roadRouting";
import type { RoadGraph } from "../roadRouting";

const nodes = [
  { id: "A", lat: -0.95, lng: -80.73 },
  { id: "B", lat: -0.951, lng: -80.731 },
  { id: "C", lat: -0.952, lng: -80.732 },
  { id: "D", lat: -0.953, lng: -80.733 },
] as const;

describe("shortestRoadRoute", () => {
  test("returns the cheapest directed route and its physical distance", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [
        { from: "A", to: "B", distanceMeters: 150 },
        { from: "B", to: "D", distanceMeters: 150 },
        { from: "A", to: "C", distanceMeters: 400 },
        { from: "C", to: "D", distanceMeters: 400 },
      ],
    };

    expect(shortestRoadRoute(graph, "A", "D")).toEqual({
      path: ["A", "B", "D"],
      distanceMeters: 300,
    });
  });

  test("does not get trapped by a locally cheaper first hop", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [
        { from: "A", to: "B", distanceMeters: 10 },
        { from: "A", to: "C", distanceMeters: 1 },
        { from: "C", to: "B", distanceMeters: 1 },
        { from: "B", to: "D", distanceMeters: 1 },
        { from: "C", to: "D", distanceMeters: 100 },
      ],
    };

    expect(shortestRoadRoute(graph, "A", "D")).toEqual({
      path: ["A", "C", "B", "D"],
      distanceMeters: 3,
    });
  });

  test("respects one-way edges in both query directions", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [
        { from: "A", to: "B", distanceMeters: 100 },
        { from: "B", to: "C", distanceMeters: 120 },
      ],
    };

    expect(shortestRoadRoute(graph, "A", "C")?.distanceMeters).toBe(220);
    expect(shortestRoadRoute(graph, "C", "A")).toBeNull();
  });

  test("returns null when the destination is disconnected", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [{ from: "A", to: "B", distanceMeters: 100 }],
    };

    expect(shortestRoadRoute(graph, "A", "D")).toBeNull();
    expect(shortestRoadRoute(graph, "B", "D")).toBeNull();
  });

  test("returns a zero-distance path when from equals to", () => {
    const graph: RoadGraph = { nodes, edges: [] };

    expect(shortestRoadRoute(graph, "B", "B")).toEqual({ path: ["B"], distanceMeters: 0 });
  });

  test("returns null for unknown node ids", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [{ from: "A", to: "B", distanceMeters: 100 }],
    };

    expect(shortestRoadRoute(graph, "Z", "B")).toBeNull();
    expect(shortestRoadRoute(graph, "A", "Z")).toBeNull();
    expect(shortestRoadRoute(graph, "Z", "Z")).toBeNull();
  });

  test("supports zero-distance edges and prefers them over positive ones", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [
        { from: "A", to: "B", distanceMeters: 0 },
        { from: "B", to: "D", distanceMeters: 0 },
        { from: "A", to: "D", distanceMeters: 50 },
      ],
    };

    expect(shortestRoadRoute(graph, "A", "D")).toEqual({
      path: ["A", "B", "D"],
      distanceMeters: 0,
    });
  });

  test("uses the cheaper of parallel edges", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [
        { from: "A", to: "B", distanceMeters: 500 },
        { from: "A", to: "B", distanceMeters: 200 },
      ],
    };

    expect(shortestRoadRoute(graph, "A", "B")).toEqual({
      path: ["A", "B"],
      distanceMeters: 200,
    });
  });

  test("handles cycles without looping and still finds the shortest exit", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [
        { from: "A", to: "B", distanceMeters: 10 },
        { from: "B", to: "A", distanceMeters: 10 },
        { from: "B", to: "C", distanceMeters: 15 },
        { from: "A", to: "C", distanceMeters: 40 },
      ],
    };

    expect(shortestRoadRoute(graph, "A", "C")).toEqual({
      path: ["A", "B", "C"],
      distanceMeters: 25,
    });
  });

  test("breaks cost ties deterministically by node id", () => {
    const graph: RoadGraph = {
      nodes,
      edges: [
        { from: "A", to: "B", distanceMeters: 1 },
        { from: "A", to: "C", distanceMeters: 1 },
        { from: "B", to: "D", distanceMeters: 1 },
        { from: "C", to: "D", distanceMeters: 1 },
      ],
    };

    expect(shortestRoadRoute(graph, "A", "D")).toEqual({
      path: ["A", "B", "D"],
      distanceMeters: 2,
    });
  });

  test("does not mutate the input graph", () => {
    const graph: RoadGraph = {
      nodes: [...nodes],
      edges: [
        { from: "A", to: "B", distanceMeters: 100 },
        { from: "B", to: "C", distanceMeters: 120 },
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(graph));

    shortestRoadRoute(graph, "A", "C");

    expect(graph).toEqual(snapshot);
  });

  test("rejects negative or non-finite edge distances", () => {
    const negative: RoadGraph = {
      nodes,
      edges: [{ from: "A", to: "B", distanceMeters: -1 }],
    };
    const nan: RoadGraph = {
      nodes,
      edges: [{ from: "A", to: "B", distanceMeters: Number.NaN }],
    };
    const infinite: RoadGraph = {
      nodes,
      edges: [{ from: "A", to: "B", distanceMeters: Number.POSITIVE_INFINITY }],
    };

    expect(() => shortestRoadRoute(negative, "A", "B")).toThrow(RangeError);
    expect(() => shortestRoadRoute(nan, "A", "B")).toThrow(RangeError);
    expect(() => shortestRoadRoute(infinite, "A", "B")).toThrow(RangeError);
  });

  test("rejects structurally invalid graphs", () => {
    const danglingEdge: RoadGraph = {
      nodes,
      edges: [{ from: "A", to: "Z", distanceMeters: 100 }],
    };
    const duplicateNode: RoadGraph = {
      nodes: [...nodes, { id: "A", lat: 0, lng: 0 }],
      edges: [],
    };
    const invalidCoordinates: RoadGraph = {
      nodes: [{ id: "A", lat: Number.NaN, lng: 0 }],
      edges: [],
    };

    expect(() => shortestRoadRoute(danglingEdge, "A", "Z")).toThrow("unknown node");
    expect(() => shortestRoadRoute(duplicateNode, "A", "B")).toThrow("Duplicate");
    expect(() => shortestRoadRoute(invalidCoordinates, "A", "A")).toThrow("finite lat/lng");
  });
});
