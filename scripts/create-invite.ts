import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { hashInvitation } from "../backend/auth";

if (existsSync(".env.local") || existsSync(".invite-code.local")) {
  console.error(
    "Ya existe configuración local. No se sobrescribió nada. Consulta README para rotar el acceso.",
  );
  process.exit(1);
}
const code = `MC-${randomBytes(10).toString("hex").toUpperCase().match(/.{5}/g)!.join("-")}`;
writeFileSync(
  ".env.local",
  `INVITE_CODE_HASHES=${hashInvitation(code)}\nINVITE_SESSION_SECRET=${randomBytes(32).toString("hex")}\n`,
  { flag: "wx", mode: 0o600 },
);
writeFileSync(".invite-code.local", `${code}\n`, { flag: "wx", mode: 0o600 });
console.log(
  "Acceso creado. Tu código está en .invite-code.local; comparte solo ese código con tus invitados. Reinicia Vite.",
);
