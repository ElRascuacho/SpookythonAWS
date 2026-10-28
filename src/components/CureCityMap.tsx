import { useEffect, useId, useState } from "react";
import { Crosshair, Globe, Layers, Map as MapIcon, Minus, Plus } from "lucide-react";
import { MANTA_EDGES, MANTA_NODES } from "../domain/mantaGraph";
import type { DailyCitySnapshot } from "../domain/types";
import type { Order } from "../domain/cureGame";
import { TRAFFIC_VEHICLES } from "../domain/traffic";

const POSITIONS: Record<string, [number, number]> = {
  N01: [645, 350],
  N02: [690, 238],
  N03: [308, 360],
  N04: [380, 480],
  N05: [800, 455],
  N06: [420, 225],
  N07: [520, 285],
  N08: [685, 520],
  N09: [815, 305],
  N10: [110, 480],
  N11: [230, 330],
  N12: [550, 400],
  N13: [900, 385],
  N14: [410, 355],
  N15: [525, 155],
  N16: [850, 590],
};
const NAMES: Record<string, string> = {
  N01: "TARQUI",
  N02: "PLAYITA MÍA",
  N03: "ULEAM",
  N04: "HOSPITAL R. ZAMBRANO",
  N05: "TERMINAL TERRESTRE",
  N06: "EL MURCIÉLAGO",
  N07: "CENTRO",
  N08: "ELOY ALFARO",
  N09: "LOS ESTEROS",
  N10: "SAN MATEO",
  N11: "BARBASQUILLO",
  N12: "COLEGIO MANTA",
  N13: "ZONA INDUSTRIAL",
  N14: "UMIÑA",
  N15: "PUERTO DE MANTA",
  N16: "URBIRRÍOS",
};
const LAND =
  "M-20 440 L80 414 L155 370 L210 315 L290 284 L340 235 L400 218 L455 160 L485 128 L545 124 L565 180 L650 202 L725 174 L820 141 L980 100 L980 700 L-20 700Z";
const BLOCKS = Array.from({ length: 450 }, (_, i) => ({
  x: (i % 30) * 35 - 12 + (Math.floor(i / 30) % 2) * 9,
  y: Math.floor(i / 30) * 35 + 128,
  w: 17 + ((i * 7) % 11),
  h: 14 + ((i * 3) % 11),
}));
const ROAD_PATHS = [
  "M0 550Q270 510 340 440T680 410T960 270",
  "M200 670Q300 460 500 380T960 190",
  "M470 670Q510 490 620 350T700 120",
  "M0 595Q400 565 960 540",
];

interface Props {
  snapshot: DailyCitySnapshot;
  selectedNode: string;
  onSelect: (nodeId: string) => void;
  orders: Order[];
  onSwitchTo3D?: (mode: "satellite" | "tactical3d") => void;
}

