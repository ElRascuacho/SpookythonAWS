import { describe, expect, test } from "bun:test";
import { pointOnRoad, quadraticRoutePoint, TRAFFIC_ROUTES, TRAFFIC_VEHICLES } from "../traffic";

describe("traffic route projection", () => {
  test("keeps vehicles on quadratic corridors and clamps progress", () => {
    const start = { x: 0, y: 0 };
    const control = { x: 5, y: 10 };
    const end = { x: 10, y: 0 };

    expect(quadraticRoutePoint(start, control, end, 0)).toMatchObject({ x: 0, y: 0 });
    expect(quadraticRoutePoint(start, control, end, 0.5)).toMatchObject({ x: 5, y: 5 });
    expect(quadraticRoutePoint(start, control, end, 1)).toMatchObject({ x: 10, y: 0 });
    expect(quadraticRoutePoint(start, control, end, 2)).toMatchObject({ x: 10, y: 0 });
  });
  test("follows real-road coordinates and clamps the start and end", () => {
    for (const route of TRAFFIC_ROUTES) {
      expect(route.coordinates.length).toBeGreaterThan(2);
      expect(pointOnRoad(route, -1)).toEqual([route.coordinates[0][0], route.coordinates[0][1]]);
      const end = route.coordinates[route.coordinates.length - 1];
      expect(pointOnRoad(route, 2)).toEqual([end[0], end[1]]);
      expect(route.cumulative.at(-1)).toBeGreaterThan(0);
      expect(route.edges.length).toBeGreaterThan(0);
    }
    expect(TRAFFIC_ROUTES[0].edges).toEqual(["E02", "E08"]);
    expect(TRAFFIC_VEHICLES).toHaveLength(216);
    expect(new Set(TRAFFIC_VEHICLES.map((v) => v.route)).size).toBe(TRAFFIC_ROUTES.length);
    expect(TRAFFIC_VEHICLES.some((v) => v.type === "bus")).toBe(true);
  });
});
