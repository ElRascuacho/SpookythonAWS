import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Generates an invitation code with at least 128 bits (16 bytes) of cryptographic entropy.
 * Format: SPK-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateInvitationCode(): string {
  // 16 bytes = 128 bits of entropy
  const bytes = randomBytes(16);
  // Format into 6 blocks of 4 hex chars or base32 chars
  const hex = bytes.toString("hex").toUpperCase();
  const chunks: string[] = [];
  for (let i = 0; i < hex.length; i += 4) {
    chunks.push(hex.substring(i, i + 4));
  }
  return `SPK-${chunks.join("-")}`;
}

/**
 * Generates an opaque session token with 256 bits (32 bytes) of cryptographic entropy.
 * Format: ses_<64 hex chars>
 */
export function generateSessionToken(): string {
  const bytes = randomBytes(32);
  return `ses_${bytes.toString("hex")}`;
}

/**
 * Generates a SHA-256 hex digest of the given secret string.
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
