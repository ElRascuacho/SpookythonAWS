export type TrafficPoint = { x: number; y: number };

export const TRAFFIC_VEHICLES = [
  { type: "car", route: 0, edge: "E01", duration: 42, delay: 0 },
  { type: "bus", route: 1, edge: "E03", duration: 52, delay: 16 },
  { type: "car", route: 2, edge: "E06", duration: 38, delay: 23 },
  { type: "bus", route: 3, edge: "E08", duration: 56, delay: 31 },
] as const;

export function quadraticRoutePoint(
  start: TrafficPoint,
  control: TrafficPoint,
  end: TrafficPoint,
  progress: number,
) {
  const t = Math.max(0, Math.min(1, progress));
  const inverse = 1 - t;
  const dx = 2 * inverse * (control.x - start.x) + 2 * t * (end.x - control.x);
  const dy = 2 * inverse * (control.y - start.y) + 2 * t * (end.y - control.y);

  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    angle: Math.atan2(dy, dx),
  };
}