export function CureCityMap({
  snapshot,
  selectedNode,
  onSelect,
  orders,
  onSwitchTo3D,
}: Props) {
  const [layer, setLayer] = useState<"infection" | "protection">("infection");
  const [zoom, setZoom] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const trafficId = useId().replaceAll(":", "");
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const affected = MANTA_NODES.filter(
    (node) => snapshot.nodes[node.id].I > 0,
  ).length;
  return (
    <section className="city-map" aria-label="Mapa interactivo de Manta">
      <div className="map-heading">
        <span className="eyebrow">TEATRO DE OPERACIONES · 2D</span>
        <h2>
          Manta, Ecuador <span>01° S / 80° O</span>
        </h2>
      </div>
      <div className="earth-top-controls">
        {onSwitchTo3D && (
          <div className="map-layers" aria-label="Modo de visualización del mapa">
            <button
              onClick={() => onSwitchTo3D("satellite")}
              title="Cambiar a vista 3D Satélite tipo Google Earth"
            >
              <Globe size={11} />
              3D Satélite
            </button>
            <button
              onClick={() => onSwitchTo3D("tactical3d")}
              title="Cambiar a Ciudad 3D vectorial"
            >
              <Layers size={11} />
              3D Ciudad
            </button>
            <button className="active">
              <MapIcon size={11} />
              2D Táctico
            </button>
          </div>
        )}
        <div className="map-layers" aria-label="Capas del mapa">
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
      <svg
        viewBox="0 0 960 670"
        className="city-svg"
        aria-label="16 zonas de Manta. Selecciona una para enviar brigadas."
      >
        <defs>
          <pattern
            id="ocean-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="#567f89"
              strokeOpacity=".08"
            />
          </pattern>
          <pattern
            id="ocean-lines"
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-35)"
          >
            <path d="M0 0V14" stroke="#244752" strokeWidth=".5" />
          </pattern>
          <radialGradient id="ocean">
            <stop stopColor="#15333e" />
            <stop offset="1" stopColor="#0b1b23" />
          </radialGradient>
          <radialGradient id="infection-glow">
            <stop stopColor="#ff745c" stopOpacity=".25" />
            <stop offset="1" stopColor="#ff745c" stopOpacity="0" />
          </radialGradient>
          <clipPath id="city-land">
            <path d={LAND} />
          </clipPath>
        </defs>
        <rect width="960" height="670" fill="url(#ocean)" />
        <rect width="960" height="670" fill="url(#ocean-grid)" />
        <g
          transform={`translate(${480 - 480 * zoom} ${335 - 335 * zoom}) scale(${zoom})`}
          className="map-transform"
        >
          <path d={LAND} fill="#172a31" stroke="#3a5961" strokeWidth="2" />
          <path
            d="M-20 418L70 392L142 348L198 292L278 264L328 215L388 198L443 140L473 107L551 103L580 158L650 180L717 153L815 120L980 79"
            fill="none"
            stroke="#30545e"
            strokeWidth="1"
          />
          <g clipPath="url(#city-land)">
            <rect
              width="960"
              height="670"
              fill="url(#ocean-lines)"
              opacity=".22"
            />
            {BLOCKS.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx="1"
                fill={i % 7 === 0 ? "#213c40" : "#20333b"}
                stroke="#2a4149"
                strokeWidth=".5"
                transform={`rotate(-12 ${b.x} ${b.y})`}
              />
            ))}
            {ROAD_PATHS.map((d, i) => (
              <path key={i} id={`traffic-road-${trafficId}-${i}`} d={d} fill="none" stroke="#38505a" strokeWidth="9" opacity=".7" />
            ))}
            {ROAD_PATHS.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#52616a" strokeWidth="1" opacity=".5" />
            ))}
          </g>
          <text
            x="145"
            y="150"
            className="ocean-label"
            transform="rotate(-16 145 150)"
          >
            OCÉANO PACÍFICO
          </text>
          <text
            x="178"
            y="177"
            className="ocean-sub"
            transform="rotate(-16 178 177)"
          >
            COSTA DE MANABÍ
          </text>
          <text x="780" y="640" className="district-label">
            MANTA · SECTOR SUR
          </text>
          {MANTA_EDGES.map((edge) => {
            const [x1, y1] = POSITIONS[edge.source];
            const [x2, y2] = POSITIONS[edge.target];
            const closed =
              snapshot.action.cordonedEdges.includes(edge.id) ||
              orders.some(
                (o) =>
                  o.kind === "cordon" &&
                  (o.nodeId === edge.source || o.nodeId === edge.target),
              );
            const infected =
              snapshot.nodes[edge.source].I > 0 ||
              snapshot.nodes[edge.target].I > 0;
            return (
              <path
                key={edge.id}
                d={`M${x1} ${y1}Q${(x1 + x2) / 2 + 12} ${(y1 + y2) / 2 - 16} ${x2} ${y2}`}
                className={`graph-route ${closed ? "closed" : infected ? "infected" : ""}`}
              />
            );
          })}
          <g aria-hidden="true" pointerEvents="none">
            {TRAFFIC_VEHICLES.map((vehicle) => (
              <g key={`${vehicle.type}-${vehicle.route}`}>
                {!reducedMotion && (
                  <animateMotion dur={`${vehicle.duration}s`} begin={`-${vehicle.delay}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#traffic-road-${trafficId}-${vehicle.route}`} />
                  </animateMotion>
                )}
                <g
                  transform={reducedMotion ? [
                    "translate(0 550) rotate(-8)",
                    "translate(200 670) rotate(-64)",
                    "translate(470 670) rotate(-77)",
                    "translate(0 595) rotate(-4)",
                  ][vehicle.route] : undefined}
                  fill={vehicle.type === "bus" ? "#80e0bc" : "#f0c879"}
                  stroke="#0b1b23"
                  strokeWidth="1"
                >
                  {vehicle.type === "bus" ? (
                    <>
                      <rect x="-14" y="-4" width="28" height="8" rx="1.5" />
                      <path d="M-9 -3h4v3h-4zm6 0h4v3h-4zm6 0h4v3H3z" fill="#17313a" stroke="none" />
                      <rect x="-11" y="3" width="4" height="2" rx=".5" fill="#071217" stroke="none" />
                      <rect x="7" y="3" width="4" height="2" rx=".5" fill="#071217" stroke="none" />
                    </>
                  ) : (
                    <>
                      <path d="M-10 -2.5  -7 -4h10l4 2 2 2v2h-19V0z" />
                      <path d="M-5 -3h7l2 3H-7z" fill="#17313a" stroke="none" />
                      <rect x="-7" y="3" width="4" height="2" rx=".5" fill="#071217" stroke="none" />
                      <rect x="5" y="3" width="4" height="2" rx=".5" fill="#071217" stroke="none" />
                    </>
                  )}
                </g>
              </g>
            ))}
          </g>
          {MANTA_NODES.map((node) => {
            const [x, y] = POSITIONS[node.id];
            const state = snapshot.nodes[node.id];
            const selected = selectedNode === node.id;
            const queued = orders.some((o) => o.nodeId === node.id);
            const color =
              layer === "protection"
                ? state.R > 0
                  ? "#80e0bc"
                  : "#6b8d96"
                : state.I > 0
                  ? "#ff8066"
                  : "#8ba8ad";
            return (
              <g
                key={node.id}
                className="map-node"
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${node.name}: ${state.I} infecciosos, ${state.R} inmunes`}
                onClick={() => onSelect(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                <title>
                  {node.name} · {state.I} infecciosos · {state.S} susceptibles
                </title>
                {state.I > 0 && (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r={50 + Math.min(50, state.I / 150)}
                      fill="url(#infection-glow)"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r="29"
                      fill="none"
                      stroke={color}
                      opacity=".24"
                      className="infection-ring"
                    />
                  </>
                )}
                {selected && (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r="25"
                      fill="none"
                      stroke="#b7d1d5"
                      strokeDasharray="3 4"
                    />
                    <path
                      d={`M${x - 32} ${y}h9M${x + 23} ${y}h9M${x} ${y - 32}v9M${x} ${y + 23}v9`}
                      stroke="#b7d1d5"
                      strokeWidth="1"
                    />
                  </>
                )}
                <circle cx={x} cy={y} r="20" fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r="13"
                  fill="#12252c"
                  stroke={color}
                  strokeWidth="1.5"
                />
                {node.id === "N04" ? (
                  <path
                    d={`M${x - 5} ${y}h10M${x} ${y - 5}v10`}
                    stroke={color}
                    strokeWidth="2"
                  />
                ) : (
                  <circle cx={x} cy={y} r="4" fill={color} />
                )}
                {queued && (
                  <circle
                    cx={x + 14}
                    cy={y - 13}
                    r="5"
                    fill="#b5e2c9"
                    stroke="#12252c"
                    strokeWidth="2"
                  />
                )}
                <text
                  x={x}
                  y={y + 38}
                  textAnchor="middle"
                  className="node-label"
                  fill={selected ? "#f2eee1" : "#a3b6bb"}
                >
                  {NAMES[node.id]}
                </text>
                {state.I > 0 && (
                  <text
                    x={x}
                    y={y + 52}
                    textAnchor="middle"
                    className="node-cases"
                  >
                    {state.I.toLocaleString("es-EC")} INFECTADOS
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="map-scale">
        <span />2 km<small>Grafo esquemático · no cartografía oficial</small>
      </div>
      <div className="map-compass">
        <span>N</span>
        <i />
      </div>
      <div className="map-zoom">
        <button
          aria-label="Acercar mapa"
          disabled={zoom >= 1.5}
          onClick={() => setZoom((z) => Math.min(1.5, z + 0.25))}
        >
          <Plus size={16} />
        </button>
        <button aria-label="Restablecer mapa" onClick={() => setZoom(1)}>
          <Crosshair size={16} />
        </button>
        <button
          aria-label="Alejar mapa"
          disabled={zoom <= 0.75}
          onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
        >
          <Minus size={16} />
        </button>
      </div>
      <div className="map-legend">
        <span>
          <i className="dot coral" />
          Brote activo
        </span>
        <span>
          <i className="dot mint" />
          Brigada asignada
        </span>
        <span className="map-count">{affected} / 16 zonas afectadas</span>
      </div>
    </section>
  );
}
