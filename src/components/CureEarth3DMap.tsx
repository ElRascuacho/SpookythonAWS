import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Compass,
  Crosshair,
  Globe,
  Layers,
  Map as MapIcon,
  Minus,
  Orbit,
  Plus,
  ShieldCheck,
  ShieldPlus,
  SprayCan,
} from "lucide-react";
import { MANTA_EDGES, MANTA_NODES, NODE_MAP } from "../domain/mantaGraph";
import type { CityNode, DailyCitySnapshot } from "../domain/types";
import type { Order } from "../domain/cureGame";

export type MapStyleMode = "satellite" | "tactical3d";

interface Props {
  snapshot: DailyCitySnapshot;
  selectedNode: string;
  onSelect: (nodeId: string) => void;
  orders: Order[];
  patientZeroId: string;
  styleMode: MapStyleMode;
  onChangeStyleMode: (mode: MapStyleMode) => void;
  onSwitchTo2D: () => void;
}

const MANTA_CENTER: [number, number] = [-80.724, -0.9565];

const SHORT_NAMES: Record<string, string> = {
  N01: "TARQUI",
  N02: "PLAYITA MÍA",
  N03: "ULEAM",
  N04: "HOSP. ZAMBRANO",
  N05: "TERMINAL",
  N06: "EL MURCIÉLAGO",
  N07: "CENTRO",
  N08: "ELOY ALFARO",
  N09: "LOS ESTEROS",
  N10: "SAN MATEO",
  N11: "BARBASQUILLO",
  N12: "COLEGIO MANTA",
  N13: "Z. INDUSTRIAL",
  N14: "UMIÑA",
  N15: "PUERTO MANTA",
  N16: "URBIRRÍOS",
};

/**
 * Converts meters offset (dx east, dy north) into [lng, lat] around a reference coordinate.
 */
function offsetLngLat(
  lng: number,
  lat: number,
  dxMeters: number,
  dyMeters: number,
): [number, number] {
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);
  return [lng + dxMeters / metersPerDegLng, lat + dyMeters / metersPerDegLat];
}

/**
 * Generates a regular polygon footprint in [lng, lat] around a center point.
 */
function createPolygonRing(
  lng: number,
  lat: number,
  radiusMeters: number,
  sides = 12,
  rotationRad = 0,
): number[][] {
  const coords: number[][] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = rotationRad + (i * 2 * Math.PI) / sides;
    coords.push(
      offsetLngLat(
        lng,
        lat,
        radiusMeters * Math.cos(angle),
        radiusMeters * Math.sin(angle),
      ),
    );
  }
  return coords;
}

/**
 * Generates a hollow ring polygon (outer + inner hole) in [lng, lat].
 */
function createHollowRing(
  lng: number,
  lat: number,
  outerRadiusM: number,
  innerRadiusM: number,
  sides = 16,
  rotationRad = 0,
): number[][][] {
  const outer = createPolygonRing(lng, lat, outerRadiusM, sides, rotationRad);
  const inner = createPolygonRing(
    lng,
    lat,
    innerRadiusM,
    sides,
    rotationRad,
  ).reverse();
  return [outer, inner];
}

/**
 * Generates a rectangular building footprint rotated by angleRad.
 */
function createBoxFootprint(
  lng: number,
  lat: number,
  halfWidthM: number,
  halfDepthM: number,
  angleRad = 0,
): number[][] {
  const corners = [
    [-halfWidthM, -halfDepthM],
    [halfWidthM, -halfDepthM],
    [halfWidthM, halfDepthM],
    [-halfWidthM, halfDepthM],
    [-halfWidthM, -halfDepthM],
  ];
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return corners.map(([x, y]) =>
    offsetLngLat(lng, lat, x * cos - y * sin, x * sin + y * cos),
  );
}

/**
 * Builds a 3D architectural compound centered on [node.lng, node.lat].
 */
