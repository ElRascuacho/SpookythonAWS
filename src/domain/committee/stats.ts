import { ECONOMY } from "../economy";
import type { DailyCitySnapshot } from "../types";

export interface DailyInspectionStat {
  day: number;
  activeInfected: number;
  activeExposed: number;
  activeSusceptible: number;
  activeRecovered: number;
  cumulativeInfected: number;
  hospitalLoadPct: number;
  hospitalCollapsed: boolean;
  dayBudgetSpent: number;
  attackRatePct: number;
  activeInfectionPct: number;
  actionSummary: string;
}

export interface CommitteeStats {
  // Eficacia Macro
  reductionAbsolute: number;
  reductionPct: number;
  attackRatePct: number;
  totalPopulation: number;
  finalInfected: number;

  // Capacidad y Estrés Hospitalario
  hospitalCapacity: number;
  peakInfected: number;
  peakHospitalLoadPct: number;
  collapseDays: number;
  hospitalStatus: "normal" | "alerta" | "colapso";

  // Distribución Presupuestaria y Táctica
  totalBudgetSpent: number;
  totalVaccineDoses: number;
  totalCordons: number;
  totalFumigations: number;
  vaccineSpent: number;
  cordonSpent: number;
  fumigationSpent: number;
  vaccineBudgetPct: number;
  cordonBudgetPct: number;
  fumigationBudgetPct: number;

  // Inspección por Día
  dailyStats: DailyInspectionStat[];
}

export interface ComputeStatsOptions {
  hospitalCapacity?: number;
}

