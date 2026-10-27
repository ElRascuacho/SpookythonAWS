import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { S3StorageService } from "../storage/s3Client";
import { InvitationService } from "../auth/invitationService";
import { SessionService } from "../auth/sessionService";
import { JobAdmissionService } from "../services/jobAdmissionService";
import { JobQueryService } from "../services/jobQueryService";
import {
  createSessionCookieHeader,
  createClearSessionCookieHeader,
  parseSessionCookie,
} from "../auth/cookieHelper";
import {
  CreateSessionRequestSchema,
  CreateJobRequestSchema,
  JobVisibilitySchema,
} from "../../src/domain/schemas/api.schema";

export interface ApiHandlerDependencies {
  db: InMemoryDatabase;
  s3: S3StorageService;
  invitationService: InvitationService;
  sessionService: SessionService;
  jobAdmissionService: JobAdmissionService;
  jobQueryService: JobQueryService;
}

const COMMON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...extraHeaders,
    },
  });
}

function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse({ ok: false, error: message, code }, status);
}

export function createApiHandler(deps: ApiHandlerDependencies) {
  return async function apiHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    try {
      // 1. Auth routes (/api/v1/auth/session)
      if (path === "/api/v1/auth/session") {
        if (method === "POST") {
          let bodyText = "";
          try {
            bodyText = await req.text();
          } catch {
            return errorResponse("Cuerpo de solicitud no válido.", 400);
          }

          let jsonBody: any;
          try {
            jsonBody = bodyText ? JSON.parse(bodyText) : {};
          } catch {
            return errorResponse("JSON malformado.", 400);
          }

          const parsed = CreateSessionRequestSchema.safeParse(jsonBody);
          if (!parsed.success) {
            return errorResponse(
              (parsed.error.issues?.[0]?.message || (parsed.error as unknown as { errors?: Array<{ message?: string }> }).errors?.[0]?.message) || "Código de invitación no válido.",
              400,
            );
          }

          const inv = await deps.invitationService.validateInvitation(parsed.data.code);
          if (!inv) {
            return errorResponse(
              "Código de invitación no válido, expirado o revocado.",
              401,
              "UNAUTHORIZED",
            );
          }

          const session = await deps.sessionService.createSession(inv.invitationId, inv.codeHash);
          const cookie = createSessionCookieHeader(session.token);

          return jsonResponse(
            {
              ok: true,
              invitationId: inv.invitationId,
              expiresAt: session.expiresAt,
            },
            200,
            { "Set-Cookie": cookie },
          );
        }

        if (method === "GET") {
          const cookieHeader = req.headers.get("cookie") || undefined;
          const token = parseSessionCookie(cookieHeader);
          if (!token) {
            return errorResponse("No autenticado.", 401, "UNAUTHORIZED");
          }

          const verified = await deps.sessionService.verifySession(token);
          if (!verified) {
            return errorResponse("Sesión inválida o expirada.", 401, "UNAUTHORIZED");
          }

          return jsonResponse({
            ok: true,
            invitationId: verified.invitationId,
            sessionId: verified.sessionId,
            expiresAt: verified.expiresAt,
          });
        }

        if (method === "DELETE") {
          const cookieHeader = req.headers.get("cookie") || undefined;
          const token = parseSessionCookie(cookieHeader);
          if (token) {
            await deps.sessionService.revokeSession(token);
          }
          const clearCookie = createClearSessionCookieHeader();
          return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearCookie });
        }

        return errorResponse("Método no permitido.", 405);
      }

      // All remaining /api/v1/jobs* endpoints strictly REQUIRE authentication
      const cookieHeader = req.headers.get("cookie") || undefined;
      const token = parseSessionCookie(cookieHeader);
      if (!token) {
        return errorResponse("Acceso no autorizado. Inicie sesión.", 401, "UNAUTHORIZED");
      }

      const verified = await deps.sessionService.verifySession(token);
      if (!verified) {
        return errorResponse("Sesión no válida o expirada.", 401, "UNAUTHORIZED");
      }

      const callerInvitationId = verified.invitationId;

      // 2. Jobs shared gallery (/api/v1/jobs/shared)
      if (path === "/api/v1/jobs/shared") {
        if (method !== "GET") {
          return errorResponse("Método no permitido.", 405);
        }
        const jobs = await deps.jobQueryService.listSharedJobs();
        return jsonResponse({ ok: true, jobs });
      }

      // 3. Jobs collection (/api/v1/jobs)
      if (path === "/api/v1/jobs") {
        if (method === "GET") {
          const jobs = await deps.jobQueryService.listOwnJobs(callerInvitationId);
          return jsonResponse({ ok: true, jobs });
        }

        if (method === "POST") {
          let bodyText = "";
          try {
            bodyText = await req.text();
          } catch {
            return errorResponse("Cuerpo no válido.", 400);
          }

          let jsonBody: any = {};
          if (bodyText) {
            try {
              jsonBody = JSON.parse(bodyText);
            } catch {
              return errorResponse("JSON malformado.", 400);
            }
          }

          const parsed = CreateJobRequestSchema.safeParse(jsonBody);
          if (!parsed.success) {
            return errorResponse(
              (parsed.error.issues?.[0]?.message || (parsed.error as unknown as { errors?: Array<{ message?: string }> }).errors?.[0]?.message) || "Parámetros de trabajo inválidos.",
              400,
            );
          }

          const idempotencyKey =
            req.headers.get("Idempotency-Key") ||
            parsed.data.idempotencyKey ||
            undefined;

          try {
            const admitted = await deps.jobAdmissionService.admitJob({
              invitationId: callerInvitationId,
              params: parsed.data.params,
              enableAiStrategy: parsed.data.enableAiStrategy,
              visibility: parsed.data.visibility,
              idempotencyKey,
            });

            return jsonResponse(
              {
                ok: true,
                jobId: admitted.jobId,
                status: admitted.status,
                estimatedTimeSeconds: admitted.estimatedTimeSeconds,
                idempotent: admitted.idempotent,
              },
              202,
            );
          } catch (err: any) {
            const msg = err.message || "Error al admitir trabajo.";
            if (msg.includes("Conflicto de idempotencia") || msg.includes("Slot activo ocupado")) {
              return errorResponse(msg, 409, "CONFLICT");
            }
            if (msg.includes("Cuota")) {
              return errorResponse(msg, 429, "QUOTA_EXCEEDED");
            }
            return errorResponse(msg, 400);
          }
        }

        return errorResponse("Método no permitido.", 405);
      }

      // 4. Jobs item routes (/api/v1/jobs/:id and /api/v1/jobs/:id/results)
      const jobItemMatch = path.match(/^\/api\/v1\/jobs\/([a-zA-Z0-9_-]+)(\/results)?$/);
      if (jobItemMatch) {
        const jobId = jobItemMatch[1];
        const isResults = jobItemMatch[2] === "/results";

        if (isResults) {
          if (method !== "GET") return errorResponse("Método no permitido.", 405);
          try {
            const results = await deps.jobQueryService.getJobResultsProxy(jobId, callerInvitationId);
            return jsonResponse(results);
          } catch (err: any) {
            const msg = err.message || "Error al obtener resultados.";
            if (msg.includes("no encontrado")) return errorResponse(msg, 404, "NOT_FOUND");
            if (msg.includes("no ha finalizado")) return errorResponse(msg, 409, "JOB_NOT_READY");
            return errorResponse(msg, 400);
          }
        }

        if (method === "GET") {
          try {
            const job = await deps.jobQueryService.getJobStatus(jobId, callerInvitationId);
            return jsonResponse({ ok: true, job });
          } catch (err: any) {
            return errorResponse(err.message || "Trabajo no encontrado.", 404, "NOT_FOUND");
          }
        }

        if (method === "PATCH") {
          let bodyText = "";
          try {
            bodyText = await req.text();
          } catch {
            return errorResponse("Cuerpo no válido.", 400);
          }

          let jsonBody: any = {};
          try {
            jsonBody = JSON.parse(bodyText);
          } catch {
            return errorResponse("JSON malformado.", 400);
          }

          const parsedVisibility = JobVisibilitySchema.safeParse(jsonBody.visibility);
          if (!parsedVisibility.success) {
            return errorResponse("Visibilidad no válida (debe ser PRIVATE o SHARED_INVITEES).", 400);
          }

          try {
            const updated = await deps.jobQueryService.updateJobVisibility(
              jobId,
              callerInvitationId,
              parsedVisibility.data,
            );
            return jsonResponse({ ok: true, job: updated });
          } catch (err: any) {
            return errorResponse(err.message || "No autorizado.", 403, "FORBIDDEN");
          }
        }

        return errorResponse("Método no permitido.", 405);
      }

      return errorResponse("Ruta no encontrada.", 404, "NOT_FOUND");
    } catch (err: any) {
      return errorResponse(err.message || "Error interno del servidor.", 500, "INTERNAL_ERROR");
    }
  };
}
