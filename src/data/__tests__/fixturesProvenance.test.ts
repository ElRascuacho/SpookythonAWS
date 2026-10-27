import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const FIXTURES_DIR = join(process.cwd(), "src", "data", "fixtures");
const NODES_PATH = join(FIXTURES_DIR, "manta-nodes.json");
const CLIMATE_PATH = join(FIXTURES_DIR, "climate-manta.json");
const MANIFEST_PATH = join(FIXTURES_DIR, "provenance-manifest.json");

describe("Task 03: Data Fixtures Existence & Size Gates", () => {
  it("verifies that all three versioned fixtures exist on disk", () => {
    expect(existsSync(NODES_PATH)).toBe(true);
    expect(existsSync(CLIMATE_PATH)).toBe(true);
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it("ensures total fixture payload size is < 200 KB for fast Lambda cold starts", () => {
    const nodesSize = statSync(NODES_PATH).size;
    const climateSize = statSync(CLIMATE_PATH).size;
    const manifestSize = statSync(MANIFEST_PATH).size;
    const totalSizeKb = (nodesSize + climateSize + manifestSize) / 1024;

    expect(totalSizeKb).toBeLessThan(200);
  });
});

describe("Task 03: Demographic & Topological Invariants", () => {
  it("verifies exactly 16 urban nodes with valid Manta coordinates", () => {
    const nodes = JSON.parse(readFileSync(NODES_PATH, "utf-8"));
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBe(16);

    const ids = new Set<string>();
    for (const node of nodes) {
      expect(node.id).toMatch(/^N(0[1-9]|1[0-6])$/);
      expect(ids.has(node.id)).toBe(false);
      ids.add(node.id);

      // Lat/Lng bounds for Manta, Ecuador
      expect(node.lat).toBeLessThan(-0.9);
      expect(node.lat).toBeGreaterThan(-1.05);
      expect(node.lng).toBeLessThan(-80.6);
      expect(node.lng).toBeGreaterThan(-80.85);

      expect(node.population).toBeGreaterThan(1000);
      expect(node.baseVectorRisk).toBeGreaterThanOrEqual(0);
      expect(node.baseVectorRisk).toBeLessThanOrEqual(1);
    }
  });

  it("verifies demographic invariance: population sum strictly equals 264,281 inhabitants", () => {
    const nodes = JSON.parse(readFileSync(NODES_PATH, "utf-8"));
    const totalPopulation = nodes.reduce(
      (sum: number, n: any) => sum + n.population,
      0,
    );

    // Official census coverage for the 16 nodes: 264,281 hab. (97.5% of 271,145 hab.)
    expect(totalPopulation).toBe(264281);
  });
});

describe("Task 03: Climate Series Multipliers", () => {
  it("verifies 60 daily climate records with valid coastal ranges", () => {
    const climate = JSON.parse(readFileSync(CLIMATE_PATH, "utf-8"));
    expect(Array.isArray(climate)).toBe(true);
    expect(climate.length).toBe(60);

    for (let day = 1; day <= 60; day++) {
      const record = climate[day - 1];
      expect(record.day).toBe(day);
      expect(record.temperatureC).toBeGreaterThanOrEqual(20);
      expect(record.temperatureC).toBeLessThanOrEqual(35);
      expect(record.vectorMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(record.vectorMultiplier).toBeLessThanOrEqual(1.5);
    }
  });
});

describe("Task 03: Provenance Manifest & SHA-256 Integrity", () => {
  it("verifies manifest metadata and SHA-256 checksums match physical fixture files", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    expect(manifest.version).toBeDefined();
    expect(manifest.totalPopulation).toBe(264281);
    expect(manifest.sources.length).toBeGreaterThanOrEqual(4);

    // Verify SHA-256 for manta-nodes.json (normalize line endings for cross-platform deterministic hashing)
    const nodesRaw = readFileSync(NODES_PATH, "utf-8").replace(/\r\n/g, "\n");
    const expectedNodesSha = createHash("sha256").update(nodesRaw).digest("hex");
    expect(manifest.files["manta-nodes.json"].sha256).toBe(expectedNodesSha);

    // Verify SHA-256 for climate-manta.json (normalize line endings for cross-platform deterministic hashing)
    const climateRaw = readFileSync(CLIMATE_PATH, "utf-8").replace(/\r\n/g, "\n");
    const expectedClimateSha = createHash("sha256").update(climateRaw).digest("hex");
    expect(manifest.files["climate-manta.json"].sha256).toBe(expectedClimateSha);
  });

  it("verifies ethical disclaimer: hospital capacity is labeled as municipal contingency threshold", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    const hospitalSource = manifest.sources.find(
      (s: any) => s.dimension === "Capacidad Hospitalaria",
    );

    expect(hospitalSource).toBeDefined();
    expect(hospitalSource.notes.toLowerCase()).toContain("contingencia");
  });
});

describe("Task 03: Forbidden PII and Patient Privacy Gate", () => {
  it("ensures zero PII, personal phone numbers, or Ecuadorian cédulas across all fixtures", () => {
    const filesToScan = [NODES_PATH, CLIMATE_PATH, MANIFEST_PATH];
    // Regex for 10-digit ID numbers, email addresses, or phone patterns
    const cedulaRegex = /\b\d{10}\b/;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
    const phoneRegex = /\b(\+593|09)\d{8}\b/;

    for (const file of filesToScan) {
      const content = readFileSync(file, "utf-8");
      expect(emailRegex.test(content)).toBe(false);
      expect(phoneRegex.test(content)).toBe(false);
      expect(cedulaRegex.test(content)).toBe(false);
    }
  });
});
