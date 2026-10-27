export const SESSION_COOKIE_NAME = "spk_session";
export const SESSION_COOKIE_PATH = "/api/v1";
export const SESSION_COOKIE_MAX_AGE = 43200; // 12 hours

/**
 * Creates the Set-Cookie string for a valid session token.
 */
export function createSessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=${SESSION_COOKIE_PATH}; Max-Age=${SESSION_COOKIE_MAX_AGE}`;
}

/**
 * Creates the Set-Cookie string to invalidate and remove the session token from the browser.
 */
export function createClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=${SESSION_COOKIE_PATH}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Parses the session token from a Cookie header string.
 */
export function parseSessionCookie(cookieHeader?: string): string | null {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      const val = trimmed.substring(SESSION_COOKIE_NAME.length + 1).trim();
      return val.length > 0 ? val : null;
    }
  }

  return null;
}
