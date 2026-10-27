import { randomBytes, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

const REGION = process.env.AWS_REGION || "us-east-1";
const LOCAL_STORE_PATH = join(process.cwd(), ".admin-invitations-store.json");

interface InvitationMetadata {
  invitationId: string;
  label: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  hoursValid: number;
  maxSimulations: number;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  deployedToCloud: boolean;
}

function loadStore(): InvitationMetadata[] {
  if (existsSync(LOCAL_STORE_PATH)) {
    try {
      return JSON.parse(readFileSync(LOCAL_STORE_PATH, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

function saveStore(items: InvitationMetadata[]): void {
  writeFileSync(LOCAL_STORE_PATH, JSON.stringify(items, null, 2), "utf-8");
}

function hashInvitation(code: string): string {
  return createHash("sha256")
    .update(code.replace(/[\s-]/g, "").toUpperCase())
    .digest("hex");
}

async function findLambdaFunctionName(client: LambdaClient): Promise<string> {
  if (process.env.LAMBDA_FUNCTION_NAME) {
    return process.env.LAMBDA_FUNCTION_NAME;
  }
  const res = await client.send(new ListFunctionsCommand({}));
  const fn = res.Functions?.find(
    (f) =>
      f.FunctionName?.includes("MonteCarloSimFunction") ||
      f.FunctionName?.startsWith("spookython-manta-cero"),
  );
  if (!fn?.FunctionName) {
    throw new Error(
      "No se encontró la función Lambda del simulador en AWS. Verifica que el stack 'spookython-manta-cero' esté desplegado.",
    );
  }
  return fn.FunctionName;
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let name = "Invitado Spookython";
  let hours = 8;
  let sims = 20;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--name" || arg === "-n") && args[i + 1]) {
      name = args[i + 1];
      i++;
    } else if ((arg === "--hours" || arg === "-h") && args[i + 1]) {
      hours = parseFloat(args[i + 1]) || 8;
      i++;
    } else if ((arg === "--sims" || arg === "-s" || arg === "--quota") && args[i + 1]) {
      sims = parseInt(args[i + 1], 10) || 20;
      i++;
    }
  }

  return { name, hours, sims };
}

async function main() {
  const { name, hours, sims } = parseCliArgs();

  console.log("\n=======================================================");
  console.log("  GENERADOR DE ACCESO TEMPORAL — OPERACIÓN MANTA CERO");
  console.log("=======================================================");
  console.log(`👤 Destinatario:       ${name}`);
  console.log(`⏱️  Duración:           ${hours} horas`);
  console.log(`📊 Cuota estimada:     ${sims} simulaciones`);

  // 1. Generar código en formato compatible con frontend (MC-XXXXX-XXXXX-XXXXX-XXXXX)
  const code = `MC-${randomBytes(10).toString("hex").toUpperCase().match(/.{5}/g)!.join("-")}`;
  const codeHash = hashInvitation(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  const invitationId = randomBytes(6).toString("hex");

  console.log("\n[1/3] Conectando con AWS Lambda...");
  const lambda = new LambdaClient({ region: REGION });
  const functionName = await findLambdaFunctionName(lambda);
  console.log(`      Función detectada: ${functionName}`);

  // 2. Obtener variables actuales
  console.log("[2/3] Obteniendo configuración y agregando hash criptográfico...");
  const config = await lambda.send(
    new GetFunctionConfigurationCommand({ FunctionName: functionName }),
  );
  const currentVars = config.Environment?.Variables || {};
  const existingHashes = (currentVars.INVITE_CODE_HASHES || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  if (!existingHashes.includes(codeHash)) {
    existingHashes.push(codeHash);
  }

  // 3. Actualizar Lambda en caliente
  console.log("[3/3] Inyectando nuevo acceso a AWS Lambda...");
  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Environment: {
        Variables: {
          ...currentVars,
          INVITE_CODE_HASHES: existingHashes.join(","),
        },
      },
    }),
  );

  // 4. Guardar registro local
  const store = loadStore();
  store.push({
    invitationId,
    label: name,
    codeHash,
    createdAt: now.toISOString(),
    expiresAt,
    hoursValid: hours,
    maxSimulations: sims,
    status: "ACTIVE",
    deployedToCloud: true,
  });
  saveStore(store);

  console.log("\n=======================================================");
  console.log("  ¡ACCESO CREADO Y SINCRONIZADO EN AWS EXITOSAMENTE!");
  console.log("=======================================================");
  console.log(`🔑 CÓDIGO DE ACCESO:`);
  console.log(`   ${code}`);
  console.log("-------------------------------------------------------");
  console.log(`🌐 Aplicación en producción:`);
  console.log(`   https://d1jqe51rtigrcl.cloudfront.net`);
  console.log(`📅 Válido hasta:      ${expiresAt}`);
  console.log(`🛡️  Hash registrado:   ${codeHash.slice(0, 16)}...`);
  console.log("=======================================================\n");
  console.log("Tip: El usuario solo debe ingresar el código en la pantalla de bienvenida.");
}

main().catch((err) => {
  console.error("\n❌ Error al sincronizar el código con AWS:", err.message);
  process.exit(1);
});
