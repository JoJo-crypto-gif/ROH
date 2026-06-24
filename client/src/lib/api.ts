const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

let accessToken: string | null = null;

/** Store access token in memory (not localStorage — more secure) */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/** Wrapper around fetch with auth headers, JSON handling, and refresh retry */
async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(customHeaders as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include", // send httpOnly cookies (refresh token)
  });

  // If 401, try to refresh the token
  if (res.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry the original request with new token
      headers["Authorization"] = `Bearer ${accessToken}`;
      const retryRes = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
      });

      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ error: "Request failed" }));
        throw new ApiError(retryRes.status, err.error || "Request failed", err.code);
      }
      return retryRes.json();
    }

    // Refresh failed — clear token and redirect to login
    setAccessToken(null);
    window.location.href = "/login?expired=true";
    throw new ApiError(401, "Session expired", "SESSION_EXPIRED");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, err.error || "Request failed", err.code, err.details);
  }

  return res.json();
}

export interface RefreshResponse {
  accessToken: string;
  user: ApiUser;
}

let refreshPromise: Promise<RefreshResponse | null> | null = null;

/** Deduplicated function to refresh the session */
export async function refreshSession(): Promise<RefreshResponse | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) return null;

      const data = await res.json();
      setAccessToken(data.accessToken);
      return data;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Try to refresh the access token using the httpOnly cookie */
async function tryRefresh(): Promise<boolean> {
  const data = await refreshSession();
  return !!data;
}

// ── API Error class ──────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth API ─────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  me: () => request<{ user: ApiUser }>("/auth/me"),

  logout: () =>
    request<{ message: string }>("/auth/logout", { method: "POST" }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
    }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { token, password },
    }),
};

// ── Users API ────────────────────────────────────────────

export const usersApi = {
  list: () => request<{ users: ApiUser[] }>("/users"),
  get: (id: string) => request<{ user: ApiUser }>(`/users/${id}`),
  create: (data: { email: string; password: string; name: string; roleId: string }) =>
    request<{ user: ApiUser }>("/users", { method: "POST", body: data }),
  update: (id: string, data: { email?: string; name?: string; roleId?: string; active?: boolean }) =>
    request<{ user: ApiUser }>(`/users/${id}`, { method: "PATCH", body: data }),
  deactivate: (id: string) =>
    request<{ message: string }>(`/users/${id}`, { method: "DELETE" }),
};

// ── Roles API ────────────────────────────────────────────

export const rolesApi = {
  list: () => request<{ roles: ApiRole[] }>("/roles"),
  get: (id: string) => request<{ role: ApiRole }>(`/roles/${id}`),
  create: (data: { name: string; slug: string; description?: string; permissions: string[] }) =>
    request<{ role: ApiRole }>("/roles", { method: "POST", body: data }),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<{ role: ApiRole }>(`/roles/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) =>
    request<{ message: string }>(`/roles/${id}`, { method: "DELETE" }),
};

// ── API Types ────────────────────────────────────────────

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  avatarInitials: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  permissions: string[];
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  builtIn: boolean;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}
