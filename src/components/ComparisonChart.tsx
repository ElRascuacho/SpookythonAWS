import React, { useId, useState } from 'react';
import { MonteCarloComparisonResult, StrategyType } from '../domain/types';
import { Activity, TrendingDown } from 'lucide-react';

interface ComparisonChartProps {
  result: MonteCarloComparisonResult;
  currentDay: number;
  onSelectDay: (day: number) => void;
  activeStrategy: StrategyType;
}

type ChartMetric = 'ACTIVE_ZOMBIES' | 'CUMULATIVE_INFECTED';

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  result,
  currentDay,
  onSelectDay,
}) => {
  const [metric, setMetric] = useState<ChartMetric>('ACTIVE_ZOMBIES');

  const dayInputId = useId();
  const days = result.params.days;
  const noIntBands = result.strategies.NO_INTERVENTION.dailyBands;
  const randomBands = result.strategies.RANDOM.dailyBands;
  const smartBands = result.strategies.SMART_CORTAFUEGOS.dailyBands;

  const width = 760;
  const height = 250;
  const padLeft = 56;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getValue = (pt: (typeof noIntBands)[0], mode: 'mean' | 'p10' | 'p90') => {
    if (metric === 'ACTIVE_ZOMBIES') {
      if (mode === 'p10') return pt.p10ActiveZombies;
      if (mode === 'p90') return pt.p90ActiveZombies;
      return pt.meanActiveZombies;
    } else {
      if (mode === 'p10') return pt.p10CumulativeInfected;
      if (mode === 'p90') return pt.p90CumulativeInfected;
      return pt.meanCumulativeInfected;
    }
  };

  let maxY = result.params.hospitalCapacity * 1.25;
  for (let d = 0; d <= days; d++) {
    maxY = Math.max(
      maxY,
      getValue(noIntBands[d], 'p90'),
      getValue(randomBands[d], 'p90'),
      getValue(smartBands[d], 'p90'),
    );
  }
  maxY = Math.ceil(maxY * 1.08);

  const toX = (day: number) => padLeft + (day / Math.max(1, days)) * plotW;
  const toY = (val: number) => padTop + plotH - (Math.min(maxY, Math.max(0, val)) / maxY) * plotH;

  const buildLinePath = (bands: typeof noIntBands) =>
    bands
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${toX(pt.day).toFixed(1)},${toY(getValue(pt, 'mean')).toFixed(1)}`)
      .join(' ');

  const buildBandPolygon = (bands: typeof noIntBands) => {
    const upper = bands.map((pt) => `${toX(pt.day).toFixed(1)},${toY(getValue(pt, 'p90')).toFixed(1)}`);
    const lower = [...bands]
      .reverse()
      .map((pt) => `${toX(pt.day).toFixed(1)},${toY(getValue(pt, 'p10')).toFixed(1)}`);
    return [...upper, ...lower].join(' ');
  };

  const hospY = toY(result.params.hospitalCapacity);
  const dayX = toX(currentDay);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxY * t));

  return (
    <div className="comparison-chart bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Comparativa Monte Carlo ({result.params.monteCarloRuns} corridas, Bandas P10–P90)
            </h3>
            <p className="text-sm text-slate-400">
              🔴 Sin Intervención vs. 🟡 Azar vs. 🟢 Smart Graph Cortafuegos (Usa el selector de día o haz clic en la gráfica)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setMetric('ACTIVE_ZOMBIES')}
            className={`px-2.5 py-1 rounded-lg text-sm transition cursor-pointer ${
              metric === 'ACTIVE_ZOMBIES'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Zombies Activos I(t)
          </button>
          <button
            onClick={() => setMetric('CUMULATIVE_INFECTED')}
            className={`px-2.5 py-1 rounded-lg text-sm transition cursor-pointer ${
              metric === 'CUMULATIVE_INFECTED'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Contagios Acumulados
          </button>
        </div>
      </div>

      <label className="comparison-day" htmlFor={dayInputId}>
        Día observado: {currentDay} de {days}
        <input id={dayInputId} type="range" min={0} max={days} step={1} value={currentDay} disabled={days === 0} aria-valuetext={`Día ${currentDay} de ${days}`} onChange={e => onSelectDay(Number(e.target.value))} />
      </label>
      <div className="relative w-full overflow-x-auto" role="region" aria-label="Gráfica comparativa con desplazamiento horizontal" tabIndex={0}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: width }}
          role="img"
          aria-label="Comparación de estrategias. Los datos del día seleccionado se detallan debajo."
          className="w-full h-auto select-none cursor-crosshair"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const clickedDay = Math.round(((relX - padLeft) / plotW) * days);
            onSelectDay(Math.max(0, Math.min(days, clickedDay)));
          }}
        >
          {/* Horizontal Grid Lines */}
          {yTicks.map((val, idx) => {
            const y = toY(val);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-sm font-mono"
                >
                  {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                </text>
              </g>
            );
          })}

          {/* X-Axis Day Labels */}
          {[0, 10, 20, 30, 40, 50, 60]
            .filter((d) => d <= days)
            .map((d) => (
              <text
                key={d}
                x={toX(d)}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-400 text-sm font-mono"
              >
                Día {d}
              </text>
            ))}

          {/* Confidence Bands (P10 - P90) */}
          <polygon points={buildBandPolygon(noIntBands)} fill="#f43f5e" fillOpacity={0.14} />
          <polygon points={buildBandPolygon(randomBands)} fill="#f59e0b" fillOpacity={0.15} />
          <polygon points={buildBandPolygon(smartBands)} fill="#10b981" fillOpacity={0.22} />

          {/* Hospital Capacity Threshold Line (only on Active Zombies view) */}
          {metric === 'ACTIVE_ZOMBIES' && hospY >= padTop && hospY <= padTop + plotH && (
            <g>
              <line
                x1={padLeft}
                y1={hospY}
                x2={width - padRight}
                y2={hospY}
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <text
                x={width - padRight - 6}
                y={hospY - 5}
                textAnchor="end"
                className="fill-cyan-300 text-sm font-mono"
              >
                🏥 Colapso Hospital Rodríguez Zambrano ({result.params.hospitalCapacity.toLocaleString()})
              </text>
            </g>
          )}

          {/* Mean Trajectory Curves */}
          <path
            d={buildLinePath(noIntBands)}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={2.5}
          />
          <path
            d={buildLinePath(randomBands)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2.5}
            strokeDasharray="5 3"
          />
          <path
            d={buildLinePath(smartBands)}
            fill="none"
            stroke="#10b981"
            strokeWidth={3.2}
          />

          {/* Current Day Playhead Line */}
          <line
            x1={dayX}
            y1={padTop}
            x2={dayX}
            y2={padTop + plotH}
            stroke="#f8fafc"
            strokeWidth={1.5}
          />
          <circle
            cx={dayX}
            cy={toY(getValue(noIntBands[currentDay], 'mean'))}
            r={4}
            fill="#f43f5e"
          />
          <circle
            cx={dayX}
            cy={toY(getValue(randomBands[currentDay], 'mean'))}
            r={4}
            fill="#f59e0b"
          />
          <circle
            cx={dayX}
            cy={toY(getValue(smartBands[currentDay], 'mean'))}
            r={5}
            fill="#10b981"
            stroke="#022c22"
            strokeWidth={1.5}
          />
        </svg>
      </div>

      {/* Day Readout Footer */}
      <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-2 text-sm" aria-live="polite" aria-atomic="true">
        <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div>
            <div className="text-sm text-rose-300">🔴 Sin Intervención (Día {currentDay})</div>
            <div className="font-mono font-bold text-rose-400">
              {getValue(noIntBands[currentDay], 'mean').toLocaleString()} casos
            </div>
          </div>
          <span className="text-sm font-mono text-rose-300/80">
            Pico: {result.strategies.NO_INTERVENTION.meanPeakZombies.toLocaleString()}
          </span>
        </div>

        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div>
            <div className="text-sm text-amber-300">🟡 Azar (Día {currentDay})</div>
            <div className="font-mono font-bold text-amber-400">
              {getValue(randomBands[currentDay], 'mean').toLocaleString()} casos
            </div>
          </div>
          <span className="text-sm font-mono text-amber-300/80">
            Contagios evitados: +{result.strategies.RANDOM.meanLivesSavedVsBaseline.toLocaleString()}
          </span>
        </div>

        <div className="bg-emerald-950/40 border border-emerald-600/50 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div>
            <div className="text-sm text-emerald-300 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              <span>🟢 Smart Cortafuegos (Día {currentDay})</span>
            </div>
            <div className="font-mono font-bold text-emerald-400">
              {getValue(smartBands[currentDay], 'mean').toLocaleString()} casos
            </div>
          </div>
          <span className="text-sm font-mono font-semibold text-emerald-300">
            Contagios evitados: +{result.strategies.SMART_CORTAFUEGOS.meanLivesSavedVsBaseline.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
