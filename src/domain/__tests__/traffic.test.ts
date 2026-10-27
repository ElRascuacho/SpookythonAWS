import { describe, expect, test } from "bun:test";
import { quadraticRoutePoint } from "../traffic";

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
});
