import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { authorize, json } from "./auth";
import { NEWS_BODY_LIMIT, NEWS_ROUTE, handleNewsRoute } from "./news";
import { RESEARCH_VOICE_ROUTE, handleResearchVoice } from './researchVoice';
import { RESEARCH_BODY_LIMIT, RESEARCH_ROUTE, handleResearchAgent } from './researchAgent';
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { handleCommitteeRoute } from './committee/http';

export function invitationAuth(env: Record<string, string>): Plugin {
  const middleware =
    (port: number) =>
    async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (!req.url?.startsWith("/api/")) return next();
      const origin = env.INVITE_APP_ORIGIN || `http://localhost:${port}`;
      const pathname = req.url.split("?")[0] ?? req.url;
      // /api/news necesita un cuerpo algo mayor (estado de partida) que el resto.
      const bodyLimit = pathname === RESEARCH_ROUTE ? RESEARCH_BODY_LIMIT : pathname === NEWS_ROUTE ? NEWS_BODY_LIMIT : 4096;
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > bodyLimit) {
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
        const serverEnv: Record<string, string | undefined> = { ...env, INVITE_APP_ORIGIN: origin };
        const clientIp = req.socket.remoteAddress ?? "unknown";
        let response = await authorize(request, clientIp, serverEnv);
        // Después de autorizar y antes del 404: boletín diario generado en servidor.
        if (!response && pathname === NEWS_ROUTE)
          response = await handleNewsRoute(request, clientIp, serverEnv);
        if (!response && pathname === RESEARCH_ROUTE) response = await handleResearchAgent(request, clientIp, serverEnv);
        if (!response && pathname === RESEARCH_VOICE_ROUTE) response = await handleResearchVoice(request, clientIp, serverEnv);
        if (!response && pathname.startsWith("/api/committee/")) {
          const localPolicyReader = !serverEnv.COMMITTEE_RESULTS_BUCKET ? {
            async latest() {
              const localCandidates = [
                "committee-policy.local.json",
                "docs/features/committee-learning/evidence/raw/local-registered-policy.json",
              ];
              for (const rel of localCandidates) {
                const fullPath = join(process.cwd(), rel);
                if (existsSync(fullPath)) {
                  try {
                    return JSON.parse(readFileSync(fullPath, "utf-8"));
                  } catch {}
                }
              }
              return null;
            },
          } : undefined;
          response = await handleCommitteeRoute(request, serverEnv, undefined, localPolicyReader);
        }
        response ??= json(404, { error: "Ruta no encontrada." });
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
