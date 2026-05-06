import { defineStore } from "pinia";

const STORAGE_KEY = "agri_admin_session";

export interface SessionTenant {
  id?: number | null;
  tenantCode?: string | null;
  tenantName?: string | null;
  tenantSlug?: string | null;
}

export interface SessionUser {
  id?: number | null;
  username?: string | null;
  realName?: string | null;
}

export interface SessionDataScope {
  targetType?: string | null;
  scopeType?: string | null;
  targetId?: string | number | null;
}

export interface SessionPayload {
  accessToken?: string | null;
  refreshToken?: string | null;
  permissionCodes?: string[];
  user?: SessionUser | null;
  tenant?: SessionTenant | null;
  dataScopes?: SessionDataScope[];
  [key: string]: unknown;
}

function readPersistedSession(): SessionPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionPayload) : null;
  } catch {
    return null;
  }
}

function persistSession(session: SessionPayload | null): void {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore localStorage failures
  }
}

export const useSessionStore = defineStore("session", {
  state: () => ({
    session: readPersistedSession() as SessionPayload | null
  }),
  getters: {
    accessToken: (state): string => state.session?.accessToken || "",
    refreshToken: (state): string => state.session?.refreshToken || "",
    permissionCodes: (state): string[] => state.session?.permissionCodes || [],
    isAuthenticated: (state): boolean => Boolean(state.session?.accessToken)
  },
  actions: {
    hydrate(): SessionPayload | null {
      this.session = readPersistedSession();
      return this.session;
    },
    setSession(session: SessionPayload | null): SessionPayload | null {
      this.session = session || null;
      persistSession(this.session);
      return this.session;
    },
    clearSession(): void {
      this.session = null;
      persistSession(null);
    }
  }
});
