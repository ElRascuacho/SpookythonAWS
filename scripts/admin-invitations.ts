import { InvitationService } from "../backend/auth/invitationService";
import { InMemoryDatabase } from "../backend/storage/inMemoryDatabase";
import { hashSecret } from "../backend/auth/crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_STORE_PATH = join(process.cwd(), ".admin-invitations-store.json");

function loadDb(): InMemoryDatabase {
  const db = new InMemoryDatabase();
  if (existsSync(LOCAL_STORE_PATH)) {
    try {
      const data = JSON.parse(readFileSync(LOCAL_STORE_PATH, "utf-8"));
      for (const item of data) {
        db.putItem(item);
      }
    } catch {
      // ignore
    }
  }
  return db;
}

async function saveDb(db: InMemoryDatabase): Promise<void> {
  const items = await db.scanAll();
  writeFileSync(LOCAL_STORE_PATH, JSON.stringify(items, null, 2), "utf-8");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const db = loadDb();
  const service = new InvitationService(db);

  if (command === "create") {
    let label = "Jurado Spookython";
    let quota = 20;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--label" && args[i + 1]) {
        label = args[i + 1];
        i++;
      } else if (args[i] === "--quota" && args[i + 1]) {
        quota = parseInt(args[i + 1], 10);
        i++;
      }
    }

    const created = await service.createInvitation({ label, maxJobsPerDay: quota });
    await saveDb(db);

    console.log("=================================================");
    console.log("  NUEVA INVITACIÓN CREADA CON ÉXITO");
    console.log("=================================================");
    console.log(`ID:           ${created.invitationId}`);
    console.log(`Etiqueta:     ${created.label}`);
    console.log(`Cuota diaria: ${quota} jobs/día`);
    console.log(`Expira:       ${created.expiresAt}`);
    console.log(`Hash SHA-256: ${created.codeHash}`);
    console.log("-------------------------------------------------");
    console.log(`CÓDIGO SECRETO (compártelo solo una vez con el invitado):`);
    console.log(`  ${created.code}`);
    console.log("=================================================");
  } else if (command === "list") {
    const list = await service.listInvitations();
    console.log("=========================================================================================");
    console.log(`  LISTADO DE INVITACIONES REGISTRADAS (${list.length} en total)`);
    console.log("  (Por seguridad, los códigos originales NUNCA se almacenan en texto plano)");
    console.log("=========================================================================================");
    if (list.length === 0) {
      console.log("No hay invitaciones creadas aún.");
    } else {
      console.table(
        list.map((inv) => ({
          ID: inv.invitationId.slice(0, 8) + "...",
          Etiqueta: inv.label,
          Estado: inv.status,
          Cuota: `${inv.activeJobsCount}/${inv.maxJobsPerDay}`,
          HashSHA256: inv.codeHash.slice(0, 12) + "...",
          Expira: inv.expiresAt.slice(0, 16),
        })),
      );
    }
  } else if (command === "revoke") {
    let target = "";
    for (let i = 1; i < args.length; i++) {
      if ((args[i] === "--code" || args[i] === "--id") && args[i + 1]) {
        target = args[i + 1];
        i++;
      }
    }

    if (!target) {
      console.error("Error: Proporcione --id <invitationId> o --code <código> para revocar.");
      process.exit(1);
    }

    let invId = target;
    if (target.startsWith("SPK-") || target.startsWith("MC-")) {
      const codeHash = hashSecret(target);
      const lookup = await db.getItem(`CODE#${codeHash}`, "RESOLVE");
      if (!lookup) {
        console.error("Error: Código no encontrado.");
        process.exit(1);
      }
      invId = lookup.invitationId;
    }

    const ok = await service.revokeInvitation(invId);
    if (ok) {
      await saveDb(db);
      console.log(`Invitación ${invId} revocada exitosamente.`);
    } else {
      console.error(`No se encontró la invitación ${invId}.`);
    }
  } else {
    console.log("Uso del CLI administrativo de invitaciones:");
    console.log("  bun run scripts/admin-invitations.ts create --label \"Jurado 1\" --quota 20");
    console.log("  bun run scripts/admin-invitations.ts list");
    console.log("  bun run scripts/admin-invitations.ts revoke --code \"<CÓDIGO>\"");
    console.log("  bun run scripts/admin-invitations.ts revoke --id \"<invitationId>\"");
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error en CLI:", err);
    process.exit(1);
  });
}
