import { z } from "zod";

export const VALID_MANTA_NODE_IDS = [
  "N01",
  "N02",
  "N03",
  "N04",
  "N05",
  "N06",
  "N07",
  "N08",
  "N09",
  "N10",
  "N11",
  "N12",
  "N13",
  "N14",
  "N15",
  "N16",
] as const;

export const NodeIdSchema = z.enum(VALID_MANTA_NODE_IDS);

export const SimulationParamsSchema = z
  .object({
    betaHuman: z
      .number()
      .min(0.01, "betaHuman debe ser >= 0.01")
      .max(1.0, "betaHuman debe ser <= 1.0")
      .default(0.35),
    betaVector: z
      .number()
      .min(0.01, "betaVector debe ser >= 0.01")
      .max(1.0, "betaVector debe ser <= 1.0")
      .default(0.12),
    sigma: z
      .number()
      .min(0.01, "sigma debe ser >= 0.01")
      .max(1.0, "sigma debe ser <= 1.0")
      .default(0.33),
    gamma: z
      .number()
      .min(0.01, "gamma debe ser >= 0.01")
      .max(1.0, "gamma debe ser <= 1.0")
      .default(0.1),
    hospitalCapacity: z
      .number()
      .int("hospitalCapacity debe ser un entero")
      .min(100, "hospitalCapacity debe ser >= 100")
      .max(10000, "hospitalCapacity debe ser <= 10000")
      .default(2500),
    vaccineEfficacy: z
      .number()
      .min(0.1, "vaccineEfficacy debe ser >= 0.10")
      .max(1.0, "vaccineEfficacy debe ser <= 1.0")
      .default(0.85),
    dailyBudget: z
      .number()
      .int("dailyBudget debe ser un entero")
      .min(100, "dailyBudget debe ser >= 100")
      .max(11000, "dailyBudget debe ser <= 11000")
      .default(1000),
    vaccineCost: z
      .number()
      .int("vaccineCost debe ser un entero")
      .min(1, "vaccineCost debe ser >= 1")
      .max(5000, "vaccineCost debe ser <= 5000")
      .default(200),
    vaccineBatchSize: z
      .number()
      .int("vaccineBatchSize debe ser un entero")
      .min(10, "vaccineBatchSize debe ser >= 10")
      .max(5000, "vaccineBatchSize debe ser <= 5000")
      .default(500),
    fumigationCost: z
      .number()
      .int("fumigationCost debe ser un entero")
      .min(1, "fumigationCost debe ser >= 1")
      .max(5000, "fumigationCost debe ser <= 5000")
      .default(250),
    cordonCost: z
      .number()
      .int("cordonCost debe ser un entero")
      .min(1, "cordonCost debe ser >= 1")
      .max(5000, "cordonCost debe ser <= 5000")
      .default(300),
    days: z
      .number()
      .int("days debe ser un entero")
      .min(1, "days debe ser >= 1")
      .max(60, "days debe ser <= 60")
      .default(60),
    seed: z
      .number()
      .int("seed debe ser un entero de 32 bits")
      .min(0, "seed debe ser >= 0")
      .max(4294967295, "seed debe ser <= 4294967295")
      .default(20261030),
    monteCarloRuns: z
      .number()
      .int("monteCarloRuns debe ser un entero")
      .min(10, "monteCarloRuns debe ser >= 10")
      .max(500, "monteCarloRuns debe ser <= 500")
      .default(60),
    patientZeroIds: z
      .array(NodeIdSchema)
      .min(1, "Debe incluir al menos un nodo en patientZeroIds")
      .default(["N01"]),
    initialInfectedPerNode: z
      .number()
      .int("initialInfectedPerNode debe ser un entero")
      .min(1, "initialInfectedPerNode debe ser >= 1")
      .max(500, "initialInfectedPerNode debe ser <= 500")
      .default(35),
    initialExposedPerNode: z
      .number()
      .int("initialExposedPerNode debe ser un entero")
      .min(0, "initialExposedPerNode debe ser >= 0")
      .max(500, "initialExposedPerNode debe ser <= 500")
      .default(50),
  })
  .strict();

export const PartialSimulationParamsSchema = SimulationParamsSchema.partial().strict();

export type ValidatedSimulationParams = z.infer<typeof SimulationParamsSchema>;
export type ValidatedPartialSimulationParams = z.infer<typeof PartialSimulationParamsSchema>;