export function computeCommitteeStats(
  playback: readonly DailyCitySnapshot[],
  baselineMean: number,
  candidateMean: number | null,
  options: ComputeStatsOptions = {},
): CommitteeStats {
  const hospitalCapacity = options.hospitalCapacity ?? 2500;

  if (!playback || playback.length === 0) {
    const candidate = candidateMean ?? 0;
    const diff = baselineMean > 0 ? baselineMean - candidate : 0;
    const redPct = baselineMean > 0 ? (diff / baselineMean) * 100 : 0;

    return {
      reductionAbsolute: Math.round(diff),
      reductionPct: Number(redPct.toFixed(1)),
      attackRatePct: 0,
      totalPopulation: 0,
      finalInfected: Math.round(candidate),
      hospitalCapacity,
      peakInfected: 0,
      peakHospitalLoadPct: 0,
      collapseDays: 0,
      hospitalStatus: "normal",
      totalBudgetSpent: 0,
      totalVaccineDoses: 0,
      totalCordons: 0,
      totalFumigations: 0,
      vaccineSpent: 0,
      cordonSpent: 0,
      fumigationSpent: 0,
      vaccineBudgetPct: 0,
      cordonBudgetPct: 0,
      fumigationBudgetPct: 0,
      dailyStats: [],
    };
  }

  const initial = playback[0];
  const totalPopulation = initial.totalS + initial.totalE + initial.totalI + initial.totalR;
  const final = playback[playback.length - 1];
  const finalInfected = final.cumulativeInfected;

  const candidate = candidateMean ?? finalInfected;
  const reductionAbsolute = baselineMean > 0 ? Math.round(baselineMean - candidate) : 0;
  const reductionPct = baselineMean > 0 ? Number((((baselineMean - candidate) / baselineMean) * 100).toFixed(1)) : 0;
  const attackRatePct = totalPopulation > 0 ? Math.min(100, Number(((finalInfected / totalPopulation) * 100).toFixed(1))) : 0;

  let peakInfected = 0;
  let collapseDays = 0;
  let totalBudgetSpent = 0;
  let totalVaccineDoses = 0;
  let totalCordons = 0;
  let totalFumigations = 0;

  const dailyStats: DailyInspectionStat[] = [];

  for (const snap of playback) {
    if (snap.totalI > peakInfected) {
      peakInfected = snap.totalI;
    }
    if (snap.hospitalCollapsed || (hospitalCapacity > 0 && snap.totalI >= hospitalCapacity)) {
      collapseDays += 1;
    }

    const action = snap.action;
    totalBudgetSpent += action.budgetSpent;

    let dayDoses = 0;
    if (action.vaccinatedNodes) {
      for (const doses of Object.values(action.vaccinatedNodes)) {
        dayDoses += doses;
      }
    }
    totalVaccineDoses += dayDoses;

    const dayCordons = (action.cordonedNodes?.length ?? 0) + (action.cordonedEdges?.length ?? 0);
    totalCordons += dayCordons;

    const dayFumigations = action.fumigatedNodes?.length ?? 0;
    totalFumigations += dayFumigations;

    const hospitalLoadPct = hospitalCapacity > 0 ? Number(((snap.totalI / hospitalCapacity) * 100).toFixed(1)) : 0;
    const snapAttackRate = totalPopulation > 0 ? Number(((snap.cumulativeInfected / totalPopulation) * 100).toFixed(1)) : 0;
    const activeInfectionPct = totalPopulation > 0 ? Number(((snap.totalI / totalPopulation) * 100).toFixed(1)) : 0;

    dailyStats.push({
      day: snap.day,
      activeInfected: Math.round(snap.totalI),
      activeExposed: Math.round(snap.totalE),
      activeSusceptible: Math.round(snap.totalS),
      activeRecovered: Math.round(snap.totalR),
      cumulativeInfected: Math.round(snap.cumulativeInfected),
      hospitalLoadPct,
      hospitalCollapsed: snap.hospitalCollapsed || hospitalLoadPct >= 100,
      dayBudgetSpent: action.budgetSpent,
      attackRatePct: snapAttackRate,
      activeInfectionPct,
      actionSummary: action.summaryText || "Sin intervenciones",
    });
  }

  const peakHospitalLoadPct = hospitalCapacity > 0 ? Number(((peakInfected / hospitalCapacity) * 100).toFixed(1)) : 0;

  let hospitalStatus: "normal" | "alerta" | "colapso" = "normal";
  if (collapseDays > 0 || peakHospitalLoadPct >= 100) {
    hospitalStatus = "colapso";
  } else if (peakHospitalLoadPct >= 75) {
    hospitalStatus = "alerta";
  }

  // Desglose de costos por táctica
  const vaccineCostPerDose = ECONOMY.vaccineLotUsd / ECONOMY.vaccineLotDoses;
  const rawVaccineSpent = totalVaccineDoses * vaccineCostPerDose;
  const rawCordonSpent = totalCordons * ECONOMY.cordonUsd;
  const rawFumigationSpent = totalFumigations * ECONOMY.fumigationUsd;

  const rawTotalTactics = rawVaccineSpent + rawCordonSpent + rawFumigationSpent;

  let vaccineBudgetPct = 0;
  let cordonBudgetPct = 0;
  let fumigationBudgetPct = 0;

  if (rawTotalTactics > 0) {
    vaccineBudgetPct = Number(((rawVaccineSpent / rawTotalTactics) * 100).toFixed(1));
    cordonBudgetPct = Number(((rawCordonSpent / rawTotalTactics) * 100).toFixed(1));
    fumigationBudgetPct = Number(((rawFumigationSpent / rawTotalTactics) * 100).toFixed(1));
  }

  return {
    reductionAbsolute,
    reductionPct,
    attackRatePct,
    totalPopulation,
    finalInfected: Math.round(finalInfected),
    hospitalCapacity,
    peakInfected: Math.round(peakInfected),
    peakHospitalLoadPct,
    collapseDays,
    hospitalStatus,
    totalBudgetSpent: Math.round(totalBudgetSpent),
    totalVaccineDoses,
    totalCordons,
    totalFumigations,
    vaccineSpent: Math.round(rawVaccineSpent),
    cordonSpent: Math.round(rawCordonSpent),
    fumigationSpent: Math.round(rawFumigationSpent),
    vaccineBudgetPct,
    cordonBudgetPct,
    fumigationBudgetPct,
    dailyStats,
  };
}
