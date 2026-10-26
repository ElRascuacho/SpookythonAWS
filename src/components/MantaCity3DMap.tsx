import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { CityNode, DailyCitySnapshot, StrategyType } from '../domain/types';
import { MANTA_EDGES, MANTA_NODES, NODE_MAP } from '../domain/mantaGraph';
import { Crosshair, Compass, Eye, Layers, ShieldAlert, Sparkles } from 'lucide-react';

interface MantaCity3DMapProps {
  snapshot: DailyCitySnapshot;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  patientZeroIds: string[];
  onTogglePatientZero: (nodeId: string) => void;
  activeStrategy: StrategyType;
  onChangeStrategy: (strategy: StrategyType) => void;
}

type HeightMode = 'ACTIVE_CASES' | 'POPULATION_IMMUNITY';

/**
 * Generates an octagonal 3D footprint polygon around (lng, lat) with radius in meters.
 */
function createOctagonPolygon(lng: number, lat: number, radiusMeters: number, sides = 12): number[][][] {
  const coords: number[][] = [];
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);

  for (let i = 0; i <= sides; i++) {
    const angle = (i * 2 * Math.PI) / sides;
    const dLng = (radiusMeters * Math.cos(angle)) / metersPerDegLng;
    const dLat = (radiusMeters * Math.sin(angle)) / metersPerDegLat;
    coords.push([lng + dLng, lat + dLat]);
  }
  return [coords];
}

/**
 * Computes tactical RGB hex color for a node based on its S, E, I, R ratios.
 */
function getNodeStatusColor(node: CityNode, s: number, e: number, i: number, r: number): string {
  const pop = Math.max(1, node.population);
  const zombieRatio = i / pop;
  const exposedRatio = e / pop;
  const immuneRatio = r / pop;

  if (zombieRatio >= 0.06) return '#ff1e42'; // Neon Crimson (Critical Zombie Outbreak)
  if (zombieRatio >= 0.02) return '#f97316'; // Bright Orange-Red (Active Contagion)
  if (zombieRatio >= 0.004 || exposedRatio >= 0.015) return '#f59e0b'; // Amber Alert (Incubating)
  if (immuneRatio >= 0.35) return '#06b6d4'; // Cyan Shield (High Immunization / Exorcised)
  return '#10b981'; // Emerald Green (Healthy / Controlled)
}

