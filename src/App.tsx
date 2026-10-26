import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SIMULATION_PARAMS, TOTAL_MANTA_POPULATION } from './domain/mantaGraph';
import { runMonteCarloComparison } from './domain/monteCarlo';
import { SimulationParams, StrategyType } from './domain/types';
import { MantaCity3DMap } from './components/MantaCity3DMap';
import { SurpriseOutbreakPanel } from './components/SurpriseOutbreakPanel';
import { ComparisonChart } from './components/ComparisonChart';
import { MayorReportModal } from './components/MayorReportModal';
import {
  Activity,
  Award,
  Calendar,
  FileText,
  HeartPulse,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
} from 'lucide-react';

export function App() {
  const [params, setParams] = useState<SimulationParams>(() => ({
    ...DEFAULT_SIMULATION_PARAMS,
  }));
  const [activeStrategy, setActiveStrategy] = useState<StrategyType>('SMART_CORTAFUEGOS');
  const [currentDay, setCurrentDay] = useState<number>(12);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('N01');
  const [isMayorModalOpen, setIsMayorModalOpen] = useState<boolean>(false);
  const [recalcTrigger, setRecalcTrigger] = useState<number>(0);

  // Compute Monte Carlo comparison across all 3 strategies
  const mcResult = useMemo(() => {
    return runMonteCarloComparison(params);
  }, [params, recalcTrigger]);

  const activeSummary = mcResult.strategies[activeStrategy];
  const smartSummary = mcResult.strategies.SMART_CORTAFUEGOS;
  const randomSummary = mcResult.strategies.RANDOM;
  const noIntSummary = mcResult.strategies.NO_INTERVENTION;

  const clampedDay = Math.min(params.days, Math.max(0, currentDay));
  const currentSnapshot =
    activeSummary.representativeRun.timeline[clampedDay] ??
    activeSummary.representativeRun.timeline[0];

  // Timeline playback interval
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setCurrentDay((prev) => {
        if (prev >= params.days) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 320);
    return () => window.clearInterval(timer);
  }, [isPlaying, params.days]);

  const handleTogglePatientZero = (nodeId: string) => {
    setParams((prev) => {
      const exists = prev.patientZeroIds.includes(nodeId);
      let nextIds: string[];
      if (exists) {
        nextIds = prev.patientZeroIds.length > 1 ? prev.patientZeroIds.filter((id) => id !== nodeId) : prev.patientZeroIds;
      } else {
        nextIds = [...prev.patientZeroIds, nodeId];
      }
      return {
        ...prev,
        patientZeroIds: nextIds,
      };
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Tactical Command Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 py-2.5">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">
                  OPERACIÓN MANTA CERO
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-semibold">
                  SEIR-V 3D Graph Engine
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-mono">
                  16 Barrios · {TOTAL_MANTA_POPULATION.toLocaleString()} Hab. · AWS us-east-1
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Centro de Mando Epidemiológico del GAD Manta — Contención de Brote Zombie + Vector Necro-Dengue
              </p>
            </div>
          </div>

          {/* Right Header KPI Pills & Mayor Briefing Button */}
          <div className="flex items-center gap-2.5">
            <div className="hidden md:flex items-center gap-4 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs">
              <div>
                <span className="text-slate-400">Vidas Salvadas (SGC vs Nada): </span>
                <strong className="font-mono text-emerald-400">
                  +{smartSummary.meanLivesSavedVsBaseline.toLocaleString()}
                </strong>
              </div>
              <span className="text-slate-700">|</span>
              <div>
                <span className="text-slate-400">Ventaja vs Azar: </span>
                <strong className="font-mono text-cyan-400">
                  +
                  {Math.max(
                    0,
                    smartSummary.meanLivesSavedVsBaseline - randomSummary.meanLivesSavedVsBaseline,
                  ).toLocaleString()}
                </strong>
              </div>
              <span className="text-slate-700">|</span>
              <div>
                <span className="text-slate-400">Semilla: </span>
                <code className="text-amber-400 font-mono">{params.seed}</code>
              </div>
            </div>

            <button
              onClick={() => setIsMayorModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>📜 Informe al Alcalde</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Command Dashboard Grid */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left / Center Column: 3D Manta Viewport + Timeline + Comparison Chart (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-3.5">
          {/* Top KPI Strip for Current Day & Strategy */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">🟢 Población Sana (S)</div>
                <div className="text-lg font-mono font-bold text-emerald-400">
                  {currentSnapshot.totalS.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500">
                  {((currentSnapshot.totalS / TOTAL_MANTA_POPULATION) * 100).toFixed(1)}% de Manta
                </div>
              </div>
              <Shield className="w-7 h-7 text-emerald-500/30" />
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">🔴 Zombies Activos Hoy (I)</div>
                <div className="text-lg font-mono font-bold text-rose-400">
                  {currentSnapshot.totalI.toLocaleString()}
                </div>
                <div className="text-[10px] text-amber-400 font-mono">
                  +{currentSnapshot.totalE.toLocaleString()} incubando (E)
                </div>
              </div>
              <Skull className="w-7 h-7 text-rose-500/30" />
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">🔵 Protegidos / Exorcizados (R)</div>
                <div className="text-lg font-mono font-bold text-cyan-400">
                  {currentSnapshot.totalR.toLocaleString()}
                </div>
                <div className="text-[10px] text-emerald-400">
                  0 vacunas desperdiciadas
                </div>
              </div>
              <Sparkles className="w-7 h-7 text-cyan-500/30" />
            </div>

            <div
              className={`rounded-xl p-3 flex items-center justify-between border ${
                currentSnapshot.hospitalCollapsed
                  ? 'bg-rose-950/50 border-rose-600/70'
                  : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div>
                <div className="text-[11px] text-slate-400">🏥 Hospital R. Zambrano</div>
                <div
                  className={`text-sm font-bold ${
                    currentSnapshot.hospitalCollapsed ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {currentSnapshot.hospitalCollapsed ? '⚠️ SATURADO' : '✅ OPERATIVO'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Cap: {params.hospitalCapacity.toLocaleString()} | γ_ef={currentSnapshot.effectiveGamma}
                </div>
              </div>
              <HeartPulse
                className={`w-7 h-7 ${
                  currentSnapshot.hospitalCollapsed ? 'text-rose-500 animate-pulse' : 'text-cyan-500/30'
                }`}
              />
            </div>
          </div>

          {/* 3D Interactive Map of Manta */}
          <div className="h-[530px]">
            <MantaCity3DMap
              snapshot={currentSnapshot}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              patientZeroIds={params.patientZeroIds}
              onTogglePatientZero={handleTogglePatientZero}
              activeStrategy={activeStrategy}
              onChangeStrategy={setActiveStrategy}
            />
          </div>

          {/* Interactive Timeline Playback Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 shadow-xl flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (clampedDay >= params.days) setCurrentDay(0);
                    setIsPlaying((p) => !p);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Pausar' : 'Simular Día a Día'}</span>
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentDay(0);
                  }}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  title="Reiniciar al Día 0"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-300 flex items-center gap-1 ml-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  <strong>Día {clampedDay}</strong> de {params.days}
                </span>
              </div>

              <div className="text-xs text-slate-300 truncate max-w-xl font-medium">
                <span className="text-emerald-400 font-semibold">Acción Comité: </span>
                <span>{currentSnapshot.action.summaryText}</span>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={params.days}
              value={clampedDay}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentDay(parseInt(e.target.value, 10));
              }}
              aria-label="Línea de tiempo en días"
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Monte Carlo 3-Strategy Comparison Chart */}
          <ComparisonChart
            result={mcResult}
            currentDay={clampedDay}
            onSelectDay={(day) => {
              setIsPlaying(false);
              setCurrentDay(day);
            }}
            activeStrategy={activeStrategy}
          />
        </div>

        {/* Right Column: Jury Surprise Outbreak Panel + Scorecard + Mayor Action Log (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3.5">
          <SurpriseOutbreakPanel
            params={params}
            onChangeParams={setParams}
            onRunSimulation={() => setRecalcTrigger((c) => c + 1)}
            executionTimeMs={mcResult.executionTimeMs}
          />

          {/* Executive Strategy Comparison Scorecard */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">
                Resultados Monte Carlo ({params.monteCarloRuns} corridas)
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-950/35 border border-emerald-500/40">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-300">
                    🟢 1º Smart Graph Cortafuegos
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold text-[10px]">
                    GANADORA
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-slate-300 font-mono">
                  <span>Salvados: +{smartSummary.meanLivesSavedVsBaseline.toLocaleString()}</span>
                  <span>Pico I(t): {smartSummary.meanPeakZombies.toLocaleString()}</span>
                  <span>
                    Rango P10-P90: [{smartSummary.p10TotalInfected.toLocaleString()}–
                    {smartSummary.p90TotalInfected.toLocaleString()}]
                  </span>
                  <span>Costo/Vida: ${smartSummary.costPerLifeSaved}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-950/25 border border-amber-700/40">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-amber-300">
                    🟡 2º Intervención al Azar (${params.dailyBudget}/d)
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">Línea Base 2</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] text-slate-400 font-mono">
                  <span>Salvados: +{randomSummary.meanLivesSavedVsBaseline.toLocaleString()}</span>
                  <span>Pico I(t): {randomSummary.meanPeakZombies.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-950/25 border border-rose-800/40">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-rose-300">🔴 3º Sin Intervención</span>
                  <span className="text-[10px] text-rose-400 font-mono">Línea Base 1</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] text-slate-400 font-mono">
                  <span>Infectados: {noIntSummary.meanTotalInfected.toLocaleString()}</span>
                  <span>Pico I(t): {noIntSummary.meanPeakZombies.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chronological Action Log for the Mayor */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">
                  Bitácora Táctica Día a Día (SGC)
                </h3>
              </div>
              <span className="text-[10px] text-slate-400">Clic para viajar al día</span>
            </div>

            <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
              {smartSummary.representativeRun.timeline.slice(1).map((snap) => {
                const isCurrent = snap.day === clampedDay;
                return (
                  <button
                    key={snap.day}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentDay(snap.day);
                    }}
                    className={`w-full text-left p-2 rounded-xl border text-[11px] transition cursor-pointer ${
                      isCurrent
                        ? 'bg-emerald-950/50 border-emerald-500/60 text-white'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 mb-0.5">
                      <span className="text-emerald-400 font-bold">Día {snap.day}</span>
                      <span>
                        🔴 {snap.totalI.toLocaleString()} zombies | 💰 ${snap.action.budgetSpent}
                      </span>
                    </div>
                    <div className="line-clamp-2 text-slate-200">{snap.action.summaryText}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Mayor Plain-Language Report Modal */}
      <MayorReportModal
        isOpen={isMayorModalOpen}
        onClose={() => setIsMayorModalOpen(false)}
        result={mcResult}
      />
    </div>
  );
}
export default App;
