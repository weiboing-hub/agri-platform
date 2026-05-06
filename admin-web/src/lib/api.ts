import { clearSession, isAccessTokenExpiringSoon, loadSession, saveSession } from "./session";
import type { SessionPayload } from "../stores/session";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const DEFAULT_TIMEOUT_MS = 30000;
const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);

let refreshPromise: Promise<SessionPayload | null> | null = null;

interface ApiErrorOptions {
  code?: string;
  status?: number;
  details?: unknown;
}

interface ApiEnvelope<T = unknown> {
  ok?: boolean;
  message?: string;
  error?: string;
  details?: unknown;
  data?: T;
  [key: string]: unknown;
}

export interface ApiRequestOptions extends RequestInit {
  skipAuth?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  _retriedAfterRefresh?: boolean;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.code = options.code || "request_failed";
    this.status = options.status || 500;
    this.details = options.details ?? null;
  }
}

async function parseResponsePayload<T = unknown>(response: Response): Promise<ApiEnvelope<T>> {
  const rawText = await response.text();
  return rawText ? (JSON.parse(rawText) as ApiEnvelope<T>) : {};
}

async function refreshAccessToken(): Promise<SessionPayload | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const session = loadSession();
      if (!session?.refreshToken) {
        throw new Error("登录状态已失效，请重新登录");
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          refreshToken: session.refreshToken
        })
      });
      const payload = await parseResponsePayload<Partial<SessionPayload>>(response);
      if (!response.ok || payload?.ok === false) {
        clearSession();
        throw new ApiError(payload?.message || "登录状态已失效，请重新登录", {
          code: payload?.error || "unauthorized",
          status: response.status,
          details: payload?.details ?? null
        });
      }

      const nextSession: SessionPayload = {
        ...session,
        ...(payload.data || {})
      };
      saveSession(nextSession);
      return nextSession;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export function buildQuery(params: Record<string, unknown> = {}): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    searchParams.append(key, String(value));
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

export async function apiRequest<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let session = loadSession();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string> | undefined) || {})
  };
  const method = String(options.method || "GET").toUpperCase();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const maxRetries = Number.isFinite(Number(options.maxRetries))
    ? Number(options.maxRetries)
    : (RETRYABLE_METHODS.has(method) ? 1 : 0);

  if (options.body !== undefined && options.body !== null && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (!options.skipAuth && session?.refreshToken && isAccessTokenExpiringSoon(session)) {
    session = await refreshAccessToken();
  }

  if (!options.skipAuth && session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let response: Response | null = null;
  let payload: ApiEnvelope<T> | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        signal: controller.signal
      });

      payload = await parseResponsePayload<T>(response);
      clearTimeout(timeoutId);
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt >= maxRetries) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ApiError("请求超时，请稍后重试", {
            code: "request_timeout",
            status: 408
          });
        }
        throw new ApiError("网络异常，请检查连接后重试", {
          code: "network_error",
          status: 0
        });
      }
    }
  }

  if (!response) {
    throw lastError instanceof Error ? lastError : new Error("请求失败");
  }

  if (
    response.status === 401 &&
    !options.skipAuth &&
    !options._retriedAfterRefresh &&
    !path.startsWith("/api/v1/auth/login") &&
    !path.startsWith("/api/v1/auth/refresh") &&
    session?.refreshToken
  ) {
    try {
      await refreshAccessToken();
      return apiRequest<T>(path, {
        ...options,
        _retriedAfterRefresh: true
      });
    } catch (error) {
      clearSession();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      throw error;
    }
  }

  if (response.status === 401) {
    clearSession();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  if (!response.ok || payload?.ok === false) {
    throw new ApiError(payload?.message || "请求失败", {
      code: payload?.error || "request_failed",
      status: response.status,
      details: payload?.details ?? null
    });
  }

  return payload?.data as T;
}

export async function login(username: string, password: string) {
  return apiRequest<SessionPayload>("/api/v1/auth/login", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ username, password })
  });
}

export async function listLoginTenants() {
  return apiRequest("/api/v1/auth/tenant-options", {
    skipAuth: true
  });
}

export async function loginWithTenant(username: string, password: string, tenantIdentifier = "") {
  return apiRequest<SessionPayload>("/api/v1/auth/login", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ username, password, tenantIdentifier })
  });
}

export async function logout(refreshToken?: string | null) {
  return apiRequest("/api/v1/auth/logout", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ refreshToken })
  });
}
