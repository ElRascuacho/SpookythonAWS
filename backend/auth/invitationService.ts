import { randomUUID } from "node:crypto";
import { generateInvitationCode, hashSecret } from "./crypto";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";

export type InvitationStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export interface InvitationRecord {
  invitationId: string;
  codeHash: string;
  label: string;
  maxJobsPerDay: number;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  activeJobsCount: number;
  ttl: number;
}

export interface CreateInvitationOptions {
  label?: string;
  maxJobsPerDay?: number;
  expiresInDays?: number;
}

export interface CreatedInvitation {
  code: string;
  invitationId: string;
  codeHash: string;
  label: string;
  expiresAt: string;
  status: InvitationStatus;
}

export class InvitationService {
  constructor(private db: InMemoryDatabase) {}

  async createInvitation(options: CreateInvitationOptions = {}): Promise<CreatedInvitation> {
    const code = generateInvitationCode();
    const codeHash = hashSecret(code);
    const invitationId = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresInDays = options.expiresInDays ?? 7;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const ttl = Math.floor(Date.parse(expiresAt) / 1000);

    const invItem: InvitationRecord & { PK: string; SK: string } = {
      PK: `INV#${invitationId}`,
      SK: "METADATA",
      invitationId,
      codeHash,
      label: options.label || "Jurado Spookython",
      maxJobsPerDay: options.maxJobsPerDay ?? 20,
      status: "ACTIVE",
      createdAt,
      expiresAt,
      activeJobsCount: 0,
      ttl,
    };

    const lookupItem = {
      PK: `CODE#${codeHash}`,
      SK: "RESOLVE",
      codeHash,
      invitationId,
      ttl,
    };

    await this.db.transactWrite([
      { type: "Put", item: invItem },
      { type: "Put", item: lookupItem },
    ]);

    return {
      code,
      invitationId,
      codeHash,
      label: invItem.label,
      expiresAt,
      status: "ACTIVE",
    };
  }

  async validateInvitation(code: string): Promise<InvitationRecord | null> {
    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return null;
    }

    const codeHash = hashSecret(code.trim());
    const lookup = await this.db.getItem(`CODE#${codeHash}`, "RESOLVE");
    if (!lookup || !lookup.invitationId) {
      return null;
    }

    const inv = await this.db.getItem(`INV#${lookup.invitationId}`, "METADATA");
    if (!inv) {
      return null;
    }

    const now = new Date().toISOString();
    if (inv.status !== "ACTIVE" || inv.expiresAt <= now) {
      return null;
    }

    return inv as InvitationRecord;
  }

  async getInvitationById(invitationId: string): Promise<InvitationRecord | null> {
    const inv = await this.db.getItem(`INV#${invitationId}`, "METADATA");
    if (!inv) return null;
    return inv as InvitationRecord;
  }

  async revokeInvitation(invitationId: string): Promise<boolean> {
    const inv = await this.getInvitationById(invitationId);
    if (!inv) return false;

    await this.db.transactWrite([
      {
        type: "Update",
        PK: `INV#${invitationId}`,
        SK: "METADATA",
        update: (item) => {
          item.status = "REVOKED";
        },
      },
    ]);
    return true;
  }

  async listInvitations(): Promise<Array<Omit<InvitationRecord, "PK" | "SK">>> {
    const all = await this.db.scanAll();
    const now = new Date().toISOString();
    return all
      .filter((item) => item.PK.startsWith("INV#") && item.SK === "METADATA")
      .map((item) => {
        let status = item.status;
        if (status === "ACTIVE" && item.expiresAt <= now) {
          status = "EXPIRED";
        }
        return {
          invitationId: item.invitationId,
          codeHash: item.codeHash,
          label: item.label,
          maxJobsPerDay: item.maxJobsPerDay,
          status,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
          activeJobsCount: item.activeJobsCount,
          ttl: item.ttl,
        };
      });
  }
}
