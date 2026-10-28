import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { trainOffline } from "../src/domain/committee/offline";
import { parsePublishedPolicy } from "../src/domain/policyEvaluation";
import type { RegisteredPolicy } from "../backend/committee/policyRegistry";

const hashRecord = (record: Omit<RegisteredPolicy, "recordHash">) =>
  createHash("sha256").update(JSON.stringify(record)).digest("hex");

console.log("Entrenando política offline con semilla 20261030 y horizonte de 40 días...");
const training = trainOffline({
  jobId: "zero-day-manta-local",
  baseSeed: 20261030,
  horizonDays: 40,
});

console.log(`Resultado del entrenamiento: audit=${training.audit}, recomendación=${training.artifact.recommendation}`);
console.log("Pesos obtenidos:", training.artifact.weights);

const now = new Date("2026-10-28T12:00:00.000Z");
const id = "zero-day-local-v1";
const publishedAt = now.toISOString();
const registryVersion = `${publishedAt}_${id}`;
const contents = {
  registryVersion,
  publishedAt,
  audit: training.audit,
  finalEvidence: training.finalEvidence,
  artifact: training.artifact,
};
const record: RegisteredPolicy = { ...contents, recordHash: hashRecord(contents) };

// Validar con parsePublishedPolicy
parsePublishedPolicy(record);
console.log("Validación parsePublishedPolicy exitosa.");

const targets = [
  "docs/features/committee-learning/evidence/raw/local-registered-policy.json",
  "committee-policy.local.json",
];

for (const target of targets) {
  await writeFile(target, JSON.stringify(record, null, 2), "utf-8");
  console.log(`Guardada política publicada en: ${target}`);
}