function buildNode3DCompound(
  node: CityNode,
  coreHeight: number,
  coreColor: string,
  accentColor: string,
  isSelected: boolean,
  hasCordon: boolean,
  hasVaccine: boolean,
  hasFumigate: boolean,
) {
  const features: Array<{
    type: "Feature";
    properties: Record<string, string | number>;
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }> = [];

  const ringRadius = isSelected ? 155 : 130;

  // 1. Outer 3D containment ring on the ground
  features.push({
    type: "Feature",
    properties: {
      id: node.id,
      part: "perimeter-ring",
      color: isSelected
        ? "#b1dfc8"
        : hasCordon
          ? "#80e0bc"
          : coreColor,
      base: 0,
      height: isSelected ? 14 : 9,
    },
    geometry: {
      type: "Polygon",
      coordinates: createHollowRing(
        node.lng,
        node.lat,
        ringRadius,
        ringRadius - 14,
        12,
      ),
    },
  });

  // 2. Central hexagonal pedestal
  features.push({
    type: "Feature",
    properties: {
      id: node.id,
      part: "pedestal",
      color: isSelected ? "#1f424d" : "#122730",
      base: 0,
      height: 14,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        createPolygonRing(node.lng, node.lat, 82, 8, Math.PI / 8),
      ],
    },
  });

  // 3. Role-specific 3D structure centered at [node.lng, node.lat]
  if (node.id === "N04") {
    // Hospital Rodríguez Zambrano: 3D Medical Cross + Central Beacon Spire
    const wingH = Math.max(48, Math.round(coreHeight * 0.58));
    features.push(
      {
        type: "Feature",
        properties: {
          id: node.id,
          part: "hospital-ns",
          color: coreColor,
          base: 14,
          height: wingH,
        },
        geometry: {
          type: "Polygon",
          coordinates: [createBoxFootprint(node.lng, node.lat, 24, 72, 0.12)],
        },
      },
      {
        type: "Feature",
        properties: {
          id: node.id,
          part: "hospital-ew",
          color: coreColor,
          base: 14,
          height: wingH,
        },
        geometry: {
          type: "Polygon",
          coordinates: [createBoxFootprint(node.lng, node.lat, 72, 24, 0.12)],
        },
      },
      {
        type: "Feature",
        properties: {
          id: node.id,
          part: "hospital-core",
          color: accentColor,
          base: wingH,
          height: Math.round(coreHeight),
        },
        geometry: {
          type: "Polygon",
          coordinates: [createPolygonRing(node.lng, node.lat, 30, 8)],
        },
      },
    );
  } else {
    // Stepped 3D Epidemiological Spire + 4 Symmetric Corner Blocks
    const midH = Math.max(38, Math.round(coreHeight * 0.55));
    features.push(
      {
        type: "Feature",
        properties: {
          id: node.id,
          part: "core-lower",
          color: coreColor,
          base: 14,
          height: midH,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            createPolygonRing(node.lng, node.lat, 50, 8, Math.PI / 8),
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          id: node.id,
          part: "core-spire",
          color: accentColor,
          base: midH,
          height: Math.round(coreHeight),
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            createPolygonRing(node.lng, node.lat, 28, 8, Math.PI / 8),
          ],
        },
      },
    );

    const subOffsets = [
      [58, 42, 0.25],
      [-58, 42, -0.25],
      [58, -42, -0.25],
      [-58, -42, 0.25],
    ];
    subOffsets.forEach(([dx, dy, rot], idx) => {
      const [bLng, bLat] = offsetLngLat(node.lng, node.lat, dx, dy);
      features.push({
        type: "Feature",
        properties: {
          id: node.id,
          part: `sub-${idx}`,
          color: idx % 2 === 0 ? coreColor : "#1d3942",
          base: 10,
          height: Math.max(24, Math.round(coreHeight * 0.34)),
        },
        geometry: {
          type: "Polygon",
          coordinates: [createBoxFootprint(bLng, bLat, 16, 14, rot)],
        },
      });
    });
  }

  // 4. 3D Sanitary Cordon Barricade Pillars around the perimeter
  if (hasCordon) {
    const segments = 12;
    const cordonR = 175;
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const [wLng, wLat] = offsetLngLat(
        node.lng,
        node.lat,
        cordonR * Math.cos(angle),
        cordonR * Math.sin(angle),
      );
      features.push({
        type: "Feature",
        properties: {
          id: node.id,
          part: `cordon-${i}`,
          color: "#80e0bc",
          base: 0,
          height: 85,
        },
        geometry: {
          type: "Polygon",
          coordinates: [createBoxFootprint(wLng, wLat, 7, 22, angle)],
        },
      });
    }
  }

  // 5. Floating 3D Intervention Ring for Vaccine / Fumigation
  if (hasVaccine || hasFumigate) {
    features.push({
      type: "Feature",
      properties: {
        id: node.id,
        part: "intervention-crown",
        color: hasVaccine ? "#b1dfc8" : "#d3bc80",
        base: Math.round(coreHeight + 12),
        height: Math.round(coreHeight + 28),
      },
      geometry: {
        type: "Polygon",
        coordinates: createHollowRing(node.lng, node.lat, 42, 26, 8),
      },
    });
  }

  return features;
}

/**
 * Style specification combining:
 * - Esri World Imagery Satellite tiles (Google Earth view)
 * - AWS Open Data DEM Hillshade (topographic relief without Z-plane distortion)
 * - OpenFreeMap vector streets & 3D buildings of Manta
 * Note: We intentionally keep the geometric terrain plane at z=0 so that
 * 3D fill-extrusions, map.project() canvas arcs, and DOM markers share the
 * exact same coordinate projection with zero parallax drift.
 */
