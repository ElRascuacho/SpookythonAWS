export type TrafficPoint = { x: number; y: number };
import roadData from "../data/manta-osm-routes.json";
import { NODE_MAP } from "./mantaGraph";
import { shortestRoadRoute, type RoadGraph } from "./roadRouting";

// Fixed road geometries generated from OpenStreetMap via OSRM, not official bus itineraries.
function prepareRoute<T extends { coordinates: number[][] }>(route: T) {
  const cumulative = [0];
  for (let i = 1; i < route.coordinates.length; i++) {
    const [a, b] = [route.coordinates[i - 1], route.coordinates[i]];
    cumulative.push(cumulative[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { ...route, cumulative };
}
export const ROAD_ROUTES = roadData.routes.map(prepareRoute);

const nodeIds = [...new Set(ROAD_ROUTES.flatMap((route) => [route.from, route.to]))];
const roadGraph: RoadGraph = {
  nodes: nodeIds.map((id) => ({ id, lat: NODE_MAP[id].lat, lng: NODE_MAP[id].lng })),
  edges: ROAD_ROUTES.map(({ from, to, distanceMeters }) => ({ from, to, distanceMeters })),
};

function buildTrafficRoute(from: string, to: string) {
  const selected = shortestRoadRoute(roadGraph, from, to);
  if (!selected) throw new Error(`No hay corredor vial entre ${from} y ${to}`);
  const parts = selected.path.slice(1).map((id, index) => {
    const road = ROAD_ROUTES.filter((route) => route.from === selected.path[index] && route.to === id).sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    if (!road) throw new Error("Tramo vial no disponible");
    return road;
  });
  return prepareRoute({ from, to, distanceMeters: selected.distanceMeters, edges: parts.map((part) => part.edge), coordinates: parts.flatMap((part) => part.coordinates) });
}

// Routing is shortest only over the cached district corridors, not the whole city road graph.
export const TRAFFIC_ROUTES = [buildTrafficRoute("N08", "N02"), buildTrafficRoute("N01", "N07"), buildTrafficRoute("N02", "N08"), buildTrafficRoute("N02", "N01")];

export function pointOnRoad(route: { coordinates: number[][]; cumulative: number[] }, progress: number): [number, number] {
  const distance = Math.max(0, Math.min(1, progress)) * route.cumulative[route.cumulative.length - 1];
  let i = 1;
  while (i < route.cumulative.length - 1 && route.cumulative[i] < distance) i++;
  const span = route.cumulative[i] - route.cumulative[i - 1];
  const t = span ? (distance - route.cumulative[i - 1]) / span : 0;
  const a = route.coordinates[i - 1], b = route.coordinates[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export const TRAFFIC_VEHICLES = [
  { type: "car", route: 0, duration: 42, delay: 0 },
  { type: "bus", route: 1, duration: 52, delay: 16 },
  { type: "car", route: 2, duration: 38, delay: 23 },
  { type: "bus", route: 3, duration: 56, delay: 31 },
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
