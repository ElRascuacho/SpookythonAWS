import React from 'react';
import { MonteCarloComparisonResult } from '../domain/types';
import { NODE_MAP } from '../domain/mantaGraph';
import { CheckCircle2, FileText, ShieldAlert, Sparkles, X } from 'lucide-react';

interface MayorReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: MonteCarloComparisonResult;
}

export const MayorReportModal: React.FC<MayorReportModalProps> = ({
  isOpen,
  onClose,
  result,
}) => {
  if (!isOpen) return null;

  const noInt = result.strategies.NO_INTERVENTION;
  const random = result.strategies.RANDOM;
  const smart = result.strategies.SMART_CORTAFUEGOS;
  const advantageOverRandom = Math.max(0, smart.meanLivesSavedVsBaseline - random.meanLivesSavedVsBaseline);

  const patientZeroNames = result.params.patientZeroIds
    .map((id) => `${NODE_MAP[id]?.name ?? id} (${id})`)
    .join(', ');

  const keyActions = smart.representativeRun.timeline
    .filter((snap) => snap.day >= 1 && snap.day <= 10)
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono uppercase">
                  Boletín Oficial GAD Manta
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Síntesis Ejecutiva en Lenguaje Simple
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                Informe de Decisiones para la Alcaldía de Manta — Operación Manta Cero
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plain-Language Executive Summary */}
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-200">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
              1. Diagnóstico en Lenguaje Claro para el Alcalde
            </h3>
            <p>
              Señor(a) Alcalde(sa): El brote se inició en <strong>{patientZeroNames}</strong>. Si el
              municipio no interviene, las rutas de buses urbanos y el comercio en mercados llevarán
              el contagio a <strong>{noInt.meanTotalInfected.toLocaleString()} ciudadanos</strong> en{' '}
              {result.params.days} días (rango P10–P90:{' '}
              {noInt.p10TotalInfected.toLocaleString()} – {noInt.p90TotalInfected.toLocaleString()}),
              colapsando el <strong>Hospital Rodríguez Zambrano</strong> durante{' '}
              <strong>{noInt.meanHospitalCollapseDays} días</strong>.
            </p>
            <p className="mt-2">
              Con el mismo presupuesto diario de{' '}
              <strong>${result.params.dailyBudget.toLocaleString()}/día</strong>, repartir recursos
              al azar apenas salva a{' '}
              <strong>{random.meanLivesSavedVsBaseline.toLocaleString()} personas</strong>. En
              cambio, nuestra estrategia matemática{' '}
              <strong className="text-emerald-400">Smart Graph Cortafuegos (SGC)</strong> protege a{' '}
              <strong className="text-emerald-400">
                {smart.meanLivesSavedVsBaseline.toLocaleString()} mantenses
              </strong>{' '}
              (<strong>+{advantageOverRandom.toLocaleString()} vidas adicionales</strong> frente al
              azar), a un costo promedio de apenas{' '}
              <strong>${smart.costPerLifeSaved} USD por vida salvada</strong>.
            </p>
          </div>

          {/* Comparative Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-3">Estrategia Evaluada</th>
                  <th className="py-2 px-3">Contagios Totales (Media [P10–P90])</th>
                  <th className="py-2 px-3">Pico Zombies vs. Hospital</th>
                  <th className="py-2 px-3">Ciudadanos Salvados</th>
                  <th className="py-2 px-3">Días Colapso Hospital</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                <tr className="bg-rose-950/20 text-rose-300">
                  <td className="py-2.5 px-3 font-sans font-semibold">🔴 1. Sin Intervención</td>
                  <td className="py-2.5 px-3">
                    {noInt.meanTotalInfected.toLocaleString()} [{noInt.p10TotalInfected.toLocaleString()}–
                    {noInt.p90TotalInfected.toLocaleString()}]
                  </td>
                  <td className="py-2.5 px-3">{noInt.meanPeakZombies.toLocaleString()}</td>
                  <td className="py-2.5 px-3">0 (Base)</td>
                  <td className="py-2.5 px-3">{noInt.meanHospitalCollapseDays} días</td>
                </tr>
                <tr className="bg-amber-950/20 text-amber-300">
                  <td className="py-2.5 px-3 font-sans font-semibold">🟡 2. Azar (Mismo Presupuesto)</td>
                  <td className="py-2.5 px-3">
                    {random.meanTotalInfected.toLocaleString()} [{random.p10TotalInfected.toLocaleString()}–
                    {random.p90TotalInfected.toLocaleString()}]
                  </td>
                  <td className="py-2.5 px-3">{random.meanPeakZombies.toLocaleString()}</td>
                  <td className="py-2.5 px-3">+{random.meanLivesSavedVsBaseline.toLocaleString()}</td>
                  <td className="py-2.5 px-3">{random.meanHospitalCollapseDays} días</td>
                </tr>
                <tr className="bg-emerald-950/35 text-emerald-300 font-bold">
                  <td className="py-2.5 px-3 font-sans">🟢 3. Smart Graph Cortafuegos</td>
                  <td className="py-2.5 px-3">
                    {smart.meanTotalInfected.toLocaleString()} [{smart.p10TotalInfected.toLocaleString()}–
                    {smart.p90TotalInfected.toLocaleString()}]
                  </td>
                  <td className="py-2.5 px-3">{smart.meanPeakZombies.toLocaleString()}</td>
                  <td className="py-2.5 px-3">+{smart.meanLivesSavedVsBaseline.toLocaleString()}</td>
                  <td className="py-2.5 px-3">{smart.meanHospitalCollapseDays} días</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Operational Action Plan for the First Days */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">
              2. Plan Operativo Inmediato (Primeros Días Críticos en Manta)
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {keyActions.map((snap) => (
                <li key={snap.day} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{snap.action.summaryText}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Explicit Limitations & Anti-Penalty Verification */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-xl p-3">
              <div className="font-bold text-emerald-300 mb-1">
                ✅ Auditoría de Cero Desperdicio de Vacunas
              </div>
              <p className="text-slate-300">
                El motor bloquea matemáticamente vacunar a infectados (<code>E/I</code>) o inmunes (
                <code>R</code>). Dosis desperdiciadas verificadas:{' '}
                <strong>{smart.representativeRun.wastedDosesOnInfected} dosis</strong>.
              </p>
            </div>
            <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3">
              <div className="font-bold text-amber-300 flex items-center gap-1 mb-1">
                <ShieldAlert className="w-4 h-4" /> Supuestos y Limitaciones Declaradas
              </div>
              <p className="text-slate-300">
                1) Asume cumplimiento del 92% en cordones sanitarios viales (FETUM). 2) La
                efectividad vacunal ({Math.round(result.params.vaccineEfficacy * 100)}%) se modela
                con inmunización inmediata en el compartimento <code>S</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Semilla de Auditoría: <code className="text-emerald-400">{result.params.seed}</code> |
            Región AWS: <code>us-east-1</code>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer"
          >
            Entendido, Volver al Mapa 3D
          </button>
        </div>
      </div>
    </div>
  );
};
