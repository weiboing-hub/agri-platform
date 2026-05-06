import { pinia } from "../stores/pinia";
import { useSessionStore, type SessionPayload } from "../stores/session";

interface JwtPayload {
  exp?: number;
  [key: string]: unknown;
}

function getSessionStore() {
  return useSessionStore(pinia);
}

export function loadSession(): SessionPayload | null {
  return getSessionStore().session;
}

export function saveSession(session: SessionPayload | null): SessionPayload | null {
  return getSessionStore().setSession(session);
}

export function clearSession(): void {
  getSessionStore().clearSession();
}

export function decodeJwtPayload(token?: string | null): JwtPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isAccessTokenExpiringSoon(
  session: SessionPayload | null = loadSession(),
  thresholdMs = 60 * 1000
): boolean {
  const payload = decodeJwtPayload(session?.accessToken);
  if (!payload?.exp) {
    return false;
  }
  return payload.exp * 1000 - Date.now() <= thresholdMs;
}

export function getPermissionCodes(session: SessionPayload | null = loadSession()): string[] {
  return session?.permissionCodes || [];
}

export function hasPermission(
  permissionCode: string,
  session: SessionPayload | null = loadSession()
): boolean {
  const permissionCodes = getPermissionCodes(session);
  return permissionCodes.includes(permissionCode);
}

export function hasAnyPermission(
  permissionCodes: string[] = [],
  session: SessionPayload | null = loadSession()
): boolean {
  if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) {
    return true;
  }
  const granted = new Set(getPermissionCodes(session));
  return permissionCodes.some((permissionCode) => granted.has(permissionCode));
}