const EARTH_3D_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "aws-terrain-dem": {
      type: "raster-dem",
      tiles: [
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
      ],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
    },
    "esri-world-satellite": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 18,
    },
    "carto-dark-matter": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      maxzoom: 18,
    },
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    {
      id: "background-void",
      type: "background",
      paint: {
        "background-color": "#08141a",
      },
    },
    {
      id: "tactical-dark-raster",
      type: "raster",
      source: "carto-dark-matter",
      paint: {
        "raster-opacity": 0.95,
        "raster-contrast": 0.15,
        "raster-brightness-max": 0.82,
      },
    },
    {
      id: "satellite-earth-raster",
      type: "raster",
      source: "esri-world-satellite",
      paint: {
        "raster-opacity": 0.88,
        "raster-brightness-max": 0.78,
        "raster-brightness-min": 0.05,
        "raster-contrast": 0.24,
        "raster-saturation": -0.25,
      },
    },
    {
      id: "terrain-hillshade",
      type: "hillshade",
      source: "aws-terrain-dem",
      paint: {
        "hillshade-exaggeration": 0.5,
        "hillshade-shadow-color": "#040b0f",
        "hillshade-highlight-color": "#7fb8a4",
        "hillshade-accent-color": "#132a34",
      },
    },
    {
      id: "manta-roads-glow",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 11,
      paint: {
        "line-color": "#386878",
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.7, 15, 2.8],
        "line-opacity": 0.48,
      },
    },
    {
      id: "manta-real-3d-buildings",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 12,
      paint: {
        "fill-extrusion-color": "#162d36",
        "fill-extrusion-height": [
          "coalesce",
          ["get", "render_height"],
          ["get", "height"],
          12,
        ],
        "fill-extrusion-base": [
          "coalesce",
          ["get", "render_min_height"],
          0,
        ],
        "fill-extrusion-opacity": 0.62,
      },
    },
  ],
};

