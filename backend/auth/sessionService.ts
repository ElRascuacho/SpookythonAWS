import { randomUUID } from "node:crypto";
import { generateSessionToken, hashSecret } from "./crypto";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { InvitationService, InvitationRecord } from "./invitationService";

export interface SessionRecord {
  tokenHash: string;
  sessionId: string;
  invitationId: string;
  invitationKey: string;
  createdAt: string;
  expiresAt: string;
  ttl: number;
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  invitationId: string;
  expiresAt: string;
}

export interface VerifiedSession {
  sessionId: string;
  invitationId: string;
  invitationKey: string;
  expiresAt: string;
  invitation: InvitationRecord;
}

export class SessionService {
  constructor(
    private db: InMemoryDatabase,
    private invitationService: InvitationService,
  ) {}

  async createSession(invitationId: string, codeHash: string): Promise<CreatedSession> {
    const inv = await this.invitationService.getInvitationById(invitationId);
    if (!inv || inv.status !== "ACTIVE") {
      throw new Error("No se puede crear sesión para una invitación inactiva o inexistente.");
    }

    const token = generateSessionToken();
    const tokenHash = hashSecret(token);
    const sessionId = randomUUID();
    const createdAt = new Date().toISOString();

    // Session lifespan: min(12 hours, invitation expiration)
    const sessionMaxDurationMs = 12 * 60 * 60 * 1000;
    const invExpiryMs = Date.parse(inv.expiresAt);
    const sessionExpiryMs = Math.min(Date.now() + sessionMaxDurationMs, invExpiryMs);
    const expiresAt = new Date(sessionExpiryMs).toISOString();
    const ttl = Math.floor(sessionExpiryMs / 1000);

    const sessionItem: SessionRecord & { PK: string; SK: string } = {
      PK: `SES#${tokenHash}`,
      SK: "METADATA",
      tokenHash,
      sessionId,
      invitationId,
      invitationKey: `INV#${invitationId}`,
      createdAt,
      expiresAt,
      ttl,
    };

    await this.db.putItem(sessionItem);

    return {
      token,
      sessionId,
      invitationId,
      expiresAt,
    };
  }

  async verifySession(token: string): Promise<VerifiedSession | null> {
    if (!token || typeof token !== "string" || !token.startsWith("ses_")) {
      return null;
    }

    const tokenHash = hashSecret(token);
    const session = await this.db.getItem(`SES#${tokenHash}`, "METADATA");
    if (!session) {
      return null;
    }

    const now = new Date().toISOString();
    if (session.expiresAt <= now) {
      return null;
    }

    // Crucial: Re-verify owning invitation status on EVERY request to ensure immediate revocation
    const inv = await this.invitationService.getInvitationById(session.invitationId);
    if (!inv || inv.status !== "ACTIVE" || inv.expiresAt <= now) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      invitationId: session.invitationId,
      invitationKey: session.invitationKey,
      expiresAt: session.expiresAt,
      invitation: inv,
    };
  }

  async revokeSession(token: string): Promise<void> {
    if (!token || !token.startsWith("ses_")) return;
    const tokenHash = hashSecret(token);
    await this.db.deleteItem(`SES#${tokenHash}`, "METADATA");
  }
}
