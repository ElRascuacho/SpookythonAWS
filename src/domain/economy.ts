/**
 * Unidad de costo de la respuesta de emergencia de Manta (USD, economía dolarizada de Ecuador).
 * Cada cifra es el costo real de movilizar un recurso municipal/nacional durante un día de operación.
 */
export const ECONOMY = {
  /** Lote de 850 dosis: vial + cadena de frío + 6 vacunadores (≈ $2.82 por dosis). */
  vaccineLotDoses: 850,
  vaccineLotUsd: 2400,
  /** 12 operadores, 2 termonebulizadores, insecticida y logística por zona-día. */
  fumigationUsd: 1100,
  /** Policía Nacional / Fuerzas Armadas, vallas y control de accesos por zona-día. */
  cordonUsd: 1900,
  isolationUsd: 1300,
  preventionUsd: 700,
  /** Laboratorio nacional: 3 puntos porcentuales de avance por día. */
  researchStandardUsd: 1200,
  /** Refuerzo COE nacional / OPS: 5 puntos porcentuales por día. */
  researchPriorityUsd: 2200,
  /** Austeridad municipal / emergencia municipal (COE cantonal) / refuerzo COE nacional. */
  dailyBudgetLevels: [4000, 7500, 11000] as const,
} as const;

export const BUDGET_LEVELS = ECONOMY.dailyBudgetLevels;
