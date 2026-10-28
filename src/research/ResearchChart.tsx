import { useMemo, useState } from "react";
import type { ResearchChartSpec } from "../domain/research";

const padding = { left: 54, right: 18, top: 20, bottom: 38 };
const width = 520;
const height = 240;
const palette = ["#ffad66", "#8bd8bd", "#7aa2ff", "#ffd166", "#ff6b6b"];

export function ResearchChart({ chart }: { chart: ResearchChartSpec }) {
  const [hover, setHover] = useState<string | null>(null);
  const model = useMemo(() => buildModel(chart), [chart]);
  return (
    <figure className="rw-agent-chart" aria-label={`${chart.title}. Fuente: ${chart.source}`}>
      <figcaption>
        <strong>{chart.title}</strong>
        {chart.subtitle && <span>{chart.subtitle}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title}>
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
        {model.yTicks.map((tick) => (
          <g key={tick.value} className="rw-chart-grid">
            <line x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} />
            <text x={padding.left - 8} y={tick.y + 4} textAnchor="end">{formatValue(tick.value, chart.unit)}</text>
          </g>
        ))}
        {chart.type === "bar" ? (
          model.bars.map((bar) => (
            <g key={`${bar.series}-${bar.x}`} tabIndex={0} onFocus={() => setHover(bar.label)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(bar.label)} onMouseLeave={() => setHover(null)}>
              <rect x={bar.x0} y={bar.y} width={bar.w} height={bar.h} rx="3" fill={bar.color} />
              <text x={bar.x0 + bar.w / 2} y={height - padding.bottom + 16} textAnchor="middle">{String(bar.x).slice(0, 8)}</text>
            </g>
          ))
        ) : (
          model.lines.map((line) => (
            <g key={line.name}>
              {chart.type === "area" && <path d={`${line.areaPath}`} fill={line.color} opacity="0.14" />}
              <path d={line.path} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {line.points.map((point, index) => (
                <circle key={index} cx={point.cx} cy={point.cy} r="4" fill={line.color} tabIndex={0} onFocus={() => setHover(point.label)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(point.label)} onMouseLeave={() => setHover(null)} />
              ))}
            </g>
          ))
        )}
        <text className="rw-chart-axis" x={(width + padding.left - padding.right) / 2} y={height - 6} textAnchor="middle">{chart.xLabel}</text>
        <text className="rw-chart-axis" x="14" y={height / 2} transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle">{chart.yLabel}</text>
      </svg>
      <div className="rw-chart-legend">
        {chart.series.map((series, index) => (
          <span key={series.name}><i style={{ background: series.color ?? palette[index % palette.length] }} />{series.name}</span>
        ))}
      </div>
      <small>{hover ?? `Fuente: ${chart.source}`}</small>
    </figure>
  );
}

function buildModel(chart: ResearchChartSpec) {
  const allPoints = chart.series.flatMap((series) => series.points);
  const maxY = Math.max(1, ...allPoints.map((p) => p.y));
  const minY = Math.min(0, ...allPoints.map((p) => p.y));
  const yRange = Math.max(1, maxY - minY);
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const y = (value: number) => padding.top + ((maxY - value) / yRange) * plotH;
  const yTicks = [0, 0.5, 1].map((ratio) => {
    const value = minY + yRange * ratio;
    return { value, y: y(value) };
  });
  if (chart.type === "bar") {
    const first = chart.series[0]?.points ?? [];
    const gap = 10;
    const w = Math.max(12, (plotW - gap * Math.max(0, first.length - 1)) / Math.max(1, first.length));
    return {
      yTicks,
      bars: first.map((point, index) => {
        const x0 = padding.left + index * (w + gap);
        const top = y(point.y);
        return {
          x: point.x,
          x0,
          y: top,
          w,
          h: height - padding.bottom - top,
          color: chart.series[0]?.color ?? palette[0],
          series: chart.series[0]?.name ?? "Serie",
          label: `${point.label ?? point.x}: ${formatValue(point.y, chart.unit)}`,
        };
      }),
      lines: [],
    };
  }
  const maxLen = Math.max(1, ...chart.series.map((series) => series.points.length));
  const x = (index: number) => padding.left + (maxLen === 1 ? plotW / 2 : (index / (maxLen - 1)) * plotW);
  const lines = chart.series.map((series, sIndex) => {
    const color = series.color ?? palette[sIndex % palette.length];
    const points = series.points.map((point, index) => ({
      cx: x(index),
      cy: y(point.y),
      label: `${series.name} · ${point.label ?? point.x}: ${formatValue(point.y, chart.unit)}`,
    }));
    const path = points.map((point, index) => `${index ? "L" : "M"}${point.cx},${point.cy}`).join(" ");
    const areaPath = points.length
      ? `${path} L${points.at(-1)!.cx},${height - padding.bottom} L${points[0].cx},${height - padding.bottom} Z`
      : "";
    return { name: series.name, color, points, path, areaPath };
  });
  return { yTicks, bars: [], lines };
}

function formatValue(value: number, unit: ResearchChartSpec["unit"]) {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "usd") return `$${Math.round(value).toLocaleString()}`;
  return Math.round(value).toLocaleString();
}