export const MantaCity3DMap: React.FC<MantaCity3DMapProps> = ({
  snapshot,
  selectedNodeId,
  onSelectNode,
  patientZeroIds,
  onTogglePatientZero,
  activeStrategy,
  onChangeStrategy,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [heightMode, setHeightMode] = useState<HeightMode>('ACTIVE_CASES');

  const selectedNode = NODE_MAP[selectedNodeId] ?? MANTA_NODES[0];
  const selectedNodeSnap = snapshot.nodes[selectedNode.id];

  // Build GeoJSON for 3D Node Towers & Ground Vector Halos
  const { nodesGeoJson, halosGeoJson, edgesGeoJson } = useMemo(() => {
    const cordonedEdgesSet = new Set(snapshot.action.cordonedEdges);
    const cordonedNodesSet = new Set(snapshot.action.cordonedNodes);

    const nodeFeatures = MANTA_NODES.map((node) => {
      const nSnap = snapshot.nodes[node.id] ?? {
        S: node.population,
        E: 0,
        I: 0,
        R: 0,
        vectorIndex: node.baseVectorRisk,
        vaccinatedToday: 0,
        fumigatedToday: false,
        cordonedToday: false,
      };

      const activeCases = nSnap.I + nSnap.E;
      const color = getNodeStatusColor(node, nSnap.S, nSnap.E, nSnap.I, nSnap.R);

      // Compute 3D cylinder extrusion height in meters
      const heightMeters =
        heightMode === 'ACTIVE_CASES'
          ? Math.min(1800, 65 + activeCases * 0.42 + nSnap.I * 0.65)
          : Math.min(1600, 80 + (nSnap.R / node.population) * 950 + (node.population / 35000) * 320);

      const isSelected = node.id === selectedNodeId;
      const radius = isSelected ? 195 : 155;

      return {
        type: 'Feature' as const,
        properties: {
          id: node.id,
          name: node.name,
          color,
          height: Math.round(heightMeters),
          base: 0,
          isSelected: isSelected ? 1 : 0,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: createOctagonPolygon(node.lng, node.lat, radius, 14),
        },
      };
    });

    const haloFeatures = MANTA_NODES.map((node) => {
      const nSnap = snapshot.nodes[node.id];
      const vIdx = nSnap ? nSnap.vectorIndex : node.baseVectorRisk;
      const isCordoned = cordonedNodesSet.has(node.id);
      const isPatientZero = patientZeroIds.includes(node.id);
      const radius = 260 + vIdx * 180;

      let haloColor = '#a855f7'; // Necro-Dengue violet vector halo
      if (isCordoned) haloColor = '#38bdf8'; // Cordon Sanitario cyan perimeter
      else if (isPatientZero && snapshot.day <= 3) haloColor = '#f43f5e';

      return {
        type: 'Feature' as const,
        properties: {
          id: node.id,
          haloColor,
          opacity: isCordoned ? 0.55 : Math.max(0.14, vIdx * 0.45),
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: createOctagonPolygon(node.lng, node.lat, radius, 20),
        },
      };
    });

    const edgeFeatures = MANTA_EDGES.map((edge) => {
      const srcNode = NODE_MAP[edge.source];
      const tgtNode = NODE_MAP[edge.target];
      const srcSnap = snapshot.nodes[edge.source];
      const tgtSnap = snapshot.nodes[edge.target];

      const isCordoned =
        cordonedEdgesSet.has(edge.id) ||
        cordonedNodesSet.has(edge.source) ||
        cordonedNodesSet.has(edge.target);

      const zombieFlow =
        ((srcSnap?.I ?? 0) / srcNode.population + (tgtSnap?.I ?? 0) / tgtNode.population) *
        edge.weight;

      let edgeColor = '#334155';
      let lineWidth = 2 + edge.weight * 8;

      if (isCordoned) {
        edgeColor = '#38bdf8'; // Sanitary Cordon active (Cyan)
        lineWidth = 3.5;
      } else if (zombieFlow > 0.012) {
        edgeColor = '#ff1e42'; // High zombie transmission corridor
        lineWidth = 4 + edge.weight * 12;
      } else if (zombieFlow > 0.002) {
        edgeColor = '#f59e0b'; // Moderate contagion corridor
        lineWidth = 3 + edge.weight * 9;
      } else {
        edgeColor = '#10b981'; // Controlled green transit corridor
      }

      return {
        type: 'Feature' as const,
        properties: {
          id: edge.id,
          routeLabel: edge.routeLabel,
          edgeColor,
          lineWidth,
          isCordoned: isCordoned ? 1 : 0,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [srcNode.lng, srcNode.lat],
            [tgtNode.lng, tgtNode.lat],
          ],
        },
      };
    });

    return {
      nodesGeoJson: {
        type: 'FeatureCollection' as const,
        features: nodeFeatures,
      },
      halosGeoJson: {
        type: 'FeatureCollection' as const,
        features: haloFeatures,
      },
      edgesGeoJson: {
        type: 'FeatureCollection' as const,
        features: edgeFeatures,
      },
    };
  }, [snapshot, selectedNodeId, heightMode, patientZeroIds]);

  // Initialize 3D MapLibre GL JS Map centered on Manta
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [-80.7225, -0.9565],
      zoom: 13.1,
      pitch: 60,
      bearing: -22,
      maxPitch: 78,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      // Enhance 3D buildings if vector tile source exists
      const style = map.getStyle();
      const openMapTilesSource = Object.keys(style.sources || {}).find(
        (s) => s.includes('openmaptiles') || s.includes('ne2') || style.sources[s].type === 'vector',
      );

      if (openMapTilesSource && !map.getLayer('manta-3d-buildings')) {
        try {
          map.addLayer({
            id: 'manta-3d-buildings',
            source: openMapTilesSource,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': '#1e293b',
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'render_height'],
                ['get', 'height'],
                14,
              ],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.72,
            },
          });
        } catch {
          // Ignore if vector source schema differs
        }
      }

      // 1. Ground Vector & Cordon Halo Layer
      map.addSource('manta-halos', {
        type: 'geojson',
        data: halosGeoJson,
      });

      map.addLayer({
        id: 'manta-halos-fill',
        type: 'fill',
        source: 'manta-halos',
        paint: {
          'fill-color': ['get', 'haloColor'],
          'fill-opacity': ['get', 'opacity'],
        },
      });

      // 2. Urban Graph Edges (Outer Glow + Core Line)
      map.addSource('manta-edges', {
        type: 'geojson',
        data: edgesGeoJson,
      });

      map.addLayer({
        id: 'manta-edges-glow',
        type: 'line',
        source: 'manta-edges',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'edgeColor'],
          'line-width': ['*', ['get', 'lineWidth'], 2.4],
          'line-opacity': 0.25,
          'line-blur': 4,
        },
      });

      map.addLayer({
        id: 'manta-edges-core',
        type: 'line',
        source: 'manta-edges',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'edgeColor'],
          'line-width': ['get', 'lineWidth'],
          'line-opacity': 0.9,
        },
      });

      // 3. 3D Extruded Node Columns (SEIR-V State Towers)
      map.addSource('manta-nodes-3d', {
        type: 'geojson',
        data: nodesGeoJson,
      });

      map.addLayer({
        id: 'manta-nodes-extrusion',
        type: 'fill-extrusion',
        source: 'manta-nodes-3d',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.92,
        },
      });

      // Click handler on 3D node towers
      map.on('click', 'manta-nodes-extrusion', (e) => {
        const feature = e.features?.[0];
        const clickedId = feature?.properties?.id;
        if (clickedId) {
          onSelectNode(String(clickedId));
        }
      });

      map.on('mouseenter', 'manta-nodes-extrusion', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'manta-nodes-extrusion', () => {
        map.getCanvas().style.cursor = '';
      });

      setMapLoaded(true);
    });

    // Create interactive HUD Markers for all 16 Manta Nodes
    for (const node of MANTA_NODES) {
      const el = document.createElement('div');
      el.className = 'cursor-pointer select-none transition-transform duration-150';
      el.onclick = (ev) => {
        ev.stopPropagation();
        onSelectNode(node.id);
      };

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
        offset: [0, -14],
      })
        .setLngLat([node.lng, node.lat])
        .addTo(map);

      markersRef.current[node.id] = { marker, el };
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update GeoJSON sources smoothly on day / strategy / parameter change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const nodesSource = map.getSource('manta-nodes-3d') as maplibregl.GeoJSONSource | undefined;
    if (nodesSource) nodesSource.setData(nodesGeoJson);

    const halosSource = map.getSource('manta-halos') as maplibregl.GeoJSONSource | undefined;
    if (halosSource) halosSource.setData(halosGeoJson);

    const edgesSource = map.getSource('manta-edges') as maplibregl.GeoJSONSource | undefined;
    if (edgesSource) edgesSource.setData(edgesGeoJson);
  }, [nodesGeoJson, halosGeoJson, edgesGeoJson, mapLoaded]);

  // Update floating 3D node HUD badges
  useEffect(() => {
    for (const node of MANTA_NODES) {
      const entry = markersRef.current[node.id];
      if (!entry) continue;

      const nSnap = snapshot.nodes[node.id];
      const isSelected = node.id === selectedNodeId;
      const isPatientZero = patientZeroIds.includes(node.id);
      const zombies = nSnap?.I ?? 0;
      const vaxToday = (nSnap?.vaccinatedToday ?? 0) > 0;
      const fumToday = nSnap?.fumigatedToday ?? false;
      const cordToday = nSnap?.cordonedToday ?? false;

      const badgeIcons = [
        isPatientZero ? '☣️' : '',
        cordToday ? '🚧' : '',
        vaxToday ? '💉' : '',
        fumToday ? '🌫️' : '',
      ]
        .filter(Boolean)
        .join('');

      const borderClass = isSelected
        ? 'border-emerald-400 ring-2 ring-emerald-400/50 bg-slate-900/95 scale-110 z-30'
        : zombies > 250
          ? 'border-rose-500/80 bg-slate-950/90'
          : zombies > 30
            ? 'border-amber-500/80 bg-slate-950/85'
            : 'border-slate-700/80 bg-slate-950/80';

      entry.el.innerHTML = `
        <div class="px-2 py-1 rounded-md border ${borderClass} shadow-lg backdrop-blur-sm flex items-center gap-1.5 text-[11px] font-medium text-slate-100 whitespace-nowrap">
          <span class="font-mono text-[10px] text-slate-400">${node.id}</span>
          <span class="truncate max-w-[105px]">${node.name.split('(')[0].trim()}</span>
          <span class="px-1 rounded text-[10px] font-mono ${
            zombies > 0 ? 'bg-rose-500/25 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
          }">${zombies > 0 ? `🔴${zombies}` : '🟢Sano'}</span>
          ${badgeIcons ? `<span class="text-xs">${badgeIcons}</span>` : ''}
        </div>
      `;
    }
  }, [snapshot, selectedNodeId, patientZeroIds]);

  const handleFlyToMantaOverview = () => {
    mapRef.current?.flyTo({
      center: [-80.7225, -0.9565],
      zoom: 13.1,
      pitch: 62,
      bearing: -22,
      duration: 1200,
    });
  };

  const handleFocusNode = (node: CityNode) => {
    onSelectNode(node.id);
    mapRef.current?.flyTo({
      center: [node.lng, node.lat],
      zoom: 14.3,
      pitch: 65,
      bearing: -15,
      duration: 900,
    });
  };

  const isSelectedPatientZero = patientZeroIds.includes(selectedNode.id);

  return (
    <div className="relative w-full h-full min-h-[520px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {/* MapLibre 3D WebGL Viewport */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top-Left Tactical Camera & Strategy Switcher Overlay */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-1 flex items-center gap-1 shadow-xl">
          {(
            [
              { id: 'NO_INTERVENTION', label: '🔴 Sin Intervención', activeCls: 'bg-rose-600 text-white' },
              { id: 'RANDOM', label: '🟡 Azar ($1k/d)', activeCls: 'bg-amber-500 text-slate-950 font-semibold' },
              {
                id: 'SMART_CORTAFUEGOS',
                label: '🟢 Smart Cortafuegos',
                activeCls: 'bg-emerald-500 text-slate-950 font-semibold',
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChangeStrategy(tab.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                activeStrategy === tab.id
                  ? tab.activeCls
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-1 flex items-center gap-1 shadow-xl">
          <button
            onClick={() =>
              setHeightMode((m) => (m === 'ACTIVE_CASES' ? 'POPULATION_IMMUNITY' : 'ACTIVE_CASES'))
            }
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            title="Alternar qué representa la altura de las torres 3D"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Altura 3D: {heightMode === 'ACTIVE_CASES' ? 'Amenaza Zombie (I+E)' : 'Escudo Inmune (R)'}
            </span>
          </button>
          <button
            onClick={handleFlyToMantaOverview}
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
            title="Restaurar cámara panorámica 3D de Manta"
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>Vista Manta 3D</span>
          </button>
        </div>
      </div>

      {/* Bottom-Left Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-10 bg-slate-950/90 backdrop-blur-md border border-slate-800/90 rounded-xl px-3 py-2 text-[11px] text-slate-300 flex flex-wrap items-center gap-3 shadow-xl pointer-events-auto">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Sano (S)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Mordido (E)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Zombie (I)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Inmunizado/Exorcizado (R)
        </span>
        <span className="text-slate-500">|</span>
        <span>🚧 Cordón</span>
        <span>💉 Vacunación</span>
        <span>🌫️ Fumigación</span>
      </div>

      {/* Top-Right Selected Node 3D Inspector + One-Click Patient Zero Selector */}
      {selectedNode && selectedNodeSnap && (
        <div className="absolute top-16 right-3 z-10 w-80 bg-slate-950/92 backdrop-blur-md border border-slate-800 rounded-2xl p-3.5 shadow-2xl pointer-events-auto">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-emerald-400">
                  {selectedNode.id}
                </span>
                <span className="text-[11px] text-slate-400">{selectedNode.category}</span>
              </div>
              <h3 className="text-sm font-bold text-white mt-0.5">{selectedNode.name}</h3>
            </div>
            <button
              onClick={() => handleFocusNode(selectedNode)}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 cursor-pointer"
              title="Enfocar cámara 3D en este barrio"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
            {selectedNode.roleDescription}
          </p>

          {/* Compartment Breakdown in Selected Node */}
          <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
            <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-1.5">
              <div className="text-[10px] text-emerald-300">Sanos (S)</div>
              <div className="text-xs font-mono font-bold text-emerald-400">
                {selectedNodeSnap.S.toLocaleString()}
              </div>
            </div>
            <div className="bg-amber-950/40 border border-amber-800/40 rounded-lg p-1.5">
              <div className="text-[10px] text-amber-300">Mordidos (E)</div>
              <div className="text-xs font-mono font-bold text-amber-400">
                {selectedNodeSnap.E.toLocaleString()}
              </div>
            </div>
            <div className="bg-rose-950/50 border border-rose-800/50 rounded-lg p-1.5">
              <div className="text-[10px] text-rose-300">Zombies (I)</div>
              <div className="text-xs font-mono font-bold text-rose-400">
                {selectedNodeSnap.I.toLocaleString()}
              </div>
            </div>
            <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg p-1.5">
              <div className="text-[10px] text-cyan-300">Inmunes (R)</div>
              <div className="text-xs font-mono font-bold text-cyan-400">
                {selectedNodeSnap.R.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Graph Metrics & Vector Index */}
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-300 bg-slate-900/70 rounded-lg px-2.5 py-1.5 border border-slate-800/80">
            <span>
              Centralidad: <strong className="text-emerald-400">{(selectedNode.betweenness * 100).toFixed(0)}%</strong>
            </span>
            <span>
              Vector Dengue:{' '}
              <strong className="text-purple-400">{(selectedNodeSnap.vectorIndex * 100).toFixed(0)}%</strong>
            </span>
          </div>

          {/* Active Daily Interventions in this Node */}
          {(selectedNodeSnap.vaccinatedToday > 0 ||
            selectedNodeSnap.fumigatedToday ||
            selectedNodeSnap.cordonedToday) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              {selectedNodeSnap.cordonedToday && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  🚧 Cordón Sanitario Activo
                </span>
              )}
              {selectedNodeSnap.vaccinatedToday > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  💉 +{selectedNodeSnap.vaccinatedToday} Inmunizados Hoy
                </span>
              )}
              {selectedNodeSnap.fumigatedToday && (
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  🌫️ Brigada Fumigación (-80% Vector)
                </span>
              )}
            </div>
          )}

          {/* One-Click Patient Zero Toggle for Jury Surprise Outbreak */}
          <button
            onClick={() => onTogglePatientZero(selectedNode.id)}
            className={`mt-3 w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isSelectedPatientZero
                ? 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-lg shadow-rose-600/25'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isSelectedPatientZero ? (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>☣️ Foco Paciente Cero Activo (Clic para quitar)</span>
              </>
            ) : (
              <>
                <Crosshair className="w-4 h-4 text-rose-400" />
                <span>Marcar como Paciente Cero del Brote</span>
              </>
            )}
          </button>

          {/* Quick Node Selector Dropdown */}
          <div className="mt-2">
            <select
              value={selectedNode.id}
              onChange={(e) => {
                const targetNode = NODE_MAP[e.target.value];
                if (targetNode) handleFocusNode(targetNode);
              }}
              aria-label="Seleccionar barrio de Manta"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              {MANTA_NODES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} — {n.name} ({n.population.toLocaleString()} hab.)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
