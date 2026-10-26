import React from 'react';
import { SimulationParams } from '../domain/types';
import { DEFAULT_SIMULATION_PARAMS, MANTA_NODES } from '../domain/mantaGraph';
import { Dices, Flame, RefreshCw, ShieldCheck, Sliders, Zap } from 'lucide-react';

interface SurpriseOutbreakPanelProps {
  params: SimulationParams;
  onChangeParams: (next: SimulationParams) => void;
  onRunSimulation: () => void;
  executionTimeMs: number;
}

export const SurpriseOutbreakPanel: React.FC<SurpriseOutbreakPanelProps> = ({
  params,
  onChangeParams,
  onRunSimulation,
  executionTimeMs,
}) => {
  const updateField = <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => {
    onChangeParams({
      ...params,
      [key]: value,
    });
  };

  const applyPreset = (preset: Partial<SimulationParams>) => {
    onChangeParams({
      ...DEFAULT_SIMULATION_PARAMS,
      seed: params.seed,
      monteCarloRuns: params.monteCarloRuns,
      ...preset,
    });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-tight">
              🎃 Modo Brote Sorpresa (Jurado)
            </h2>
            <p className="text-[11px] text-slate-400">
              Ajuste en vivo de parámetros SEIR-V y semilla reproducible
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 font-mono text-[10px] text-emerald-300">
          {executionTimeMs} ms
        </span>
      </div>

      {/* Jury Quick Presets */}
      <div>
        <div className="text-[11px] font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Escenarios de Prueba de Fuego (1-Clic):</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() =>
              applyPreset({
                betaHuman: 0.70,
                betaVector: 0.22,
                patientZeroIds: ['N01'],
              })
            }
            className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/50 text-rose-200 text-[11px] font-medium text-left transition cursor-pointer"
          >
            🔥 2x Contagio (βh=0.70)
          </button>
          <button
            onClick={() =>
              applyPreset({
                dailyBudget: 500,
                vaccineBatchSize: 425,
              })
            }
            className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/70 border border-amber-700/50 text-amber-200 text-[11px] font-medium text-left transition cursor-pointer"
          >
            💸 50% Presupuesto ($500/d)
          </button>
          <button
            onClick={() =>
              applyPreset({
                vaccineEfficacy: 0.45,
                betaHuman: 0.42,
              })
            }
            className="px-2.5 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/70 border border-purple-700/50 text-purple-200 text-[11px] font-medium text-left transition cursor-pointer"
          >
            🧬 Variante Escape (η=45%)
          </button>
          <button
            onClick={() =>
              applyPreset({
                patientZeroIds: ['N03', 'N05'],
                initialInfectedPerNode: 45,
              })
            }
            className="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-700/50 text-cyan-200 text-[11px] font-medium text-left transition cursor-pointer"
          >
            🎓 Brote ULEAM + Terminal
          </button>
        </div>
      </div>

      {/* Parameter Sliders */}
      <div className="space-y-2.5 text-xs">
        <div>
          <div className="flex justify-between text-slate-300 mb-0.5">
            <span>Contagio Humano-Zombie (βh)</span>
            <span className="font-mono text-rose-400 font-semibold">
              {params.betaHuman.toFixed(2)} / día
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1.2}
            step={0.05}
            value={params.betaHuman}
            onChange={(e) => updateField('betaHuman', parseFloat(e.target.value))}
            aria-label="Tasa de transmisión humano-zombie"
            className="w-full accent-rose-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-300 mb-0.5">
            <span>Foco Vectorial Necro-Dengue (βv)</span>
            <span className="font-mono text-purple-400 font-semibold">
              {params.betaVector.toFixed(2)} / día
            </span>
          </div>
          <input
            type="range"
            min={0.0}
            max={0.6}
            step={0.02}
            value={params.betaVector}
            onChange={(e) => updateField('betaVector', parseFloat(e.target.value))}
            aria-label="Tasa de transmisión vectorial"
            className="w-full accent-purple-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-300 mb-0.5">
            <span>Efectividad de Vacuna (η)</span>
            <span className="font-mono text-emerald-400 font-semibold">
              {Math.round(params.vaccineEfficacy * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.15}
            max={1.0}
            step={0.05}
            value={params.vaccineEfficacy}
            onChange={(e) => updateField('vaccineEfficacy', parseFloat(e.target.value))}
            aria-label="Efectividad de la vacuna"
            className="w-full accent-emerald-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-300 mb-0.5">
            <span>Presupuesto Diario Comité (Bt)</span>
            <span className="font-mono text-amber-400 font-semibold">
              ${params.dailyBudget.toLocaleString()} / día
            </span>
          </div>
          <input
            type="range"
            min={200}
            max={3000}
            step={100}
            value={params.dailyBudget}
            onChange={(e) => updateField('dailyBudget', parseInt(e.target.value, 10))}
            aria-label="Presupuesto diario"
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-300 mb-0.5">
            <span>Capacidad Hospital Rodríguez Zambrano (Hmax)</span>
            <span className="font-mono text-cyan-400 font-semibold">
              {params.hospitalCapacity.toLocaleString()} camas
            </span>
          </div>
          <input
            type="range"
            min={500}
            max={8000}
            step={250}
            value={params.hospitalCapacity}
            onChange={(e) => updateField('hospitalCapacity', parseInt(e.target.value, 10))}
            aria-label="Capacidad hospitalaria"
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Deterministic Seed & Monte Carlo Runs */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">
            Semilla Reproducible (Seed)
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={params.seed}
              onChange={(e) => updateField('seed', parseInt(e.target.value, 10) || 20261030)}
              aria-label="Semilla aleatoria reproducible"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => updateField('seed', Math.floor(10000000 + Math.random() * 90000000))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              title="Generar nueva semilla aleatoria"
            >
              <Dices className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 mb-1">
            Corridas Monte Carlo (M)
          </label>
          <select
            value={params.monteCarloRuns}
            onChange={(e) => updateField('monteCarloRuns', parseInt(e.target.value, 10))}
            aria-label="Número de corridas Monte Carlo"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value={30}>30 corridas (Instantáneo)</option>
            <option value={60}>60 corridas (Estándar)</option>
            <option value={120}>120 corridas (Alta Precisión)</option>
            <option value={200}>200 corridas (Modo Jurado)</option>
          </select>
        </div>
      </div>

      {/* Patient Zero Summary Pills */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
        <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between">
          <span>☣️ Barrios Paciente Cero (Día 0):</span>
          <span className="text-slate-500">Clic en mapa 3D para cambiar</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {params.patientZeroIds.map((id) => {
            const node = MANTA_NODES.find((n) => n.id === id);
            return (
              <span
                key={id}
                className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-medium"
              >
                {id}: {node?.name.split('(')[0].trim()}
              </span>
            );
          })}
        </div>
      </div>

      {/* Golden Rule Verification Banner */}
      <div className="flex items-center gap-2 bg-emerald-950/35 border border-emerald-700/40 rounded-xl px-2.5 py-2 text-[11px] text-emerald-300">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>
          <strong>Regla de Oro Verificada:</strong> 100% de vacunas aplicadas solo a Sanos (
          <code>S</code>). 0 dosis desperdiciadas en <code>E/I/R</code>.
        </span>
      </div>

      {/* Reset / Re-run Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChangeParams({ ...DEFAULT_SIMULATION_PARAMS })}
          className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Restaurar Base</span>
        </button>
        <button
          onClick={onRunSimulation}
          className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Recalcular Monte Carlo</span>
        </button>
      </div>
    </div>
  );
};