export function CureEarth3DMap({
  snapshot,
  selectedNode,
  onSelect,
  orders,
  patientZeroId,
  styleMode,
  onChangeStyleMode,
  onSwitchTo2D,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<
    Record<
      string,
      {
        marker: maplibregl.Marker;
        hostEl: HTMLDivElement;
        btnEl: HTMLButtonElement;
      }
    >
  >({});

  const [layer, setLayer] = useState<"infection" | "protection">("infection");
  const [mapReady, setMapReady] = useState(false);
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [isPitched, setIsPitched] = useState(true);

  // Refs for the 60fps tactical holographic overlay canvas
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const affected = MANTA_NODES.filter(
    (node) => snapshot.nodes[node.id].I > 0,
  ).length;

  // Build 3D GeoJSON for compounds, ground bio-halos, and corridor lines
  const { buildingsGeoJson, halosGeoJson, edgesGeoJson } = useMemo(() => {
    const cordonedEdgesSet = new Set(snapshot.action.cordonedEdges);
    const cordonedNodesSet = new Set(snapshot.action.cordonedNodes);

    const compoundFeatures: ReturnType<typeof buildNode3DCompound> = [];
    const haloFeatures: Array<{
      type: "Feature";
      properties: Record<string, string | number>;
      geometry: { type: "Polygon"; coordinates: number[][][] };
    }> = [];

    for (const node of MANTA_NODES) {
      const state = snapshot.nodes[node.id];
      const isSelected = node.id === selectedNode;
      const queuedOrders = orders.filter((o) => o.nodeId === node.id);
      const hasVaccine =
        queuedOrders.some((o) => o.kind === "vaccine") ||
        state.vaccinatedToday > 0;
      const hasFumigate =
        queuedOrders.some((o) => o.kind === "fumigate") ||
        state.fumigatedToday;
      const hasCordon =
        queuedOrders.some((o) => o.kind === "cordon") ||
        state.cordonedToday ||
        cordonedNodesSet.has(node.id);

      const coreColor =
        layer === "protection"
          ? state.R > 0
            ? "#6fd4af"
            : "#355863"
          : state.I > 250
            ? "#ff5d47"
            : state.I > 0
              ? "#f58a72"
              : "#4c727d";

      const accentColor =
        layer === "protection"
          ? "#b1dfc8"
          : state.I > 0
            ? "#ffb19e"
            : "#87adb7";

      const coreHeight =
        layer === "protection"
          ? Math.min(340, 58 + (state.R / Math.max(1, node.population)) * 280)
          : Math.min(380, 56 + state.I * 0.18 + state.E * 0.12);

      compoundFeatures.push(
        ...buildNode3DCompound(
          node,
          coreHeight,
          coreColor,
          accentColor,
          isSelected,
          hasCordon,
          hasVaccine,
          hasFumigate,
        ),
      );

      // Ground Halo (Infection aura or Protection shield)
      const haloRadius =
        state.I > 0
          ? 200 + Math.min(180, state.I * 0.11)
          : 165 + state.vectorIndex * 65;
      const haloColor = hasCordon
        ? "#80e0bc"
        : state.I > 0
          ? "#f58a72"
          : hasFumigate
            ? "#d3bc80"
            : "#3d6975";
      const haloOpacity = hasCordon
        ? 0.25
        : state.I > 0
          ? Math.min(0.34, 0.14 + state.I / 2500)
          : 0.08;

      haloFeatures.push({
        type: "Feature",
        properties: {
          id: node.id,
          color: haloColor,
          opacity: haloOpacity,
        },
        geometry: {
          type: "Polygon",
          coordinates: [createPolygonRing(node.lng, node.lat, haloRadius, 24)],
        },
      });
    }

    const edgeFeatures = MANTA_EDGES.map((edge) => {
      const src = NODE_MAP[edge.source];
      const tgt = NODE_MAP[edge.target];
      const closed =
        cordonedEdgesSet.has(edge.id) ||
        orders.some(
          (o) =>
            o.kind === "cordon" &&
            (o.nodeId === edge.source || o.nodeId === edge.target),
        );
      const infected =
        snapshot.nodes[edge.source].I > 0 || snapshot.nodes[edge.target].I > 0;
      const touchesSelected =
        edge.source === selectedNode || edge.target === selectedNode;

      const color = closed
        ? "#a7ddc4"
        : infected
          ? "#f58a72"
          : touchesSelected
            ? "#9ec8bb"
            : "#567d87";
      const width = closed
        ? 3
        : touchesSelected
          ? 2.8
          : infected
            ? 2.2 + edge.weight * 3
            : 1.4;

      return {
        type: "Feature" as const,
        properties: {
          id: edge.id,
          color,
          width,
          closed: closed ? 1 : 0,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [src.lng, src.lat],
            [tgt.lng, tgt.lat],
          ],
        },
      };
    });

    return {
      buildingsGeoJson: {
        type: "FeatureCollection" as const,
        features: compoundFeatures,
      },
      halosGeoJson: {
        type: "FeatureCollection" as const,
        features: haloFeatures,
      },
      edgesGeoJson: {
        type: "FeatureCollection" as const,
        features: edgeFeatures,
      },
    };
  }, [snapshot, selectedNode, orders, layer]);

  // Initialize MapLibre 3D Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: EARTH_3D_STYLE,
      center: MANTA_CENTER,
      zoom: prefersReducedMotion ? 13.15 : 11.4,
      pitch: prefersReducedMotion ? 56 : 25,
      bearing: prefersReducedMotion ? -18 : -6,
      maxPitch: 75,
      attributionControl: false,
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    map.on("load", () => {
      try {
        map.setSky({
          "sky-color": "#071319",
          "sky-horizon-blend": 0.45,
          "horizon-color": "#183945",
          "horizon-fog-blend": 0.65,
          "fog-color": "#0b1b23",
          "fog-ground-blend": 0.35,
        });
      } catch {
        // Ignore if sky spec is unsupported
      }

      // 1. Ground Bio-Halos
      map.addSource("cure-halos", {
        type: "geojson",
        data: halosGeoJson,
      });
      map.addLayer({
        id: "cure-halos-fill",
        type: "fill",
        source: "cure-halos",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["get", "opacity"],
        },
      });

      // 2. Ground Mobility Corridors
      map.addSource("cure-edges", {
        type: "geojson",
        data: edgesGeoJson,
      });
      map.addLayer({
        id: "cure-edges-glow",
        type: "line",
        source: "cure-edges",
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["*", ["get", "width"], 2.8],
          "line-opacity": 0.24,
          "line-blur": 3,
        },
      });
      map.addLayer({
        id: "cure-edges-line",
        type: "line",
        source: "cure-edges",
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["get", "width"],
          "line-opacity": 0.82,
          "line-dasharray": [2, 2],
        },
      });

      // 3. 3D Node Architectural Compounds & Cordon Barricades
      map.addSource("cure-compounds-3d", {
        type: "geojson",
        data: buildingsGeoJson,
      });
      map.addLayer({
        id: "cure-compounds-extrusion",
        type: "fill-extrusion",
        source: "cure-compounds-3d",
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 0.92,
        },
      });

      map.on("click", "cure-compounds-extrusion", (e) => {
        const clickedId = e.features?.[0]?.properties?.id;
        if (clickedId) {
          onSelectRef.current(String(clickedId));
        }
      });

      map.on("mouseenter", "cure-compounds-extrusion", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "cure-compounds-extrusion", () => {
        map.getCanvas().style.cursor = "";
      });

      setMapReady(true);

      if (!prefersReducedMotion) {
        map.flyTo({
          center: MANTA_CENTER,
          zoom: 13.15,
          pitch: 58,
          bearing: -18,
          duration: 1600,
          essential: true,
        });
      }
    });

    // Create zero-drift 0x0 marker hosts anchored at the exact [lng, lat] center
    for (const node of MANTA_NODES) {
      const hostEl = document.createElement("div");
      hostEl.className = "earth-marker-host";

      const btnEl = document.createElement("button");
      btnEl.type = "button";
      btnEl.className = "earth-node-pin";
      btnEl.setAttribute("aria-label", `Seleccionar zona ${node.name}`);
      btnEl.onclick = (ev) => {
        ev.stopPropagation();
        onSelectRef.current(node.id);
      };

      const stemEl = document.createElement("span");
      stemEl.className = "pin-stem";

      const dotEl = document.createElement("span");
      dotEl.className = "pin-anchor-dot";

      hostEl.appendChild(dotEl);
      hostEl.appendChild(stemEl);
      hostEl.appendChild(btnEl);

      const marker = new maplibregl.Marker({
        element: hostEl,
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      })
        .setLngLat([node.lng, node.lat])
        .addTo(map);

      markersRef.current[node.id] = { marker, hostEl, btnEl };
    }

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Synchronize Satellite vs Tactical 3D City style layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const isSat = styleMode === "satellite";
    if (map.getLayer("satellite-earth-raster")) {
      map.setPaintProperty(
        "satellite-earth-raster",
        "raster-opacity",
        isSat ? 0.88 : 0,
      );
    }
    if (map.getLayer("manta-real-3d-buildings")) {
      map.setPaintProperty(
        "manta-real-3d-buildings",
        "fill-extrusion-opacity",
        isSat ? 0.5 : 0.82,
      );
      map.setPaintProperty(
        "manta-real-3d-buildings",
        "fill-extrusion-color",
        isSat ? "#19333d" : "#152932",
      );
    }
  }, [styleMode, mapReady]);

  // Update 3D GeoJSON sources when game state or orders change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const compoundsSrc = map.getSource("cure-compounds-3d") as
      | maplibregl.GeoJSONSource
      | undefined;
    compoundsSrc?.setData(buildingsGeoJson);

    const halosSrc = map.getSource("cure-halos") as
      | maplibregl.GeoJSONSource
      | undefined;
    halosSrc?.setData(halosGeoJson);

    const edgesSrc = map.getSource("cure-edges") as
      | maplibregl.GeoJSONSource
      | undefined;
    edgesSrc?.setData(edgesGeoJson);
  }, [buildingsGeoJson, halosGeoJson, edgesGeoJson, mapReady]);

  // Update DOM HUD pins on all 16 Manta zones
  useEffect(() => {
    for (const node of MANTA_NODES) {
      const entry = markersRef.current[node.id];
      if (!entry) continue;

      const state = snapshot.nodes[node.id];
      const isSelected = node.id === selectedNode;
      const nodeOrders = orders.filter((o) => o.nodeId === node.id);
      const isOrigin = node.id === patientZeroId && snapshot.day <= 2;

      const hasVax =
        nodeOrders.some((o) => o.kind === "vaccine") ||
        state.vaccinatedToday > 0;
      const hasFum =
        nodeOrders.some((o) => o.kind === "fumigate") || state.fumigatedToday;
      const hasCord =
        nodeOrders.some((o) => o.kind === "cordon") || state.cordonedToday;

      const statusState =
        state.I > 200
          ? "critical"
          : state.I > 0
            ? "infected"
            : state.R > 0
              ? "protected"
              : "healthy";

      entry.hostEl.className = [
        "earth-marker-host",
        `state-${statusState}`,
        isSelected ? "is-selected" : "",
        nodeOrders.length > 0 ? "has-orders" : "",
      ]
        .filter(Boolean)
        .join(" ");

      entry.btnEl.className = [
        "earth-node-pin",
        isSelected ? "selected" : "",
        state.I > 0 ? "infected" : "healthy",
        nodeOrders.length > 0 ? "queued" : "",
      ]
        .filter(Boolean)
        .join(" ");

      entry.btnEl.setAttribute("aria-pressed", String(isSelected));
      entry.btnEl.setAttribute(
        "aria-label",
        `${node.name}: ${state.I} infecciosos, ${state.R} inmunes`,
      );

      const tagsHtml = [
        isOrigin
          ? '<i class="pin-tag origin" title="Paciente Cero">P0</i>'
          : "",
        hasVax ? '<i class="pin-tag vax" title="Vacunación">💉</i>' : "",
        hasFum ? '<i class="pin-tag fum" title="Fumigación">🌫️</i>' : "",
        hasCord ? '<i class="pin-tag cord" title="Cordón sanitario">🚧</i>' : "",
      ]
        .filter(Boolean)
        .join("");

      const metricText =
        layer === "protection"
          ? `${state.R.toLocaleString("es-EC")} INM`
          : state.I > 0
            ? `${state.I.toLocaleString("es-EC")} INF`
            : "0 INF";

      const detailHtml = isSelected
        ? `<span class="pin-detail">${state.S.toLocaleString("es-EC")} susc. · ${state.R.toLocaleString("es-EC")} inm.</span>`
        : "";

      entry.btnEl.innerHTML = `
        <span class="pin-header">
          <span class="pin-dot"></span>
          <b class="pin-id">${node.id === "N04" ? "✚" : node.id}</b>
          <span class="pin-name">${SHORT_NAMES[node.id]}</span>
          <span class="pin-badge">${metricText}</span>
          ${tagsHtml ? `<span class="pin-tags">${tagsHtml}</span>` : ""}
        </span>
        ${detailHtml}
      `;
    }
  }, [snapshot, selectedNode, orders, layer, patientZeroId]);

  // Smooth camera focus when selectedNode changes (without losing zoom context)
  const isFirstSelectionRef = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (isFirstSelectionRef.current) {
      isFirstSelectionRef.current = false;
      return;
    }
    const target = NODE_MAP[selectedNode];
    if (!target) return;

    map.easeTo({
      center: [target.lng, target.lat],
      duration: 650,
      essential: true,
    });
  }, [selectedNode, mapReady]);

  // Optional 360° Tactical Camera Orbit
  useEffect(() => {
    if (!isOrbiting || !mapReady) return;
    let rafId = 0;
    const rotate = () => {
      const map = mapRef.current;
      if (map) {
        map.rotateTo((map.getBearing() + 0.16) % 360, { duration: 0 });
      }
      rafId = requestAnimationFrame(rotate);
    };
    rafId = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(rafId);
  }, [isOrbiting, mapReady]);

  // 60fps Holographic 3D Overlay: Parabolic Contagion Arcs, Quarantine Domes & Bio-Pulses
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map || !mapReady) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let rafId = 0;
    const startTime = performance.now();

    const renderOverlay = (now: number) => {
      const elapsed = (now - startTime) * 0.001;
      const mapCanvas = map.getCanvas();
      const width = mapCanvas.clientWidth;
      const height = mapCanvas.clientHeight;

      if (width > 0 && height > 0) {
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(width * dpr);
        const targetH = Math.round(height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, width, height);

          const snap = snapshotRef.current;
          const activeOrders = ordersRef.current;
          const selId = selectedNodeRef.current;
          const pitchFactor = Math.max(0.2, map.getPitch() / 62);
          const zoomScale = Math.pow(2, Math.max(-1, map.getZoom() - 13));

          // Update dynamic stem height CSS variable on the map container so labels sit cleanly above 3D towers
          const stemPx = Math.round(14 + 26 * pitchFactor * Math.min(1.35, zoomScale));
          containerRef.current?.style.setProperty("--pin-stem-h", `${stemPx}px`);

          // 1. Draw 3D Parabolic Arcs & Contagion Particles between Manta Zones
          for (let i = 0; i < MANTA_EDGES.length; i++) {
            const edge = MANTA_EDGES[i];
            const srcNode = NODE_MAP[edge.source];
            const tgtNode = NODE_MAP[edge.target];
            const p1 = map.project([srcNode.lng, srcNode.lat]);
            const p2 = map.project([tgtNode.lng, tgtNode.lat]);

            const isClosed =
              snap.action.cordonedEdges.includes(edge.id) ||
              activeOrders.some(
                (o) =>
                  o.kind === "cordon" &&
                  (o.nodeId === edge.source || o.nodeId === edge.target),
              );

            const touchesSelected =
              edge.source === selId || edge.target === selId;
            const srcI = snap.nodes[edge.source]?.I ?? 0;
            const tgtI = snap.nodes[edge.target]?.I ?? 0;
            const infectedFlow = srcI + tgtI;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 10 || dist > 1800) continue;

            const arcLift = Math.min(85, dist * 0.24) * pitchFactor;
            const cx = (p1.x + p2.x) * 0.5;
            const cy = (p1.y + p2.y) * 0.5 - arcLift;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);

            if (isClosed) {
              ctx.strokeStyle = "rgba(128, 224, 188, 0.78)";
              ctx.lineWidth = 2;
              ctx.setLineDash([4, 5]);
              ctx.stroke();
              ctx.setLineDash([]);
            } else if (infectedFlow > 0 || touchesSelected) {
              ctx.strokeStyle =
                infectedFlow > 0
                  ? touchesSelected
                    ? "rgba(245, 138, 114, 0.72)"
                    : "rgba(245, 138, 114, 0.38)"
                  : "rgba(177, 223, 200, 0.35)";
              ctx.lineWidth = touchesSelected ? 1.9 : 1.3;
              ctx.stroke();

              // Animated pathogen pulses traveling along infected 3D arcs
              if (infectedFlow > 0 && !prefersReducedMotion) {
                const dir = srcI >= tgtI ? 1 : -1;
                const speed = 0.26 + edge.weight * 0.5;
                const tRaw = (elapsed * speed + i * 0.17) % 1;
                const t = dir === 1 ? tRaw : 1 - tRaw;
                const invT = 1 - t;
                const px =
                  invT * invT * p1.x + 2 * invT * t * cx + t * t * p2.x;
                const py =
                  invT * invT * p1.y + 2 * invT * t * cy + t * t * p2.y;

                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fillStyle = "#ff967d";
                ctx.shadowColor = "#f58a72";
                ctx.shadowBlur = 7;
                ctx.fill();
                ctx.shadowBlur = 0;
              }
            }
          }

          // 2. Draw 3D Holographic Domes, Shields & Target Reticles over Nodes
          for (const node of MANTA_NODES) {
            const pt = map.project([node.lng, node.lat]);
            if (
              pt.x < -100 ||
              pt.x > width + 100 ||
              pt.y < -100 ||
              pt.y > height + 100
            ) {
              continue;
            }

            const nState = snap.nodes[node.id];
            const nodeOrders = activeOrders.filter((o) => o.nodeId === node.id);
            const hasCordon =
              nodeOrders.some((o) => o.kind === "cordon") ||
              nState.cordonedToday;
            const hasFumigate =
              nodeOrders.some((o) => o.kind === "fumigate") ||
              nState.fumigatedToday;
            const hasVaccine =
              nodeOrders.some((o) => o.kind === "vaccine") ||
              nState.vaccinatedToday > 0;
            const isSel = node.id === selId;

            const baseR = Math.min(58, Math.max(18, 24 * zoomScale));
            const squashY = Math.max(0.45, 1 - pitchFactor * 0.45);

            // Selected Node 3D Ground Target Reticle
            if (isSel) {
              ctx.save();
              ctx.translate(pt.x, pt.y);
              ctx.scale(1, squashY);
              ctx.rotate(prefersReducedMotion ? 0 : elapsed * 0.55);
              ctx.strokeStyle = "rgba(177, 223, 200, 0.85)";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.arc(0, 0, baseR * 1.15, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }

            // 3D Geodesic Quarantine Dome for Sanitary Cordon
            if (hasCordon) {
              const domeR = baseR * 1.22;
              const domeH = domeR * (0.7 + pitchFactor * 0.3);

              ctx.save();
              ctx.strokeStyle = "rgba(128, 224, 188, 0.7)";
              ctx.fillStyle = "rgba(128, 224, 188, 0.08)";
              ctx.lineWidth = 1.3;

              ctx.beginPath();
              ctx.ellipse(
                pt.x,
                pt.y,
                domeR,
                domeR * squashY,
                0,
                0,
                Math.PI * 2,
              );
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(pt.x - domeR, pt.y);
              ctx.quadraticCurveTo(
                pt.x,
                pt.y - domeH * 1.35,
                pt.x + domeR,
                pt.y,
              );
              ctx.fill();
              ctx.stroke();
              ctx.restore();
            }

            // 3D Bio-Mist Dispersion Ring for Fumigation
            if (hasFumigate) {
              const pulse = prefersReducedMotion ? 0.5 : (elapsed * 0.7) % 1;
              const ringR = baseR * (0.65 + pulse * 0.65);
              ctx.save();
              ctx.translate(pt.x, pt.y - 12 * pitchFactor);
              ctx.scale(1, squashY);
              ctx.strokeStyle = `rgba(211, 188, 128, ${0.75 * (1 - pulse)})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(0, 0, ringR, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }

            // 3D Rising Immunization Shield Ring for Vaccination
            if (hasVaccine) {
              const pulse = prefersReducedMotion
                ? 0.4
                : (elapsed * 0.85 + 0.3) % 1;
              const lift = pulse * 44 * pitchFactor;
              ctx.save();
              ctx.translate(pt.x, pt.y - lift);
              ctx.scale(1, squashY);
              ctx.strokeStyle = `rgba(177, 223, 200, ${0.85 * (1 - pulse)})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(0, 0, baseR * 0.7, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }
          }

          ctx.restore();
        }
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(renderOverlay);
      }
    };

    rafId = requestAnimationFrame(renderOverlay);
    const onMapMove = () => {
      if (prefersReducedMotion) {
        renderOverlay(performance.now());
      }
    };
    map.on("move", onMapMove);

    return () => {
      cancelAnimationFrame(rafId);
      map.off("move", onMapMove);
    };
  }, [mapReady]);

  const handleOrbitalDive = () => {
    const map = mapRef.current;
    if (!map) return;
    setIsOrbiting(false);
    map.flyTo({
      center: MANTA_CENTER,
      zoom: 6.2,
      pitch: 12,
      bearing: 0,
      duration: 950,
      essential: true,
    });
    window.setTimeout(() => {
      map.flyTo({
        center: MANTA_CENTER,
        zoom: 13.15,
        pitch: 58,
        bearing: -18,
        duration: 2100,
        essential: true,
      });
      setIsPitched(true);
    }, 1000);
  };

  const handleResetView = () => {
    const map = mapRef.current;
    if (!map) return;
    setIsOrbiting(false);
    map.flyTo({
      center: MANTA_CENTER,
      zoom: 13.15,
      pitch: 58,
      bearing: -18,
      duration: 850,
      essential: true,
    });
    setIsPitched(true);
  };

  const handleTogglePitch = () => {
    const map = mapRef.current;
    if (!map) return;
    const nextPitch = isPitched ? 0 : 58;
    setIsPitched(!isPitched);
    map.easeTo({
      pitch: nextPitch,
      bearing: isPitched ? 0 : -18,
      duration: 650,
    });
  };

  return (
    <section
      className="city-map earth-3d-map"
      aria-label="Mapa 3D satelital e interactivo de Manta"
    >
      {/* MapLibre 3D WebGL Surface */}
      <div ref={containerRef} className="earth-webgl-viewport" />

      {/* Synchronized 60fps 3D Holographic Overlay (Arcs, Quarantine Domes, Pulses) */}
      <canvas
        ref={overlayCanvasRef}
        className="earth-hologram-canvas"
        aria-hidden="true"
      />

      {/* Top-Left Theater Heading */}
      <div className="map-heading">
        <span className="eyebrow">
          GEODATA 3D ·{" "}
          {styleMode === "satellite" ? "SATÉLITE REAL" : "VECTORIAL 3D"}
        </span>
        <h2>
          Manta, Ecuador <span>00°57&apos;S / 80°43&apos;O · RELIEVE 3D</span>
        </h2>
      </div>

      {/* Top-Right Layer & 3D Mode Switcher */}
      <div className="earth-top-controls">
        <div className="map-layers" aria-label="Modo de visualización del mapa">
          <button
            className={styleMode === "satellite" ? "active" : ""}
            onClick={() => onChangeStyleMode("satellite")}
            title="Imagen satelital tipo Google Earth con edificios y modelos 3D"
          >
            <Globe size={11} />
            3D Satélite
          </button>
          <button
            className={styleMode === "tactical3d" ? "active" : ""}
            onClick={() => onChangeStyleMode("tactical3d")}
            title="Ciudad 3D vectorial nocturna"
          >
            <Layers size={11} />
            3D Ciudad
          </button>
          <button
            onClick={onSwitchTo2D}
            title="Cambiar al mapa esquemático 2D SVG"
          >
            <MapIcon size={11} />
            2D Táctico
          </button>
        </div>

        <div className="map-layers" aria-label="Capas epidemiológicas">
          <button
            className={layer === "infection" ? "active" : ""}
            onClick={() => setLayer("infection")}
          >
            Contagios
          </button>
          <button
            className={layer === "protection" ? "active" : ""}
            onClick={() => setLayer("protection")}
          >
            Protección
          </button>
        </div>
      </div>

      {/* Right Camera & 3D Orbit Controls */}
      <div className="map-zoom earth-camera-controls">
        <button
          aria-label="Acercar cámara 3D"
          title="Acercar"
          onClick={() => mapRef.current?.zoomIn({ duration: 300 })}
        >
          <Plus size={15} />
        </button>
        <button
          aria-label="Alejar cámara 3D"
          title="Alejar"
          onClick={() => mapRef.current?.zoomOut({ duration: 300 })}
        >
          <Minus size={15} />
        </button>
        <button
          aria-label="Restablecer vista 3D de Manta"
          title="Centrar en Manta 3D"
          onClick={handleResetView}
        >
          <Crosshair size={15} />
        </button>
        <button
          aria-label="Alternar inclinación 3D"
          title={isPitched ? "Cambiar a vista cenital" : "Inclinación 3D (58°)"}
          className={isPitched ? "active-cam" : ""}
          onClick={handleTogglePitch}
        >
          <Compass size={15} />
        </button>
        <button
          aria-label="Orbitar cámara 360 grados"
          title="Rotación orbital 360° automática"
          className={isOrbiting ? "active-cam" : ""}
          onClick={() => setIsOrbiting((o) => !o)}
        >
          <Orbit size={15} />
        </button>
        <button
          aria-label="Vuelo orbital hacia Manta"
          title="Inmersión satelital hacia Manta"
          onClick={handleOrbitalDive}
        >
          <Globe size={15} />
        </button>
      </div>

      {/* Active Orders 3D HUD Pill */}
      {orders.length > 0 && (
        <div className="earth-orders-hud" aria-live="polite">
          <span>DESPLIEGUE 3D EN COLA:</span>
          {orders.map((o) => (
            <b key={`${o.nodeId}-${o.kind}`} className={`hud-tag ${o.kind}`}>
              {o.kind === "vaccine" && <ShieldPlus size={11} />}
              {o.kind === "fumigate" && <SprayCan size={11} />}
              {o.kind === "cordon" && <ShieldCheck size={11} />}
              {SHORT_NAMES[o.nodeId]}
            </b>
          ))}
        </div>
      )}

      <div className="map-scale">
        <span />2 km
        <small>Relieve AWS DEM · Ortofoto Satelital · Modelos 3D</small>
      </div>

      <div className="map-legend">
        <span>
          <i className="dot coral" />
          Torre 3D / Brote activo
        </span>
        <span>
          <i className="dot mint" />
          Domo Cordón / Brigada 3D
        </span>
        <span className="map-count">
          {affected} / 16 zonas afectadas · Clic derecho + arrastrar para rotar 3D
        </span>
      </div>
    </section>
  );
}
