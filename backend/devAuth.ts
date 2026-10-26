import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { authorize, json } from "./auth";

export function invitationAuth(env: Record<string, string>): Plugin {
  const middleware =
    (port: number) =>
    async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (!req.url?.startsWith("/api/")) return next();
      const origin = env.INVITE_APP_ORIGIN || `http://localhost:${port}`;
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) {
            res.writeHead(413, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            res.end(JSON.stringify({ error: "Solicitud demasiado grande." }));
            return;
          }
          chunks.push(Buffer.from(chunk));
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers))
          if (value)
            headers.set(key, Array.isArray(value) ? value.join("; ") : value);
        const request = new Request(new URL(req.url, origin), {
          method: req.method,
          headers,
          body:
            req.method === "GET" || req.method === "HEAD"
              ? undefined
              : Buffer.concat(chunks),
        });
        const response =
          (await authorize(request, req.socket.remoteAddress ?? "unknown", {
            ...env,
            INVITE_APP_ORIGIN: origin,
          })) ?? json(404, { error: "Ruta no encontrada." });
        res.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries()),
        );
        res.end(await response.text());
      } catch {
        res.writeHead(500, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify({
            error: "No pudimos verificar el acceso. Vuelve a intentarlo.",
          }),
        );
      }
    };
  return {
    name: "invitation-auth",
    configureServer(server) {
      server.middlewares.use(middleware(server.config.server.port ?? 5173));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(server.config.preview.port ?? 4173));
    },
  };
}
