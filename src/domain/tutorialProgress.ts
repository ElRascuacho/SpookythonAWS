const COOKIE_NAME = "manta_cero_tutorial";
const VERSION = "2";
export const TUTORIAL_COMPLETED_KEY = "manta-cero:tutorial:completed:v2";

export function tutorialCookieComplete(cookie: string): boolean {
  return cookie.split(";").some(part => part.trim() === `${COOKIE_NAME}=${VERSION}`);
}

export function hasCompletedTutorial(): boolean {
  try { if (tutorialCookieComplete(document.cookie)) return true; } catch { /* Cookies may be blocked. */ }
  try { return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === VERSION; } catch { return false; }
}

export function rememberTutorialCompletion(): void {
  // This is a browser preference, not an authentication or authorization token.
  try {
    document.cookie = `${COOKIE_NAME}=${VERSION}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* Try independent local storage below. */ }
  try { localStorage.setItem(TUTORIAL_COMPLETED_KEY, VERSION); } catch { /* Completion still unlocks this session. */ }
}
